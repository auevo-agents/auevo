import { describe, expect, it } from "vitest";
import { encodeAbiParameters, pad, toFunctionSelector, type Address, type Hex } from "viem";
import { scanTokenRisk, RISK_WEIGHTS } from "./risk";
import { IMPLEMENTATION_SLOT, ADMIN_SLOT } from "@/lib/evm/proxy";
import type { EvmReadClient } from "@/lib/evm/client";

const TOKEN: Address = "0x1111111111111111111111111111111111111111";
const IMPLEMENTATION: Address = "0x2222222222222222222222222222222222222222";
const ADMIN: Address = "0x3333333333333333333333333333333333333333";
const MINTER_1: Address = "0x4444444444444444444444444444444444444444";
const MINTER_2: Address = "0x5555555555555555555555555555555555555555";
const OWNER: Address = "0x6666666666666666666666666666666666666666";

const push4 = (sig: string) => `63${toFunctionSelector(sig).slice(2)}`;
function bytecode(...signatures: string[]): Hex {
  return `0x${signatures.map(push4).join("")}00` as Hex;
}

function addr(address: string): string {
  return address.toLowerCase();
}

/**
 * A scripted EvmReadClient — no network, matching this codebase's own
 * pattern for testing chain-reading logic against a fake RPC (see
 * rwa/dex/quote.test.ts's mockClient).
 */
function mockClient(opts: {
  codes: Map<string, Hex>;
  storage?: Map<string, Hex>;
  owner?: Address;
  roleMemberCount?: number;
  roleMembers?: Address[];
}): EvmReadClient {
  const storage = opts.storage ?? new Map();

  return {
    async getCode({ address }: { address: Address }) {
      return opts.codes.get(addr(address));
    },
    async getStorageAt({ address, slot }: { address: Address; slot: Hex }) {
      return storage.get(`${addr(address)}:${slot}`);
    },
    async call({ data }: { data: Hex }) {
      const selector = data.slice(0, 10);
      if (selector === toFunctionSelector("owner()")) {
        return { data: (opts.owner ? pad(opts.owner, { size: 32 }) : "0x") as Hex };
      }
      if (selector === toFunctionSelector("getRoleMemberCount(bytes32)")) {
        return { data: encodeAbiParameters([{ type: "uint256" }], [BigInt(opts.roleMemberCount ?? 0)]) };
      }
      if (selector === toFunctionSelector("getRoleMember(bytes32,uint256)")) {
        const indexWord = data.slice(10 + 64);
        const index = Number(BigInt(`0x${indexWord}`));
        const holder = opts.roleMembers?.[index];
        return { data: (holder ? encodeAbiParameters([{ type: "address" }], [holder]) : "0x") as Hex };
      }
      return { data: "0x" as Hex };
    },
  } as unknown as EvmReadClient;
}

