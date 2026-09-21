import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  encodeAbiParameters,
  pad,
  toEventSelector,
  toFunctionSelector,
  toHex,
} from "viem";
import type { TokenScanReport } from "./token-security";

/**
 * End-to-end scan against a scripted JSON-RPC node.
 *
 * The unit tests cover what the analysis concludes; this covers whether
 * the scanner can talk to a node at all — request shapes, return decoding,
 * the deployment binary search, the holder pass, and that the finished
 * report survives JSON serialisation. Without it the first real run would
 * be the first time any of that executed.
 */

const TOKEN = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";
const WHALE = "0x3333333333333333333333333333333333333333";
const SMALL_HOLDER = "0x4444444444444444444444444444444444444444";
const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";

const HEAD_BLOCK = 100_000n;
const DEPLOY_BLOCK = 90_000n;
const DAYS_OLD = 30;

const TOTAL_SUPPLY = 1_000_000n * 10n ** 18n;
const BALANCES: Record<string, bigint> = {
  [WHALE]: (TOTAL_SUPPLY * 62n) / 100n,
  [SMALL_HOLDER]: (TOTAL_SUPPLY * 3n) / 100n,
  [OWNER]: (TOTAL_SUPPLY * 5n) / 100n,
};

const SELECTORS = {
  name: toFunctionSelector("name()"),
  symbol: toFunctionSelector("symbol()"),
  decimals: toFunctionSelector("decimals()"),
  totalSupply: toFunctionSelector("totalSupply()"),
  owner: toFunctionSelector("owner()"),
  balanceOf: toFunctionSelector("balanceOf(address)"),
};

/** A token whose owner can mint, pause and blacklist. */
const TOKEN_CODE = `0x${[
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
  "mint(address,uint256)",
  "pause()",
  "setBlacklist(address,bool)",
]
  .map((signature) => `63${toFunctionSelector(signature).slice(2)}`)
  .join("")}00`;

const TRANSFER_TOPIC = toEventSelector(
  "Transfer(address,address,uint256)"
);

function word(value: bigint): string {
  return pad(toHex(value), { size: 32 });
}

function topicFor(address: string): string {
  return pad(address as `0x${string}`, { size: 32 });
}

