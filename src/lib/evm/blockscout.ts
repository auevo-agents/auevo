import { getAddress, isAddress, type Address } from "viem";
import { fetchJson } from "./http";

/**
 * Blockscout — Robinhood Chain's own explorer, used to close the two gaps
 * a public RPC leaves open.
 *
 * Holder distribution is the important one. Reconstructing it from
 * Transfer logs means scanning tens of millions of blocks on a chain
 * producing one every ~100ms, which is not possible inside a request; the
 * explorer has already indexed it. Deployment date is the other: it needs
 * historical state the public node does not serve.
 *
 * It also answers whether the source is verified — a fact with no on-chain
 * representation at all, and one an unverified scam token cannot fake.
 */

/**
 * Blockscout serves Robinhood Chain from two places — the chain's own
 * instance and the multichain endpoint keyed by chain id — and the first
 * live scan showed the instance host alone does not answer. Rather than
 * pick one and be wrong again, the candidates are tried in order and the
 * one that answers is pinned for the rest of the process.
 */
const DEFAULT_BASE_URLS = [
  "https://api.blockscout.com/4663",
  "https://robinhoodchain.blockscout.com",
];

function candidateBases(): string[] {
  const configured = process.env.BLOCKSCOUT_API_URL?.trim();
  // An explicit empty value is how you turn the source off.
  if (configured === "") return [];
  if (configured) return [configured.replace(/\/+$/, "")];
  return DEFAULT_BASE_URLS;
}

/** Pinned once a base answers, so later calls in the same scan skip the probe. */
let pinnedBase: string | null = null;

export function resolvedBlockscoutBase(): string | null {
  return pinnedBase;
}

/** Resets the pin — tests point the client at a different host per file. */
export function resetBlockscoutBase(): void {
  pinnedBase = null;
}

function withKey(url: string): string {
  const key = process.env.BLOCKSCOUT_API_KEY?.trim();
  if (!key) return url;
  return `${url}${url.includes("?") ? "&" : "?"}apikey=${encodeURIComponent(key)}`;
}

/**
 * Fetches a path against whichever base answers. A null result means every
 * candidate failed or the path genuinely 404s — callers must not read that
 * as a statement about the token.
 */
async function blockscoutFetch<T>(
  path: string,
  timeoutMs: number
): Promise<T | null> {
  const bases = pinnedBase ? [pinnedBase] : candidateBases();

  for (const base of bases) {
    const result = await fetchJson<T>(withKey(`${base}${path}`), timeoutMs);
    if (result !== null) {
      pinnedBase = base;
      return result;
    }
  }

  return null;
}

export interface BlockscoutHolder {
  address: Address;
  balance: string;
}

export interface BlockscoutTokenInfo {
  /** Total number of holders the explorer has indexed. */
  holderCount: number | null;
  /** Largest holders, already ranked by the explorer. */
  holders: BlockscoutHolder[];
}

export interface BlockscoutContractInfo {
  isVerified: boolean | null;
  creator: Address | null;
  creationTxHash: string | null;
}

function toAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    return null;
  }
  return getAddress(value);
}

function parseHolders(payload: unknown): BlockscoutHolder[] {
  if (!payload || typeof payload !== "object") return [];
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  const holders: BlockscoutHolder[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as { address?: { hash?: unknown }; value?: unknown };
    const address = toAddress(row.address?.hash);
    if (!address || typeof row.value !== "string") continue;
    holders.push({ address, balance: row.value });
  }
  return holders;
}

export async function fetchBlockscoutToken(
  token: Address
): Promise<BlockscoutTokenInfo | null> {
  if (candidateBases().length === 0) return null;

  // Sequential on purpose: the first call is also what pins the base, so
  // firing both at once would probe every candidate twice.
  const holdersPayload = await blockscoutFetch<unknown>(
    `/api/v2/tokens/${token}/holders`,
    8_000
  );
  const counters = await blockscoutFetch<{ token_holders_count?: unknown }>(
    `/api/v2/tokens/${token}/counters`,
    6_000
  );

  const holders = parseHolders(holdersPayload);
  if (holders.length === 0) return null;

  const rawCount = counters?.token_holders_count;
  const holderCount =
    typeof rawCount === "string" || typeof rawCount === "number"
      ? Number(rawCount)
      : null;

  return {
    holderCount: Number.isFinite(holderCount) ? holderCount : null,
    holders,
  };
}

