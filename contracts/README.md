# Auevo contracts

Solidity contracts for the Auevo platform on Robinhood Chain (chain id
4663). Separate `package.json` from the Next.js app on purpose — a
compiler and test toolchain for contracts has no reason to be part of
the web app's dependency tree or its Vercel build.

See [`DEPLOYMENTS_PENDING.md`](./DEPLOYMENTS_PENDING.md) for the running
list of everything here that's ready (or getting ready) for a mainnet
deploy — kept as one list so the deploys happen together as a batch,
not one at a time.

## DcaVault — status: written, tested, statically analysed. **Not deployed.**

Recurring-buy (dollar-cost-average) vault for ERC-20↔ERC-20 pairs,
executed through Uniswap V3's SwapRouter02 (already deployed and audited
on this chain — see `src/lib/uniswap.ts` in the main app for the
addresses and how they were sourced). Full security model is documented
in the contract itself — `src/DcaVault.sol` — read that before anything
else here. Short version:

- Nobody but a position's own owner can ever withdraw its principal.
  There is no admin withdrawal path and the contract is not upgradeable.
- `executeBuy()` is permissionless (a keeper pattern) but every
  execution is priced against the pool's own TWAP oracle
  (`src/libraries/TwapOracle.sol`), so a malicious or careless keeper
  cannot push a fill worse than the position owner's own stated
  slippage tolerance — this is what actually stops a sandwich attack
  here, not trust in whoever calls the function.
- Pausing (owner-only) can only block new deposits/top-ups/executions.
  It can never block a withdrawal.

### What's been done

- Compiles cleanly with solc 0.8.24, zero warnings.
- 13 integration tests against a local Ganache node covering: deposit
  and position accounting, the TWAP floor rejecting a bad-price fill,
  a fair-price fill succeeding, the interval lock, owner-only
  withdrawal, pause blocking new activity while never blocking
  withdrawal, and — the two that matter most — a malicious token
  attempting reentrancy through both `transfer()` (the path
  `withdraw()` takes) and `transferFrom()` (the path `executeBuy()`'s
  fund pull takes), both blocked by OpenZeppelin's ReentrancyGuard.
  Run with `npm test`.
- Slither static analysis. Every finding on this contract's own code
  was either already documented as intentional (the pool's harmonic-
  mean-liquidity return value is deliberately unused — the contract
  doesn't need it) or a standard, low-severity note (`block.timestamp`
  comparisons, expected for any interval check, immaterial at DCA's
  time granularity). Findings outside `DcaVault.sol` and
  `TwapOracle.sol` are all inside vendored OpenZeppelin/Uniswap library
  code, not this project's to fix.

### What has NOT been done

- **No independent, paid, professional audit.** Everything above is
  real, but it is not a substitute for one. Do not treat "reviewed and
  tested" as "audited."
- **No mainnet deployment.** See `script/deploy-dca.mjs` — deploying is
  a decision with immediate financial-security consequences (a public,
  fundable address) and needs a private key with real ETH for gas.
  Nobody but you should run that script, from your own machine, when
  you decide to.
- **No fork test against the real, live SwapRouter02/Factory on
  Robinhood Chain** — the integration tests use mock Uniswap contracts
  (`test/mocks/MockUniswap.sol`) so the vault's own logic (custody,
  access control, the TWAP floor) could be exercised deterministically.
  Testing against a mainnet fork, or on testnet first if you decide
  that's worth doing despite the earlier "mainnet only" instruction,
  would catch anything about the *real* router/factory's actual
  behaviour these mocks don't capture.

## DcaVaultV4 — status: written, tested, statically analysed. **Not deployed.**

RWA_SPEC.md Phase 7's v4/USDG port of DcaVault.sol — `src/DcaVaultV4.sol`.
Read that contract's own doc comment before anything else here; it is
long on purpose because the security posture genuinely differs from the
V3 vault, not just the plumbing. Short version:

- Same custody/pause guarantees as DcaVault.sol: only a position's own
  owner can ever withdraw its principal, no admin path, not upgradeable,
  pausing never blocks withdrawal.
- Executes swaps directly against Uniswap v4's PoolManager via the
  unlock/callback pattern (`IUnlockCallback`) — not UniversalRouter, not
  Permit2. The vault already custodies its own principal, so it can call
  PoolManager the same way Uniswap's own periphery routers do; no
  signature of any kind is involved in `executeBuy()`.