function handle(method: string, params: unknown[]): unknown {
  switch (method) {
    case "eth_chainId":
      return "0x1237"; // 4663
    case "eth_blockNumber":
      return toHex(HEAD_BLOCK);

    case "eth_getCode": {
      const [address, block] = params as [string, string];
      if (address.toLowerCase() === MULTICALL3) return "0x"; // no Multicall3
      if (address.toLowerCase() !== TOKEN) return "0x";
      if (block === "latest") return TOKEN_CODE;
      return BigInt(block) >= DEPLOY_BLOCK ? TOKEN_CODE : "0x";
    }

    case "eth_getStorageAt":
      return word(0n); // no proxy slots set

    case "eth_call": {
      const [tx] = params as [{ to: string; data: string }];
      const data = tx.data ?? "0x";
      const selector = data.slice(0, 10);

      if (selector === SELECTORS.name) {
        return encodeAbiParameters([{ type: "string" }], ["Mock Token"]);
      }
      if (selector === SELECTORS.symbol) {
        return encodeAbiParameters([{ type: "string" }], ["MOCK"]);
      }
      if (selector === SELECTORS.decimals) return word(18n);
      if (selector === SELECTORS.totalSupply) return word(TOTAL_SUPPLY);
      if (selector === SELECTORS.owner) {
        return encodeAbiParameters(
          [{ type: "address" }],
          [OWNER as `0x${string}`]
        );
      }
      if (selector === SELECTORS.balanceOf) {
        const holder = `0x${data.slice(-40)}`.toLowerCase();
        const match = Object.entries(BALANCES).find(
          ([address]) => address.toLowerCase() === holder
        );
        return word(match ? match[1] : 0n);
      }

      throw new Error(`execution reverted: ${selector}`);
    }

    case "eth_getBlockByNumber": {
      const [block] = params as [string];
      const timestamp = BigInt(
        Math.floor(Date.now() / 1000) - DAYS_OLD * 86_400
      );
      return {
        number: block === "latest" ? toHex(HEAD_BLOCK) : block,
        hash: pad("0xabc", { size: 32 }),
        parentHash: pad("0xabb", { size: 32 }),
        timestamp: toHex(timestamp),
        gasLimit: "0x0",
        gasUsed: "0x0",
        miner: OWNER,
        transactions: [],
        uncles: [],
        difficulty: "0x0",
        extraData: "0x",
        logsBloom: `0x${"0".repeat(512)}`,
        nonce: "0x0000000000000000",
        size: "0x0",
        stateRoot: pad("0x0", { size: 32 }),
        receiptsRoot: pad("0x0", { size: 32 }),
        transactionsRoot: pad("0x0", { size: 32 }),
        sha3Uncles: pad("0x0", { size: 32 }),
      };
    }

    case "eth_getLogs": {
      const mints = [WHALE, SMALL_HOLDER, OWNER].map((holder, index) => ({
        address: TOKEN,
        topics: [
          TRANSFER_TOPIC,
          topicFor("0x0000000000000000000000000000000000000000"),
          topicFor(holder),
        ],
        data: word(BALANCES[holder] ?? 0n),
        blockNumber: toHex(DEPLOY_BLOCK + BigInt(index)),
        blockHash: pad("0xabc", { size: 32 }),
        logIndex: toHex(BigInt(index)),
        transactionHash: pad("0xdef", { size: 32 }),
        transactionIndex: "0x0",
        removed: false,
      }));
      // One wallet-to-wallet transfer among the top holders — the funding
      // graph's edges come from exactly this kind of log.
      const walletTransfer = {
        address: TOKEN,
        topics: [TRANSFER_TOPIC, topicFor(WHALE), topicFor(SMALL_HOLDER)],
        data: word(1_000n * 10n ** 18n),
        blockNumber: toHex(DEPLOY_BLOCK + 5n),
        blockHash: pad("0xabc", { size: 32 }),
        logIndex: toHex(4n),
        transactionHash: pad("0xdef", { size: 32 }),
        transactionIndex: "0x0",
        removed: false,
      };
      return [...mints, walletTransfer];
    }

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
      const respond = (single: { id: number; method: string; params: unknown[] }) => {
        try {
          return { jsonrpc: "2.0", id: single.id, result: handle(single.method, single.params ?? []) };
        } catch (err) {
          return {
            jsonrpc: "2.0",
            id: single.id,
            error: { code: -32000, message: (err as Error).message },
          };
        }
      };

      const body = Array.isArray(request)
        ? request.map(respond)
        : respond(request);

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

describe("scanToken against a scripted node", () => {
  it("reads token metadata off the contract", () => {
    expect(report.token.symbol).toBe("MOCK");
    expect(report.token.name).toBe("Mock Token");
    expect(report.token.decimals).toBe(18);
    expect(report.token.totalSupplyFormatted).toBe("1000000");
  });

  it("reports the owner's privileged powers", () => {
    const ids = report.findings.map((finding) => finding.id);
    expect(ids).toContain("capability-mint");
    expect(ids).toContain("capability-pause");
    expect(ids).toContain("capability-blacklist");
    expect(ids).toContain("ownership-active");
  });

  it("finds the deployment block by binary search", () => {
    expect(report.deployment?.blockNumber).toBe(DEPLOY_BLOCK.toString());
    expect(Math.round(report.deployment?.ageDays ?? 0)).toBe(DAYS_OLD);
  });

  it("reconstructs holder concentration from Transfer logs", () => {
    expect(report.holders?.topPercent).toBeCloseTo(62, 0);
    expect(report.holders?.top[0]?.address.toLowerCase()).toBe(WHALE);
    expect(report.findings.map((f) => f.id)).toContain(
      "holder-concentration-extreme"
    );
  });

  it("builds a funding graph from the same Transfer logs — mints and wallet-to-wallet edges", () => {
    const graph = report.holders?.graph;
    expect(graph).toBeDefined();

    const nodeAddresses = graph?.nodes.map((n) => n.address.toLowerCase()) ?? [];
    expect(nodeAddresses).toContain(WHALE);
    expect(nodeAddresses).toContain(SMALL_HOLDER);
    expect(nodeAddresses).toContain(OWNER);
    // The zero address only becomes a node because a mint edge into it exists.
    expect(graph?.nodes.some((n) => n.kind === "mint")).toBe(true);

    const edgeAddrs = graph?.edges.map((e) => [e.from.toLowerCase(), e.to.toLowerCase()]);
    expect(edgeAddrs).toContainEqual([
      "0x0000000000000000000000000000000000000000",
      WHALE,
    ]);
    expect(edgeAddrs).toContainEqual([WHALE, SMALL_HOLDER]);
  });

  it("lands on a risk verdict driven by the findings", () => {
    expect(report.verdict).toBe("critical");
    expect(report.score).toBeLessThan(50);
  });

  it("always states what it could not check", () => {
    expect(report.checksSkipped.join(" ")).toContain("honeypot");
  });

  it("produces a report that survives JSON serialisation", () => {
    expect(() => JSON.stringify(report)).not.toThrow();
    expect(JSON.parse(JSON.stringify(report)).address).toBe(report.address);
  });
});
