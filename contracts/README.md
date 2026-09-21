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
