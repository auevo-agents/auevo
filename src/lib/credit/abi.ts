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
    name: "agentInfo",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      { name: "delegatedIn", type: "uint256" },
      { name: "principalOut", type: "uint256" },
      { name: "activeLoan", type: "bool" },
      { name: "defaulted", type: "bool" },
      { name: "loansRepaid", type: "uint32" },
      { name: "volumeRepaid", type: "uint256" },
      { name: "enrolledAt", type: "uint64" },
      { name: "sponsorCount", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "sponsorsOf",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "address[]" }],
  },
  {
    type: "function",
    name: "sponsorStakeOf",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "sponsor", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint256" },
      { name: "premiumBps", type: "uint16" },
      { name: "kind", type: "uint8" },
      { name: "seatTokenLocked", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "seatEligible",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "seatTokenRequiredFor",
    stateMutability: "view",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "seatToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "seatRatioNumerator", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "seatRatioDenominator", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "SEAT_MIN_REPAID_LOANS", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: "SEAT_BURN_BPS", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  {
    type: "function",
    name: "loanInfo",
    stateMutability: "view",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: [
      { name: "agentId", type: "uint256" },
      { name: "principal", type: "uint256" },
      { name: "fee", type: "uint256" },
      { name: "dueAt", type: "uint64" },
      { name: "defaultableAt", type: "uint64" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "loanSharesOf",
    stateMutability: "view",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: [
      {
        name: "shares",
        type: "tuple[]",
        components: [
          { name: "sponsor", type: "address" },
          { name: "principal", type: "uint256" },
          { name: "fee", type: "uint256" },
          { name: "kind", type: "uint8" },
        ],
      },
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
  { type: "function", name: "totalBadDebt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "minLoan", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "maxLoan", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "feeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "minRootStake", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "asset", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "identity", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },

  // Writes — every one of these is a real on-chain action with real
  // money behind it the moment the pool is deployed. See
  // AgentCreditPool.sol's own doc comment for exactly what each can and
  // cannot do; this file only mirrors the signatures.
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  { type: "function", name: "enrollRoot", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "vouch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "premiumBps", type: "uint16" },
      { name: "maxPremiumBps", type: "uint16" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "borrow",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "termDays", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "loanId", type: "uint256" }],
  },
  {
    type: "function",
    name: "repay",
    stateMutability: "nonpayable",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "markDefault",
    stateMutability: "nonpayable",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "vouchSeat",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "premiumBps", type: "uint16" },
      { name: "maxPremiumBps", type: "uint16" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const STAKE_KIND = ["Pool", "Seat"] as const;

export const CONSENT_EIP712_TYPES = {
  Consent: [
    { name: "agentId", type: "uint256" },
    { name: "sponsor", type: "address" },
    { name: "maxPremiumBps", type: "uint16" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

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
