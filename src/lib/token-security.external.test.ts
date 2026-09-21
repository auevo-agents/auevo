import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodeAbiParameters, pad, toFunctionSelector, toHex } from "viem";
import type { TokenScanReport } from "./token-security";

/**
 * The external sources, and the rules that govern them.
 *
 * Two properties matter more than any individual field mapping. A second
 * opinion may add risk but never clear it — so a honeypot verdict lands
 * even on a contract whose bytecode looks spotless. And a field the API
 * omits stays unknown: on this chain most tax fields come back empty, and
 * empty must never render as "no tax".
 */

const TOKEN = "0x1111111111111111111111111111111111111111";
const WHALE = "0x3333333333333333333333333333333333333333";
const CREATION_TX = `0x${"ab".repeat(32)}`;

const HEAD_BLOCK = 70_000_000n;
const TOTAL_SUPPLY = 1_000_000n * 10n ** 18n;

const SELECTORS = {
  name: toFunctionSelector("name()"),
  symbol: toFunctionSelector("symbol()"),
  decimals: toFunctionSelector("decimals()"),
  totalSupply: toFunctionSelector("totalSupply()"),
  owner: toFunctionSelector("owner()"),
};

/** Nothing privileged in the bytecode, and ownership renounced. */
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

const word = (value: bigint) => pad(toHex(value), { size: 32 });

function rpc(method: string, params: unknown[]): unknown {
  switch (method) {
    case "eth_chainId":
      return "0x1237";
    case "eth_blockNumber":
      return toHex(HEAD_BLOCK);
    case "eth_getCode": {
      const [address, block] = params as [string, string];
      if (address.toLowerCase() !== TOKEN) return "0x";
      if (block !== "latest") throw new Error("missing trie node");
      return CLEAN_CODE;
    }
    case "eth_getStorageAt":
      return word(0n);
    case "eth_getLogs":
      return []; // no usable log history — the explorer has to carry this
    case "eth_call": {
      const [tx] = params as [{ data: string }];
      const selector = (tx.data ?? "0x").slice(0, 10);
      if (selector === SELECTORS.name)
        return encodeAbiParameters([{ type: "string" }], ["Quiet Token"]);
      if (selector === SELECTORS.symbol)
        return encodeAbiParameters([{ type: "string" }], ["QUIET"]);
      if (selector === SELECTORS.decimals) return word(18n);
      if (selector === SELECTORS.totalSupply) return word(TOTAL_SUPPLY);
      if (selector === SELECTORS.owner)
        return encodeAbiParameters(
          [{ type: "address" }],
          ["0x0000000000000000000000000000000000000000"]
        );
      throw new Error("execution reverted");
    }
    default:
      throw new Error(`unexpected RPC method: ${method}`);
  }
}

function httpRoute(path: string): unknown | undefined {
  if (path.startsWith("/api/v1/token_security/")) {
    return {
      code: 1,
      message: "OK",
      result: {
        [TOKEN.toLowerCase()]: {
          is_honeypot: "1",
          can_take_back_ownership: "1",
          is_open_source: "0",
          // buy_tax / sell_tax deliberately absent: the common case on
          // this chain, and it must stay unknown rather than become 0.
          holder_count: "412",
          // Robinhood Chain is not in Quick Intel's coverage (checked
          // directly against their published chain list), so GoPlus's
          // own lp_holders — part of this same response, no extra call —
          // is what actually answers "is liquidity locked" on this chain
          // in practice. Quick Intel's mock below deliberately disagrees
          // (0/0, unlocked) to prove GoPlus wins when both answer.
          lp_holders: [
            {
              address: "0x000000000000000000000000000000000000dead",
              percent: "0.55",
              is_locked: "0",
            },
            {
              address: "0x6666666666666666666666666666666666666666",
              percent: "0.37",
              is_locked: "1",
            },
            {
              address: "0x7777777777777777777777777777777777777777",
              percent: "0.08",
              is_locked: "0",
            },
          ],
        },
      },
    };
  }

  if (path.endsWith("/holders")) {
    return {
      items: [
        { address: { hash: WHALE }, value: ((TOTAL_SUPPLY * 80n) / 100n).toString() },
        {
          address: { hash: "0x4444444444444444444444444444444444444444" },
          value: ((TOTAL_SUPPLY * 5n) / 100n).toString(),
        },
      ],
    };
  }

  if (path.endsWith("/counters")) return { token_holders_count: "412" };

  if (path.startsWith("/api/v2/smart-contracts/")) return null; // unverified
  if (path.startsWith("/api/v2/addresses/")) {
    return {
      creator_address_hash: "0x5555555555555555555555555555555555555555",
      creation_transaction_hash: CREATION_TX,
    };
  }
  if (path.startsWith("/api/v2/transactions/")) {
    const deployedAt = new Date(Date.now() - 200 * 86_400 * 1000).toISOString();
    return { timestamp: deployedAt, block_number: 1234 };
  }

  return undefined;
}

