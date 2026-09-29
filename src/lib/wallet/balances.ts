import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { USDC_ADDRESS, USDC_DECIMALS, WALLET_CHAINS, type WalletChain } from "./tokens";

/**
 * Balance reads for AUEVO Wallet — plain public-RPC viem calls, no
 * connected signer needed. Runs fine client-side: a balanceOf/getBalance
 * read leaks nothing an on-chain observer couldn't already see, unlike the
 * RPC client in lib/evm/client.ts (server-only because that endpoint list
 * can carry a paid provider's embedded API key).
 *
 * Deliberately untyped (`any`) rather than `PublicClient`: viem narrows a
 * client's return types (e.g. getBlock's `transactions` shape) per the
 * specific `chain` object passed to createPublicClient, so a client built
 * from a UNION of chains (WalletChain — mainnet | base) structurally
 * mismatches the general `PublicClient` interface's own formatter
 * defaults ("two different types with this name exist" for that reason
 * alone, unrelated to the privy/wagmi issue documented in wagmi.ts). The
 * two methods this file actually calls, getBalance and readContract, are
 * unaffected — neither depends on the chain-specific getBlock shape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
const clients = new Map<number, any>();

function clientFor(chain: WalletChain) {
  let client = clients.get(chain.id);
  if (!client) {
    client = createPublicClient({ chain, transport: http() });
    clients.set(chain.id, client);
  }
  return client;
}

export type WalletBalance = {
  chainId: number;
  chainName: string;
  symbol: "ETH" | "USDC";
  raw: bigint;
  formatted: string;
};

export async function fetchWalletBalances(address: `0x${string}`): Promise<WalletBalance[]> {
  const reads = WALLET_CHAINS.flatMap((chain) => {
    const client = clientFor(chain);

    const eth = client.getBalance({ address }).then(
      (raw: bigint): WalletBalance => ({
        chainId: chain.id,
        chainName: chain.name,
        symbol: "ETH",
        raw,
        formatted: formatUnits(raw, 18),
      })
    );

    const usdcAddress = USDC_ADDRESS[chain.id];
    const usdc = usdcAddress
      ? client
          .readContract({ address: usdcAddress, abi: erc20Abi, functionName: "balanceOf", args: [address] })
          .then(
            (raw: bigint): WalletBalance => ({
              chainId: chain.id,
              chainName: chain.name,
              symbol: "USDC",
              raw,
              formatted: formatUnits(raw, USDC_DECIMALS),
            })
          )
      : null;

    return usdc ? [eth, usdc] : [eth];
  });

  // Settled, not all: one chain's RPC hiccup shouldn't blank out every
  // other balance the user can already see.
  const settled = await Promise.allSettled(reads);
  return settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}
