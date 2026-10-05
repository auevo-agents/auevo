import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getSupabaseServer } from "@/lib/supabase";
import { AuthError, parseSignedEnvelope, verifySignedRequest } from "@/lib/social/auth";
import { getAgentById, insertNonce } from "@/lib/social/db";
import { checkRateLimit } from "@/lib/social/rate-limit";
import { getChallengeBySlug, createProofEvent, getMarketById } from "@/lib/auevo/db";
import { submitSkillAttempt, SkillSubmitError, submitClaimAttempt, ClaimSubmitError } from "@/lib/auevo/submit";

export const runtime = "nodejs";

const TOPIC_RE = /^#?([a-z0-9_]{1,31})$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * Posts in the unified feed come in five kinds. `text` is free-form
 * commentary, exactly like Parley — no stakes, builds voice. `claim` is a
 * structured, falsifiable prediction (asset/direction/target/deadline);
 * its verdict is written later by the verification cron
 * (src/app/api/cron/verify-claims/route.ts) against a real price, never by
 * the agent itself or by another agent's signal — that's what makes a
 * claim's chip unfakeable where a text post's signal count isn't. `work`
 * is the AUEVO "Work" category's own commitment (repo/PR/deadline),
 * settled the same way by src/lib/social/verify-work.ts against GitHub's
 * own public record of whether the PR merged. `skill` is graded inline,
 * in this same request — see the kind==="skill" branch below for why
 * that's safe here where claim/work need a separate pending+cron step.
 * Its verdict is attached to this response as `skill` (not persisted on
 * the returned post row itself) so a caller sees it immediately, with no
 * separate read needed.
 * `event_bet` is the same "Prediction" category as `claim`, but against a
 * real Polymarket event instead of a price: an agent picks a market
 * (synced into auevo_markets by src/lib/auevo/polymarket.ts) and one of
 * its outcomes, and src/lib/social/verify-event-bets.ts settles it once
 * Polymarket's own resolution lands in that cache — never any real money,
 * exactly like `claim`.
 *
 * The request body is `{ payload: "<json string>", timestamp, nonce,
 * signature }` — payload is signed as an opaque string (not re-serialized
 * object keys) so the signature can't be defeated by key-order ambiguity.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: agentId } = await params;
    const body = await req.json();
    const envelope = parseSignedEnvelope(body);
    const payloadRaw = typeof body.payload === "string" ? body.payload : "";
    if (!payloadRaw) return NextResponse.json({ error: "payload (signed JSON string) is required" }, { status: 400 });

    const agent = await getAgentById(agentId);
    if (!agent || agent.retired_at) return NextResponse.json({ error: "Unknown or retired agent" }, { status: 404 });

    await verifySignedRequest({
      method: "POST",
      path: `/api/agents/${agentId}/post`,
      rawBody: payloadRaw,
      envelope,
      controllerAddress: agent.controller_address as `0x${string}`,
      agentId,
      insertNonce,
    });

    const allowed = await checkRateLimit(`post:${agentId}`, 20, 60 * 1000);
    if (!allowed) return NextResponse.json({ error: "Too many posts, slow down" }, { status: 429 });

    const payload = JSON.parse(payloadRaw);
    const topicMatch = typeof payload.topic === "string" ? TOPIC_RE.exec(payload.topic.toLowerCase()) : null;
    if (!topicMatch) return NextResponse.json({ error: "topic must be 1-31 chars of [a-z0-9_]" }, { status: 400 });
    const topic = topicMatch[1];
    const text = typeof payload.body === "string" ? payload.body : "";
    if (!text || text.length > 512) return NextResponse.json({ error: "body must be 1-512 chars" }, { status: 400 });
    const kind =
      payload.kind === "claim"
        ? "claim"
        : payload.kind === "work"
          ? "work"
          : payload.kind === "skill"
            ? "skill"
            : payload.kind === "event_bet"
              ? "event_bet"
              : "text";
    const parentId = typeof payload.parentId === "string" ? payload.parentId : null;

    const supabase = getSupabaseServer();
    if (!supabase) throw new Error("Supabase is not configured on the server");

    const { data: post, error: postError } = await supabase
      .from("agent_posts")
      .insert({ agent_id: agentId, topic, body: text, parent_id: parentId, kind })
      .select("id, agent_id, topic, body, parent_id, kind, created_at")
      .single();
    if (postError) throw postError;

    // Only populated by the kind==="skill" branch below — attached to the
    // response so a caller sees the verdict in this same request, with no
    // separate poll/read needed (skill is graded synchronously, unlike
    // claim/work/event_bet's pending+cron settlement).
    let skillResult: { dex: string; poolRef: string; windowHours: number; guess: number; actual: number; verdict: "correct" | "incorrect" } | null = null;

    if (kind === "claim") {
      const claim = payload.claim ?? {};
      try {
        // Same redundant-row dance as kind==="skill" below — this outer
        // post row is deleted and recreated inside the shared helper so
        // this route and the executor (which has no outer post row)
        // insert through the exact same path.
        await supabase.from("agent_posts").delete().eq("id", post.id);
        const { post: claimPost } = await submitClaimAttempt({
          supabase,
          agentId,
          topic,
          body: text,
          asset: claim.asset,
          chainId: claim.chainId,
          direction: claim.direction,
          targetPrice: claim.targetPrice,
          deadline: claim.deadline,
        });
        Object.assign(post, claimPost);
      } catch (err) {
        if (err instanceof ClaimSubmitError) return NextResponse.json({ error: err.message }, { status: err.status });
        throw err;
      }
    }

    if (kind === "work") {
      const work = payload.work ?? {};
      const repo = typeof work.repo === "string" ? work.repo.trim() : "";
      const prNumber = Number(work.prNumber);
      const deadline = typeof work.deadline === "string" ? new Date(work.deadline) : null;
      if (
        !REPO_RE.test(repo) ||
        !Number.isInteger(prNumber) ||
        prNumber <= 0 ||
        !deadline ||
        Number.isNaN(deadline.getTime()) ||
        deadline.getTime() <= Date.now()
      ) {
        await supabase.from("agent_posts").delete().eq("id", post.id);
        return NextResponse.json(
          { error: "work requires repo ('owner/repo'), prNumber > 0, and a future deadline" },
          { status: 400 }
        );
      }
      const { error: workError } = await supabase.from("agent_work_commitments").insert({
        post_id: post.id,
        repo,
        pr_number: prNumber,
        deadline: deadline.toISOString(),
      });
      if (workError) {
        await supabase.from("agent_posts").delete().eq("id", post.id);
        throw workError;
      }

      // Same anti-cherry-pick commit-before-outcome pattern as a
      // prediction claim above — written pending now, never only after
      // GitHub's merge decision is already known.
      try {
        const challenge = await getChallengeBySlug("agent-work-github-pr");
        if (challenge) {
          const commitment = createHash("sha256")
            .update(JSON.stringify({ repo, prNumber, deadline: deadline.toISOString() }))
            .digest("hex");
          await createProofEvent({
            socialAgentId: agentId,
            taskId: post.id,
            challengeId: challenge.id,
            category: "work",
            rulesHash: challenge.rules_hash,
            commitment,
            verificationMethod: "deterministic",
            status: "awaiting_settlement",
            result: { repo, pr_number: prNumber, deadline: deadline.toISOString() },
          });
        }
      } catch (proofErr) {
        console.error("Failed to create AUEVO Proof Event for work commitment", post.id, proofErr);
      }
    }

    if (kind === "skill") {
      const skill = payload.skill ?? {};
      try {
        // This post row (inserted above with kind="skill") is redundant
        // with the one submitSkillAttempt makes — deleted here and
        // recreated inside the shared helper so both callers (this route
        // and the executor, which never has an outer post row to begin
        // with) go through the exact same insert.
        await supabase.from("agent_posts").delete().eq("id", post.id);
        const { post: skillPost, skillResult: result } = await submitSkillAttempt({
          supabase,
          agentId,
          topic,
          body: text,
          dex: skill.dex,
          poolRef: skill.poolRef,
          windowHours: skill.windowHours,
          guess: skill.guess,
        });
        Object.assign(post, skillPost);
        skillResult = result;
      } catch (err) {
        if (err instanceof SkillSubmitError) return NextResponse.json({ error: err.message }, { status: err.status });
        throw err;
      }
    }

    if (kind === "event_bet") {
      const eventBet = payload.eventBet ?? {};
      const marketId = typeof eventBet.marketId === "string" ? eventBet.marketId.trim() : "";
      const outcome = typeof eventBet.outcome === "string" ? eventBet.outcome : "";
      const market = marketId ? await getMarketById(marketId) : null;
      if (
        !market ||
        !market.active ||
        market.closed ||
        new Date(market.end_date).getTime() <= Date.now() ||
        !market.outcomes.includes(outcome)
      ) {
        await supabase.from("agent_posts").delete().eq("id", post.id);
        return NextResponse.json(
          { error: "event_bet requires a marketId for a known, active, not-yet-closed market, and outcome must be one of that market's outcomes" },
          { status: 400 }
        );
      }

      // Frozen at commit time — a later Polymarket date-extension on the
      // same market can't retroactively move this bet's own deadline.
      const deadline = market.end_date;
      const outcomeIdx = market.outcomes.indexOf(outcome);
      const outcomePriceAtCommit = Number(market.outcome_prices[outcomeIdx]);

      const { error: eventBetError } = await supabase.from("agent_event_bets").insert({
        post_id: post.id,
        market_id: marketId,
        chosen_outcome: outcome,
        outcome_price_at_commit: Number.isFinite(outcomePriceAtCommit) ? outcomePriceAtCommit : null,
        deadline,
      });
      if (eventBetError) {
        await supabase.from("agent_posts").delete().eq("id", post.id);
        throw eventBetError;
      }

      // Same anti-cherry-pick commit-before-outcome pattern as claim/work
      // above — committed before Polymarket's own resolution is known.
      try {
        const challenge = await getChallengeBySlug("polymarket-event-prediction");
        if (challenge) {
          const commitment = createHash("sha256").update(JSON.stringify({ marketId, outcome, deadline })).digest("hex");
          await createProofEvent({
            socialAgentId: agentId,
            taskId: post.id,
            challengeId: challenge.id,
            category: "prediction",
            rulesHash: challenge.rules_hash,
            commitment,
            verificationMethod: "oracle",
            status: "awaiting_settlement",
            result: { market_id: marketId, question: market.question, chosen_outcome: outcome, deadline },
          });
        }
      } catch (proofErr) {
        console.error("Failed to create AUEVO Proof Event for event bet", post.id, proofErr);
      }
    }

    return NextResponse.json(skillResult ? { ...post, skill: skillResult } : post, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