describe("scanTokenRisk", () => {
  it("reports isContract=false and score 0 for an address with no code", async () => {
    const client = mockClient({ codes: new Map() });
    const result = await scanTokenRisk(client, 4663, TOKEN);
    expect(result.isContract).toBe(false);
    expect(result.score).toBe(0);
    expect(result.findings).toEqual([]);
  });

  it("scores a plain (non-proxy) token from its own bytecode's selectors", async () => {
    const client = mockClient({
      codes: new Map([[addr(TOKEN), bytecode("mint(address,uint256)", "pause()", "blacklist(address,bool)")]]),
    });
    const result = await scanTokenRisk(client, 4663, TOKEN);

    expect(result.isContract).toBe(true);
    expect(result.canMint).toBe(true);
    expect(result.canPause).toBe(true);
    expect(result.canBlacklist).toBe(true);
    expect(result.canForceTransfer).toBe(false);
    expect(result.canFreeze).toBe(false);
    expect(result.upgradeable).toBe(false);
    expect(result.proxy).toBeNull();
    expect(result.adminAddress).toBeNull();
    expect(result.mintRoleHolders).toBeNull();

    const expectedScore = 100 - RISK_WEIGHTS.mint - RISK_WEIGHTS.pause - RISK_WEIGHTS.blacklist;
    expect(result.score).toBe(expectedScore);
  });

  it("detects the RWA-specific freeze and force-transfer capabilities", async () => {
    const client = mockClient({
      codes: new Map([[addr(TOKEN), bytecode("freeze(address)", "forceTransfer(address,address,uint256)")]]),
    });
    const result = await scanTokenRisk(client, 4663, TOKEN);

    expect(result.canFreeze).toBe(true);
    expect(result.canForceTransfer).toBe(true);
    expect(result.score).toBe(100 - RISK_WEIGHTS.freeze - RISK_WEIGHTS["force-transfer"]);
  });

  it("follows an EIP-1967 proxy to the implementation for capability detection, but reads owner()/roles against the proxy address", async () => {
    const storage = new Map<string, Hex>([
      [`${addr(TOKEN)}:${IMPLEMENTATION_SLOT}`, pad(IMPLEMENTATION, { size: 32 })],
      [`${addr(TOKEN)}:${ADMIN_SLOT}`, pad(ADMIN, { size: 32 })],
    ]);
    const client = mockClient({
      codes: new Map([
        [addr(TOKEN), "0x6001" as Hex], // proxy's own tiny bytecode — not analyzed for capabilities
        [addr(IMPLEMENTATION), bytecode("mint(address,uint256)", "getRoleMemberCount(bytes32)", "getRoleMember(bytes32,uint256)")],
      ]),
      storage,
      owner: OWNER,
      roleMemberCount: 2,
      roleMembers: [MINTER_1, MINTER_2],
    });

    const result = await scanTokenRisk(client, 4663, TOKEN);

    expect(result.proxy?.kind).toBe("eip1967");
    expect(result.analyzedAddress.toLowerCase()).toBe(addr(IMPLEMENTATION));
    expect(result.upgradeable).toBe(true);
    expect(result.adminAddress?.toLowerCase()).toBe(addr(ADMIN)); // proxy admin wins over owner()
    expect(result.canMint).toBe(true);
    expect(result.mintRoleHolders?.map((a) => a.toLowerCase())).toEqual([addr(MINTER_1), addr(MINTER_2)]);
    expect(result.score).toBe(100 - RISK_WEIGHTS.mint - RISK_WEIGHTS.upgrade);
  });

  it("scores upgradeable=true from a transparent proxy's storage slot even when the implementation's own bytecode has no upgradeTo() selector", async () => {
    const storage = new Map<string, Hex>([[`${addr(TOKEN)}:${IMPLEMENTATION_SLOT}`, pad(IMPLEMENTATION, { size: 32 })]]);
    const client = mockClient({
      codes: new Map([
        [addr(TOKEN), "0x6001" as Hex],
        [addr(IMPLEMENTATION), bytecode("transfer(address,uint256)")], // no upgrade-related selector at all
      ]),
      storage,
    });

    const result = await scanTokenRisk(client, 4663, TOKEN);
    expect(result.upgradeable).toBe(true);
    expect(result.findings.some((f) => f.capabilityId === "upgrade")).toBe(true);
  });

  it("falls back to owner() as adminAddress when there is no proxy", async () => {
    const client = mockClient({
      codes: new Map([[addr(TOKEN), bytecode("owner()")]]),
      owner: OWNER,
    });
    const result = await scanTokenRisk(client, 4663, TOKEN);
    expect(result.proxy).toBeNull();
    expect(result.adminAddress?.toLowerCase()).toBe(addr(OWNER));
  });

  it("never lets the score go below zero even with every capability present", async () => {
    const client = mockClient({
      codes: new Map([
        [
          addr(TOKEN),
          bytecode(
            "mint(address,uint256)",
            "pause()",
            "blacklist(address,bool)",
            "burnFrom(address,uint256)",
            "freeze(address)",
            "forceTransfer(address,address,uint256)",
            "upgradeTo(address)"
          ),
        ],
      ]),
    });
    const result = await scanTokenRisk(client, 4663, TOKEN);
    expect(result.score).toBe(0);
  });
});
