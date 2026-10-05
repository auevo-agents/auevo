/**
 * Dated changelog for AgentCreditPool and everything around it (the
 * identity registry it points at, seats, the app pages under /credit).
 * Appended to by hand as the system actually changes — never
 * backfilled or rewritten after the fact, same spirit as a real commit
 * log. Newest entry first.
 */
export type DevLogEntry = {
  date: string; // YYYY-MM-DD
  title: string;
  body: string[]; // one paragraph per array entry
};

export const CREDIT_DEV_LOG: DevLogEntry[] = [
  {
    date: "2026-10-05",
    title: "Closed the identity-bridge gap: /credit had the contract wired up but no way in",
    body: [
      "Audit finding: the pool was genuinely deployed and readable, but the only pages that could ever DO anything (deposit, vouch, borrow, repay) lived on /credit/agent?id=<raw numeric id>, and that id comes from CREDIT_IDENTITY_ADDRESS — a registry completely separate from AUEVO's own agents, with no UI path anywhere to get one. /credit itself was three read-only panels; /credit/agents showed only unrelated AUEVO reputation tiers, zero real credit state. Compared directly against priors.trade (the model this feature was built from): its landing page puts 'Create an agent' / 'Back an agent' / 'Fund the pool' and a live ledger right on the homepage — ours put everything behind a lookup form for a record that, for almost every visitor, didn't exist yet.",
      "Added the missing bridge rather than more documentation. register() on the credit identity registry is permissionless (see AgentIdentity.sol) — src/app/credit/register-panel.tsx calls it from a connected wallet, decodes the new agentId straight out of the Registered event, and optionally links it to the caller's AUEVO handle (POST /api/credit/link, same signature-over-controller_address trust model /api/agents/register already uses; migration 0034 adds social_agents.credit_agent_id). /credit's landing page now embeds that register flow plus the lender-deposit panel plus a live ledger (agents registered, loans written/repaid/open, bad debt — all read straight from the contract, see readPoolLedger() in src/lib/credit/contract.ts) instead of being pure theory. /credit/agents now resolves a linked handle's real record and sorts agents with one above agents without; /credit/agent resolves a handle to its linked id automatically instead of making the visitor find and paste a raw number.",
      "Scope left for later: this only helps a 'Connect your agent' handle (its controller_address IS the wallet that can sign the link) — a hosted ('Create an agent') agent's controller key is never persisted, so it has no wallet to register or link with today.",
    ],
  },
  {
    date: "2026-10-04",
    title: "$AUEVO-backed seats, on top of real USDG sponsorship",
    body: [
      "Added vouchSeat() — backs an agent with SEAT_MIN_REPAID_LOANS (10) or more repaid loans using a fixed-ratio lock of a separate seat token (intended to be $AUEVO once it exists), on top of the SAME real-USDG capacity an ordinary vouch() already requires. An early design for the seat mechanic burned only the seat token on default, with nothing backing that burn in the shared lender pool; design review caught the flaw before anything depended on it: every loan is funded out of the shared lender pool regardless of which sponsor backs which part of it, so only a sponsor's own real pool-share burn can ever make a lender whole. Burning the seat token alone would have silently dropped every lender's share price on a seat-backed default — breaking the contract's one unconditional promise. The seat token lock is purely an additional penalty/incentive layer: 50% burns (to a canonical dead address) if the specific loan a seat backed defaults, the rest returns; a seat that never backed that loan gets its lock back in full on release.",
      "14 new integration tests (groups 12–15 in test/run-credit.mjs) cover the eligibility gate, the token lock plus pro-rata split plus kind-mismatch guards (an address can't mix pool- and seat-backing on the same agent), repay crediting the seat-holder real pool shares same as any sponsor, and the default burn/return split including a late-joining seat's full release. Full suite: 118 assertions, all green.",
      "Not deployed yet — the live pool predates this change entirely (vouchSeat()/seatToken() don't exist on its deployed bytecode, not just \"disabled\"). This page's own Fields section reports that honestly. Redeploying is next, while the pool still has zero real activity to migrate.",
    ],
  },
  {
    date: "2026-10-04",
    title: "Multi-sponsor backing + operatorWallet borrowing, then deployed to mainnet",
    body: [
      "Widened the pool from one-sponsor-per-agent to multiple distinct sponsors, each at their own premium — every loan now freezes a pro-rata SponsorShare[] snapshot per sponsor at borrow() time, so a sponsor who joins after a loan is drawn carries none of that loan's risk, and a default only burns the shares of sponsors who actually backed that specific loan. Also added operatorWallet support: an agent's configured operator (read via a best-effort staticcall, so any ERC-8004-shaped registry still works even without the concept) can now borrow and repay, not just the identity's owner.",
      "AgentIdentity (this app's own identity registry — no owner, no admin, no upgrade path) and the widened AgentCreditPool were deployed to Robinhood Chain mainnet: AgentIdentity at 0xfc7bd67545f9a87df2bc4551ad1d305afb36b11b, AgentCreditPool at 0xc7a04d94361de7a30d099057c6746217b6aa0d2e, pointed at USDG with the reserve address receiving the protocol's 15% fee share. Verified live on-chain (bytecode + constructor params match) and wired into the app (NEXT_PUBLIC_CREDIT_POOL_ADDRESS) — /credit/agent and /api/credit/check read real on-chain state now.",
    ],
  },
  {
    date: "2026-10-03",
    title: "AgentCreditPool written, tested, internally reviewed",
    body: [
      "First version of the credit pool — unsecured-from-the-agent, fully backed by a third party, modeled on an existing public unsecured-agent-lending design and independently implemented. No path from an agent's default to a lender's principal by construction: every loan is sized so principal + fee never exceeds its sponsor's own free capacity, and a default burns only that sponsor's shares. Auevo itself never backs an agent and never deposits capital — no owner, no admin function, no privileged address at all.",
      "30 integration tests. An independent security review during this phase found and fixed two real issues before anything depended on the contract: withdraw() rounding shares-burned the wrong direction (could leak value from an uninvolved holder's share price), and markDefault()'s share-burn cap silently diluting every other holder instead of containing a loss to the defaulting sponsor — fixed by writing off only the value actually recovered and tracking any shortfall as explicit, visible totalBadDebt.",
      "AgentIdentity (the identity registry) written alongside it: three addresses per agent (owner, controller, operatorWallet), no owner, no admin, 25 integration tests, two internal reviews (one fixed a self-transfer footgun, one fixed a gap in event coverage for an off-chain indexer).",
    ],
  },
];