let server: Server;
let report: TokenScanReport;

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];

    if (req.method === "GET") {
      const payload = httpRoute(path);
      res.setHeader("Content-Type", "application/json");
      if (payload === undefined || payload === null) {
        res.statusCode = 404;
        res.end("{}");
        return;
      }
      res.end(JSON.stringify(payload));
      return;
    }

    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (path === "/v1/getquickiauditfull") {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            quickiAudit: { contract_Verified: "0" },
            tokenDynamicDetails: {
              is_Honeypot: true,
              lp_Burned_Percent: 0,
              lp_Locked_Percent: 0,
            },
          })
        );
        return;
      }

      const request = JSON.parse(raw);
      const respond = (one: { id: number; method: string; params: unknown[] }) => {
        try {
          return { jsonrpc: "2.0", id: one.id, result: rpc(one.method, one.params ?? []) };
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
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ROBINHOOD_RPC_URL = origin;
  process.env.GOPLUS_API_URL = origin;
  process.env.BLOCKSCOUT_API_URL = origin;
  process.env.QUICKINTEL_API_URL = `${origin}/v1`; // matches the real base URL shape
  process.env.QUICKINTEL_API_KEY = "test-key";

  const { scanToken } = await import("./token-security");
  report = await scanToken(TOKEN);
}, 60_000);

afterAll(() => {
  server?.close();
});

describe("second opinion from established scanners", () => {
  it("records which sources answered", () => {
    expect(report.sources.rpc).toBe("ok");
    expect(report.sources.goplus).toBe("ok");
    expect(report.sources.blockscout).toBe("ok");
    expect(report.sources.quickIntel).toBe("ok");
    // Naming the host that answered is what makes a wrong endpoint visible.
    expect(report.sources.blockscoutBase).toBeTruthy();
  });

  it("resolves liquidity from GoPlus's own lp_holders, over Quick Intel's disagreeing answer", () => {
    // 55% burned + 37% locked = 92% secured, from the mock above.
    const finding = report.findings.find((f) => f.id === "liquidity-secured");
    expect(finding).toBeTruthy();
    expect(finding?.evidence).toBe("GoPlus");
    expect(report.findings.map((f) => f.id)).not.toContain("liquidity-unlocked");
    expect(report.evidenceGaps).not.toContain("Liquidity lock unknown");
  });

  it("does not print the same finding once per source that agrees", () => {
    const honeypots = report.findings.filter((f) => f.id === "honeypot");
    expect(honeypots).toHaveLength(1);
  });

  it("lands a honeypot verdict on bytecode that looks clean", () => {
    const ids = report.findings.map((finding) => finding.id);
    expect(ids).toContain("honeypot");
    expect(report.verdict).toBe("critical");
  });

  it("treats an omitted tax field as unknown, not as zero", () => {
    const ids = report.findings.map((finding) => finding.id);
    expect(ids).not.toContain("sell-tax");
    expect(JSON.stringify(report)).not.toContain('"sellTax":0');
  });

  it("rewrites a renouncement that can be reversed", () => {
    const renounced = report.findings.find((f) => f.id === "ownership-renounced");
    expect(renounced?.severity).not.toBe("good");
    expect(renounced?.title).toContain("reclaimable");
    expect(report.findings.map((f) => f.id)).toContain("ownership-reclaimable");
  });

  it("flags unverified source", () => {
    expect(report.findings.map((f) => f.id)).toContain("source-unverified");
  });

  it("closes the distribution gap with the explorer's index", () => {
    expect(report.holders?.partial).toBe(false);
    expect(report.holders?.topPercent).toBeCloseTo(80, 0);
    expect(report.evidenceGaps).not.toContain("Distribution incomplete");
    expect(report.findings.map((f) => f.id)).toContain(
      "holder-concentration-extreme"
    );
  });

  it("closes the age gap from the creation transaction", () => {
    expect(report.evidenceGaps).not.toContain("Age unknown");
    expect(Math.round(report.deployment?.ageDays ?? 0)).toBe(200);
  });
});
