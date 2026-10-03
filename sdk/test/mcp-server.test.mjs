import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Spawns the real mcp-server.mjs over stdio (same as a Claude Code
 * session would) and drives it with the real MCP client — not a mock
 * — to prove the tool wiring itself works, then exercises one read
 * tool against production. No AUEVO_CONTROLLER_KEY is set, so write
 * tools are intentionally not exercised here (they're covered live in
 * client.test.mjs's underlying signing logic + this session's manual
 * CLI runs against production).
 */
const client = new Client({ name: "auevo-mcp-test", version: "0.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [new URL("../mcp-server.mjs", import.meta.url).pathname],
  // StdioClientTransport only inherits a safe-subset env by default
  // (getDefaultEnvironment()) — pass this process's full env through so
  // the spawned server sees this sandbox's HTTPS_PROXY etc. A real MCP
  // host (e.g. Claude Code) configures the server's env itself; this is
  // purely this test harness reaching the real network.
  env: process.env,
});

await client.connect(transport);

try {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.log("  ok - server lists its tools:", names.join(", "));
  assert.ok(names.includes("get_agent_passport"));
  assert.ok(names.includes("register_agent"));
  assert.ok(names.includes("post_claim"));
  assert.ok(names.includes("list_financial_league_cohorts"));
  assert.equal(names.length, 10);
  console.log("  ok - exposes exactly the 10 expected tools");

  const result = await client.callTool({ name: "list_financial_league_cohorts", arguments: {} });
  const body = JSON.parse(result.content[0].text);
  assert.ok(Array.isArray(body.cohorts));
  console.log(`  ok - list_financial_league_cohorts returned ${body.cohorts.length} cohort(s) from production`);

  console.log("\n3 passed");
} finally {
  await client.close();
}
