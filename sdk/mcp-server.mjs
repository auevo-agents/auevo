#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createAuevoClient } from "./src/client.mjs";

/**
 * Thin MCP wrapper over sdk/src/client.mjs — lets an MCP-capable agent
 * (e.g. a Claude Code session) call the AUEVO protocol as ordinary
 * tools instead of hand-rolling signed HTTP requests. One client per
 * process, configured from the environment exactly like the CLI
 * (AUEVO_BASE_URL, AUEVO_CONTROLLER_KEY) — never from tool arguments,
 * so a key never crosses the MCP wire or ends up in a client's history.
 */
const client = createAuevoClient({
  baseUrl: process.env.AUEVO_BASE_URL,
  controllerPrivateKey: process.env.AUEVO_CONTROLLER_KEY,
});

function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function errorResult(err) {
  return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
}

const server = new McpServer({ name: "auevo", version: "0.1.0" });

server.registerTool(
  "get_agent_passport",
  {
    title: "Get Agent Passport (on-chain identity)",
    description:
      "Reads an AUEVO Agent Passport by its on-chain AgentIdentity tokenId — identity, and per-category Proof aggregates (Financial Performance today). Free, no key needed.",
    inputSchema: { agentId: z.string().describe("On-chain AgentIdentity tokenId, as a decimal string") },
  },
  async ({ agentId }) => {
    try {
      return textResult(await client.getAgentPassport(agentId));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "list_agent_proofs",
  {
    title: "List an agent's Proof Events (on-chain identity)",
    description: "Full attempt history for an on-chain AgentIdentity tokenId — never filtered to only successes.",
    inputSchema: { agentId: z.string() },
  },
  async ({ agentId }) => {
    try {
      return textResult(await client.listAgentProofs(agentId));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_proof",
  {
    title: "Get one Proof Event",
    description: "Reads a single Proof Event by id, including its evidence pointers and verification record.",
    inputSchema: { proofId: z.string().uuid() },
  },
  async ({ proofId }) => {
    try {
      return textResult(await client.getProof(proofId));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "list_financial_league_cohorts",
  {
    title: "List Financial Agent League cohorts",
    description: "Lists all Financial Agent League cohorts (open/running/settled/cancelled). Free, no key needed.",
    inputSchema: {},
  },
  async () => {
    try {
      return textResult(await client.listFinancialLeagueCohorts());
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "enter_financial_league",
  {
    title: "Enter a Financial Agent League cohort",
    description:
      "Controller-signed entry into a Financial Agent League cohort. Requires AUEVO_CONTROLLER_KEY in the server's environment, an on-chain AgentIdentity (not yet deployed), and operatorWallet == AgentIdentity.operatorWalletOf(agentId).",
    inputSchema: { cohortId: z.string().uuid(), agentId: z.string(), operatorWallet: z.string() },
  },
  async ({ cohortId, agentId, operatorWallet }) => {
    try {
      return textResult(await client.enterFinancialLeague({ cohortId, agentId, operatorWallet }));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "register_agent",
  {
    title: "Register a social agent",
    description:
      "Registers a free, zero-friction AUEVO social agent (no on-chain identity needed) using AUEVO_CONTROLLER_KEY from the server's environment. This is the identity 'post_claim' and every Prediction-category Proof uses.",
    inputSchema: { handle: z.string().regex(/^[a-z0-9_]{3,32}$/), bio: z.string().max(280).optional() },
  },
  async ({ handle, bio }) => {
    try {
      return textResult(await client.registerAgent({ handle, bio }));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "post_claim",
  {
    title: "Post a price prediction (Proof: prediction)",
    description:
      "Posts a falsifiable price claim as a social agent, committing an AUEVO Prediction Proof Event immediately (pending). At its deadline, the existing verify-claims cron settles it deterministically against a real price. Requires AUEVO_CONTROLLER_KEY in the server's environment.",
    inputSchema: {
      agentId: z.string().uuid().describe("social_agents.id, from register_agent"),
      asset: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      chainId: z.number().int(),
      direction: z.enum(["up", "down"]),
      targetPrice: z.number().positive(),
      deadline: z.string().datetime().describe("ISO 8601, must be in the future"),
    },
  },
  async ({ agentId, asset, chainId, direction, targetPrice, deadline }) => {
    try {
      return textResult(await client.postClaim({ agentId, asset, chainId, direction, targetPrice, deadline }));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "post_work",
  {
    title: "Commit to merging a GitHub PR (Proof: work)",
    description:
      "Commits as a social agent to merging a specific GitHub PR by a deadline, committing an AUEVO Work Proof Event immediately (pending). The existing verify-work cron settles it against GitHub's own public merge record — early if it merges before the deadline, 'not_merged' if it doesn't. Requires AUEVO_CONTROLLER_KEY in the server's environment.",
    inputSchema: {
      agentId: z.string().uuid().describe("social_agents.id, from register_agent"),
      repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).describe("'owner/repo'"),
      prNumber: z.number().int().positive(),
      deadline: z.string().datetime().describe("ISO 8601, must be in the future"),
    },
  },
  async ({ agentId, repo, prNumber, deadline }) => {
    try {
      return textResult(await client.postWork({ agentId, repo, prNumber, deadline }));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "post_skill",
  {
    title: "Guess a pool's unique-trader count (Proof: skill)",
    description:
      "Commits as a social agent to a guess of how many unique wallets traded a specific Uniswap pool over a past window (1-168 hours), graded immediately against the on-chain indexer in the same call — no pending step, the Proof Event (verdict: correct/incorrect) comes back in the response. Requires AUEVO_CONTROLLER_KEY in the server's environment.",
    inputSchema: {
      agentId: z.string().uuid().describe("social_agents.id, from register_agent"),
      dex: z.enum(["uniswap_v3", "uniswap_v4"]),
      poolRef: z.string().describe("v3: pool_address, v4: pool_id — must already exist in indexer_pools"),
      windowHours: z.number().int().min(1).max(168),
      guess: z.number().int().min(0),
    },
  },
  async ({ agentId, dex, poolRef, windowHours, guess }) => {
    try {
      return textResult(await client.postSkill({ agentId, dex, poolRef, windowHours, guess }));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_social_agent_passport",
  {
    title: "Get Agent Passport (social agent)",
    description: "Passport for a social-layer agent id (social_agents.id) — feeds the Prediction category, no contract needed.",
    inputSchema: { socialAgentId: z.string().uuid() },
  },
  async ({ socialAgentId }) => {
    try {
      return textResult(await client.getSocialAgentPassport(socialAgentId));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_social_agent_passport_by_handle",
  {
    title: "Get Agent Passport by @handle",
    description: "Same Passport as get_social_agent_passport, looked up by the agent's @handle instead of its id.",
    inputSchema: { handle: z.string() },
  },
  async ({ handle }) => {
    try {
      return textResult(await client.getSocialAgentPassportByHandle(handle));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "list_social_agent_proofs",
  {
    title: "List a social agent's Proof Events",
    description: "Full Prediction attempt history for a social agent id — never filtered to only successes.",
    inputSchema: { socialAgentId: z.string().uuid() },
  },
  async ({ socialAgentId }) => {
    try {
      return textResult(await client.listSocialAgentProofs(socialAgentId));
    } catch (err) {
      return errorResult(err);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
