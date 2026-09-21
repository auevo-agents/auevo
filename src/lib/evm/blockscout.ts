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

const DEFAULT_BASE_URL = "https://robinhoodchain.blockscout.com";

function baseUrl(): string | null {
  const configured = process.env.BLOCKSCOUT_API_URL?.trim();
  if (configured === "") return null;
  return (configured || DEFAULT_BASE_URL).replace(/\/+$/, "");
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
  const base = baseUrl();
  if (!base) return null;

  const [holdersPayload, counters] = await Promise.all([
    fetchJson<unknown>(`${base}/api/v2/tokens/${token}/holders`, 8_000),
    fetchJson<{ token_holders_count?: unknown }>(
      `${base}/api/v2/tokens/${token}/counters`,
      6_000
    ),
  ]);

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
  const base = baseUrl();
  if (!base) return null;

  const [contract, addressInfo] = await Promise.all([
    // 404 here is meaningful on its own: the explorer has no verified
    // source for this address.
    fetchJson<{ is_verified?: unknown }>(
      `${base}/api/v2/smart-contracts/${token}`,
      8_000
    ),
    fetchJson<{
      creator_address_hash?: unknown;
      creation_transaction_hash?: unknown;
      is_verified?: unknown;
    }>(`${base}/api/v2/addresses/${token}`, 8_000),
  ]);

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
  const base = baseUrl();
  if (!base) return null;

  const tx = await fetchJson<{ timestamp?: unknown; block_number?: unknown }>(
    `${base}/api/v2/transactions/${txHash}`,
    6_000
  );

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
