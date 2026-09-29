import { arbitrum, base, bsc, hyperEvm, mainnet } from "wagmi/chains";
import { createConfig, http, type Config } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { robinhoodChain, robinhoodRpcUrls } from "./chains";
import { LIFI_EVM_CHAIN_LIST } from "./rwa/lifi/chains";

/**
 * Wallet connection for the internal app (/app) — Robinhood Chain plus,
 * as of RWA_SPEC.md Phase 4, the five other EVM chains LI.FI bridges
 * to/from (Ethereum, Base, BNB, Arbitrum, HyperEVM — see rwa/lifi/chains.ts).
 * Solana is deferred per the spec's own note and needs a separate,
 * non-EVM wallet-adapter integration this phase does not add.
 *
 * This is deliberately just wallet connection: a connected wallet signs
 * its own transactions, we never hold a key or a balance. That is what
 * makes it safe to build ahead of every fund-custody feature (swap,
 * staking, OTC, launchpad) — those need this, but this needs none of
 * their risk profile.
 *
 * WalletConnect is optional. `injected()` (MetaMask and anything else
 * that injects window.ethereum) needs no external account, so the app
 * works with just that; WalletConnect is only added when a project ID
 * is configured, the same env-gated-source pattern used for GoPlus /
 * Quick Intel — an unconfigured extra is "off", not a broken build.
 */

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

function connectors() {
  // Typed `any[]` rather than inferred: with @privy-io/react-auth also in
  // the dependency tree (added for the separate /wallet product — see
  // src/app/wallet/providers.tsx), TypeScript resolves injected()'s and
  // walletConnect()'s CreateConnectorFn generic instantiations against two
  // structurally-incompatible copies of an ambient type (confirmed by
  // bisecting: a clean install without @privy-io/react-auth type-checks
  // this file with no cast needed at all; adding just that one package,
  // with every physical viem/wagmi/@wagmi/core/@wagmi/connectors/abitype
  // dependency deduped to a single version, reproduces the failure). Both
  // connectors still work identically at runtime — this only silences a
  // false-positive `tsc` error from that cross-package declaration clash.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
  const list: any[] = [injected()];
  if (walletConnectProjectId) {
    list.push(
      walletConnect({
        projectId: walletConnectProjectId,
        metadata: {
          name: "Auevo",
          description: "Trading workspace on Robinhood Chain",
          url: "https://auevo.io",
          icons: ["https://auevo.io/icon.png"],
        },
      })
    );
  }
  return list;
}

let cached: Config | undefined;

/**
 * Built lazily rather than at module load: wagmi connectors touch
 * `window`, so constructing this at import time breaks server-side
 * rendering of any file that imports this module transitively.
 */
export function getWagmiConfig(): Config {
  if (!cached) {
    cached = createConfig({
      chains: LIFI_EVM_CHAIN_LIST,
      connectors: connectors(),
      transports: {
        // robinhoodRpcUrls() reads ROBINHOOD_RPC_URL, which is NOT
        // NEXT_PUBLIC_-prefixed and so is never inlined into this
        // client bundle — it resolves to undefined here and falls back
        // to the public endpoint. That fallback is load-bearing: a
        // paid provider URL can carry an embedded API key, and this
        // config runs in the browser. Never rename that env var to a
        // NEXT_PUBLIC_ one to "fix" this — that would ship the key to
        // every visitor.
        [robinhoodChain.id]: http(robinhoodRpcUrls()[0]),
        // The other five chains use each wagmi chain object's own bundled
        // public RPC (mainnet/base/bsc/arbitrum/hyperEvm from wagmi/chains,
        // passed to http() with no URL) — this app never needs heavy read
        // volume on them itself (LI.FI's own backend does all
        // quoting/routing off-chain), only the occasional balance/allowance
        // read and a wallet-signed send, so a dedicated provider isn't
        // worth the added config surface yet.
        [mainnet.id]: http(),
        [base.id]: http(),
        [bsc.id]: http(),
        [arbitrum.id]: http(),
        [hyperEvm.id]: http(),
      },
      ssr: true,
    });
  }
  return cached;
}
