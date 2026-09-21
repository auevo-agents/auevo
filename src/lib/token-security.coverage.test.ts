import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodeAbiParameters, pad, toEventSelector, toFunctionSelector, toHex } from "viem";
import type { TokenScanReport } from "./token-security";

/**
 * Regression test for the failure mode a live scan actually produced: a
 * token with no privileged powers, on a node that serves no historical
 * state, came back "LOW RISK · 100" — while the scan had established
 * neither the contract's age nor its real holder distribution.
 *
 * Finding nothing is not the same as there being nothing. This pins the
 * rule that a clean result with unknowns underneath can never be reported
 * as low risk.
 */

const TOKEN = "0x1111111111111111111111111111111111111111";
const HOLDER = "0x3333333333333333333333333333333333333333";
const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";

const HEAD_BLOCK = 70_000_000n; // ~100ms blocks: months of history
const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n;

const SELECTORS = {
  name: toFunctionSelector("name()"),
  symbol: toFunctionSelector("symbol()"),
  decimals: toFunctionSelector("decimals()"),
  totalSupply: toFunctionSelector("totalSupply()"),
  owner: toFunctionSelector("owner()"),
  balanceOf: toFunctionSelector("balanceOf(address)"),
};

/** Plain ERC-20: no mint, no pause, no blacklist, no proxy. */
const CLEAN_CODE = `0x${[
  "totalSupply()",
  "balanceOf(address)",
  "transfer(address,uint256)",
  "transferFrom(address,address,uint256)",
  "approve(address,uint256)",
  "allowance(address,address)",
  "name()",
  "symbol()",
  "decimals()",
  "owner()",
]
  .map((signature) => `63${toFunctionSelector(signature).slice(2)}`)
  .join("")}00`;

function word(value: bigint): string {
  return pad(toHex(value), { size: 32 });
}

function handle(method: string, params: unknown[]): unknown {
  switch (method) {
    case "eth_chainId":
      return "0x1237";
    case "eth_blockNumber":
      return toHex(HEAD_BLOCK);

    case "eth_getCode": {
      const [address, block] = params as [string, string];
      if (address.toLowerCase() === MULTICALL3) return "0x";
      if (address.toLowerCase() !== TOKEN) return "0x";
      // A pruning node: current state only, which is what the public
      // endpoint actually does.
      if (block !== "latest") throw new Error("missing trie node");
      return CLEAN_CODE;
    }

    case "eth_getStorageAt":
      return word(0n);

    case "eth_call": {
      const [tx] = params as [{ to: string; data: string }];
      const selector = (tx.data ?? "0x").slice(0, 10);
      if (selector === SELECTORS.name)
        return encodeAbiParameters([{ type: "string" }], ["Chump Coin"]);
      if (selector === SELECTORS.symbol)
        return encodeAbiParameters([{ type: "string" }], ["CHUMP"]);
      if (selector === SELECTORS.decimals) return word(18n);
      if (selector === SELECTORS.totalSupply) return word(TOTAL_SUPPLY);
      if (selector === SELECTORS.owner)
        return encodeAbiParameters(
          [{ type: "address" }],
          ["0x0000000000000000000000000000000000000000"]
        );
      if (selector === SELECTORS.balanceOf)
        return word((TOTAL_SUPPLY * 14n) / 1000n); // 1.4%
      throw new Error("execution reverted");
    }

    case "eth_getLogs":
      return [
        {
          address: TOKEN,
          topics: [
            toEventSelector("Transfer(address,address,uint256)"),
            pad("0x0000000000000000000000000000000000000000", { size: 32 }),
            pad(HOLDER as `0x${string}`, { size: 32 }),
          ],
          data: word(1n),
          blockNumber: toHex(HEAD_BLOCK - 10n),
          blockHash: pad("0xabc", { size: 32 }),
          logIndex: "0x0",
          transactionHash: pad("0xdef", { size: 32 }),
          transactionIndex: "0x0",
          removed: false,
        },
      ];

    default:
      throw new Error(`unexpected RPC method: ${method}`);
  }
}

let server: Server;
let report: TokenScanReport;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const request = JSON.parse(raw);
      const respond = (one: { id: number; method: string; params: unknown[] }) => {
        try {
          return {
            jsonrpc: "2.0",
            id: one.id,
            result: handle(one.method, one.params ?? []),
          };
        } catch (err) {
          return {
            jsonrpc: "2.0",
            id: one.id,
            error: { code: -32000, message: (err as Error).message },
          };
        }
      };
      const body = Array.isArray(request) ? request.map(respond) : respond(request);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  process.env.ROBINHOOD_RPC_URL = `http://127.0.0.1:${port}`;
  // Empty means "source off" — this test covers the RPC path only.
  process.env.GOPLUS_API_URL = "";
  process.env.BLOCKSCOUT_API_URL = "";

  const { scanToken } = await import("./token-security");
  report = await scanToken(TOKEN);
}, 60_000);

afterAll(() => {
  server?.close();
});

describe("a clean contract scanned with incomplete evidence", () => {
  it("finds no privileged powers", () => {
    expect(report.capabilities.map((c) => c.id)).not.toContain("mint");
    expect(report.findings.map((f) => f.id)).toContain("ownership-renounced");
  });

  it("records both coverage gaps", () => {
    expect(report.evidenceGaps).toContain("Age unknown");
    expect(report.evidenceGaps).toContain("Distribution incomplete");
    expect(report.confidence).toBe("low");
  });

  it("never reports low risk on unknowns", () => {
    expect(report.verdict).not.toBe("low-risk");
    expect(report.verdict).toBe("caution");
  });

  it("does not present a log window as the full distribution", () => {
    expect(report.holders?.partial).toBe(true);
  });

  it("says in plain language what it could not see", () => {
    expect(report.checksSkipped.join(" ")).toContain(
      "can sit outside what we scanned"
    );
  });
});
