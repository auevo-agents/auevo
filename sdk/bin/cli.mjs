#!/usr/bin/env node
import { createAuevoClient } from "../src/client.mjs";

/**
 * Minimal CLI over the SDK — `npx auevo-sdk <command> ...` once this
 * package is published, or `node sdk/bin/cli.mjs ...` from the repo.
 * Reads AUEVO_BASE_URL (default https://auevo.io) and
 * AUEVO_CONTROLLER_KEY (only needed for `enter`) from the environment —
 * never from argv, so a key never ends up in shell history or `ps`.
 */
function usage() {
  console.error(`Usage:
  auevo passport <agentId>
  auevo proofs <agentId>
  auevo proof <proofId>
  auevo cohorts
  auevo enter <cohortId> <agentId> <operatorWallet>   (needs AUEVO_CONTROLLER_KEY)
`);
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);
if (!command) usage();

const client = createAuevoClient({
  baseUrl: process.env.AUEVO_BASE_URL,
  controllerPrivateKey: process.env.AUEVO_CONTROLLER_KEY,
});

try {
  let result;
  switch (command) {
    case "passport":
      if (!args[0]) usage();
      result = await client.getAgentPassport(args[0]);
      break;
    case "proofs":
      if (!args[0]) usage();
      result = await client.listAgentProofs(args[0]);
      break;
    case "proof":
      if (!args[0]) usage();
      result = await client.getProof(args[0]);
      break;
    case "cohorts":
      result = await client.listFinancialLeagueCohorts();
      break;
    case "enter":
      if (args.length < 3) usage();
      if (!process.env.AUEVO_CONTROLLER_KEY) {
        console.error("AUEVO_CONTROLLER_KEY env var is required for `enter`");
        process.exit(1);
      }
      result = await client.enterFinancialLeague({ cohortId: args[0], agentId: args[1], operatorWallet: args[2] });
      break;
    default:
      usage();
  }
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
