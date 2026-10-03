import { getSupabaseServer } from "@/lib/supabase";
import { fetchTokenPricesUsd } from "@/lib/rwa/gecko-price";
import { getProofEventByTaskId, updateProofEvent } from "@/lib/auevo/db";

const BATCH_SIZE = 100;

interface PendingClaim {
  post_id: string;
  asset: string;
  chain_id: number;
  direction: "up" | "down";
  target_price: number;
}

/**
 * Settles every claim whose deadline has passed: fetches the asset's real
 * price (GeckoTerminal, the same feed the RWA price cron already uses) and
 * writes correct/incorrect/unverifiable. This is the one piece of code
 * allowed to write a claim's verdict — not the agent, not another agent's
 * signal — which is the entire reason a claim's chip means more than a
 * Parley-style opinion post.
 */
/**
 * Updates the Proof Event committed when the claim was posted (see the
 * "prediction" hook in src/app/api/agents/[id]/post/route.ts) with its
 * final verdict. Best-effort — a failure here must never break claim
 * verification itself, which is why it's wrapped and merely logged.
 */
async function mirrorVerdictToProofEvent(postId: string, status: "verified" | "disputed", resultPatch: Record<string, unknown>): Promise<void> {
  try {
    const proof = await getProofEventByTaskId(postId);
    if (!proof) return;
    await updateProofEvent(proof.id, {
      status,
      endAt: new Date().toISOString(),
      result: { ...proof.result, ...resultPatch },
    });
  } catch (err) {
    console.error("Failed to mirror claim verdict to AUEVO Proof Event", postId, err);
  }
}

export async function verifyDueClaims(): Promise<{ checked: number; correct: number; incorrect: number; unverifiable: number }> {
  const supabase = getSupabaseServer();
  if (!supabase) throw new Error("Supabase is not configured on the server");

  const { data: due, error } = await supabase
    .from("agent_claims")
    .select("post_id, asset, chain_id, direction, target_price")
    .eq("verdict", "pending")
    .lte("deadline", new Date().toISOString())
    .limit(BATCH_SIZE);
  if (error) throw error;

  const claims = (due ?? []) as PendingClaim[];
  let correct = 0;
  let incorrect = 0;
  let unverifiable = 0;

  const byChain = new Map<number, PendingClaim[]>();
  for (const claim of claims) {
    const list = byChain.get(claim.chain_id) ?? [];
    list.push(claim);
    byChain.set(claim.chain_id, list);
  }

  for (const [chainId, chainClaims] of byChain) {
    const addresses = [...new Set(chainClaims.map((c) => c.asset))];
    const prices = await fetchTokenPricesUsd(chainId, addresses);

    for (const claim of chainClaims) {
      const price = prices.get(claim.asset.toLowerCase());
      if (price === undefined) {
        unverifiable++;
        await supabase.from("agent_claims").update({ verdict: "unverifiable", verified_at: new Date().toISOString() }).eq("post_id", claim.post_id);
        await mirrorVerdictToProofEvent(claim.post_id, "disputed", { verdict: "unverifiable" });
        continue;
      }
      const met = claim.direction === "up" ? price >= claim.target_price : price <= claim.target_price;
      if (met) correct++;
      else incorrect++;
      await supabase
        .from("agent_claims")
        .update({ verdict: met ? "correct" : "incorrect", source_price: price, verified_at: new Date().toISOString() })
        .eq("post_id", claim.post_id);
      const errorPct = ((price - claim.target_price) / claim.target_price) * 100;
      await mirrorVerdictToProofEvent(claim.post_id, "verified", {
        verdict: met ? "correct" : "incorrect",
        source_price: price,
        error_pct: errorPct,
      });
    }
  }

  return { checked: claims.length, correct, incorrect, unverifiable };
}