- **The price floor is weaker than DcaVault.sol's by construction, not by
  oversight.** Uniswap v4 core has no built-in historical-price oracle
  the way every v3 pool does (v4 moved that entirely into optional
  hooks, and no RWA/USDG pool on Robinhood Chain is confirmed to use an
  oracle-providing hook). Each position can optionally name an
  `IPriceOracle` (this project's own minimal interface — not a Uniswap
  type) for a real on-chain floor; when none is set (the default),
  `executeBuy()` falls back to trusting the caller's own `minAmountOut`
  outright, only rejecting a literal zero. That fallback mode is a real,
  material weakening of the anti-sandwich guarantee for a permissionless
  keeper function — exactly the kind of gap an external audit exists to
  catch, and exactly why this contract stays gated the same way
  DcaVault.sol does (see below).

### What's been done

- Compiles cleanly with solc 0.8.24 against `@uniswap/v4-core` 1.0.2,
  zero warnings.
- 15 integration tests against a local Ganache node (`test/run-v4.mjs`,
  kept separate from `test/run.mjs`'s V3 suite) covering: deposit and
  position accounting, the no-oracle path's mandatory-nonzero-
  minAmountOut guard, a bad fill reverting against both a caller-supplied
  floor and (separately) an oracle-configured floor, a fair fill
  succeeding through the full unlock/swap/sync/settle/take sequence, the
  interval lock, owner-only withdrawal, pause blocking new activity while
  never blocking withdrawal, and reentrancy via a malicious tokenIn's
  `transfer()` called from `unlockCallback`'s settle-push (the v4
  equivalent of the V3 suite's `transferFrom()` case — this version
  pushes funds to PoolManager instead of having a router pull them, so
  the reentrancy-sensitive call site moved from `transferFrom()` to
  `transfer()`; see DcaVaultV4.sol's own note on this). Run with
  `npm test` (runs both suites) or `node test/run-v4.mjs` alone.
- Slither static analysis (via `standard-input.json` + the solc-json
  platform — the same solc-js CLI quirks noted below applied here too).
  Two findings, both already-documented-intentional in the same spirit
  as DcaVault.sol's own harmonic-mean-liquidity note: an unused return
  value from `PoolManager.settle()` (the contract already knows the
  exact amount it paid; PoolManager's own echo of it back has no use
  here) and a `block.timestamp` comparison for the interval lock (same
  DCA-time-granularity reasoning as the V3 vault).
- Uses a real (if minimal) mock PoolManager (`test/mocks/
  MockPoolManagerV4.sol`) rather than the actual Uniswap v4-core
  PoolManager — deliberately: that contract's own correctness is
  Uniswap's to test, not this project's, and the mock's job is only to
  exercise DcaVaultV4's own logic deterministically (same philosophy as
  `test/mocks/MockUniswap.sol` for the V3 vault).

### What has NOT been done

- **No independent, paid, professional audit.** Same posture as
  DcaVault.sol — doubly true here given the documented price-floor
  weakening above.
- **No mainnet deployment**, and no deploy script has even been written
  for this contract yet — deploying is the same "your own key, your own
  decision" action described for DcaVault.sol, and this contract needs
  an audit first regardless.
- **No fork test against the real, live PoolManager on Robinhood
  Chain.** The integration tests use a mock PoolManager (see above), so
  the real contract's accounting invariants (`CurrencyNotSettled`,
  transient-storage deltas, hook interactions) are untested here.
- **No feature-flagged UI wired up yet.** `/app/bots` (the existing DCA
  page) still only speaks to the V3 vault; a v4/USDG section there would
  follow the same "show the honest not-deployed status, no placeholder
  address" pattern once this contract has an audit and a deployment.

## AgentCreditPool — status: written, tested. **Deployed to mainnet** at [`0xc7a04d94361de7a30d099057c6746217b6aa0d2e`](https://robinhoodchain.blockscout.com/address/0xc7a04d94361de7a30d099057c6746217b6aa0d2e) — see [`DEPLOYMENTS_PENDING.md`](./DEPLOYMENTS_PENDING.md#deployed) for deploy params and tx hash.

Unsecured-from-the-agent, fully-backed-by-a-third-party credit pool for AI
agents on Robinhood Chain, modeled on Priors' public v2 design
(github.com/priors-agents/priors) and independently reimplemented here —
`src/AgentCreditPool.sol`. Read that contract's own doc comment before
anything else here. Short version:

- No path from an agent's default to a lender's principal: every loan is
  sized so principal + fee never exceeds its one sponsor's own free
  capacity, and a default burns only that sponsor's shares.
- Auevo never backs an agent and never deposits its own capital — the
  contract has no owner, no admin function, no privileged address at all.
  Every line exists only because some third party called `vouch()` with
  that agent's owner's own EIP-712-signed consent.
- One sponsor, one open loan per agent at a time — a deliberately smaller
  surface than Priors v2 (no treasury/seat/stock-vault backer types yet).
