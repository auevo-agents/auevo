# Auevo Credit — Technical Spec

> For Claude Code. Read the whole thing before working on this feature.
> Before writing any code, read `AGENTS.md`: this is Next.js 16, the API
> differs from what you're used to — check against
> `node_modules/next/dist/docs/`.

> **Status note:** this spec was written, and §3-4 below describe the
> state of the repo, *before* `AgentCreditPool` was deployed. It has
> since been deployed to Robinhood Chain mainnet — 65 integration
> tests (`test/run-credit.mjs`; grew from the 29 §3 below describes as
> seats and multi-sponsor support were added after this spec was
> written), see [`contracts/README.md`](../contracts/README.md) and
> [`contracts/DEPLOYMENTS_PENDING.md`](../contracts/DEPLOYMENTS_PENDING.md)
> for the live address, deploy tx and current status (including seats,
> which came later and are documented there and in
> [`AUEVO_PROTOCOL_SPEC.md`](AUEVO_PROTOCOL_SPEC.md)). The rest of
> this document is kept as the original design record, not updated
> line by line for post-deploy facts.

## 1. Goal

Credit for AI agents, modeled on an existing public
unsecured-agent-lending design, independently implemented —
unsecured from the agent's side, but **fully backed by a specific third-party backer** —
a stablecoin credit line on Robinhood Chain. A direct decision by the
user: **AUEVO never backs agents with its own capital** — a line
exists only if a third party has explicitly vouched for it (an
EIP-712 signature from the agent's owner + the backer's stake).

A full, line-by-line audit of that existing design (v1/v2 mechanics, score, GO MODE,
monetization, contract addresses, a map of every page on the site) —
in a Claude Doc: https://claude.ai/code/artifact/26627c27-74fd-49da-8aa4-2bbf2063f23b.
This file does not repeat that audit — only our own architectural
decisions and implementation status.

## 2. Design decisions and why

- **Only third-party backers.** There is no analog of
  `TreasurySponsorV4` — AUEVO does not put its own money at risk of
  default. (An explicit decision by the user, see the session
  history.)
- **One sponsor, one open loan per agent at a time.** A deliberate
  narrowing of scope relative to designs that allow multiple loans
  and multiple backer types (treasury/seat/stock-vault). We currently
  have only the "root" backer (anyone with ≥ minRootStake). Extensible later.
  **This is not a bug, it's a deliberate narrowing of scope** — see
  the contract's doc comment.
- **We reuse an existing identity registry** (ERC-8004, or any
  ERC-721-compatible `ownerOf`) rather than minting our own. Which
  address to use is **an open decision at deploy time**, not a code
  decision: see `contracts/script/deploy-credit-pool.mjs`. Reusing
  the registry already live at `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
  gives free compatibility (an agent already registered there could use our pool right
  away), but it means trusting that registry's single EOA owner — a
  risk flagged in the audit.
- **The network is Robinhood Chain (4663)**, not BNB: compatibility
  with the open ERC-8004 standard and an already-live USDG matters
  more than network size for this specific feature (see the same
  discussion in the session history). AUEVO already has all its
  infrastructure built for this network (`src/lib/chains.ts`, RWA
  tokens, Uniswap v4).
- **Locking the fee at loan-issuance time** — carries over the fix for
  a self-backing loop exploit found in an earlier (v1) iteration of
  this lending pattern and corrected in its v2. Built in from day one,
  not bolted on after the fact.
- **Score — NOT yet implemented as a 0–1000 number.** A full on-chain
  score of that kind requires `dollarSecondsRepaid` (an accumulated "principal ×
  days held"), which our `AgentAccount` deliberately does not have —
  so as not to bloat the contract before any real usage. Instead,
  `verdictOf()` returns `no record | defaulted | no repayments yet |
  repaid`, the same verdict shape used by comparable public credit-check APIs. A
  full-fledged score (possibly going straight to a v2-style one: who
  took on the risk, revenue via x402, anti-sybil) — a later phase,
  after there's real traffic.

## 3. Current state of the repo

- **Contract**: `contracts/src/AgentCreditPool.sol` — written,
  compiled (`evmVersion: cancun` — needed because of OZ's EIP712,
  which Robinhood Chain supports, see the comment in
  `compile-all.js`), 29 integration tests passing
  (`contracts/test/run-credit.mjs`). **Not deployed.**
- **Deploy script**: `contracts/script/deploy-credit-pool.mjs` —
  requires explicit asset/identity/reserve addresses and decimals, no
  hardcoding. Has not been run.
- **Backend reads**: `src/lib/credit/contract.ts` +
  `src/lib/credit/abi.ts` — live on-chain reads via
  `getRobinhoodClient()`, no indexer (no point indexing what isn't on
  chain yet).
- **Public API**: `GET /api/credit/check?agent=<id>` — mirrors the
  shape of similar public credit-check API responses. `?address=` **is not
  implemented** (it needs an index of every identity, which we don't
  have yet) — it returns a 501 with a clear message rather than a
  silently empty response.
- **Pages**: `/credit` (pool status, parameters), `/credit/agent?id=`
  (agent record + wallet forms). They honestly show "Not deployed
  yet" instead of a placeholder address — the same convention as
  `/rwa/app/bots` uses for `DcaVault`.
- **UI forms** (`src/app/credit/agent/credit-agent-actions.tsx`,
  wagmi, its own `CreditProviders` — not shared with
  `/rwa/app/providers.tsx`, for the same reason `chains.ts` keeps this
  network separate): sign consent (owner, free, EIP-712), deposit/
  become a backer, vouch using a pasted-in consent, borrow,
  repay/markDefault.
- **Not yet there**: Supabase schema (not needed without real
  traffic — all the truth lives in the contract), an SDK/CLI, an MCP
  server, x402 integration, "Go Mode" (wallet-
  less social sign-in — AUEVO already has the Privy infrastructure
  from the Wallet feature, could be wired up quickly once we decide to
  do it).

## 4. Open decisions before deploy

Recorded in task #61 of the task list:

1. Which identity registry to use (`CREDIT_IDENTITY_ADDRESS`) —
   the public one already live on this chain, or our own.
2. Which stablecoin (`CREDIT_ASSET_ADDRESS` + decimals) — USDG
   (already in use by other live credit activity on this chain) or something else.
3. The protocol reserve address (`CREDIT_RESERVE_ADDRESS`) — where
   15% of every fee goes.
4. The deploy is carried out **by the user, with their own key**, not
   by me — see `contracts/README.md`.

## 5. Next candidates (not started, awaiting prioritization)

- An independent, paid audit of the contract before real money is at
  stake.
- A richer score (v2-style) + a Supabase cache, once there's real
  traffic worth indexing.
- "Go Mode" — walletless onboarding through the existing Privy setup.
- An SDK/CLI and MCP server, so agents can connect programmatically,
  not just through the browser.
- Merging with the agent feed (`/`, `src/lib/social/*`) — the credit
  model and the Parley model should merge into one product, as
  decided earlier in the strategic document (see the Claude Doc
  above).
