// Deploys DcaVault to Robinhood Chain.
//
// This is not run by any automated process, and never will be — deploying
// this contract is a decision with real, immediate financial-security
// consequences (it will be a public address anyone can send funds to),
// and it takes a private key with real ETH for gas. Run it yourself,
// from your own machine, with your own key.
//
// Usage:
//   DEPLOYER_PRIVATE_KEY=0x... node script/deploy-dca.mjs
//   # optional:
//   ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com \
//   DCA_OWNER_ADDRESS=0x... \
//   DEPLOYER_PRIVATE_KEY=0x... node script/deploy-dca.mjs
//
// DEPLOYER_PRIVATE_KEY is read from the environment only, never as a CLI
// argument (arguments can end up in shell history) and never written to
// a file by this script.
//
// The deployed contract's `owner` (able only to pause new activity — see
// DcaVault.sol's own docs for exactly what that can and cannot do) is
// set to the same address that deploys it, unless DCA_OWNER_ADDRESS
// names a different one (e.g. a multisig).
//
// Constants below are intentionally copied rather than imported from the
// Next.js app's src/lib/chains.ts and src/lib/uniswap.ts — those are
// TypeScript, and this is a standalone Node script in a separate
// package.json with no TS loader configured. Keep the two in sync by
// hand if either changes; a mismatch here would deploy against the
// wrong router or the wrong chain, so cross-check against
// src/lib/uniswap.ts and src/lib/chains.ts in the main app before
// running this if you have any doubt they still agree.

import fs from "node:fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";

const ROBINHOOD_CHAIN_ID = 4663;
const ROBINHOOD_PUBLIC_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";

// Sourced from Uniswap's own deployments manifest —
// github.com/Uniswap/contracts/blob/main/deployments/4663.md — see
// src/lib/uniswap.ts in the main app for the full provenance note.
const UNISWAP_V3_FACTORY = "0x1f7D7550B1B028f7571e69A784071f0205fd2eFA";
const UNISWAP_SWAP_ROUTER_02 = "0xcaF681A66d020601342297493863E78C959E5cB2";

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!privateKey) {
  console.error("Set DEPLOYER_PRIVATE_KEY in your environment before running this.");
  process.exit(1);
}

const build = JSON.parse(fs.readFileSync(new URL("../build.json", import.meta.url)));
const { abi, evm } = build.contracts["src/DcaVault.sol"].DcaVault;
const bytecode = `0x${evm.bytecode.object}`;

const account = privateKeyToAccount(privateKey);
const ownerAddress = process.env.DCA_OWNER_ADDRESS || account.address;
const rpcUrl = process.env.ROBINHOOD_RPC_URL || ROBINHOOD_PUBLIC_RPC_URL;

const robinhoodChain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});

const transport = http(rpcUrl);
const publicClient = createPublicClient({ chain: robinhoodChain, transport });
const walletClient = createWalletClient({ account, chain: robinhoodChain, transport });

const chainId = await publicClient.getChainId();
if (chainId !== ROBINHOOD_CHAIN_ID) {
  console.error(`RPC reports chain ${chainId}, expected ${ROBINHOOD_CHAIN_ID}. Aborting.`);
  process.exit(1);
}

console.log("Deployer:", account.address);
console.log("Owner (pause-only, never custody):", ownerAddress);
console.log("SwapRouter02:", UNISWAP_SWAP_ROUTER_02);
console.log("V3 Factory:", UNISWAP_V3_FACTORY);
console.log("RPC:", rpcUrl);
console.log("\nThis deploys to Robinhood Chain MAINNET. Ctrl+C now to abort.");
console.log("Continuing in 10 seconds...\n");
await new Promise((resolve) => setTimeout(resolve, 10_000));

const hash = await walletClient.deployContract({
  abi,
  bytecode,
  args: [UNISWAP_SWAP_ROUTER_02, UNISWAP_V3_FACTORY, ownerAddress],
});
console.log("Transaction sent:", hash);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("\nDcaVault deployed at:", receipt.contractAddress);
console.log(
  "\nSet NEXT_PUBLIC_DCA_VAULT_ADDRESS to this address in Vercel to bring /app/bots live."
);
