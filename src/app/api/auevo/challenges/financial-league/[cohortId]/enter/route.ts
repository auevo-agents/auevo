import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { AuthError, parseSignedEnvelope, verifySignedRequest } from "@/lib/social/auth";
import { readAgentIdentity } from "@/lib/auevo/identity";
import { getChallenge, getFinancialLeagueCohort, createFinancialLeagueEntry, createProofEvent, insertProofNonce, setEntryProofEvent } from "@/lib/auevo/db";
import { checkRateLimit } from "@/lib/social/rate-limit";
import { getRobinhoodClient } from "@/lib/evm/client";
import { ERC20_ABI } from "@/lib/erc20-abi";
import { fetchTokenPricesUsd } from "@/lib/rwa/gecko-price";

export const runtime = "nodejs";

/**
 * Entering a Financial Agent League cohort IS the Proof Event's
 * pre-execution commitment (design doc §10/§18-19): the agent's operator
 * wallet and its starting balance/benchmark price are captured now, on
 * chain, before a single trade happens, so settlement later can only
 * compute a return against a baseline that existed before the fact.
 *
 * Request body: `{ payload: "<json string>", timestamp, nonce, signature }`
 * — payload is `{ agentId, operatorWallet }`, signed by the agent's
 * on-chain controller key (same signed-request scheme as the social
 * agent layer — src/lib/social/auth.ts, reused as-is).
 */
export async function POST(req: Request, { params }: { params: Promise<{ cohortId: string }> }) {
  try {
    const { cohortId } = await params;
    const body = await req.json();
    const envelope = parseSignedEnvelope(body);
    const payloadRaw = typeof body.payload === "string" ? body.payload : "";
    if (!payloadRaw) return NextResponse.json({ error: "payload (signed JSON string) is required" }, { status: 400 });

    const payload = JSON.parse(payloadRaw);
    const agentIdStr = typeof payload.agentId === "string" || typeof payload.agentId === "number" ? String(payload.agentId) : "";
    const claimedOperatorWallet = typeof payload.operatorWallet === "string" ? payload.operatorWallet : "";
    if (!/^[0-9]+$/.test(agentIdStr) || !/^0x[a-fA-F0-9]{40}$/.test(claimedOperatorWallet)) {
      return NextResponse.json({ error: "payload requires numeric agentId and a 0x operatorWallet address" }, { status: 400 });
    }
    const agentId = BigInt(agentIdStr);

    const identity = await readAgentIdentity(agentId);
    if (!identity) {
      return NextResponse.json({ error: "AgentIdentity is not deployed yet, or this agent id does not exist" }, { status: 503 });
    }

    await verifySignedRequest({
      method: "POST",
      path: `/api/auevo/challenges/financial-league/${cohortId}/enter`,
      rawBody: payloadRaw,
      envelope,
      controllerAddress: identity.controller,
      agentId: agentIdStr,
      insertNonce: insertProofNonce,
    });

    if (identity.operatorWallet.toLowerCase() !== claimedOperatorWallet.toLowerCase()) {
      return NextResponse.json(
        { error: "operatorWallet does not match AgentIdentity.operatorWalletOf(agentId) on chain — set it there first" },
        { status: 409 }
      );
    }

    const allowed = await checkRateLimit(`financial-league-enter:${agentIdStr}`, 10, 60 * 60 * 1000);
    if (!allowed) return NextResponse.json({ error: "Too many entry attempts, slow down" }, { status: 429 });

    const cohort = await getFinancialLeagueCohort(cohortId);
    if (!cohort) return NextResponse.json({ error: "Unknown cohort" }, { status: 404 });
    if (cohort.status !== "open") return NextResponse.json({ error: `Cohort is '${cohort.status}', not accepting entries` }, { status: 409 });

    const challenge = cohort.challenge_id ? await getChallenge(cohort.challenge_id) : null;

    // Baseline, read live, now — before this agent has made a single trade.
    const client = getRobinhoodClient();
    const operatorBalanceRaw = await client.readContract({
      address: cohort.asset_address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [claimedOperatorWallet as `0x${string}`],
    });
    const decimals = await client.readContract({ address: cohort.asset_address as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" });
    const operatorBalance = Number(operatorBalanceRaw) / 10 ** decimals;

    let benchmarkPrice = 0;
    if (cohort.benchmark_chain_id && cohort.benchmark_token_address) {
      const prices = await fetchTokenPricesUsd(cohort.benchmark_chain_id, [cohort.benchmark_token_address]);
      benchmarkPrice = prices.get(cohort.benchmark_token_address.toLowerCase()) ?? 0;
    }

    const entry = await createFinancialLeagueEntry(cohortId, agentIdStr, claimedOperatorWallet, {
      operatorBalance,
      benchmarkPrice,
    });

    const commitment = createHash("sha256")
      .update(JSON.stringify({ cohortId, agentId: agentIdStr, operatorWallet: claimedOperatorWallet, enteredAt: entry.entered_at }))
      .digest("hex");

    const proof = await createProofEvent({
      agentId: agentIdStr,
      challengeId: cohort.challenge_id,
      category: "financial_performance",
      rulesHash: challenge?.rules_hash ?? "",
      commitment,
      verificationMethod: "deterministic",
      status: "pending",
      result: { cohort_id: cohortId, entry_id: entry.id },
    });

    await setEntryProofEvent(entry.id, proof.id);

    return NextResponse.json({ entry, proofEventId: proof.id }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
