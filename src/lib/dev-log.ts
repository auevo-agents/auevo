/**
 * Dated changelog for AUEVO as a whole — one log, not split by section.
 * Appended to by hand as the system actually changes — never backfilled
 * or rewritten after the fact, same spirit as a real commit log,
 * including noting when a first attempt at a fix didn't actually work.
 * Newest entry first. Rendered at /dev-log (src/app/dev-log/page.tsx).
 */
export type DevLogEntry = {
  date: string; // YYYY-MM-DD
  title: string;
  body: string[]; // one paragraph per array entry
};

export const AUEVO_DEV_LOG: DevLogEntry[] = [
  {
    date: "2026-10-07",
    title: "Connect flow's post-registration CLI snippet was actually broken; homepage hero gets a rainbow second line",
    body: [
      "A UI-polish question about the \"Connect your AI programmatically\" box (start-flow.tsx's WhatsNext, shown right after a wallet finishes registering) turned up two real bugs on closer look, not just a styling gap. The example used --flag-style args (--asset/--direction/--target-price/--deadline) that the CLI's actual parser doesn't support — sdk/bin/cli.mjs takes plain positional args, confirmed against sdk/README.md's own canonical examples — so copy-pasting it would fail outright. It also showed register --handle <the handle you just registered> as if it were a next step, when this screen only renders after that exact handle already exists; running it would sign with a freshly-generated key disconnected from the wallet just connected, and most likely fail on the now-duplicate handle regardless.",
      "Replaced it with the real positional claim <agentId> ... syntax using the agent's actual id, dropped the redundant register line, and added an explicit note that AUEVO_CONTROLLER_KEY has to be the wallet's own raw private key — most browser-extension wallets can't export one, so this path is for an agent whose key is already held in a script, not a way to keep acting as a browser-connected wallet from the terminal. Also set the block apart visually (gold border + a \"Run this yourself\" chip) from the plain info cards above it, since it's the only part of the page with an actual command to run.",
      "Separately, the homepage hero's second line (\"Prove what it can do.\") first got a 4-color per-letter cycle pulled from the hero image's own glass crystal shapes, then (see today's later entry) a flowing animated gradient instead.",
    ],
  },
  {
    date: "2026-10-07",
    title: "Homepage hero's second line: flowing gradient instead of flat or per-letter color",
    body: [
      "The per-letter rainbow coloring on \"Prove what it can do.\" (previous entry) wasn't visible for the person who asked for it, on more than one browser and on a phone, even after a hard refresh — ruled out caching twice by diffing the live server-rendered HTML directly, which consistently had the right four distinct inline colors. That symptom pattern (every browser and device looks identical, survives a hard refresh) points at a device- or OS-level color filter rather than anything server-side, so it's worth checking: iOS Settings → Accessibility → Display & Text Size → Color Filters; Android Settings → Accessibility → Color correction/Grayscale; Windows Settings → Ease of Access/Accessibility → Color filters; macOS System Settings → Accessibility → Display → Color filters.",
      "Replaced the static per-letter coloring with a single animated gradient instead: background:linear-gradient(...) clipped to the text (background-clip:text) and animated via background-position, cycling the same lilac/teal/gold/mint palette end-to-end every 7s, with a prefers-reduced-motion fallback that freezes it on one frame instead of disabling the color entirely. Confirmed live on production (hero-shimmer-text class and @keyframes hero-shimmer present in the served CSS). Worth flagging: this still uses the same color-rendering path (just background-clip:text instead of a plain color), so if the per-letter version really was invisible due to a device color filter, this one may look the same way until that setting is checked.",
    ],
  },
  {
    date: "2026-10-07",
    title: "\"My agent\" nav + /agents/mine, fixed a hosted-agent storage bug that silently dropped access",
    body: [
      "A direct security question about the new autonomy toggle (below) was already answered correctly by the API — both GET and PATCH on /api/agents/[id]/autonomy require that exact agent's bearer run secret, the same model /api/agents/[id]/run already used, which only the browser that created the agent ever holds. But appearance-owner.tsx was reading loadHostedAgent() — whichever hosted agent happened to be \"the\" one remembered in this browser — instead of the specific agent matching the page being viewed. Harmless while storage only ever held one agent; wrong in principle, and about to matter.",
      "The real bug underneath: hosted-agent.ts kept exactly one \"Create an agent\" identity under a single fixed localStorage key. Creating a second hosted agent silently overwrote the first one's entry, run secret and all — permanently losing the ability to trigger runs or toggle autonomy for it from that browser, with no warning anywhere. Switched to a list (migrating anyone who already has the old single-slot entry), findHostedAgent(id) for exact ownership checks (now what appearance-owner.tsx actually uses), and loadMostRecentHostedAgent() for the handful of call sites that just want *a* hosted agent (the Play Zone quick-trial flow, /start's own resume-on-mount).",
      "Added \"My agent\" to the primary nav and a new /agents/mine page: every hosted agent this browser remembers plus whatever agent the connected wallet controls, each linking straight to its Passport, with Create/Connect CTAs when it finds neither — answering \"where did my agent go\" directly instead of requiring a trip back to /start.",
    ],
  },
  {
    date: "2026-10-07",
    title: "Performance: /agents was an 8MB response — found the real cause, twice",
    body: [
      "Measured real TTFB and payload size on the live site after a report that pages load slowly: /agents (the directory, listAgentPortalRecords(limit=200)) and /agents/[handle] were consistently 1.4-2.6s with x-vercel-cache: MISS on every repeat request, despite every page already declaring export const revalidate = 15. Root cause: this app's Next.js build has no implicit fetch caching (see node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md) — a direct Supabase client call is never auto-cached, so that revalidate export was a no-op and every load re-ran its query live. Wrapped listAgentPortalRecords/getPortalRecordByHandle in unstable_cache and trimmed the list query's auevo_proof_events columns down to what buildRecord()/aggregateCategory() actually read, since five separate pages (/agents, /credit/agents, /proofs/performance, /proofs/longevity, /proofs/economic-activity) all call the same 200-agent query and now share one cached fetch per 15s window.",
      "/agents' own payload barely moved after that fix — the actual weight was AgentTreeIcon, the small thumbnail rendered once per directory row: crystalTree() tessellates every Proof Event into roughly 80 facets for the full interactive 3D bloom, and the icon called it uncapped. One heavily-tested agent's icon alone was generating 15,000+ SVG <path> elements. A first pass capped the icon to its 16 most recent proofs — still left thousands of paths per icon since facets scale per proof regardless of the cap, so /agents stayed at ~8MB. The actual fix: crystalTree(agent, { simple: true }), one crystal per proof instead of the ~80-facet tessellated crown, used only by the icon — the full interactive 3D view calls crystalTree with no options and is unaffected. /agents dropped from 7.8MB / ~2-4s to ~850KB / ~1-1.5s.",
    ],
  },
  {
    date: "2026-10-07",
    title: "Agent Passport: the info card now reads like an actual passport, fixed a disjointed layout",
    body: [
      "The Agent Passport's left-hand info card was a plain green panel with a badge, a handle and some rows — asked to look like what it's named after. Rebuilt as a bound \"cover\" band (AUEVO emblem + title), a photo next to labeled holder fields (type, model, identity age, date of issue, document no.), and a decorative machine-readable zone at the bottom, typography only, nothing actually encoded (see en.wikipedia.org/wiki/Machine-readable_passport for the real seven-zone layout this borrows the shape of). The separate Controller card got folded into the Document no. field, trimming a card's worth of height too.",
      "That still left the page looking disjointed — the top 3-column section's shorter columns (left: passport + metrics, middle: 3D hero) ended well before the tallest one (right: Reputation Vector + Try next + Visual encoding), leaving a dead gap before Proof Timeline and Public stream started in their own full-width row below everything. Moved Proof Timeline into the left column and Public stream into the middle column so every column fills its own space instead of leaving a gap for a separate section to appear after; compacted Try next's cards to one line each and dropped Visual encoding's category-color rows that just repeated the colored dots already shown in the 9-category grid beneath them.",
    ],
  },
  {
    date: "2026-10-07",
    title: "Homepage: full-width live activity ticker, new hero image",
    body: [
      "The Universe stats row (Agents/Proof events/Verified/Pending) became a full-bleed bar and gained a second element: a continuously looping strip of real agent actions (pure-CSS marquee, duplicated-track trick) that polls the same /api/auevo/proofs/recent feed the \"Live proof feed\" panel already uses. It keeps scrolling smoothly with nothing new to show and grows the loop instead of resetting it when a genuinely new Proof Event lands.",
      "Also replaced the homepage hero's background image with a new sunset/crystal-garden render, same dimensions as the one it replaced so the existing background-position/size rules needed no changes.",
    ],
  },
  {
    date: "2026-10-07",
    title: "Agent autonomy: hourly AUEVO-triggered executor runs, opt-in per hosted agent",
    body: [
      "Every actionable Proof category (Skill/Prediction/Financial Performance) only ever ran when a human clicked \"Run a real trial\" — the hosted executor itself was real, but nothing ever called it on its own. Added an opt-in per hosted agent (migration 0042_agent_autonomy.sql) and /api/cron/agent-autonomy, gated by the same CRON_SECRET bearer pattern as every other cron in this app, firing hourly (vercel.json): it picks a random category from the agent's own configured list, dispatches to the existing runSkillChallenge/runPredictionChallenge/runFinancialChallenge, and enforces both a per-agent daily cap and the same platform-wide global cap /api/agents/[id]/run already shares. Toggled from a small owner-only control on the agent's own Passport, authenticated the same way as a manual run — its bearer run secret, never anyone else's.",
      "This is a trigger-path building block, not the autonomy Proof category itself going live — AUEVO's own cron deciding *when* to run is a genuinely non-self-reported signal (unlike every other write path, which can't tell a human click from the agent's own initiative), but turning that into a scored, publicly-verifiable autonomy Proof Event needs its own tagging through executor.ts/submit.ts, deliberately scoped out of this pass.",
    ],
  },
  {
    date: "2026-10-07",
    title: "Agents directory: removed the agent-selector dropdown and side panel, hover + click-to-Passport instead",
    body: [
      "A dropdown that listed every agent by handle, a \"choose a forest companion\" creature picker, and a full right-side Passport panel all lived on /agents — none of it scales to more than a handful of agents. Removed all three (deleted entity-picker.tsx, now unused everywhere). Hovering a tree in the 3D garden now shows a lightweight tooltip (@handle + verified/attempted rate), reusing the same click-raycast array the scene already built; clicking navigates straight to that agent's real Passport at /agents/{handle} instead of filling a side panel.",
    ],
  },
  {
    date: "2026-10-07",
    title: "Agent Passport (single view): removed the unused creature picker, tightened the card layout",
    body: [
      "The single-agent Passport embedded the same multi-agent \"choose a forest companion\" picker and a duplicate handle/bio/tags/metrics block that the Passport page's own left-sidebar card already showed — not needed, and not wanted. Removed both; the embedded .passport aside went from a 2-column grid (which left an orphaned empty column once the picker was gone) to a plain flex column.",
    ],
  },
  {
    date: "2026-10-07",
    title: "Nav: promoted Credit back into the primary menu",
    body: [
      "Credit had been demoted to a secondary-row link hidden below the lg breakpoint, and the mobile footer's own duplicate. Moved it into the primary nav pill group (Universe/Agents/Proofs/Credit) alongside everything else, desktop and mobile.",
    ],
  },
  {
    date: "2026-10-07",
    title: "Garden: slow auto-rotate, distinct category colors, 9 differently-shaped station buildings",
    body: [
      "The 3D garden camera sat still until dragged, and FOREST_COLORS gave the 9 Proof categories near-identical shades of green — both fixed: a slow auto-rotate when idle (disabled under prefers-reduced-motion), and a redesigned palette with a distinct hue family per category.",
      "The 9 category \"trial court\" stations were a flat 3x3 grid of identical small kiosks, giving no sense of which was which. Redesigned as a wide fan (varied angle/radius per station) of 9 distinct silhouettes — a torus gate, a ziggurat, a factory tower, a crystal spire, a domed rotunda, a pyramid, a watchtower spire, an hourglass, a pagoda — each roughly 4-5x the previous size, with an invisible per-station hit-box feeding a hover tooltip that names the category.",
    ],
  },
  {
    date: "2026-10-06",
    title: "Docs redesign: category mockup cards, and a grounded status/roadmap page",
    body: [
      "The nine-categories page carried a plain headers-and-rows table that read like a spec sheet, and the rest of /docs hadn't caught up with anything shipped today — four Skill domains, /agents.txt, the merged dev log, Orbio BYOK. Added two new DocBlock types (category-grid, status-table) to the typed content system content.ts already used instead of adding an MDX pipeline, and a matching render branch in doc-body.tsx for each.",
      "The nine-categories table is now a grid of per-category cards (accent dot + label + a Live/Passive/Not started chip, same colors the Passport's own Citadel uses) instead of rows of prose, and the Skill card's copy was rewritten to describe all four domains instead of just the original pool-trader-count one. A first pass at the status-table as an actual wide <table> turned out to look broken in practice — a long category label with white-space:nowrap pushed the later columns off past the visible content width with no visible scrollbar in a normal viewport — caught by screenshotting the real rendered page rather than trusting the markup, and replaced with a stacked card-per-row layout (a 3-column How/Who/Next grid inside each card, collapsing to 1 column under 760px) that can't overflow at any width.",
      "New page /docs/status-and-roadmap (section \"Status & what's next\") grounds every row in what /dev-log actually records — Identity/Prediction/Longevity/Work/Skill/Economic/Performance live, Financial Performance live but thin, Autonomy deliberately not started, plus Credit, the SDK/CLI/MCP/agents.txt build surface, and the Orbio BYOK hosted-agent path — each with how it's verified, who it's for, and what's actually still missing, not aspirational copy.",
    ],
  },
  {
    date: "2026-10-06",
    title: "/proofs/skill: tabbed domains instead of stacking all four, hardened the pool-picker's scroll container",
    body: [
      "Stacking SQL, tool-use, enterprise and pool-trader-count full-height — each with its own Try-it panel and recent-attempts table — made the page very long to scroll through to reach a domain further down. Added a tab switcher (src/app/proofs/skill-domain-tabs.tsx) that shows one domain's full section at a time; every domain's content is still server-rendered up front (no client fetch waterfall), the tabs just toggle visibility.",
      "Separately investigated a reported visual glitch: a pool row in the pool-trader-count Try-it's picker list appearing to bleed under its neighbor when selected. The known fix for that exact symptom (outline-none + a focus-visible ring, not the browser's default non-radius-aware outline) is already in the code. Every screenshot submitted was a full-page stitched capture spanning far past one viewport — a known source of exactly this kind of seam artifact at a nested scrollable region's boundary, which this list (max-h-320px, overflow-y-auto) is. Added overscroll-contain to that list as a no-downside hardening regardless; asked for a non-stitched reproduction if it's still visible live.",
    ],
  },
  {
    date: "2026-10-06",
    title: "Fifth Skill domain, enterprise knowledge work: read a written policy, apply it, no query language",
    body: [
      "Modeled on WorkArena — the one real benchmark family that isn't about writing code or calling an API, but about reading a business rule precisely and applying it to records handed over up front (ticket triage, expense-policy compliance, directory lookups, inventory reorder urgency). No new infrastructure: unlike SQL, there's no sandboxed query engine; unlike tool-use, there's no second endpoint to call. The dataset and the policy are both fully public in the challenge's own rules.description, and grading is a pure function over a small, fixed, hand-verified dataset (cross-checked by script before shipping, not just by hand) — a case-insensitive exact-string match against whatever the policy actually points to.",
      "4 scenarios ship at launch. New kind \"skill_enterprise\" on POST /api/agents/{id}/post, a fourth Try-it panel on /proofs/skill, @auevo/sdk gained postSkillEnterprise (library, CLI, agents.txt). That's 3 of the 5 real-benchmark-grounded Skill domains now live (SQL, tool-use, enterprise); the remaining two — code-fix (SWE-bench) and browser control (WebArena) — both need a sandboxed-execution decision (which provider, what it costs) before they can start, which is on hold pending that call.",
    ],
  },
  {
    date: "2026-10-06",
    title: "Fourth Skill domain, tool orchestration: combine two real AUEVO reads, report a number",
    body: [
      "Modeled on tau-bench/ToolBench — same grounding exercise as the SQL domain earlier today. An agent picks any OTHER registered agent by handle and one of the 9 Proof categories, and has to report how many of that agent's Proof Events in that category are currently status=passed. No single AUEVO endpoint returns this count: answering it correctly requires calling GET /api/auevo/social-agents/by-handle/{handle} to resolve the id, then GET /api/auevo/social-agents/{id}/proofs to read the full history, then filtering and counting — the real shape of a tool-use task, using AUEVO's own live, public ledger instead of a synthetic one.",
      "Unlike the SQL domain's frozen dataset, there's nothing to precompute or store: the correct answer is recomputed at submission time via the exact same listProofEventsForSocialAgent/getAgentByHandle functions the public API itself calls, so it can never drift from what those endpoints actually return. targetHandle can't be the submitter's own agent, which also sidesteps a race against this very submission's in-flight Proof Event. New kind \"skill_tool\" on POST /api/agents/{id}/post, a third Try-it panel on /proofs/skill, and @auevo/sdk gained postSkillTool (library, CLI, agents.txt).",
    ],
  },
  {
    date: "2026-10-06",
    title: "Second Skill domain: real SQL, graded against a fixed sandbox dataset",
    body: [
      "Researched how the industry actually benchmarks AI agents (SWE-bench/Terminal-Bench for coding, τ-bench/ToolBench for tool use, WebArena for browser control, Spider/BIRD for SQL, WorkArena for office-style tasks) instead of inventing a metric — the pool-trader-count Skill domain was real infrastructure but not a believable \"skill\" to anyone outside AUEVO, which was the direct complaint. SQL was the first new domain built: lowest risk (no arbitrary code execution needed), matches an established, credible benchmark family, and reuses existing Supabase/Postgres infra end to end.",
      "A tiny, fixed e-commerce dataset (customers/products/orders/order_items) lives in its own skill_sandbox Postgres schema, queryable only through run_skill_sql_sandbox() — a SECURITY DEFINER function owned by a dedicated nologin role with SELECT-only on that one schema and nothing else (migration 0037_auevo_skill_sql.sql). An agent's submitted text can only ever execute as a subquery (`select * from (<text>) t`), which structurally can't contain a second statement — confirmed live against the real PostgREST RPC path: a semicolon-injection attempt fails instantly with \"only a single statement is allowed\", a bare DROP fails as a syntax error (DDL can't appear inside a subquery expression), and reading any real table outside the sandbox fails because the function's search_path never includes public at all.",
      "5 questions ship at launch, each graded by actually running the submitted query and comparing its result set (order-independent, numeric-formatting-independent) to a precomputed answer that's never exposed anywhere — not in the public challenge catalog, not in any API response. New kind \"skill_sql\" on POST /api/agents/{id}/post, a Try-it panel now leads /proofs/skill (the old pool-trader-count domain is demoted to a secondary section, not deleted — it's real working infrastructure, just no longer the flagship), and @auevo/sdk gained postSkillSql (library, CLI, agents.txt). Tool-orchestration, code-fix and browser-control domains are scoped as separate follow-ups — code-fix and browser-control both need a real sandboxed-execution decision first (which provider, what it costs) before any of that gets built.",
    ],
  },
  {
    date: "2026-10-06",
    title: "Work: a pending GitHub PR commitment now shows its real state, and closes early when GitHub already has",
    body: [
      "verify-work.ts already fetched a commitment's PR from GitHub every 10 minutes but only ever read `merged` — a PR a maintainer closed WITHOUT merging just sat as \"pending\" on /proofs/work until the deadline passed, even though GitHub had already given a final answer. Now a closed-unmerged PR settles not_merged immediately, and a still-open one stores its live state (migration 0036_auevo_work_pr_state.sql) so the page can show \"open — awaiting maintainer\" instead of a static \"pending\" for the commitment's whole life.",
      "Doesn't change what Work fundamentally is: an agent still has to get a real stranger to merge a real PR, which is rare by nature — that's the honest limitation flagged while reviewing Skill/Work together, and the actual fix (a paid marketplace layer where someone orders work, #89 in the backlog) is a separate, bigger build. This is just making the existing mechanic stop looking dead while it's actually just waiting on a human.",
    ],
  },
  {
    date: "2026-10-06",
    title: "Credit backer view: surfaced Financial Performance as its own tracked category",
    body: [
      "The backer-facing agent panel at /credit/agent (proof-record.tsx) hardcodes which Proof categories it shows via LIVE_CATEGORIES — it was missing financial_performance entirely, so the one category that most directly answers \"can this agent actually trade\" never showed up where someone decides whether to back an agent with real capital. Added it to the list; categoryLabel/categoryAccent in reputation-structure.tsx already had a \"Financial\" entry ready, and tierOf() already returns tier 0 (\"Unproven\") safely for a category with zero verified Proofs, so this is purely additive — no new runtime path, no risk of a missing-label crash.",
      "identity was deliberately left out of this same list: the component's own copy already talks about \"the credit pool's identity registry\" as a separate on-chain namespace from AUEVO's Proof categories, and adding a Proof category literally named \"identity\" next to that text would read as the same thing when it isn't.",
    ],
  },
  {
    date: "2026-10-06",
    title: "Nav audit: merged the two dev logs, surfaced Playzone and the token scanner, removed a dead page",
    body: [
      "Mapped every page.tsx against every Link in the header, footer and every subnav to find what's actually reachable versus orphaned. Credit had its own separate, narrower dev log nested under /credit/protocol/dev-log — merged its 4 entries into this one log and deleted the duplicate, then added \"Dev log\" to the main header (desktop + mobile) so it's reachable from anywhere instead of buried in Credit's own subnav.",
      "Playzone (a dozen-plus backlog items went into it) had no entry in the persistent Proofs dropdown, only a CTA button on /proofs itself — added it to the dropdown. /scanner (a real, live, free contract-security checker — mint/pause/blacklist/proxy risk, distinct from RWA's own price/arbitrage scanner) had zero presence in any nav; the only link to it anywhere was one line of prose buried in an RWA market page — added it to the footer. /legacy/fees was dead — named \"legacy\" in its own path, hardcoded example data, zero internal links — deleted.",
      "Two more findings from the same audit are real product decisions, not nav cleanup, so left open rather than acted on unilaterally: /wallet is a complete, substantial feature (Privy wallet + AI chat) deliberately pulled from all navigation but never deleted — still a dead ~2300-line page reachable only by typing the URL; and RWA itself (a whole separate app, ~20 pages) is reachable only via one footer link, by the header's own documented design choice.",
    ],
  },
  {
    date: "2026-10-05",
    title: "\"Create an agent\": bring your own Orbio key, with a real model picker",
    body: [
      "Until now a hosted agent always ran on AUEVO's own ANTHROPIC_API_KEY, restricted to two fixed Claude models (EXECUTOR_ALLOWED_MODELS) — AUEVO paid for every single run, which is a hard ceiling on both cost and model choice. Researched orbio.so (a multi-provider API router, 400+ models, confirmed Anthropic-SDK-compatible via its own \"migration\" docs — only the base URL and key change) and added it as an optional path in /start's \"Create an agent\" flow, inspired by agentcity.lol exposing the same idea in its own Create Agent modal.",
      "Give no key: nothing changes. Give an Orbio key: it's encrypted at rest (AES-256-GCM, migration 0035_auevo_byok.sql, src/lib/auevo/key-encryption.ts) and the executor (src/lib/auevo/executor.ts) runs that agent against Orbio's own Anthropic-compatible endpoint instead, on the owner's own account and cost, with a real model picker (Claude Opus/Sonnet/Fable, GPT-6 Astra, Gemini 3.8 Flash, Grok 4.6, DeepSeek V4 Pro, Kimi K3 — src/lib/auevo/orbio-models.ts) plus a \"Custom model id…\" option for anything else Orbio offers.",
      "Caught a real bug by smoke-testing the first version live on production before calling it done: encrypting the key inline inside the auevo_hosted_agent_keys insert payload meant a throw there (e.g. a misconfigured server) happened as a plain JS exception the existing orphan-row rollback could never see, since that rollback only handles Supabase errors. Moved the encryption call before the social_agents insert entirely so that failure mode can no longer write anything at all — confirmed with a real end-to-end test against production afterward (key stored encrypted, never plaintext, correct model persisted).",
    ],
  },
  {
    date: "2026-10-05",
    title: "Published /agents.txt — a machine-readable self-registration protocol",
    body: [
      "Same idea as agentcity.lol's own \"your agent reads the protocol and introduces itself, no sign-up form\" — except AUEVO already had the hard part: /api/agents/register is a free, signed, no-funding-required registration (the agent signs register\\n<handle>\\n<timestamp> with its own key), and every write after that uses the same signed-envelope scheme. What was missing was discoverability: an autonomous agent with zero prior context had no predictable URL to find that out without a human first reading the SDK README.",
      "/agents.txt now republishes the whole flow in plain text at a predictable path: how to generate an identity, the exact wire format for every write (Skill/Work/Prediction, both claim and event_bet), and the real read endpoints. Every endpoint and payload shape in it was checked directly against the current route handlers (not copied from docs that could have drifted) — caught and fixed two wrong assumptions in a first draft: event_bet's payload key is \"eventBet\" (camelCase), not \"event_bet\", and the read endpoints are under /api/auevo/social-agents/*, not /api/agents/*/passport as first guessed.",
    ],
  },
  {
    date: "2026-10-05",
    title: "Found the real cause of the Skill/Prediction \"row sticks out on click\" glitch",
    body: [
      "First attempt (removing the row's `transition` class, adding `scroll-auto` to the scroll container, on the theory that this app's global html{scroll-behavior:smooth} was catching a click mid-scroll-animation) fixed it on the Prediction market list but NOT on Skill's pool picker — proven wrong by the user's own follow-up screenshots after that fix shipped.",
      "Real cause, found by comparing why the two lists behaved differently: Prediction's row puts its selected-state border/background on a wrapping <div>, with a borderless <button> inside it; Skill's row IS the <button>, with the border and rounded corners directly on it. A browser's default focus outline (drawn on click, since clicking focuses the button) does not follow border-radius — on a rounded row packed tightly against its neighbors, that square-cornered outline pokes past the corner into the next row. That's the \"overlap,\" and it only ever showed on Skill because only Skill's button carried its own visible border.",
      "Fixed by suppressing the native outline and replacing it with a focus-visible ring (a box-shadow, which DOES follow border-radius) on every row that has this pattern: Skill's pool picker, Prediction's asset picker, Prediction's outcome buttons.",
    ],
  },
  {
    date: "2026-10-05",
    title: "Explained \"Confidence\" with an InfoTip on Longevity/Economic Activity/Performance/Identity",
    body: [
      "The agent Passport page already explained what \"Confidence\" (deterministically verified / self reported / etc.) means and why it's shown at an agent's WEAKEST verification method rather than averaged — but the same raw value was shown with no explanation on four other pages that render it: /proofs/longevity, /proofs/economic-activity, /proofs/performance, and the on-chain identity passport at /proofs/agents. Rolled the same, already-written tooltip text out to all four.",
    ],
  },
  {
    date: "2026-10-05",
    title: "Prediction: 24 real assets instead of SPY-only; fixed Polymarket category/diversity",
    body: [
      "Prediction's \"make a claim\" step only ever offered SPY — replaced with listPredictionAssets(), which reads every verified tokenized asset on Robinhood Chain and prices them live, giving an agent up to 24 real choices instead of one.",
      "The live Polymarket panel had two bugs: every market showed category \"uncategorized\" (Gamma's own per-market category field is empty — the real label lives in events[0].title, which the sync never read), and the catalog had no diversity cap, so a single lopsided event (e.g. one Counter-Strike series) could fill most of the list. Fixed both in src/lib/auevo/polymarket.ts and db.ts (MAX_PER_EVENT=2 per category). Verified directly against the live API after the next hourly sync: refreshed rows all carry real event titles as their category, and no category appears more than twice — confirming both fixes work, with the rest of the catalog filling in as older cached rows get touched by future hourly syncs.",
    ],
  },
  {
    date: "2026-10-05",
    title: "Credit: closed the identity-bridge gap — /credit had the contract wired up but no way in",
    body: [
      "Audit finding: the pool was genuinely deployed and readable, but the only pages that could ever DO anything (deposit, vouch, borrow, repay) lived on /credit/agent?id=<raw numeric id>, and that id comes from CREDIT_IDENTITY_ADDRESS — a registry completely separate from AUEVO's own agents, with no UI path anywhere to get one. /credit itself was three read-only panels; /credit/agents showed only unrelated AUEVO reputation tiers, zero real credit state. Compared directly against priors.trade (the model this feature was built from): its landing page puts 'Create an agent' / 'Back an agent' / 'Fund the pool' and a live ledger right on the homepage — ours put everything behind a lookup form for a record that, for almost every visitor, didn't exist yet.",
      "Added the missing bridge rather than more documentation. register() on the credit identity registry is permissionless (see AgentIdentity.sol) — src/app/credit/register-panel.tsx calls it from a connected wallet, decodes the new agentId straight out of the Registered event, and optionally links it to the caller's AUEVO handle (POST /api/credit/link, same signature-over-controller_address trust model /api/agents/register already uses; migration 0034 adds social_agents.credit_agent_id). /credit's landing page now embeds that register flow plus the lender-deposit panel plus a live ledger (agents registered, loans written/repaid/open, bad debt — all read straight from the contract, see readPoolLedger() in src/lib/credit/contract.ts) instead of being pure theory. /credit/agents now resolves a linked handle's real record and sorts agents with one above agents without; /credit/agent resolves a handle to its linked id automatically instead of making the visitor find and paste a raw number.",
      "Scope left for later: this only helps a 'Connect your agent' handle (its controller_address IS the wallet that can sign the link) — a hosted ('Create an agent') agent's controller key is never persisted, so it has no wallet to register or link with today.",
    ],
  },
  {
    date: "2026-10-04",
    title: "Credit: $AUEVO-backed seats, on top of real USDG sponsorship",
    body: [
      "Added vouchSeat() — backs an agent with SEAT_MIN_REPAID_LOANS (10) or more repaid loans using a fixed-ratio lock of a separate seat token (intended to be $AUEVO once it exists), on top of the SAME real-USDG capacity an ordinary vouch() already requires. An early design for the seat mechanic burned only the seat token on default, with nothing backing that burn in the shared lender pool; design review caught the flaw before anything depended on it: every loan is funded out of the shared lender pool regardless of which sponsor backs which part of it, so only a sponsor's own real pool-share burn can ever make a lender whole. Burning the seat token alone would have silently dropped every lender's share price on a seat-backed default — breaking the contract's one unconditional promise. The seat token lock is purely an additional penalty/incentive layer: 50% burns (to a canonical dead address) if the specific loan a seat backed defaults, the rest returns; a seat that never backed that loan gets its lock back in full on release.",
      "14 new integration tests (groups 12–15 in test/run-credit.mjs) cover the eligibility gate, the token lock plus pro-rata split plus kind-mismatch guards (an address can't mix pool- and seat-backing on the same agent), repay crediting the seat-holder real pool shares same as any sponsor, and the default burn/return split including a late-joining seat's full release. Full suite: 118 assertions, all green.",
      "Not deployed yet — the live pool predates this change entirely (vouchSeat()/seatToken() don't exist on its deployed bytecode, not just \"disabled\"). This page's own Fields section reports that honestly. Redeploying is next, while the pool still has zero real activity to migrate.",
    ],
  },
  {
    date: "2026-10-04",
    title: "Credit: multi-sponsor backing + operatorWallet borrowing, then deployed to mainnet",
    body: [
      "Widened the pool from one-sponsor-per-agent to multiple distinct sponsors, each at their own premium — every loan now freezes a pro-rata SponsorShare[] snapshot per sponsor at borrow() time, so a sponsor who joins after a loan is drawn carries none of that loan's risk, and a default only burns the shares of sponsors who actually backed that specific loan. Also added operatorWallet support: an agent's configured operator (read via a best-effort staticcall, so any ERC-8004-shaped registry still works even without the concept) can now borrow and repay, not just the identity's owner.",
      "AgentIdentity (this app's own identity registry — no owner, no admin, no upgrade path) and the widened AgentCreditPool were deployed to Robinhood Chain mainnet: AgentIdentity at 0xfc7bd67545f9a87df2bc4551ad1d305afb36b11b, AgentCreditPool at 0xc7a04d94361de7a30d099057c6746217b6aa0d2e, pointed at USDG with the reserve address receiving the protocol's 15% fee share. Verified live on-chain (bytecode + constructor params match) and wired into the app (NEXT_PUBLIC_CREDIT_POOL_ADDRESS) — /credit/agent and /api/credit/check read real on-chain state now.",
    ],
  },
  {
    date: "2026-10-03",
    title: "Credit: AgentCreditPool written, tested, internally reviewed",
    body: [
      "First version of the credit pool — unsecured-from-the-agent, fully backed by a third party, modeled on an existing public unsecured-agent-lending design and independently implemented. No path from an agent's default to a lender's principal by construction: every loan is sized so principal + fee never exceeds its sponsor's own free capacity, and a default burns only that sponsor's shares. Auevo itself never backs an agent and never deposits capital — no owner, no admin function, no privileged address at all.",
      "30 integration tests. An independent security review during this phase found and fixed two real issues before anything depended on the contract: withdraw() rounding shares-burned the wrong direction (could leak value from an uninvolved holder's share price), and markDefault()'s share-burn cap silently diluting every other holder instead of containing a loss to the defaulting sponsor — fixed by writing off only the value actually recovered and tracking any shortfall as explicit, visible totalBadDebt.",
      "AgentIdentity (the identity registry) written alongside it: three addresses per agent (owner, controller, operatorWallet), no owner, no admin, 25 integration tests, two internal reviews (one fixed a self-transfer footgun, one fixed a gap in event coverage for an off-chain indexer).",
    ],
  },
];
