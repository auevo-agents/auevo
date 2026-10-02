/**
 * Minimal ABI for AgentCreditPool (contracts/src/AgentCreditPool.sol) —
 * only the read functions this app's server code actually calls. Kept
 * hand-written and narrow rather than importing the full compiled ABI
 * (contracts/build.json lives in a separate package.json/toolchain not
 * wired into the Next.js build) so a change to the contract's write
 * functions can never silently change what this app reads.
 *
 * Keep this in sync with AgentCreditPool.sol by hand if its read-side
 * signatures change — there is no automated check for that today.
 */
export const AGENT_CREDIT_POOL_ABI = [
  {
    type: "function",
    name: "agents",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      { name: "sponsor", type: "address" },
      { name: "delegatedIn", type: "uint256" },
      { name: "principalOut", type: "uint256" },
      { name: "activeLoan", type: "bool" },
      { name: "defaulted", type: "bool" },
      { name: "loansRepaid", type: "uint32" },
      { name: "volumeRepaid", type: "uint256" },
      { name: "enrolledAt", type: "uint64" },
      { name: "premiumBps", type: "uint16" },
    ],
  },
  {
    type: "function",
    name: "loans",
    stateMutability: "view",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: [
      { name: "agentId", type: "uint256" },
      { name: "sponsor", type: "address" },
      { name: "principal", type: "uint256" },
      { name: "fee", type: "uint256" },
      { name: "dueAt", type: "uint64" },
      { name: "defaultableAt", type: "uint64" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "available",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "sharesValue",
    stateMutability: "view",
    inputs: [{ name: "who", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "freeCapacity",
    stateMutability: "view",
    inputs: [{ name: "who", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "isRoot",
    stateMutability: "view",
    inputs: [{ name: "who", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  { type: "function", name: "nextLoanId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "minLoan", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "maxLoan", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "feeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "minRootStake", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "asset", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "identity", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

export const ERC721_OWNER_OF_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

export const LOAN_STATUS = ["None", "Open", "Repaid", "Defaulted"] as const;