- Points at an *existing* identity registry (`IAgentIdentity`, matching
  ERC-8004/ERC-721 `ownerOf`) rather than minting its own — see the open
  decision below.

### What's been done

- Compiles cleanly with solc 0.8.24 against `@openzeppelin/contracts`
  5.6, `evmVersion: cancun` (needed because OpenZeppelin's EIP-712 helper
  chain pulls in `Bytes.sol`'s `MCOPY` — see `compile-all.js`'s comment;
  Robinhood Chain already runs Priors' own EIP-712-based CreditPoolV2
  live, so Cancun support is proven, not assumed).
- 30 integration tests against a local Ganache node
  (`test/run-credit.mjs`) covering: share accounting on deposit/withdraw,
  enrolling as a root above the minimum stake, `vouch()` rejecting a
  consent signed by anyone other than the agent's current owner,
  rejecting a replayed nonce, borrowing within/beyond the vouched line,
  locking the sponsor's fee capacity at borrow time (closes the
  self-backing-loop exploit Priors itself found and fixed in v2), the
  exact 60/25/15 fee split on repay, growing the agent's on-chain record,
  a default burning only the defaulting agent's own sponsor's shares
  while the lender's share value never falls, a permanently defaulted
  agent never being able to borrow again, and — added after an
  independent security review of this contract found it as a real bug,
  not a hypothetical — `withdraw()` rounding shares-burned the correct
  direction so an unevenly-divisible withdrawal can never leak value
  out of an uninvolved holder's share price.
- That same review found a second, related issue:
  `markDefault()`'s share-burn cap could, before the `withdraw()` fix
  above, subtract a defaulting loan's full loss from `totalAssets` while
  only burning however many shares the sponsor actually had left —
  diluting every other holder instead of containing the loss to that one
  sponsor, in direct contradiction of this contract's own stated
  guarantee. Fixed by writing off only the value actually recovered from
  the burn and tracking any shortfall as explicit, visible
  `totalBadDebt` (plus a `BadDebt` event) rather than silently pulling it
  from everyone else's shares. The `withdraw()` fix removes the only
  known way to trigger this in practice; the `totalBadDebt` path stays
  in as a hard backstop rather than an assumption.

### What has NOT been done

- **No independent, paid, professional audit.** Same posture as
  DcaVault.sol/DcaVaultV4.sol — doubly true here given this moves a
  stablecoin, not just swaps one.
