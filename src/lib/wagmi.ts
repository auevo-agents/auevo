import { createConfig, http, type Config } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { robinhoodChain, robinhoodRpcUrls } from "./chains";

/**
 * Wallet connection for the internal app (/app) — Robinhood Chain only.
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
  const list = [injected()];
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
      chains: [robinhoodChain],
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
      },
      ssr: true,
    });
  }
  return cached;
}