export async function fetchBlockscoutContract(
  token: Address
): Promise<BlockscoutContractInfo | null> {
  if (candidateBases().length === 0) return null;

  const addressInfo = await blockscoutFetch<{
    creator_address_hash?: unknown;
    creation_transaction_hash?: unknown;
    is_verified?: unknown;
  }>(`/api/v2/addresses/${token}`, 8_000);

  // A 404 here is meaningful, but only once a base has answered something
  // else — otherwise "no verified source" would just mean "wrong host".
  const contract = await blockscoutFetch<{ is_verified?: unknown }>(
    `/api/v2/smart-contracts/${token}`,
    8_000
  );

  if (!contract && !addressInfo) return null;

  const verifiedFlag = contract?.is_verified ?? addressInfo?.is_verified;

  return {
    // A reachable explorer that returns no verified contract record is a
    // "no", not an "unknown" — that is the state it reports for every
    // unverified address.
    isVerified:
      typeof verifiedFlag === "boolean"
        ? verifiedFlag
        : contract === null && addressInfo !== null
          ? false
          : null,
    creator: toAddress(addressInfo?.creator_address_hash),
    creationTxHash:
      typeof addressInfo?.creation_transaction_hash === "string"
        ? addressInfo.creation_transaction_hash
        : null,
  };
}

export interface BlockscoutDeployment {
  timestamp: number;
  blockNumber: string | null;
}

export async function fetchBlockscoutDeployment(
  txHash: string
): Promise<BlockscoutDeployment | null> {
  if (candidateBases().length === 0) return null;

  const tx = await blockscoutFetch<{
    timestamp?: unknown;
    block_number?: unknown;
  }>(`/api/v2/transactions/${txHash}`, 6_000);

  if (!tx || typeof tx.timestamp !== "string") return null;

  const parsed = Date.parse(tx.timestamp);
  if (!Number.isFinite(parsed)) return null;

  return {
    timestamp: Math.floor(parsed / 1000),
    blockNumber:
      typeof tx.block_number === "number" || typeof tx.block_number === "string"
        ? String(tx.block_number)
        : null,
  };
}

export interface BlockscoutLog {
  /** Raw event data, decoded by the caller — this module stays ABI-agnostic. */
  data: string;
  topics: (string | null)[];
  blockNumber: string | null;
  timestamp: number | null;
  transactionHash: string | null;
}

/**
 * Raw event logs for a contract, newest first.
 *
 * This is what makes a "new pairs" feed possible at all: the Uniswap V3
 * Factory has emitted a PoolCreated event for every pool on this chain,
 * but the chain produces a block roughly every 100ms — scanning that
 * history back to the factory's deployment with eth_getLogs would mean
 * tens of millions of blocks, the same problem holder distribution ran
 * into. Blockscout has already indexed it per-address, so one paginated
 * call here replaces what would otherwise be thousands of RPC calls.
 */
export async function fetchBlockscoutLogs(
  address: Address,
  maxItems = 200
): Promise<BlockscoutLog[]> {
  if (candidateBases().length === 0) return [];

  const logs: BlockscoutLog[] = [];
  let path = `/api/v2/addresses/${address}/logs`;

  // Blockscout paginates via a cursor object it hands back, not a page
  // number — each response's own next_page_params is what the next
  // request echoes, so a couple of hops is the extent of this loop.
  for (let page = 0; page < 3 && logs.length < maxItems; page++) {
    const result = await blockscoutFetch<{
      items?: unknown[];
      next_page_params?: Record<string, string | number> | null;
    }>(path, 8_000);

    if (!result || !Array.isArray(result.items)) break;

    for (const item of result.items) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const topics = Array.isArray(row.topics)
        ? (row.topics as unknown[]).map((t) => (typeof t === "string" ? t : null))
        : [];

      logs.push({
        data: typeof row.data === "string" ? row.data : "0x",
        topics,
        blockNumber:
          typeof row.block_number === "number" || typeof row.block_number === "string"
            ? String(row.block_number)
            : null,
        timestamp:
          typeof row.timestamp === "string"
            ? Math.floor(Date.parse(row.timestamp) / 1000) || null
            : null,
        transactionHash:
          typeof row.transaction_hash === "string" ? row.transaction_hash : null,
      });
    }

    if (!result.next_page_params) break;

    const query = new URLSearchParams(
      Object.entries(result.next_page_params).map(([k, v]) => [k, String(v)])
    ).toString();
    path = `/api/v2/addresses/${address}/logs?${query}`;
  }

  return logs.slice(0, maxItems);
}
