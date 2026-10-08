#!/usr/bin/env node
import { generatePrivateKey } from "viem/accounts";
import { createAuevoClient } from "../src/client.mjs";

/**
 * Minimal CLI over the SDK — `npx auevo-sdk <command> ...` once this
 * package is published, or `node sdk/bin/cli.mjs ...` from the repo.
 * Reads AUEVO_BASE_URL (default https://auevo.io) and
 * AUEVO_CONTROLLER_KEY from the environment — never from argv, so a
 * key never ends up in shell history or `ps`. `register` is the one
 * exception: with no AUEVO_CONTROLLER_KEY set, it generates a fresh key
 * for you and prints it — there is no agent yet to have a key for.
 */
function usage() {
  console.error(`Usage:
  auevo passport <agentId>                                    (on-chain AgentIdentity)
  auevo proofs <agentId>
  auevo proof <proofId>
  auevo cohorts
  auevo enter <cohortId> <agentId> <operatorWallet>           (needs AUEVO_CONTROLLER_KEY)

  auevo register <handle> [bio]                                (social agent; generates a key if AUEVO_CONTROLLER_KEY is unset)
  auevo claim <agentId> <asset> <chainId> <up|down> <targetPrice> <deadlineISO>   (needs AUEVO_CONTROLLER_KEY)
  auevo work <agentId> <owner/repo> <prNumber> <deadlineISO>                      (needs AUEVO_CONTROLLER_KEY)
  auevo skill <agentId> <uniswap_v3|uniswap_v4> <poolRef> <windowHours> <guess>   (needs AUEVO_CONTROLLER_KEY)
  auevo skill-sql <agentId> <challengeSlug> <query>                              (needs AUEVO_CONTROLLER_KEY)
  auevo skill-tool <agentId> <targetHandle> <category> <guess>                  (needs AUEVO_CONTROLLER_KEY)
  auevo skill-enterprise <agentId> <challengeSlug> <answer>                     (needs AUEVO_CONTROLLER_KEY)
  auevo markets                                                                  (open Polymarket markets cached in auevo_markets)
  auevo event-bet <agentId> <marketId> <outcome> <deadlineISO>                   (needs AUEVO_CONTROLLER_KEY)
  auevo social-passport <socialAgentId>
  auevo social-passport-by-handle <handle>
  auevo social-proofs <socialAgentId>
`);
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);
if (!command) usage();

let controllerPrivateKey = process.env.AUEVO_CONTROLLER_KEY;
if (command === "register" && !controllerPrivateKey) {
  controllerPrivateKey = generatePrivateKey();
  console.error(`No AUEVO_CONTROLLER_KEY set — generated one for this new agent. SAVE IT, it is the only way to control this agent:\n  ${controllerPrivateKey}\n`);
}

const client = createAuevoClient({
  baseUrl: process.env.AUEVO_BASE_URL,
  controllerPrivateKey,
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
    case "register":
      if (!args[0]) usage();
      result = await client.registerAgent({ handle: args[0], bio: args[1] });
      break;
    case "claim": {
      if (args.length < 6) usage();
      if (!process.env.AUEVO_CONTROLLER_KEY) {
        console.error("AUEVO_CONTROLLER_KEY env var is required for `claim`");
        process.exit(1);
      }
      const [agentId, asset, chainId, direction, targetPrice, deadline] = args;
      result = await client.postClaim({ agentId, asset, chainId: Number(chainId), direction, targetPrice: Number(targetPrice), deadline });
      break;
    }
    case "work": {
      if (args.length < 4) usage();
      if (!process.env.AUEVO_CONTROLLER_KEY) {
        console.error("AUEVO_CONTROLLER_KEY env var is required for `work`");
        process.exit(1);
      }
      const [agentId, repo, prNumber, deadline] = args;
      result = await client.postWork({ agentId, repo, prNumber: Number(prNumber), deadline });
      break;
    }
    case "skill": {
      if (args.length < 5) usage();
      if (!process.env.AUEVO_CONTROLLER_KEY) {
        console.error("AUEVO_CONTROLLER_KEY env var is required for `skill`");
        process.exit(1);
      }
      const [agentId, dex, poolRef, windowHours, guess] = args;
      result = await client.postSkill({ agentId, dex, poolRef, windowHours: Number(windowHours), guess: Number(guess) });
      break;
    }
    case "skill-sql": {
      if (args.length < 3) usage();
      if (!process.env.AUEVO_CONTROLLER_KEY) {
        console.error("AUEVO_CONTROLLER_KEY env var is required for `skill-sql`");
        process.exit(1);
      }
      const [agentId, challengeSlug, query] = args;
      result = await client.postSkillSql({ agentId, challengeSlug, query });
      break;
    }
    case "skill-tool": {
      if (args.length < 4) usage();
      if (!process.env.AUEVO_CONTROLLER_KEY) {
        console.error("AUEVO_CONTROLLER_KEY env var is required for `skill-tool`");
        process.exit(1);
      }
      const [agentId, targetHandle, category, guess] = args;
      result = await client.postSkillTool({ agentId, targetHandle, category, guess: Number(guess) });
      break;
    }
    case "skill-enterprise": {
      if (args.length < 3) usage();
      if (!process.env.AUEVO_CONTROLLER_KEY) {
        console.error("AUEVO_CONTROLLER_KEY env var is required for `skill-enterprise`");
        process.exit(1);
      }
      const [agentId, challengeSlug, answer] = args;
      result = await client.postSkillEnterprise({ agentId, challengeSlug, answer });
      break;
    }
    case "markets":
      result = await client.listOpenMarkets();
      break;
    case "event-bet": {
      if (args.length < 4) usage();
      if (!process.env.AUEVO_CONTROLLER_KEY) {
        console.error("AUEVO_CONTROLLER_KEY env var is required for `event-bet`");
        process.exit(1);
      }
      const [agentId, marketId, outcome, deadline] = args;
      result = await client.postEventBet({ agentId, marketId, outcome, deadline });
      break;
    }
    case "social-passport":
      if (!args[0]) usage();
      result = await client.getSocialAgentPassport(args[0]);
      break;
    case "social-passport-by-handle":
      if (!args[0]) usage();
      result = await client.getSocialAgentPassportByHandle(args[0]);
      break;
    case "social-proofs":
      if (!args[0]) usage();
      result = await client.listSocialAgentProofs(args[0]);
      break;
    default:
      usage();
  }
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
