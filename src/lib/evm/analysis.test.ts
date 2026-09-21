import { describe, expect, it } from "vitest";
import { toFunctionSelector, type Hex } from "viem";
import { OPCODE, profileBytecode } from "./bytecode";
import { checkErc20Surface, detectCapabilities } from "./capabilities";
import { inspectTokenText } from "./erc20";
import {
  ADMIN_SLOT,
  BEACON_SLOT,
  IMPLEMENTATION_SLOT,
  minimalProxyImplementation,
} from "./proxy";

/**
 * These cover the parts of the scanner that decide what a contract can do,
 * which are exactly the parts that must not be wrong. They are pure — no
 * RPC, no chain — so they pin the analysis down independently of whether
 * any particular node is reachable.
 */

const push4 = (selector: string) => `63${selector.slice(2)}`;

function bytecode(...parts: string[]): Hex {
  return `0x${parts.join("")}`;
}

describe("profileBytecode", () => {
  it("extracts PUSH4 selectors from a dispatcher", () => {
    const code = bytecode(
      push4(toFunctionSelector("mint(address,uint256)")),
      push4(toFunctionSelector("transfer(address,uint256)")),
      push4(toFunctionSelector("totalSupply()")),
      "00"
    );

    const profile = profileBytecode(code);

    expect(profile.selectors.has(toFunctionSelector("mint(address,uint256)"))).toBe(true);
    expect(profile.selectors.has(toFunctionSelector("totalSupply()"))).toBe(true);
    expect(profile.selectors.has(toFunctionSelector("pause()"))).toBe(false);
  });

  it("does not mistake PUSH data for opcodes", () => {
    // PUSH32 with a word of 0xff bytes: a naive byte scan reports
    // SELFDESTRUCT here, which is the false positive this guards against.
    const code = bytecode("7f", "ff".repeat(32), "00");
    const profile = profileBytecode(code);

    expect(profile.opcodes.has(OPCODE.SELFDESTRUCT)).toBe(false);
    expect(profile.opcodes.has(0x7f)).toBe(true);
  });

  it("detects a real selfdestruct at an instruction position", () => {
    const profile = profileBytecode(bytecode("6001", "60ff", "ff"));
    expect(profile.opcodes.has(OPCODE.SELFDESTRUCT)).toBe(true);
  });

  it("skips the Solidity metadata trailer", () => {
    // Trailer: 6 CBOR bytes (0xa1 header + a PUSH4 that must not count)
    // followed by its own big-endian length.
    const code = bytecode(
      push4(toFunctionSelector("transfer(address,uint256)")),
      "00",
      "a163deadbeef",
      "0006"
    );

    const profile = profileBytecode(code);

    expect(profile.metadataStripped).toBe(true);
    expect(profile.selectors.has("0xdeadbeef")).toBe(false);
    expect(profile.selectors.has(toFunctionSelector("transfer(address,uint256)"))).toBe(true);
  });

  it("returns an empty profile for malformed code instead of throwing", () => {
    const profile = profileBytecode("0xnothex" as Hex);
    expect(profile.sizeBytes).toBe(0);
    expect(profile.selectors.size).toBe(0);
  });
});

describe("capability detection", () => {
  const tokenCode = bytecode(
    push4(toFunctionSelector("totalSupply()")),
    push4(toFunctionSelector("balanceOf(address)")),
    push4(toFunctionSelector("transfer(address,uint256)")),
    push4(toFunctionSelector("mint(address,uint256)")),
    push4(toFunctionSelector("pause()")),
    push4(toFunctionSelector("setBlacklist(address,bool)")),
    "00"
  );

  it("reports the privileged powers present in the bytecode", () => {
    const ids = detectCapabilities(profileBytecode(tokenCode)).map(
      (capability) => capability.definition.id
    );

    expect(ids).toContain("mint");
    expect(ids).toContain("pause");
    expect(ids).toContain("blacklist");
    expect(ids).not.toContain("upgrade");
  });

  it("recognises the minimal ERC-20 surface", () => {
    const surface = checkErc20Surface(profileBytecode(tokenCode));
    expect(surface.looksLikeErc20).toBe(true);
    expect(surface.missing).toContain("approve(address,uint256)");
  });

  it("does not call an arbitrary contract a token", () => {
    const surface = checkErc20Surface(profileBytecode(bytecode("00")));
    expect(surface.looksLikeErc20).toBe(false);
  });
});

describe("token text inspection", () => {
  it("flags and strips invisible characters", () => {
    const result = inspectTokenText("US​DC");
    expect(result?.display).toBe("USDC");
    expect(result?.issues.join(" ")).toContain("invisible");
  });

  it("gives the same answer when called repeatedly", () => {
    // A /g regex reused across .test() calls carries lastIndex and returns
    // false on every second call; this is the regression test for that.
    const first = inspectTokenText("US​DC");
    const second = inspectTokenText("US​DC");
    expect(second).toEqual(first);
  });

  it("flags an over-long name", () => {
    const result = inspectTokenText("a".repeat(200));
    expect(result?.issues).toContain("unusually long");
    expect(result?.display.length).toBe(64);
  });

  it("leaves an ordinary symbol alone", () => {
    expect(inspectTokenText("USDC")).toEqual({ display: "USDC", issues: [] });
  });
});

describe("proxy detection", () => {
  it("derives the published EIP-1967 slots", () => {
    expect(IMPLEMENTATION_SLOT).toBe(
      "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
    );
    expect(ADMIN_SLOT).toBe(
      "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"
    );
    expect(BEACON_SLOT).toBe(
      "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50"
    );
  });

  it("reads the implementation out of an EIP-1167 minimal proxy", () => {
    const target = "1234567890abcdef1234567890abcdef12345678";
    const code = bytecode(
      "363d3d373d3d3d363d73",
      target,
      "5af43d82803e903d91602b57fd5bf3"
    );

    expect(minimalProxyImplementation(code)?.toLowerCase()).toBe(`0x${target}`);
  });

  it("returns null for code that is not a minimal proxy", () => {
    expect(minimalProxyImplementation(bytecode("6001600100"))).toBeNull();
  });
});
