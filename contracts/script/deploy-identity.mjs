// Deploys AgentIdentity to Robinhood Chain.
//
// Not run by any automated process. Deploying is a decision with
// immediate consequences (a public address anyone can register an
// identity against from that moment on), and it takes a private key with
// real ETH for gas. Run it yourself, from your own machine, with your own
// key.
//
// Usage:
//   DEPLOYER_PRIVATE_KEY=0x... node script/deploy-identity.mjs
//
// This contract has no constructor arguments, no owner, and no admin
// function — there is nothing else to decide before deploying it, unlike
// deploy-credit-pool.mjs's several required choices.
//
// DEPLOYER_PRIVATE_KEY is read from the environment only, never as a CLI
// argument, and never written to a file by this script.

import fs from "node:fs";
import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROBINHOOD_CHAIN_ID = 4663;
const ROBINHOOD_PUBLIC_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!privateKey) {
  console.error("Set DEPLOYER_PRIVATE_KEY in your environment before running this.");
  process.exit(1);
}

const build = JSON.parse(fs.readFileSync(new URL("../build.json", import.meta.url)));
const { abi, evm } = build.contracts["src/AgentIdentity.sol"].AgentIdentity;
const bytecode = `0x${evm.bytecode.object}`;

const account = privateKeyToAccount(privateKey);
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
console.log("RPC:", rpcUrl);
console.log("\nThis contract has NO owner and NO admin function — permanent once deployed.");
console.log("This deploys to Robinhood Chain MAINNET. Ctrl+C now to abort.");
console.log("Continuing in 10 seconds...\n");
await new Promise((resolve) => setTimeout(resolve, 10_000));

const hash = await walletClient.deployContract({ abi, bytecode });
console.log("Transaction sent:", hash);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("\nAgentIdentity deployed at:", receipt.contractAddress);
