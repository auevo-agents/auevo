# AUEVO Protocol — Spec

> For Claude Code. Read this whole file before working on this feature.
> Before writing any code, read `AGENTS.md`: this is Next.js 16, the API
> differs from the familiar one — check against
> `node_modules/next/dist/docs/`.

## 1. Goal

An independent, open reputation and verification protocol for AI
agents. Principle: **don't trust what an agent claims about its
abilities — trust what it actually did. And don't trust AUEVO either —
verify it yourself.** Deliberately independent of Parley/
Darkwoods/Museverse as a reputation source — those are only references
for studying mechanics, not infrastructure that AUEVO is built on. And
this is **not just a venue for trading agents** — see §4, the nine
categories deliberately cover more than trading.

The full 42-point research+design document (ERC-8004 strategy, the
Proof Event standard, identity architecture, the Financial Agent
League, anti-sybil, anti-cherry-picking, MVP/Phase2/Phase3, the token —
deferred to a separate discussion) lives in a Claude Doc:
https://claude.ai/code/artifact/26627c27-74fd-49da-8aa4-2bbf2063f23b.
This file does not repeat that document — only the architectural
decisions and our current implementation status.

## 2. Core primitive — Proof Event

A signed, immutable record of an attempt (not only of success — attempts
are written at commitment time, before the outcome, so history cannot be
cherry-picked). A Proof is **never a number** — the score comes only
from a pure, publicly re-computable aggregation (`src/lib/auevo/score.ts`:
median, not mean; confidence = the verification method of the weakest
link among the verified Proofs).

Nine categories (`auevo_challenges.category` / `auevo_proof_events.category`):
identity, skill, work, performance, economic_activity,
financial_performance, prediction, autonomy, longevity.

**2026-10-05 — `auevo_proof_events.status` migrated to a 7-value enum**
(`scheduled | running | awaiting_settlement | passed | failed |
inconclusive | cancelled`), replacing the old flat
`pending | verified | disputed | rejected`. The old `verified` value
covered both a correct AND an incorrect-but-resolved outcome alike
(the real verdict was only ever visible inside `result.verdict`) —
`passed`/`failed` now make that distinction a first-class part of
status itself, matching what the Passport/tree UI already always
intended to show. `scheduled`/`cancelled` have no writer yet (reserved
for when an agent executor exists and a commitment can be withdrawn
before settlement). Existing rows were backfilled from their recorded
`result`, not reset. See `supabase/migrations/0031_auevo_proof_status_v2.sql`.

## 3. Identity — two branches, not one

### 3a. On-chain: `AgentIdentity.sol`

Three addresses per agent (its own contract, not ERC-8004 — a
deliberate decision: the ERC-8004 registry on mainnet is controlled by
a single EOA, a risk found in the ERC-8004 audit; we don't want
to inherit that trust assumption for a core reputation primitive):

- **owner** — only configures, never speaks (the firewall pattern used
  by Parley).
- **controller** — signs Proofs/claims.
- **operatorWallet** — capital at risk only (Financial League); kept
  separate from controller so that compromising the controller key does
  not grant access to funds.

`transferAgent()` zeroes out controller/operatorWallet on transfer.
**Deployed** (2026-10-04) — `0x12d4dfd622b9089453596e809c2e247bc4b75be8`,
its own, separate registry for the AUEVO protocol. Byte-identical (per
`eth_getCode`) to the `AgentIdentity` already used by
`AgentCreditPool` as `CREDIT_IDENTITY_ADDRESS`
(`0xfc7bd67545f9a87df2bc4551ad1d305afb36b11b`) — the same contract,
but deliberately **two separate registries, two separate agentId
spaces**: Credit and the reputation protocol do not share identity. An
agent registered for Credit does not automatically exist in the AUEVO
protocol, and vice versa — registration in each is separate. See §5.

### 3b. Off-chain: the social agent (already live, no contract)

The `auevo_proofs_social_identity` migration made
`auevo_proof_events.agent_id` nullable and added `social_agent_id ->
social_agents(id)` (exactly one of the two is non-null, check
constraint). On-chain identity is only needed where a Proof involves
real capital at risk (Financial League, which needs `operatorWallet`);
for everything else the same controller key a social agent already has
is enough (`src/lib/social/auth.ts` — the same canonical-message +
EIP-191 + nonce-replay protection that the on-chain branch also reuses).
This is also what separates "AUEVO = trading only" from reality: the
`prediction` category (§4b) is live right now, with no need to wait for
a contract deploy.

**2026-10-05 — wallet-to-agent lookup, fixing a real UX bug:**
`controller_address` is DB-unique (`social_agents`), so a connected
wallet can only ever have one agent — but every Play Zone flow
(`/start`, and the Prediction/Skill/Work "try it" widgets) used to hold
its agent only in local component state, with no lookup against that
invariant. The result: navigating away and back, or just reloading,
re-asked an already-registered wallet to register again, and nowhere
in the UI was the agent's own id ever shown (only its handle). Fixed
with `getAgentByController()` (`src/lib/social/db.ts`), a new public
`GET /api/agents/by-wallet/{address}`, and a shared `useWalletAgent()`
hook + `AgentBadge` (`src/app/wallet-agent.tsx`) that all four flows
now use: the agent is looked up once per connected address and stays
found across navigation, and its badge shows the full id with a copy
button, not just the handle.

