import type { WalletChain } from "./tokens";

/**
 * Server-only 0x Swap API v2 client (AllowanceHolder flow) — see
 * ZEROX_API_KEY in .env.example for why this flow was chosen over Permit2.
 * Never import from a "use client" component: the API key must stay
 * server-only, same rule as every other proxied third-party key in this
 * codebase (GoPlus, LI.FI, Houdini, ...).
 */

const ZEROX_API_BASE = "https://api.0x.org";

/** 0x's sentinel address for the chain's native asset (ETH here). */
export const ZEROX_NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export type ZeroXQuote = {
  buyAmount: string;
  sellAmount: string;
  minBuyAmount: string;
  transaction: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: string;
    gas: string | null;
  };
  issues: {
    allowance: { spender: `0x${string}` } | null;
    balance: { token: `0x${string}`; actual: string; expected: string } | null;
  };
};

export class ZeroXError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZeroXError";
  }
}

/**
 * Fetches an AllowanceHolder swap quote. Throws ZeroXError with 0x's own
 * message on any non-2xx response rather than guessing at a cause.
 */
export async function getZeroXQuote(params: {
  chain: WalletChain;
  sellToken: `0x${string}`;
  buyToken: `0x${string}`;
  sellAmount: string;
  taker: `0x${string}`;
}): Promise<ZeroXQuote> {
  const apiKey = process.env.ZEROX_API_KEY;
  if (!apiKey) throw new ZeroXError("Swap is not configured on the server (missing ZEROX_API_KEY)");

  const query = new URLSearchParams({
    chainId: String(params.chain.id),
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
    taker: params.taker,
  });

  const res = await fetch(`${ZEROX_API_BASE}/swap/allowance-holder/quote?${query.toString()}`, {
    headers: {
      "0x-api-key": apiKey,
      "0x-version": "v2",
    },
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body && typeof body === "object" && "reason" in body && String(body.reason)) || `0x quote failed with ${res.status}`;
    throw new ZeroXError(message);
  }
  if (!body?.transaction?.to || !body?.transaction?.data) {
    throw new ZeroXError("0x returned a quote with no transaction to execute (likely no route for this pair/amount)");
  }

  return {
    buyAmount: body.buyAmount,
    sellAmount: body.sellAmount,
    minBuyAmount: body.minBuyAmount ?? body.buyAmount,
    transaction: {
      to: body.transaction.to,
      data: body.transaction.data,
      value: body.transaction.value ?? "0",
      gas: body.transaction.gas ?? null,
    },
    issues: {
      allowance: body.issues?.allowance ?? null,
      balance: body.issues?.balance ?? null,
    },
  };
}
