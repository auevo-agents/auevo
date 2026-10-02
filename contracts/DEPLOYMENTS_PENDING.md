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
| DcaVault | [`src/DcaVault.sol`](./src/DcaVault.sol) | [`script/deploy-dca.mjs`](./script/deploy-dca.mjs) | Written, 13 integration tests passing, Slither-clean. **Not independently audited.** Ready to deploy when the batch goes out. |
| AgentCreditPool | [`src/AgentCreditPool.sol`](./src/AgentCreditPool.sol) | [`script/deploy-credit-pool.mjs`](./script/deploy-credit-pool.mjs) | Written, 29 integration tests passing. **Not independently audited.** Not yet ready — needs a conscious decision on which identity registry to trust (`CREDIT_IDENTITY_ADDRESS`) before it goes in the batch; see README.md's own section on this contract and the deploy script's header. |

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

_Nothing yet._
