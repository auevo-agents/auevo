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

AgentCreditPool with seats (`vouchSeat()`) is written and tested (see `src/AgentCreditPool.sol`'s own doc comment and 118 integration-test assertions) but deliberately NOT redeployed yet — it needs a real `seatToken` address ($AUEVO), which doesn't exist on chain yet, and this contract has no admin to add one after deploy. The currently live AgentCreditPool (see "Deployed" below) predates seats entirely and keeps working as-is in the meantime.

See "Deployed" below for AgentCreditPool and AgentIdentity, both now live.

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
| AgentIdentity | [`0xfc7bd67545f9a87df2bc4551ad1d305afb36b11b`](https://robinhoodchain.blockscout.com/address/0xfc7bd67545f9a87df2bc4551ad1d305afb36b11b) | `0x85344514ef0267a06ef0e0d1528a68b7fde1623974fc223596ea084b5a2e868b` | 2026-10-04 |
| AgentCreditPool | [`0xc7a04d94361de7a30d099057c6746217b6aa0d2e`](https://robinhoodchain.blockscout.com/address/0xc7a04d94361de7a30d099057c6746217b6aa0d2e) | `0x812fce9687060ab5ff23829bf3da1c7b78548cfe65bab889c1618aef7dd76577` | 2026-10-04 |

AgentCreditPool deploy params: `CREDIT_ASSET_ADDRESS=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (USDG, 6 decimals), `CREDIT_IDENTITY_ADDRESS=0xfc7bd67545f9a87df2bc4551ad1d305afb36b11b` (this deploy's own AgentIdentity, not Priors' shared registry), `CREDIT_RESERVE_ADDRESS=0x77772e5e78ab5EA22D33B2caD8a701133aa95b85`, default loan bounds ($5–$500, 1% fee/30d, $10 min root stake). `NEXT_PUBLIC_CREDIT_POOL_ADDRESS` is set in Vercel; `/credit/agent` and `/api/credit/check` are live against the real pool.
