import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getSupabaseServer } from "@/lib/supabase";
import { AuthError, parseSignedEnvelope, verifySignedRequest } from "@/lib/social/auth";
import { getAgentById, insertNonce } from "@/lib/social/db";
import { checkRateLimit } from "@/lib/social/rate-limit";
import { getChallengeBySlug, createProofEvent, getMarketById } from "@/lib/auevo/db";
import { SKILL_MIN_WINDOW_HOURS, SKILL_MAX_WINDOW_HOURS, computeSkillWindow, poolExists, countUniqueTraders } from "@/lib/auevo/skill";

export const runtime = "nodejs";

const TOPIC_RE = /^#?([a-z0-9_]{1,31})$/;
// Chains src/lib/rwa/gecko-price.ts's fetchTokenPricesUsd can actually price.
const SUPPORTED_CLAIM_CHAIN_IDS = new Set([1, 10, 56, 4663, 5000, 8453, 42161]);
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

    if (kind === "claim") {
      const claim = payload.claim ?? {};
      const asset = typeof claim.asset === "string" ? claim.asset.trim() : "";
      const chainId = SUPPORTED_CLAIM_CHAIN_IDS.has(Number(claim.chainId)) ? Number(claim.chainId) : 4663;
      const direction = claim.direction === "up" || claim.direction === "down" ? claim.direction : null;
      const targetPrice = Number(claim.targetPrice);
      const deadline = typeof claim.deadline === "string" ? new Date(claim.deadline) : null;
      if (
        !/^0x[a-fA-F0-9]{40}$/.test(asset) ||
        !direction ||
        !Number.isFinite(targetPrice) ||
        targetPrice <= 0 ||
        !deadline ||
        Number.isNaN(deadline.getTime()) ||
        deadline.getTime() <= Date.now()
      ) {
        await supabase.from("agent_posts").delete().eq("id", post.id);
        return NextResponse.json(
          { error: "claim requires a token address as asset, direction ('up'|'down'), targetPrice > 0, and a future deadline" },
          { status: 400 }
        );
      }
      const { error: claimError } = await supabase.from("agent_claims").insert({
        post_id: post.id,
        asset: asset.toLowerCase(),
        chain_id: chainId,
        direction,
        target_price: targetPrice,
        deadline: deadline.toISOString(),
      });
      if (claimError) {
        await supabase.from("agent_posts").delete().eq("id", post.id);
        throw claimError;
      }

      // Commit this claim into AUEVO as a Proof Event right now, pending —
      // never only after the verdict lands — so the attempt can't be
      // cherry-picked out of history later (design doc §17). The AUEVO
      // "prediction" category reuses this social agent layer's own
      // identity (social_agent_id) rather than requiring the separate
      // on-chain AgentIdentity registration — see
      // supabase/migrations/.../auevo_proofs_social_identity.sql.
      try {
        const challenge = await getChallengeBySlug("price-claim-prediction");
        if (challenge) {
          const commitment = createHash("sha256")
            .update(JSON.stringify({ asset, chainId, direction, targetPrice, deadline: deadline.toISOString() }))
            .digest("hex");
          await createProofEvent({
            socialAgentId: agentId,
            taskId: post.id,
            challengeId: challenge.id,
            category: "prediction",
            rulesHash: challenge.rules_hash,
            commitment,
            verificationMethod: "deterministic",
            status: "pending",
            result: { asset, chain_id: chainId, direction, target_price: targetPrice, deadline: deadline.toISOString() },
          });
        }
      } catch (proofErr) {
        // A Proof Event bookkeeping failure must never block the claim
        // post itself — the claim (and its own verdict pipeline) is the
        // source of truth; AUEVO mirrors it, not the other way around.
        console.error("Failed to create AUEVO Proof Event for claim", post.id, proofErr);
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
            status: "pending",
            result: { repo, pr_number: prNumber, deadline: deadline.toISOString() },
          });
        }
      } catch (proofErr) {
        console.error("Failed to create AUEVO Proof Event for work commitment", post.id, proofErr);
      }
    }

    if (kind === "skill") {
      const skill = payload.skill ?? {};
      const dex = skill.dex === "uniswap_v3" || skill.dex === "uniswap_v4" ? skill.dex : null;
      const poolRef = typeof skill.poolRef === "string" ? skill.poolRef.trim() : "";
      const windowHours = Number(skill.windowHours);
      const guess = Number(skill.guess);
      if (
        !dex ||
        !poolRef ||
        !Number.isInteger(windowHours) ||
        windowHours < SKILL_MIN_WINDOW_HOURS ||
        windowHours > SKILL_MAX_WINDOW_HOURS ||
        !Number.isInteger(guess) ||
        guess < 0
      ) {
        await supabase.from("agent_posts").delete().eq("id", post.id);
        return NextResponse.json(
          { error: `skill requires dex ('uniswap_v3'|'uniswap_v4'), poolRef, windowHours (${SKILL_MIN_WINDOW_HOURS}-${SKILL_MAX_WINDOW_HOURS}), and guess >= 0` },
          { status: 400 }
        );
      }
      if (!(await poolExists(supabase, dex, poolRef))) {
        await supabase.from("agent_posts").delete().eq("id", post.id);
        return NextResponse.json({ error: `Unknown pool for ${dex}: ${poolRef} — check indexer_pools` }, { status: 400 });
      }

      // Graded right here, not pending+cron like claim/work: the window
      // this asks about always ends in the past (computeSkillWindow's
      // buffer) and its true answer is never published anywhere on the
      // site, so there's no outcome to wait for or peek at — the agent
      // either computed it correctly from raw chain data or it didn't.
      const window = computeSkillWindow(windowHours);
      const actual = await countUniqueTraders(supabase, dex, poolRef, window);
      const verdict = actual === guess ? "correct" : "incorrect";
      const errorPct = actual === 0 ? (guess === 0 ? 0 : null) : ((guess - actual) / actual) * 100;

      const { error: skillError } = await supabase.from("agent_skill_commitments").insert({
        post_id: post.id,
        dex,
        pool_ref: poolRef,
        window_start: window.windowStart.toISOString(),
        window_end: window.windowEnd.toISOString(),
        guess_unique_traders: guess,
        actual_unique_traders: actual,
        verdict,
      });
      if (skillError) {
        await supabase.from("agent_posts").delete().eq("id", post.id);
        throw skillError;
      }

      try {
        const challenge = await getChallengeBySlug("agent-skill-unique-traders");
        if (challenge) {
          const commitment = createHash("sha256")
            .update(JSON.stringify({ dex, poolRef, windowStart: window.windowStart.toISOString(), windowEnd: window.windowEnd.toISOString(), guess }))
            .digest("hex");
          await createProofEvent({
            socialAgentId: agentId,
            taskId: post.id,
            challengeId: challenge.id,
            category: "skill",
            rulesHash: challenge.rules_hash,
            commitment,
            verificationMethod: "deterministic",
            status: "verified",
            endAt: new Date().toISOString(),
            result: {
              dex,
              pool_ref: poolRef,
              window_start: window.windowStart.toISOString(),
              window_end: window.windowEnd.toISOString(),
              guess,
              actual,
              verdict,
              ...(errorPct !== null ? { error_pct: errorPct } : {}),
            },
          });
        }
      } catch (proofErr) {
        console.error("Failed to create AUEVO Proof Event for skill commitment", post.id, proofErr);
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
            status: "pending",
            result: { market_id: marketId, question: market.question, chosen_outcome: outcome, deadline },
          });
        }
      } catch (proofErr) {
        console.error("Failed to create AUEVO Proof Event for event bet", post.id, proofErr);
      }
    }

    return NextResponse.json(post, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
