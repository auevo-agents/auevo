import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { AllowanceTransfer, MaxAllowanceExpiration, MaxAllowanceTransferAmount } from "@uniswap/permit2-sdk";
import { getRobinhoodClient } from "@/lib/evm/client";
import { getPermit2Allowance } from "@/lib/rwa/dex/build";
import { PERMIT2, UNIVERSAL_ROUTER } from "@/lib/rwa/dex/addresses";
import { robinhoodChain } from "@/lib/chains";

export const maxDuration = 15;

/**
 * The EIP-712 payload for the one-time-per-token Permit2 signature —
 * RWA_SPEC.md phase 2's "подпись permit" step. Computed server-side so
 * `@uniswap/permit2-sdk` (and the `ethers` it pulls in) never has to ship
 * to the browser: the client only ever sees plain JSON to hand straight
 * to wagmi's `useSignTypedData`, and only ever runs viem/wagmi itself.
 *
 * Uses the current on-chain nonce (Permit2.allowance's own nonce field)
 * and grants max amount + max expiration — the standard Permit2 pattern
 * (sign once, cover many future trades of that token, until revoked) — so
 * the user is not asked to re-sign every single swap. A fresh ERC-20
 * `approve(Permit2, max)` is still required once per token before this
 * means anything (Permit2's allowance is itself gated by that approval);
 * this route only ever produces the *signature* step, never the approval
 * transaction.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const owner = searchParams.get("owner");
  const token = searchParams.get("token");

  if (!owner || !isAddress(owner, { strict: false })) {
    return NextResponse.json({ error: "owner must be a valid address" }, { status: 400 });
  }
  if (!token || !isAddress(token, { strict: false })) {
    return NextResponse.json({ error: "token must be a valid address" }, { status: 400 });
  }

  try {
    const client = getRobinhoodClient();
    const { nonce } = await getPermit2Allowance(client, owner as Address, token as Address, UNIVERSAL_ROUTER);

    const permit = {
      details: {
        token: token as Address,
        amount: MaxAllowanceTransferAmount.toString(),
        expiration: MaxAllowanceExpiration,
        nonce,
      },
      spender: UNIVERSAL_ROUTER,
      sigDeadline: Math.floor(Date.now() / 1000) + 30 * 60,
    };

    const typedData = AllowanceTransfer.getPermitData(permit, PERMIT2, robinhoodChain.id);

    return NextResponse.json({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: "PermitSingle",
      message: typedData.values,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
