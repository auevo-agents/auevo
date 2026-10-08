# Contracts pending deployment

Every contract that's been written and is ready (or getting ready) for
mainnet, kept in one place so they can be deployed together in a single
batch rather than one at a time. Nothing here is deployed yet — this list
exists so that when we do deploy, there's a checklist instead of a memory
exercise.

Each entry links straight to the contract source and its deploy script.
Deploying is never automated — see [`README.md`](./README.md) and each
script's own header for why: it takes a real private key with real ETH,
and produces a public, fundable mainnet address the moment it lands.

| Contract | Source | Deploy script | Status |
| --- | --- | --- | --- |
| DcaVault | [`src/DcaVault.sol`](./src/DcaVault.sol) | [`script/deploy-dca.mjs`](./script/deploy-dca.mjs) | Written, 13 integration tests passing, Slither-clean. **Not independently audited.** Ready to deploy when the batch goes out. Deliberately held back for now — RWA trading-side feature, not part of the current agent/credit focus. |
| DcaVaultV4 | [`src/DcaVaultV4.sol`](./src/DcaVaultV4.sol) | [`script/deploy-dca-v4.mjs`](./script/deploy-dca-v4.mjs) | Written, 15 integration tests passing. **This contract's own doc comment says it must not go to mainnet before an external audit** — the no-oracle fallback mode is a real, material sandwich-protection gap, chosen per-position by whoever calls `createPosition()`, not something a deploy-time flag can close. Deploy script exists and is ready whenever that tradeoff is consciously accepted; not run yet. |

AgentCreditPool with seats (`vouchSeat()`) is written and tested (see `src/AgentCreditPool.sol`'s own doc comment and 65 passing integration tests in `test/run-credit.mjs` — the README's "118 passing" badge is the sum across all four contract test suites, 13+65+15+25, not this contract alone) but deliberately NOT redeployed yet. The deploy script's `CREDIT_SEAT_RATIO_NUMERATOR`/`DENOMINATOR` — a fixed, deploy-time rate, no oracle, no admin to ever change it afterward — needs a real `$AUEVO`/USDG price to be set against. **`$AUEVO` is being relaunched (2026-10-08 decision) — the token launched that day is being pulled and redone**, so seats stay blocked on a real price from whichever launch ends up being the one that sticks, not the one already on chain. Once that price exists: pick the ratio from it, then run `script/deploy-credit-pool.mjs` with `CREDIT_ASSET_ADDRESS`/`CREDIT_ASSET_DECIMALS`/`CREDIT_IDENTITY_ADDRESS`/`CREDIT_RESERVE_ADDRESS` matching the currently-live pool's own params (see below) plus the new `CREDIT_SEAT_TOKEN_ADDRESS`/ratio pair. This contract has no admin to add seats after deploy, so seats on the currently-live pool (predates seats entirely) will never be retrofittable — the live pool just keeps working as-is, seatless, in the meantime.

See "Deployed" below for AgentCreditPool and both AgentIdentity deployments, all now live.

**Note (2026-10-04):** there are two separate `AgentIdentity` deployments, by design, not by accident — Credit and the AUEVO reputation protocol are kept on independent identity registries, each with its own agentId namespace (an agent registered in one does not exist in the other). On-chain bytecode comparison (`eth_getCode` on both addresses) confirms both instances are **byte-identical** (8506 bytes each, the same current `src/AgentIdentity.sol` source), so this is a deliberate choice about namespace separation, not a difference in contract capability — both support `controller`/`operatorWallet` equally.

## When it's time to deploy

1. Review every contract in this list one more time — anything changed
   since it was marked ready gets re-tested first.
2. Run each deploy script in order, from a machine with the deployer key
   — never from this environment (no key or wallet access here, by
   design).
3. Record each resulting address below, and wire it into the app's env
   vars (e.g. `NEXT_PUBLIC_DCA_VAULT_ADDRESS`) in Vercel.
4. Move the row from "pending" to a "deployed" table here once it's live,
   with the address, deploy tx hash, and date.

## Deployed

| Contract | Address | Deploy tx | Date |
| --- | --- | --- | --- |
| AgentIdentity (credit registry — `CREDIT_IDENTITY_ADDRESS` below, Credit only) | [`0xfc7bd67545f9a87df2bc4551ad1d305afb36b11b`](https://robinhoodchain.blockscout.com/address/0xfc7bd67545f9a87df2bc4551ad1d305afb36b11b) | `0x85344514ef0267a06ef0e0d1528a68b7fde1623974fc223596ea084b5a2e868b` | 2026-10-04 |
| AgentCreditPool | [`0xc7a04d94361de7a30d099057c6746217b6aa0d2e`](https://robinhoodchain.blockscout.com/address/0xc7a04d94361de7a30d099057c6746217b6aa0d2e) | `0x812fce9687060ab5ff23829bf3da1c7b78548cfe65bab889c1618aef7dd76577` | 2026-10-04 |
| AgentIdentity (AUEVO protocol registry — `NEXT_PUBLIC_AUEVO_IDENTITY_ADDRESS` below, Financial League + Identity Proof) | [`0x12d4dfd622b9089453596e809c2e247bc4b75be8`](https://robinhoodchain.blockscout.com/address/0x12d4dfd622b9089453596e809c2e247bc4b75be8) | `0x1fda88b813f40e2e18979121adb267327fc0d886a3720361104ac1e5cf1c8622` | 2026-10-04 |

`$AUEVO` launched once via Pons on 2026-10-08 and was wired into the site that same day. **That launch is being pulled
and the token relaunched (2026-10-08 decision)** — every mention of that address, including on `/` and the old
`/token` page, has been removed from the site and this repo's docs. Don't treat any `$AUEVO` address found outside
this file (an old screenshot, a cached page, a search result) as current; the relaunch's real address, once there is
one, goes here first.

AgentCreditPool deploy params: `CREDIT_ASSET_ADDRESS=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (USDG, 6 decimals), `CREDIT_IDENTITY_ADDRESS=0xfc7bd67545f9a87df2bc4551ad1d305afb36b11b`, `CREDIT_RESERVE_ADDRESS=0x77772e5e78ab5EA22D33B2caD8a701133aa95b85`, default loan bounds ($5–$500, 1% fee/30d, $10 min root stake). `NEXT_PUBLIC_CREDIT_POOL_ADDRESS` is set in Vercel; `/credit/agent` and `/api/credit/check` are live against the real pool.

Set `NEXT_PUBLIC_AUEVO_IDENTITY_ADDRESS=0x12d4dfd622b9089453596e809c2e247bc4b75be8` in Vercel to bring Financial Agent League entry (`/proofs/financial-league`) and the Identity Proof category live — a separate agentId namespace from Credit's, by design (see the note above).