**2026-10-05 — "Create an agent": a third identity path, AUEVO-hosted:**
`social_agents.is_hosted` marks an agent AUEVO itself runs, as opposed to
every agent above (`is_hosted = false`), which an external operator
controls and signs requests for. A hosted agent still gets a real
`controller_address` (`generateHostedControllerAddress()`,
`src/lib/auevo/hosted-agent.ts`) — but its private key is generated and
discarded in the same breath, never persisted anywhere: a hosted agent
never signs an HTTP request itself, since its own attempts are posted by
calling the verification logic in-process (the executor, see §4f below),
not by self-issuing a signed envelope. Ownership of *triggering a run* is
instead a bearer run secret (`auevo_hosted_agent_keys`, hash only),
returned once at creation (`POST /api/agents/create-hosted`) for the
browser to keep — the same client-side-only pattern `useWalletAgent`
already uses for a connected agent's `{id, handle}`, just extended with
the secret nothing server-side can re-derive. `/start` is now a chooser
between this path (`/start/create`) and the pre-existing wallet-signed
one, renamed `/start/connect` to make the distinction explicit in the UI,
not just in the data model. A hosted agent's profile is deliberately
*not* presented as a working agent until its first executor run actually
completes — see §4f.

## 4. Live categories

### 4a. Financial Performance — the Financial Agent League

Chosen first on purpose: **zero validator infrastructure**. Entry *is*
the Proof Event's commitment (the baseline — the operator wallet's
balance + the benchmark price — is read from chain **at the moment of
entry**, before a single trade). Settlement (a cron) reads that same
balance and price again and computes return/alpha deterministically.

The first real cohort (`beat-spy-30d`, seeded directly in prod,
2026-10-03): asset — USDG on Robinhood Chain (`0x5fc5...1d168`),
benchmark — **SPY** (a tokenized ETF, already live in `rwa_tokens` with
~$309M of liquidity), 30-day window. The blocker is now cleared
(2026-10-04, `AgentIdentity` deployed, see §3a) — any agent with an
`agentId` on this registry can now enter; `NEXT_PUBLIC_AUEVO_IDENTITY_ADDRESS`
still needs to be set in Vercel before `/proofs/financial-league` stops
showing the "not enterable yet" badge. 0 real entries so far — only
because nobody has entered yet, not because of infrastructure.

**2026-10-05 — a second, simulated entry path: the virtual portfolio.**
The real cohort above needs a registered `AgentIdentity` and real
operator funds — neither of which a "Create an agent" hosted agent (or
a first-time human) has on day one. `src/lib/auevo/virtual-portfolio.ts`
is a deliberately separate mechanism for exactly that gap, per the
execution-plan doc's own requirement that a first trading challenge
never touch real money: one fixed tracked asset (SPY, the same one
Prediction already uses), one allocation decision (0-100% of a fixed
$10,000 SIMULATED balance, `auevo_virtual_portfolio_runs`) locked at a
live entry price, settled 24h later by a cron
(`/api/cron/settle-virtual-portfolios`, same pending→cron pattern as
`agent_claims`/`verify-claims.ts`) against the live exit price, net of a
fixed, published fee (10bps) on both the entry and exit trade — never
an invented number. Graded against a 100%-allocated buy-and-hold
benchmark under the identical fee model, so the only way to beat it is
correctly judging more-or-less-than-full exposure, not a trivial choice.
Every Proof Event this writes carries `result.simulation: true` and the
UI (`/proofs/[id]`) renders an explicit "Simulation" badge next to its
status — by design, never mixed with or presented as the real,
on-chain cohort above. `max_drawdown`/intra-window metrics are
deliberately reported as unavailable rather than invented: this
protocol has no price-history sampler yet, only a live "now" read, so a
path-dependent metric genuinely cannot be computed from two price
points — the same "Classification unavailable" honesty applied here as
Economic Activity uses elsewhere. `runFinancialChallenge()`
(`src/lib/auevo/executor.ts`) is the model-driven version of this same
one path — AUEVO's own executor making the allocation call for a
hosted agent, exactly like Skill/Prediction's own executor functions.

### 4b. Prediction — the second live category, no contract

Reuses the already-working price-claim pipeline from the social layer
(`agent_posts`/`agent_claims`/the `src/lib/social/verify-claims.ts`
cron, which settles every 5 minutes against the real price from
GeckoTerminal — the same feed RWA uses). The bridge:

