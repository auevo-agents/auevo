import { createPublicClient, fallback, http } from "viem";
import { robinhoodChain, robinhoodRpcUrls } from "../chains";

/**
 * Server-only RPC client for Robinhood Chain.
 *
 * Never import this from a "use client" component: the endpoint list may
 * contain a provider URL with an embedded API key, and that must not ship
 * to the browser.
 *
 * Nothing here assumes anything beyond a standard JSON-RPC node — no
 * JSON-RPC batching, no Multicall3 — because we are starting on a public
 * endpoint whose capabilities we cannot rely on. Features that need more
 * (see multicall.ts) probe for support first and degrade when it's absent.
 */
function createClient() {
  const transports = robinhoodRpcUrls().map((url) =>
    http(url, {
      timeout: 12_000,
      retryCount: 2,
      retryDelay: 300,
      batch: false,
    })
  );

  return createPublicClient({
    chain: robinhoodChain,
    transport:
      transports.length > 1 ? fallback(transports, { rank: false }) : transports[0],
  });
}

export type RobinhoodClient = ReturnType<typeof createClient>;

let cached: RobinhoodClient | undefined;

export function getRobinhoodClient(): RobinhoodClient {
  if (!cached) cached = createClient();
  return cached;
}

/**
 * Thrown when the node itself is unreachable or unusable, as opposed to a
 * contract call that legitimately reverted. Callers surface this as a 503
 * ("chain is down"), not as a scan result, so a node outage never reads as
 * a verdict about the token.
 */
export class RpcUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Robinhood Chain RPC is unreachable");
    this.name = "RpcUnavailableError";
    this.cause = cause;
  }
}

/** Cheap liveness probe: confirms the node answers and is the chain we expect. */
export async function assertChainReachable(): Promise<void> {
  try {
    const chainId = await getRobinhoodClient().getChainId();
    if (chainId !== robinhoodChain.id) {
      throw new Error(
        `RPC reports chain ${chainId}, expected ${robinhoodChain.id}`
      );
    }
  } catch (err) {
    throw new RpcUnavailableError(err);
  }
}
