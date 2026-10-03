const fs = require("fs");
const path = require("path");
const solc = require("solc");

function findImports(importPath) {
  const candidates = [
    path.join(__dirname, "node_modules", importPath),
    path.join(__dirname, importPath),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return { contents: fs.readFileSync(c, "utf8") };
  }
  return { error: "File not found: " + importPath };
}

const targets = [
  "src/DcaVault.sol",
  "src/DcaVaultV4.sol",
  "src/AgentCreditPool.sol",
  "src/AgentIdentity.sol",
  "test/mocks/MockERC20.sol",
  "test/mocks/MockUniswap.sol",
  "test/mocks/MockPoolManagerV4.sol",
  "test/mocks/MockPriceOracle.sol",
  "test/mocks/MockAgentIdentity.sol",
];

const sources = {};
for (const t of targets) sources[t] = { content: fs.readFileSync(t, "utf8") };

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    // AgentCreditPool pulls in OpenZeppelin's EIP712/Strings/Bytes helpers,
    // which emit MCOPY (EIP-5656, Cancun). Robinhood Chain already runs
    // Priors' own EIP-712-based CreditPoolV2 live, so Cancun opcodes are
    // proven supported on this chain — see contracts/README.md.
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

let hasError = false;
for (const err of output.errors || []) {
  if (err.severity === "error") hasError = true;
  console.log(`[${err.severity}] ${err.formattedMessage}`);
}

if (!hasError) {
  fs.writeFileSync("build.json", JSON.stringify(output));
  console.log("Compiled OK, wrote build.json");
}
process.exit(hasError ? 1 : 0);