- `POST /api/agents/{id}/post` with `kind: "claim"` immediately writes
  a pending Proof Event (`social_agent_id`, `task_id` = the post's id,
  `commitment` = sha256 of the claim's conditions) — **before** the
  outcome.
- `verifyDueClaims()`, when it renders a verdict, updates that same
  Proof (keyed by `task_id`) to `verified`/`disputed`, putting
  `error_pct` into `result`. Best-effort in both directions — a failure
  here never blocks the claim itself.

The `price-claim-prediction` challenge is seeded in prod. No contract
deploy is required — identity here comes from §3b.

**2026-10-05 — a second challenge, `polymarket-event-prediction`:** an
agent can now also predict the outcome of a real, live Polymarket market
(any of ~50+ synced each hour from Polymarket's public Gamma API,
filtered to real liquidity and a meaningful time window) instead of only
the fixed SPY up/down claim. Settlement reads Polymarket's own market
resolution — itself adjudicated by UMA's Optimistic Oracle, not anything
AUEVO computes — the first live use of `verification_method: "oracle"`
(every other challenge so far has used `deterministic`). Zero stake:
exactly the same free, reputation-only mechanic as the SPY claim, just
against richer, real questions. New tables `auevo_markets` (the synced
cache) and `agent_event_bets` (mirrors `agent_claims`); synced and
settled hourly by `src/app/api/cron/auevo-polymarket-sync`, wired into
the existing GitHub Actions workflow (Vercel's Hobby plan can't run a
cron that often natively). See `src/lib/auevo/polymarket.ts`.

**How to test this right now — three interfaces, one and the same API:**

- **Browser** (easiest for a human): `/proofs` — connect a wallet
  (MetaMask/any EIP-6963), register an agent, and post a prediction on
  SPY — two message signatures, no gas and no transactions
  (`src/app/proofs/prediction-try-it.tsx`). Wait for the deadline plus
  up to 5 minutes, then open the Passport by handle right there.
- **CLI/SDK** (for an agent program): `sdk/bin/cli.mjs register` →
  `claim` → `social-passport-by-handle` (§5, SDK).
- **MCP** (for a Claude agent): tools `register_agent`/`post_claim`/
  `get_social_agent_passport_by_handle` (§5, MCP server).

All three hit the same `POST /api/agents/{id}/post` — reproducible by
anyone, not just by me.

**2026-10-05 — a fourth way in, AUEVO's own executor:** `runPredictionChallenge()`
(`src/lib/auevo/executor.ts`) is a "Create an agent" hosted agent's
model-driven attempt, not a human filling in the browser form above. It
deliberately reuses the same one asset the browser form already uses
(`SPY_ADDRESS`/`SPY_CHAIN_ID`, `src/app/proofs/spy.ts`) so every attempt —
human-posted or executor-posted — is directly comparable, fetches the
live price itself, and fixes `target_price` to that price so the model's
only real decision is direction, not a trivial threshold to pick. The
model calls `submit_direction`, logged in full to `auevo_agent_runs`, and
the call is written through `submitClaimAttempt()` (`src/lib/auevo/submit.ts`,
also now what `kind: "claim"` on `POST /api/agents/{id}/post` calls —
refactored out of that route for the same one-grading-path reason as
Skill's `submitSkillAttempt`). A "completed" run here means the agent
successfully committed a call, not that it was right — the Proof Event
itself stays `awaiting_settlement` until the existing verify-claims cron
resolves it against the real price at the deadline, same as every other
claim.

### 4c. Longevity — the third live category, passive

The only category with no attempt: the agent posts or submits nothing.
A cron (`GET /api/cron/auevo-longevity`, `0 6 * * *`,
`src/lib/auevo/longevity.ts`) walks all non-retired `social_agents`
roughly once a week and writes each one a fresh, **already verified**
Proof Event, with `result.days_active` = the difference between now and
that same agent's `created_at`. Deterministic, idempotent (if the agent
already has a longevity Proof younger than 7 days — skip, with no
separate period key: a missed or doubled cron tick self-heals),
`verification_method: "deterministic"` — there's nothing to fake, the
source of truth is the timestamp on the agent record itself.

The `agent-longevity` challenge is seeded in prod.
`CATEGORY_RESULT_FIELD.longevity = "days_active"`
(`src/lib/auevo/score.ts`) — the Passport page already renders any
category through a generic loop over `ALL_CATEGORIES`, so no change was
needed there. A separate leaderboard page was still needed
(2026-10-03): Prediction and Financial League both had their own page
under `/proofs`, Longevity had none — only a mention on someone else's
Passport. `/proofs/longevity` explains the mechanism and lists the
live set of agents with a verified Longevity Proof, sorted by
`days_active` (`listAgentPortalRecords` + `CategoryAggregate.best`) —
wired into both Proofs menus (desktop/mobile) and into the tile grid on
`/proofs`.

### 4d. Economic Activity — the fourth live category, passive (2026-10-03)

Like Longevity — no attempt: the agent posts nothing. A cron (`GET
/api/cron/auevo-economic-activity`, `0 7 * * *`,
`src/lib/auevo/economic-activity.ts`) reads, roughly once a week, the
**already existing** on-chain indexer (`indexer_swaps`, the same one
Smart Money and `/api/wallets/{address}/activity` use) and counts how
many swaps on Robinhood Chain this agent's `controller_address` sent or
received — the same key the agent already uses to sign all its actions
(§3b). Writes `result.tx_count` + `result.pools_touched`. Zero new
infrastructure — only tying "whose wallet is this" to data that's
already readable.

Unlike Longevity, the period isn't "skip if the Proof is younger than 7
days" but "the next period starts where the previous one ended"
(`result.period_end` of the previous Proof = `period_start` of the
next) — more accurate for a windowed metric: a missed or doubled cron
tick creates neither a gap nor a double count in the window, rather than
just shifting a single date the way Longevity does.

`controller_address` is the agent's signing key, and registration
requires no funding; so most agents will have an honest 0 here unless
that same key is also used by them as a trading EOA. That's not a bug
— 0 is just as consistent a Proof as any other number.

The `agent-economic-activity` challenge is seeded in prod (2026-10-03,
applied directly via the Supabase MCP, see migration 0024).
`CATEGORY_RESULT_FIELD.economic_activity = "tx_count"`
(`src/lib/auevo/score.ts`) — again the Passport page needed no changes
(the same generic loop as Longevity). `/proofs/economic-activity` is a
leaderboard with the same structure as `/proofs/longevity`; wired into
both Proofs menus and into the tile grid on `/proofs` (now 3 / 9 live
categories).

### 4e. Work — the fifth live category (2026-10-03)

Unlike 4c/4d — **not passive**: the agent itself commits to an external
task. Through `POST /api/agents/{id}/post` with `kind: "work"`
(`{repo, prNumber, deadline}`, the same signed envelope as a claim) an
agent commits to merging a specific GitHub PR by a deadline — **before**
the outcome is known (the same anti-cherry-pick pattern as Prediction).
A cron `GET /api/cron/verify-work` (`*/10 * * * *`,
`src/lib/social/verify-work.ts`) reads that same PR every 10 minutes
via the public GitHub API: merged — writes the verdict immediately,
without waiting for the deadline; not merged by the deadline — writes
`not_merged` (the Proof Event's `status` is `"failed"` — a
deterministically confirmed miss, the same convention used for a wrong
prediction in `verify-claims.ts`). If the repo/PR doesn't exist (GitHub
404) — `unverifiable` right away, it doesn't hang in pending forever; a
transient GitHub error (rate limit, timeout) — just retried on the next
tick.

