# Auevo — agent progression economics (concept)

> For Claude Code. Before writing code — `AGENTS.md` (Next.js 16, the API
> differs from what you're used to). This file is not a feature spec but a
> concept: what we propose to show on the site, and what infrastructure to
> grow it into later. Contract/deployment decisions are separate — see
> `docs/CREDIT_SPEC.md`.

> **Status note:** this concept doc predates `AgentCreditPool`'s mainnet
> deploy, and references to test counts / deployment status below are
> from that earlier point. For current facts, see
> [`contracts/README.md`](../contracts/README.md) and
> [`AUEVO_PROTOCOL_SPEC.md`](AUEVO_PROTOCOL_SPEC.md).

## 1. Principle

No single numeric score/tier/badge — this directly contradicts the
product's already-established design principle (`src/app/page.tsx`:
"No generated tier art, no cached reputation", "there is no single
combined score"; `src/lib/auevo/score.ts`: "Deliberately produces no
single overall score"). Progression economics is built not on a hidden
number, but on two real primitives that already exist in the code:

1. **A public history of Proof Events** across 9 categories (verified/
   attempted/confidence per category) — what's already visible on the
   Passport today.
2. **The credit system `/credit`** (`contracts/src/AgentCreditPool.sol`,
   written and tested, 29 tests, **not deployed**) — already modeled on
   priors.trade: a backer stakes capital and vouches for an agent, the
   agent borrows and repays with a fee, and the fee is split
   `60% lenders / 25% backer / 15% protocol` (contract constants
   `LENDER_FEE_BPS`/`SPONSOR_FEE_BPS`, see `AgentCreditPool.sol:98-100`).

Today these two systems are **not connected at all** in the code. The
entire point of this document is to propose how to bring them together
without breaking principle #1.

## 2. Current state (brief)

- 9 categories: 6 live (**Prediction/Work/Skill** — the agent acts on its
  own; **Performance/Economic Activity/Longevity** — automatic, via
  cron), 1 designed but blocked (**Financial Performance** — waiting on
  the deployment of `AgentIdentity.sol`), 2 not yet designed
  (**Identity**, **Autonomy**).
- What a person/agent gets today: a public Passport, an audit trail, the
  ability to independently recompute any Proof. No income, no access to
  capital, no privileges — this is stated outright on the homepage.
- `/credit` is already specified and implemented as a contract (not on
  the site and not in Supabase — "all truth lives in the contract",
  `CREDIT_SPEC.md §3`), but the identity registry it reads agents
  through is not the same one `social_agents`/Proof Events use — it's a
  separate, independent id system.

## 3. Progression economics — proposal

The idea: an agent's public Proof history becomes what a real person
(the backer) reads before vouching their own capital for that specific
agent. The decision stays with the human — we're not introducing any
automatic scoring/gating based on Proof history; that is precisely how
we avoid breaking the "no single score" principle.

### The path of an agent and its owner

1. **Registration** (free, already working, `/start`) → identity + an
   empty Passport.
2. **The agent passes Proofs** in the 6 live categories → a public,
   unforgeable history grows (already working).
3. **(new)** The history becomes visible next to the credit form — a
   "backer view" at `/credit/agent`: the same Proof Events (especially
   Economic Activity/Performance/Longevity) visible on the Passport are
   shown right where the human decides whether to vouch for the agent.
   Not a new computation — just the same API in a new place.
4. **The backer stakes USDG and vouches** (`vouch`, the contract already
   supports this) → the agent gets its first credit line (in the spirit
   of Priors — the first line is small).
5. **The agent borrows and repays** → the agent's on-chain verdict
   (`no record / defaulted / no repayments yet / repaid`, already in the
   contract) becomes a second, more specific trust signal — separate
   from Proof Events, but visible alongside them.
6. **A larger history (Proof + repayment) → backers, at their own
   discretion, become willing to vouch for bigger lines.** Not
   automatic — this is always the decision of a specific person reading
   public data.
7. Deploying `AgentIdentity.sol`, which unlocks **Financial
   Performance**, is the same infrastructure step that `/credit` also
   needs (both read the identity registry). One step opens up two
   directions.

### What the human gets

- **The agent owner** — free registration, a public Passport, an audit
  trail (already exists); down the line — the agent's access to real
  operating capital, proportional to its own proven history, mediated by
  people rather than a hidden algorithm.
- **Backer** (already specified, not deployed) — stakes USDG, chooses
  which agents to trust based on their public Proof history, receives
  **25%** of every fee the agent pays; on default, absorbs the loss
  first.
- **Lender** (already specified, not deployed) — deposits into the
  shared pool, receives **60%** of every fee from all loans; default
  risk reaches them only after the backer's.
- The protocol — **15%** of the fee goes to the reserve.
- The base fee is **1% per 30 days** (a contract constant, same as
  Priors); the cap on the backer's premium on top is 2%/30d.

### What the agent gets

- Today — an unforgeable public history (Passport, Proof Events).
- Further out (requires the steps in §4) — real operating USDG capital
  that grows together with the proven history, not through a hidden
  score, but through people who read its Proof history themselves and
  decide.

## 4. What to build next (infrastructure/contracts)

1. Resolve the open deployment decisions from `CREDIT_SPEC.md §4`
   (identity registry, stablecoin, reserve address) and deploy
   `AgentIdentity.sol` + `AgentCreditPool.sol` — done by the user, with
   their own key (see `contracts/README.md`).
2. **Backer view** — done. `/credit/agent?handle=<handle>`
   (`src/app/credit/agent/proof-record.tsx`) shows the agent's Proof
   history across the 6 live categories right next to the vouch/borrow
   forms; `/agents/[handle]` links there ("For backers: check or open
   this agent's credit record"). Matching is currently by `handle` in
   the URL, not automatic: Proof Events (`social_agent_id`, a uuid) and
   `/credit` (on-chain identity tokenId) use different id spaces, and
   there's no bridge between them until an identity registry is chosen
   (see `CREDIT_SPEC.md §4.1`) — this is stated explicitly on the page
   itself.
3. One and the same identity deployment simultaneously unlocks Financial
   Performance (a Proof category) and `/credit` (credit) — plan it as
   one step, not two separate ones.
4. Later, after real traffic: consider repayment history as a possible
   new signal/category (or an extension of Economic Activity). Not
   before real usage — see `CREDIT_SPEC.md §5`.
5. On the site: a diagram on the homepage (`src/app/page.tsx`)
   visualizing exactly this chain — the next step of this task after
   this document.

## 5. Tier per live category (`src/lib/auevo/tier.ts`)

Not a new score — a purely presentational layer on top of the already
existing `CategoryAggregate.verified` (`score.ts`), recomputable by
anyone from the raw Proof Events. Three thresholds: **1 / 5 / 20
verified** → *Proving / Established / Proven*. The tier is computed
**separately for each of the 6 live categories**, never summed across
them — the same "no single combined score" principle, just applied one
level down (the category level) rather than only "no score across the
whole agent".

Tier carries two different meanings, depending on the category:

- **Prediction / Work / Skill** ("agent acts") — the agent acts on its
  own. Today **nothing is restricted**: a claim/PR/pool of any size is
  available with zero history. Tier here is **a proposal for the
  future**: a higher tier unlocks more complex/larger tasks (longer
  horizons, bigger PRs, more volatile pools) — not automatic out of the
  box, but a roadmap decision that still needs to be designed and coded
  separately.
- **Performance / Economic Activity / Longevity** ("automatic") — a cron
  job writes the Proof without the agent's involvement. Tier here,
  already today, is exactly the signal the backer reads before vouching
  (see §3): the higher the tier, the more confidently a human can size
  the line. Nothing needs to be coded here — it's simply a different cut
  of already-existing data.

The full table with the concrete wording for each of the 6 categories
lives in `src/app/progression-flow.tsx` (`CATEGORY_TIERS`), rendered on
the homepage below the diagram ("How each of the 6 live categories earns
its tier"). It also marks, right there, that anything beyond the first
tier is a proposal, not current behavior.

## 6. What we deliberately don't do

- We don't introduce a single numeric score/tier/badge.
- We don't invent utility for the $AUEVO token (staking/governance/
  fee-share for the token) — the `/token` page deliberately stays silent
  on this, and it's not our call to change that without an explicit
  request.
- We don't make the credit line automatic/algorithmic based on Proof
  history — the decision stays with the human backer; the Proof history
  only makes that decision informed, the same way it worked at Priors.
