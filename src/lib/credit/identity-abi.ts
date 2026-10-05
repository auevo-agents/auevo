/**
 * Minimal ABI for AgentIdentity (contracts/src/AgentIdentity.sol) as used
 * by the CLIENT to register a brand-new credit agent id — the one write
 * path this app's server-side src/lib/auevo/identity-abi.ts never needed,
 * since that file only ever reads the AUEVO-protocol registry. This is
 * the SEPARATE credit identity registry (CREDIT_IDENTITY_ADDRESS) — its
 * address is never hardcoded here, callers read it live from the pool's
 * own identity() view (see AGENT_CREDIT_POOL_ABI) so there is exactly one
 * place this address can drift from the deployed pool.
 */
export const CREDIT_IDENTITY_WRITE_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI_", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  { type: "function", name: "nextAgentId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
    ],
  },
] as const;