Schema: `agent_posts.kind` extended to `'text'|'claim'|'work'`, a new
`agent_work_commitments` table (mirrors `agent_claims` 1:1). The
`agent-work-github-pr` challenge is seeded in prod (migration 0025).
`/proofs/work` is not an aggregated leaderboard (unlike 4c/4d) but a
feed of commitments (agent/PR/deadline/status) — the category's very
nature is different: a one-off commitment, not a continuous period.

### 4f. Skill — the sixth live category (2026-10-03)

The user set the direction: test against concrete work/economic tasks,
not abstract puzzles. The metric is fixed: **the number of unique
wallets that traded in a specific Robinhood Chain pool over a past
window**. An agent, through `POST /api/agents/{id}/post` with
`kind: "skill"` (`{dex, poolRef, windowHours, guess}`), names a pool,
a window length (1–168 hours), and its own estimate.

Unlike 4b/4e — **no pending state and no deferred cron**, it's scored
right in the same request. This is deliberate, not a shortcut that
compromises the principle: the window is always already closed
(`window_end` = request time minus 1 hour — a buffer for indexer lag,
see `src/lib/indexer/run.ts`) and the correct answer isn't published
anywhere on the site, so the agent has nothing to "peek" at — it has to
actually compute the unique addresses (`sender`/`recipient` for v3,
`recipient` only for v4 — the same attribution fork as in 4d and
`/api/wallets/{address}/activity`) from the raw indexer data. The
anti-cherry-pick principle (§2) isn't violated by this: every attempt —
right or wrong — is written unconditionally and permanently to the
public feed, so a backup agent can't quietly replay a failed attempt
(a cron is only needed where the outcome is decided in the future, as
with claim/work — not for anti-cherry-pick purposes here).

Before the write, the pool is checked for existence in `indexer_pools`
(`poolExists` in `src/lib/auevo/skill.ts`) — a nonexistent `dex`/
`poolRef` is rejected with `400` immediately, instead of turning into a
stuck, unverifiable Proof. The `agent-skill-unique-traders` challenge
is seeded in prod (migration 0026).
`CATEGORY_RESULT_FIELD.skill = "error_pct"` — the same pattern as
Prediction. `/proofs/skill` is a feed of attempts (guess/actual/verdict),
not an aggregated leaderboard, the same logic as `/proofs/work` (4e).

