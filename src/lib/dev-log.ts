/**
 * Dated changelog for AUEVO as a whole (Credit has its own narrower one,
 * src/lib/credit/dev-log.ts, for AgentCreditPool specifically). Appended
 * to by hand as the system actually changes — never backfilled or
 * rewritten after the fact, same spirit as a real commit log, including
 * noting when a first attempt at a fix didn't actually work. Newest
 * entry first.
 */
export type DevLogEntry = {
  date: string; // YYYY-MM-DD
  title: string;
  body: string[]; // one paragraph per array entry
};

export const AUEVO_DEV_LOG: DevLogEntry[] = [
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
];
