import { createPublicClient, http } from "viem";
import { arbitrum, base, bsc, hyperEvm, mainnet } from "wagmi/chains";
import { robinhoodChain, robinhoodRpcUrls } from "@/lib/chains";
import type { EvmReadClient } from "@/lib/evm/client";

/**
 * Server-only RPC clients for every chain rwa_tokens can list a token on
 * (see rwa/lifi/chains.ts) — RWA_SPEC.md Phase 5's risk scoring needs to
 * read contract state (bytecode, storage slots, AccessControl roles) on
 * whichever chain a given token actually lives on, not just Robinhood
 * Chain.
 *
 * RPC_ETHEREUM/RPC_BASE/RPC_BSC/RPC_ARBITRUM/RPC_HYPEREVM (.env.example,
 * added in Phase 4 and reserved for exactly this) override each chain's
 * default public RPC when set; unset, each chain falls back to the same
 * bundled public endpoint its `wagmi/chains` definition ships with — fine
 * for occasional per-token scans, not for bulk indexing.
 */
const RPC_ENV_VAR: Record<number, string> = {
  [mainnet.id]: "RPC_ETHEREUM",
  [base.id]: "RPC_BASE",
  [bsc.id]: "RPC_BSC",
  [arbitrum.id]: "RPC_ARBITRUM",
  [hyperEvm.id]: "RPC_HYPEREVM",
};

const CHAINS = [robinhoodChain, mainnet, base, bsc, arbitrum, hyperEvm];

const cache = new Map<number, EvmReadClient>();

/**
 * Null when `chainId` is none of the chains this app knows about. Returns
 * the narrow EvmReadClient interface (call/getStorageAt/getCode) rather
 * than a full PublicClient — createPublicClient's return type is generic
 * over the specific Chain object passed in, so a client built from
 * `mainnet` and one built from `robinhoodChain` are not the same TS type
 * even though both behave identically for the plain reads risk.ts makes;
 * this cache only needs the latter, so it never has to reconcile them.
 */
export function getEvmClient(chainId: number): EvmReadClient | null {
  const cached = cache.get(chainId);
  if (cached) return cached;

  const chain = CHAINS.find((c) => c.id === chainId);
  if (!chain) return null;

  const rpcUrl = chainId === robinhoodChain.id ? robinhoodRpcUrls()[0] : process.env[RPC_ENV_VAR[chainId]]?.trim() || undefined;

  const client: EvmReadClient = createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 12_000, retryCount: 2, retryDelay: 300 }),
  });
  cache.set(chainId, client);
  return client;
}

/** Test-only — forces the next getEvmClient(chainId) call to rebuild. */
export function resetEvmClientCache(): void {
  cache.clear();
}