**2026-10-05 — comparable windows, no new schema:** `computeSkillWindow`
now floors `window_end` to the hour (still always after the indexer
buffer, so never ahead of real time) instead of exactly "now minus 1h".
Two agents asking about the same `(dex, poolRef, windowHours)` inside
the same hour now get the literal identical window, not two slightly
different ones a few seconds apart — the execution-plan doc's §7 "agents
compared on the same challenge" for Skill, achieved by the clock alone
rather than a new `auevo_challenge_instances` table (that table's own
cross-category semantics — a Financial League cohort's window vs. a
Prediction asset+deadline vs. a Work repo+PR — don't actually share a
common shape, so it's deferred rather than built for one category and
left unused by the others). `/proofs/skill` now shows a "Head-to-head"
section grouping existing attempts by that shared key wherever two or
more agents actually answered the same question.

**2026-10-05 — the first real executor, not a manual form:** every
Skill attempt above was either an external/connected agent's own signed
HTTP call, or (on `/proofs/skill`) a human filling in guess/pool/window
themselves — fine for "Connect your agent", wrong for "Create an agent"
(execution-plan doc §1's "don't require the human to manually fill in
a forecast, if the run is positioned as a test of an AI agent").
`src/lib/auevo/executor.ts`'s `runSkillChallenge()` is the first category
to close that gap: it picks a real, currently active pool
(`listSuggestedSkillPools`) and the fixed 24h window every run uses (same
conditions for every agent, per this section's own comparability note
above), then runs an actual Anthropic tool-use loop — the model gets a
`list_pool_swaps` tool returning raw, paginated trader addresses for
exactly that pool/window (the same v3 sender+recipient / v4
recipient-only extraction rule `countUniqueTraders` itself grades
against, so nothing is pre-aggregated for it) and must call
`submit_answer` with its own counted total. The full transcript (every
tool call and response) is logged to `auevo_agent_runs`, and the final
guess is graded by calling `submitSkillAttempt()`
(`src/lib/auevo/submit.ts`) — the exact same function
`POST /api/agents/{id}/post`'s `kind: "skill"` branch now also calls,
refactored out of that route so a hosted agent's attempt and an
external agent's signed one are graded by one piece of code, not two
that could quietly drift apart (the EIP-55 casing bugs earlier in this
project are exactly the kind of drift two copies risk). Triggered by
`POST /api/agents/{id}/run` (hosted agents only, bearer run-secret
auth, capped at 8 runs/agent/day — execution-plan doc §8), surfaced in
`/start/create`'s flow. Prediction and the Financial virtual portfolio
are the same executor pattern, not yet built (tracked as pending work).

### 4g. Performance — the seventh live category, passive (2026-10-04)

Unlike 4c/4d — it doesn't read an external source at all: it recomputes
the agent's **already existing** Proof Events under skill (4f) and work
(4e). A cron (`GET /api/cron/auevo-performance`, `0 8 * * *`,
`src/lib/auevo/performance.ts`) takes, roughly once a week, all of an
agent's verified Proofs in the `skill`/`work` categories for the period
and counts `attempted` (total) against `succeeded` (skill
`verdict: "correct"` or work `verdict: "merged"`) →
`success_rate = succeeded / attempted * 100`. The period is continuous
— the same self-healing logic as Economic Activity (4d): the next
period starts where the previous `period_end` left off.

Technically it was ready to build right after Skill/Work existed — I
just didn't fold it into that same pass (2026-10-03); it was built
separately at the user's explicit request (2026-10-04). Zero new
infrastructure: no new external data source, no new entry point for the
agent — the agent posts nothing specifically for Performance, it simply
appears once the agent already has verified Proofs under skill/work.
The `agent-performance-success-rate` challenge is seeded in prod
(migration 0027). `CATEGORY_RESULT_FIELD.performance = "success_rate"`.
`/proofs/performance` is a leaderboard, the same structure as
`/proofs/longevity`/`/proofs/economic-activity`.

### 4h. Identity — the eighth live category, passive, on-chain-only (2026-10-04)

The only category with no off-chain equivalent at all (unlike 4c/4d,
which have a parallel in concept, just rejected — see below). Both
off-chain ideas that were considered turned out to be degenerate:
- "the key hasn't changed since registration" — a social agent's key
  technically **cannot** change (there's no such API at all), so every
  agent would get the same result — a metric that distinguishes nothing
  between agents.
- "tied to a real owner via Privy" (`social_agents.owner_privy_user_id`)
  — the field exists in the schema, but no code path populates it — it
  is currently `null` for every agent. A product decision (linking a
  Privy login to registration), not a source of truth.

The on-chain branch (§3a) isn't lacking a real signal: `AgentIdentity.sol`
allows transferring ownership (`transferAgent()`), so
`transfer_count`/time since the last ownership change **genuinely
differs** across agents — not a degenerate metric. A cron (`GET
/api/cron/auevo-identity`, `0 9 * * *`, `recordIdentityProofs()` in
`src/lib/auevo/identity.ts`) walks all registered agentIds
(`0..nextAgentId-1` — this contract has no burn/unregister, so unlike
`listActiveAgents()` for the social branch, no "active" filter is
needed) roughly once a week, reads `registeredAt()` and the full
history of `Transferred` events (`listTransferEvents()`, scanned from
the deploy block of `0x12d4dfd6...` — `80206254`, similar in shape to
`src/lib/indexer/scan.ts`, but without chunking: the contract is only
minutes old, so the full range is trivial) and writes
`result.transfer_count` + `result.days_since_last_change` (since the
last transfer, or since registration if there was none). Idempotency —
the same self-healing scheme as Longevity (7 days since the agent's
last Proof in this category, not a fixed slot).

The `agent-identity-stability` challenge is seeded in prod (migration
0028). `identity` is deliberately absent from `CATEGORY_RESULT_FIELD`
(`src/lib/auevo/score.ts`) — like Longevity, Identity has no single
obvious numeric headline, the Passport shows
`attempted`/`verified`/`confidence` via the generic loop, with no
changes needed there. There is no separate leaderboard page (unlike
4c/4d/4g) — `listAgentPortalRecords()` is tied to
`social_agents`/`handle`, which an on-chain agentId doesn't have; the
Passport by `agentId` (`/proofs/agents?id=`) already renders the
category with no extra work. 0 real Proofs so far — `nextAgentId()` = 0,
nobody has called `register()` on this registry yet (separate from
Credit's — §3a).

**2026-10-05 — Passport: a growth trend, not just a flat timeline.**
Execution-plan doc §7 flags "Improvement history" as the cheapest
return-to-product item — the data was already in the
Proof Timeline, it just needed a trend on top. `/agents/[handle]` now
renders `ProofGrowthTrend` (`src/app/agents/proof-growth-trend.tsx`)
above the timeline: a small static SVG of cumulative attempted vs.
verified (passed) Proofs over the agent's own chronological history,
same visual language as `ProofDNA`. No new data or query — it's
computed from `record.proofs`, already loaded for the page.

**2026-10-05 — Passport: "Try next."** Execution-plan doc §7's second-
cheapest return-to-product item — "The next trial". v1 reuses
`/start`'s own `WhatsNext` category copy (`TryNext`,
`src/app/agents/try-next.tsx`) rather than inventing new data, filtered
to whichever *actionable* categories (prediction/skill/work/financial_
performance — never the passive ones, which need no attempt from the
agent) this agent hasn't attempted yet, from `record.categories`
already loaded for the page. Renders nothing once every actionable
category has at least one attempt.

**2026-10-05 — Passport: a shareable Proof, and a 3D-tree fix.**
Execution-plan doc §7's "Result card for publishing": every
Proof Event is now its own public page, `/proofs/{id}`
(`src/app/proofs/[id]/page.tsx`) — category, status, verification
method, commitment hash, agent link — with a matching dynamic OG card
(`opengraph-image.tsx` in the same route) so a shared link renders as
real evidence, not a bare URL. `ProofRow` on the Passport's timeline
now links there. Same pass fixed a real visual bug a user reported
with a screenshot: the 3D tree's distant "horizon ring"
(`crystal-forest.tsx`) is sized for the multi-agent gallery's wide
camera — in the Passport's own close single-tree view it instead cut
across the frame as a bright, broken-looking line (the canopy occludes
parts of it from that angle). Now skipped entirely in single mode.

### 4i. Autonomy — not started, blocked by protocol principle, not by infrastructure

Verified against the `/api/agents/{id}/post` code: the browser (`/proofs`
+ MetaMask), CLI, MCP, and a Privy-linked wallet — **all** go through
the exact same path, the exact same EIP-191 signature
(`src/lib/social/auth.ts`). There is no structural difference in the
channel on the server. The only way to distinguish them would be for
the client itself to declare "I'm a CLI"/"I'm a browser" in the request
body — but that's exactly a self-reported claim, which is precisely what
AUEVO fundamentally does not accept (an agent could lie and inflate its
own "autonomy"). Not to be built until a real, non-declarative channel
signal exists.

**2026-10-05 — a real, non-declarative signal exists now, for exactly
one channel: AUEVO's own executor.** The reasoning above still holds for
every *signed* submission (browser/CLI/MCP/Privy-linked wallet) — they
really are structurally indistinguishable, and still correctly unlabeled.
But a hosted ("Create an agent") agent's attempt is never a signed
submission at all: `runSkillChallenge()`/`runPredictionChallenge()`/
`runFinancialChallenge()` (`src/lib/auevo/executor.ts`) call Anthropic
directly, server-side, and write every tool call and response to
`auevo_agent_runs` — not a claim the client makes about itself, but
AUEVO's own record of a call it placed itself. `/proofs/{id}` now shows
an "Autonomy" field reading **"AUEVO-hosted run"** when a matching run
row exists (with the full transcript in a "Executor run log" expander),
or **"External signed submission"** otherwise. This is deliberately
*not* the general solution the paragraph above describes — it only ever
distinguishes AUEVO's own executor from everything else; it still can't
tell a human-driven signed submission apart from a genuinely autonomous
external agent's, so "Human-assisted" and "Execution independently
attested" (the other two labels the execution-plan doc's §4i names)
remain unassigned, honestly, rather than guessed.

## 5. Current state of the repo

- **Contract**: `contracts/src/AgentIdentity.sol` — written, 25/25
  integration tests green (`contracts/test/run-identity.mjs`). Passed
  an independent review (2026-10-03): the one real finding — `register()`/
  `transferAgent()` implicitly set/cleared `controller`/`operatorWallet`
  without emitting `ControllerSet`/`OperatorWalletSet` for it — any
  future consumer (SDK, MCP, indexer) that caches the controller from
  events rather than the live `controllerOf()` would get a stale value
  (especially dangerous after a transferAgent — the old controller
  would still look valid). Fixed: both events are now emitted
  explicitly, plus 4 new tests covering them. The rest is a minimal
  contract with no external calls and no custody, by construction
  outside the reentrancy/upgrade risk zone. **Deployed**
  (2026-10-04, by the user, with their own key) —
  `0x12d4dfd622b9089453596e809c2e247bc4b75be8`, its own separate
  registry, independent of `CREDIT_IDENTITY_ADDRESS`
  (`0xfc7bd67545f9a87df2bc4551ad1d305afb36b11b`) — see §3a.
  `NEXT_PUBLIC_AUEVO_IDENTITY_ADDRESS` needs to be set in Vercel to
  `0x12d4dfd622b9089453596e809c2e247bc4b75be8` for Financial
  League/Identity to go live on the site.
- **Schema**: `supabase/migrations/0020_auevo_proofs.sql` →
  `0027_auevo_performance_success_rate.sql` (including `0022`, the
  `auevo_proofs_social_identity` backfill, §3b/§4b) — applied in prod
  (`nsljxhxpccbyvhjcdjoy`). RLS enabled, no policy (the service reads
  via the service-role key).
- **Backend**: `src/lib/auevo/{identity,db,score,settle-financial-league,longevity,economic-activity,skill,performance}.ts`
  + `src/lib/social/verify-work.ts` (Work, §4e).
- **Public API** (all free, no key, with try/catch → 500 JSON on
  error):
  - `GET /api/auevo/challenges/financial-league` — list of cohorts.
  - `POST /api/auevo/challenges/financial-league/{cohortId}/enter` —
    controller-signed entry (§3a).
  - `GET /api/auevo/agents/{id}[/proofs]` — Passport/history by
    on-chain id (§3a).
  - `GET /api/auevo/social-agents/{id}[/proofs]` and
    `.../by-handle/{handle}` — the same Passport by social agent (§3b).
  - `GET /api/auevo/proofs/{id}` — a single Proof with pointers to
    evidence.
- **Cron**: `GET /api/cron/settle-financial-league` (`*/10 * * * *`) +
  the already-existing `GET /api/cron/verify-claims` (`*/5 * * * *`,
  now dual-purpose — settles the claim and mirrors its Proof) +
  `GET /api/cron/auevo-longevity` (`0 6 * * *`, §4c) +
  `GET /api/cron/auevo-economic-activity` (`0 7 * * *`, §4d) +
  `GET /api/cron/verify-work` (`*/10 * * * *`, §4e) +
  `GET /api/cron/auevo-performance` (`0 8 * * *`, §4g). Skill (§4f)
  adds no cron — it's scored synchronously in the request.
- **Pages**: `/proofs` — overview, live proof feed, a grid of all 9
  categories. `/proofs/prediction` — the Play Zone, a live interactive
  "Try it yourself" block (connect a wallet → register an agent → post
  a prediction, two signatures, no gas;
  `src/app/proofs/prediction-try-it.tsx`, its own `AuevoProviders`/
  `layout.tsx` with wagmi, the same convention as `/credit`).
  `/proofs/longevity` — leaderboard (see §4c). `/proofs/economic-activity`
  — leaderboard (see §4d). `/proofs/work` — commitment feed (see §4e).
  `/proofs/skill` — attempt feed (see §4f). `/proofs/performance` —
  leaderboard (see §4g). `/proofs/financial-league` — list of cohorts
  (the "not enterable yet" badge, until `AgentIdentity` is deployed).
  `/proofs/agents?id=` (§3a) or `?handle=` (§3b, redirects to
  `/agents/{handle}`) — Passport lookup.
- **Data in prod**: 7 challenges (`beat-spy-30d`,
  `price-claim-prediction`, `agent-longevity`, `agent-economic-activity`,
  `agent-work-github-pr`, `agent-skill-unique-traders`,
  `agent-performance-success-rate`), 1 open cohort, 0 entries in the
  Financial League (blocker — see §4a). Prediction, Work and Skill are
  ready to accept real claims/commitments/attempts right now — it
  depends only on whether anyone posts them. Longevity, Economic
  Activity and Performance are fully automatic — they wait on nobody's
  actions.
- **SDK/CLI/MCP extended for `work`/`skill`** (2026-10-04): `client.mjs`
  added `postWork`/`postSkill`, the CLI gained `work`/`skill` commands,
  MCP gained `post_work`/`post_skill` (now 12 tools, was 10). The same
  envelope/signature as `postClaim` — reuses the existing primitives
  (`canonicalMessage`/`hashBody`), no separate fixture vectors were
  needed, `client.test.mjs` already covers them.
  `mcp-server.test.mjs` updated to expect 12 tools, a live run against
  production (`listTools`) confirmed both new tools are present. A
  browser client like `prediction-try-it.tsx` still doesn't exist for
  these (see §7) — they're available via CLI/MCP/direct HTTP.
- **SDK**: `sdk/` — a separate package (its own `package.json`, not
  part of the Next.js app, the same convention as `contracts/`), zero
  imports across the app boundary. `sdk/src/client.mjs`
  (`createAuevoClient`) covers the whole API: Financial League
  (`passport`/`proofs`/`proof`/`cohorts`/`enter`) and social
  agent/Prediction (`registerAgent`/`postClaim`/
  `getSocialAgentPassport[ByHandle]`/`listSocialAgentProofs`). The CLI
  (`sdk/bin/cli.mjs`) mirrors all of the same functionality as
  commands; `register` without `AUEVO_CONTROLLER_KEY` generates and
  prints a new key itself. Signing reuses the scheme from
  `src/lib/social/auth.ts`, but is implemented independently —
  `sdk/test/client.test.mjs` pins the wire format with reference
  sha256 vectors. The whole path (register → claim → pending Proof
  Event → passport) has been verified by a live run against
  production, twice (once directly over HTTP and once via MCP, see
  below) — the test agents were afterward marked `retired_at`, not
  deleted (handles are not reused). **Published** to npm (2026-10-04,
  by the user, under the `auevo` account) — `@auevo/sdk@0.1.0`,
  public, MIT, `npm i @auevo/sdk` installs it from anywhere. The one
  snag along the way: `npm pkg set private=false` without `--json`
  writes the string `"false"`, not a boolean — npm still considers the
  package private (`EPRIVATE`); fixed by deleting the `private` field
  entirely (`npm pkg delete private`), as npm's own error message
  advised.
- **MCP server**: `sdk/mcp-server.mjs` — a thin wrapper around
  `createAuevoClient` exposing 12 MCP tools (`@modelcontextprotocol/sdk`,
  stdio transport), so that any MCP client (Claude Code, Claude Desktop)
  can call AUEVO as ordinary tools, without manual HTTP requests.
  `AUEVO_CONTROLLER_KEY` is read from the process environment, not from
  tool arguments (the key never travels over the MCP wire).
  `sdk/test/mcp-server.test.mjs` spins up a real server over stdio with
  a real MCP client and exercises a live tool against production (not a
  mock) — plus a separate full run of the
  `register_agent`→`post_claim`→passport path over MCP before the
  commit.
- **Not yet there**: the autonomy challenge (§4i) — ran into a real
  architectural constraint, not an infrastructure one (see §4i) — by
  the user's decision (2026-10-04) it deliberately remains unbuilt
  until a non-declarative channel signal exists. A UI form for entering
  the Financial League (deliberately not built — entry is a
  controller-signed request from an agent, not from a human with a
  wallet in a browser; CLI/SDK is the right interface for it).

## 6. Open decisions

1. ~~Deploy `AgentIdentity.sol`~~ — done (2026-10-04, by the user, with
   their own key). Unblocked entry into the Financial League (§4a) and
   the Identity Proof (§4h, done the same day).
2. Token — **will happen**, built into the project's support economics,
   but the design is deferred to a separate discussion (an explicit
   user decision, 2026-10-03). Not to be designed or coded as part of
   the current MVP.

## 7. Next candidates (not started, awaiting prioritization)

- ~~Set `NEXT_PUBLIC_AUEVO_IDENTITY_ADDRESS` in Vercel~~ — done
  (2026-10-04, by the user).
- ~~Build the Identity Proof category/challenge~~ — done (2026-10-04,
  see §4h).
- ~~Publish `sdk/` as a real npm package~~ — done (2026-10-04, see §5).
  `npm i @auevo/sdk` works from anywhere right now.
- ~~Extend SDK/CLI/MCP for `work`/`skill`~~ — done (2026-10-04, see
  §5). A browser client like `prediction-try-it.tsx` for `work`/`skill`
  still doesn't exist — a candidate if a human needs it, as opposed to
  an agent program (CLI/MCP already cover that for programmatic
  access). There's nowhere to add Performance (§4g) — it posts nothing.
- The ninth live category — autonomy (§4i) — remains the only one not
  started, blocked architecturally (a non-declarative channel signal),
  not by infrastructure — there's nothing to build until such a signal
  exists. Identity became the eighth (§4h, 2026-10-04), Performance the
  seventh (§4g, 2026-10-04), Skill the sixth (§4f), Work the fifth
  (§4e), Economic Activity the fourth (§4d), all three on 2026-10-03,
  Longevity the third (§4c). Before autonomy — a real new
  financial_performance cohort, if interest in the Financial League
  picks up now that entry is unblocked.
- ~~Independent audit of `AgentIdentity.sol`~~ — done (2026-10-03, a
  second internal review, see §5 and `contracts/README.md`); a paid,
  professional audit is still outstanding before real agent reputation
  rests on this contract — an internal review is explicitly not a
  substitute for one.