- **No mainnet deployment**, and deploying needs one decision made
  first, consciously, by you: which identity registry to point
  `CREDIT_IDENTITY_ADDRESS` at. Reusing Priors' own ERC-8004 registry
  (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`) means any agent already
  registered there needs no new identity to use this pool — but it also
  means trusting that registry's own owner, which the Priors audit found
  to be a single EOA today, not a multisig. See `script/deploy-credit-
  pool.mjs`'s own header for the full list of required deploy-time
  decisions (asset token, its decimals, reserve address) — none of them
  have a hardcoded default in that script, on purpose.
- **No fork test against the real, live ERC-8004 registry on Robinhood
  Chain** — the integration tests use a mock (`test/mocks/
  MockAgentIdentity.sol`) so the pool's own logic could be exercised
  deterministically, same philosophy as `test/mocks/MockUniswap.sol` for
  DcaVault.
- **No backend/frontend wiring yet** — this is the contract layer only.

## AgentIdentity — status: written, tested, reviewed. **Deployed to mainnet** at [`0xfc7bd67545f9a87df2bc4551ad1d305afb36b11b`](https://robinhoodchain.blockscout.com/address/0xfc7bd67545f9a87df2bc4551ad1d305afb36b11b) — this is the `CREDIT_IDENTITY_ADDRESS` AgentCreditPool above actually points at. See [`DEPLOYMENTS_PENDING.md`](./DEPLOYMENTS_PENDING.md#deployed).

Minimal, non-upgradeable agent identity registry for AUEVO's reputation
protocol (see the "AUEVO as an Independent Reputation & Verification
Protocol" design doc) — `src/AgentIdentity.sol`. ERC-8004-shaped (an
agent is a uint256 id with an owner and an off-chain `agentURI`) but
deliberately not the canonical ERC-8004 deployment: direct on-chain
inspection this session found the canonical Identity Registry is owned
by a single plain private key (no multisig) on every chain sharing its
deterministic address. This contract has no owner, no admin function, no
upgrade path — nothing to trust beyond the code itself.

Three addresses per agent — owner (configures), controller (speaks, for
whatever system reads it — e.g. a future ProofRegistry), operatorWallet
(capital-at-risk challenges only) — read the contract's own doc comment
for the full rationale. Transfer clears controller/operatorWallet so a
sold identity's old controller can never keep speaking for a new owner.

25 integration tests (`test/run-identity.mjs`): registration defaults,
owner-only configuration, reverts on a nonexistent agent id, transfer
clearing controller/operatorWallet and revoking the old owner's access,
zero-address guards on every setter, independent incrementing ids, and
(added in the second review below) that the implicit controller/
operatorWallet changes in `register`/`transferAgent` are actually
observable as events.

### Internal review (2026-10-03) — before anything depends on this contract

Manual read plus Slither static analysis (`slither src/AgentIdentity.sol`).
No value custody, no external calls, no reentrancy surface at all — the
contract only writes to its own storage. Slither's only output is the
same known false-positive class already noted for `DcaVault`
(`address(0)` existence checks misclassified as "timestamp
comparisons" — nothing to do with `block.timestamp`).

One real issue found and fixed: `transferAgent(agentId, newOwner)` had
no check against `newOwner == currentOwner`, so an owner accidentally
calling it with their own address would silently wipe their own
`controller`/`operatorWallet` to zero with no ownership change to show
for it — a self-inflicted footgun, not exploitable by anyone else, but
untested and unguarded. Fixed with a `require(newOwner != a.owner)`,
covered by a new test (case 6 in `run-identity.mjs`).

Also checked, not a bug: the first registered agent gets id `0`
(`nextAgentId` starts at 0), which is a classic sentinel-collision
footgun in systems that treat `id == 0` as "no agent". Traced every
agentId read path in both `AgentCreditPool.sol` and the Next.js app
(`src/lib/auevo/db.ts` and callers) — all use explicit existence checks
(`owner != address(0)`, `?? null`) or string comparisons, never numeric
truthiness on the id itself, so agent `#0` is handled correctly
everywhere.

**Still not a substitute for a paid, independent, professional audit**
— this was a thorough internal review, not that. Do not treat "reviewed
and tested" as "audited." **Not deployed** —
`script/deploy-identity.mjs` has no required arguments (this contract
takes none), unlike `deploy-credit-pool.mjs`.

### Second internal review (2026-10-03) — event completeness

Manual read, focused on what *off-chain* consumers (the app's own
`src/lib/auevo/identity.ts`, the future SDK/MCP server, a third-party
indexer) can actually observe. This app's own backend is unaffected —
it always re-reads `controllerOf`/`operatorWalletOf` live, never caches
from logs — but the contract's event log itself had a real gap: both
`register()` and `transferAgent()` change `controller`/`operatorWallet`
(set to the caller on register, cleared to `address(0)` on transfer)
without emitting `ControllerSet`/`OperatorWalletSet` for that change —
only `Registered`/`Transferred`. A consumer built to cache "current
controller" from `ControllerSet` alone (a reasonable, gas-cheap
integration pattern once a future ProofRegistry or the SDK starts
watching this contract) would never learn the default on registration,
and worse, would keep treating a transferred-away agent's *old*
controller as still authorized to speak for it after `transferAgent` —
since nothing it was listening for told it otherwise. Fixed: both
functions now also emit `ControllerSet`/`OperatorWalletSet` for the
implicit change, covered by 4 new tests that decode the transaction
receipt's logs and check the emitted `(agentId, controller)` /
`(agentId, operatorWallet)` args directly, not just the resulting
state. `slither src/AgentIdentity.sol` would not run in this
environment (the installed `solc` here is the Emscripten/WASM build,
incompatible with crytic-compile's `--combined-json` expectations) —
unrelated to the code change; re-run it in an environment with a native
solc binary before this is treated as re-verified by the same process
as the first review.

## Setup

```bash
cd contracts
npm install
npm run compile   # writes build.json (ABI + bytecode)
npm test          # compiles, then runs the Ganache integration suite
```

## Deploying (you, not me)

```bash
DEPLOYER_PRIVATE_KEY=0x... node script/deploy-dca.mjs
```

Prints the deployed address. Set `NEXT_PUBLIC_DCA_VAULT_ADDRESS` to it
in Vercel to bring `/app/bots` live in the frontend — until that env var
is set, the page shows its current status honestly rather than pointing
at a placeholder address.

## Toolchain note

`binaries.soliditylang.org` and `foundry.paradigm.xyz` were unreachable
from the environment these contracts were built in, so this uses
`solc`'s npm/WASM build instead of a native binary or Foundry. Slither
needed a small wrapper script (see `../CLAUDE.md` or ask if it's not
obvious from context) to work around two solc-js CLI quirks: no
`--allow-paths` support, and a non-JSON diagnostic line printed to
stdout ahead of the actual `--standard-json` output. If you have Foundry
available, `forge test` (once a `foundry.toml` and Foundry-style test
imports are added) would be worth running too — it does real fuzzing,
which nothing here does yet.
