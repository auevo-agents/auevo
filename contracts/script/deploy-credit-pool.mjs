// Deploys AgentCreditPool to Robinhood Chain.
//
// This is not run by any automated process, and never will be — deploying
// this contract is a decision with real, immediate financial-security
// consequences (it will be a public address anyone can vouch, lend or
// borrow against the moment it lands), and it takes a private key with
// real ETH for gas. Run it yourself, from your own machine, with your own
// key.
//
// Usage:
//   DEPLOYER_PRIVATE_KEY=0x... \
//   CREDIT_ASSET_ADDRESS=0x... \
//   CREDIT_ASSET_DECIMALS=6 \
//   CREDIT_IDENTITY_ADDRESS=0x... \
//   CREDIT_RESERVE_ADDRESS=0x... \
//   node script/deploy-credit-pool.mjs
//
// All four CREDIT_* variables are REQUIRED, with no hardcoded default —
// each is a real decision, not a code detail:
//
//   CREDIT_ASSET_ADDRESS    The ERC-20 stablecoin agents borrow and repay
//                           in. Must already exist on Robinhood Chain —
//                           this script does not deploy one.
//   CREDIT_ASSET_DECIMALS   That token's decimals(), so the $5/$500 loan
//                           bounds below are computed correctly. Get this
//                           wrong and every size check is wrong too.
//   CREDIT_IDENTITY_ADDRESS An existing ERC-8004 (or ERC-721-ownerOf-
//                           compatible) identity registry. This contract
//                           never mints or owns identities itself — it
//                           only reads who currently owns one. A public
//                           identity registry already live on this chain
//                           is at 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 —
//                           reusing it means any agent already registered
//                           there can use this pool with no new identity,
//                           but it also means trusting THAT registry's
//                           own owner (a single EOA today, not a
//                           multisig — see that registry's own audit
//                           history before deciding). Deploying a separate
//                           registry of your own is the alternative if you
//                           don't want that dependency; this script does
//                           not do that for you either.
//   CREDIT_RESERVE_ADDRESS  Where the 15% protocol fee share is paid out,
//                           immediately, on every repay(). Not this
//                           contract — it never accrues funds here.
//
// Optional, with these defaults:
//   CREDIT_MIN_LOAN_USD=5 CREDIT_MAX_LOAN_USD=500 CREDIT_FEE_BPS=100
//   CREDIT_MIN_ROOT_STAKE_USD=10
//
// Seats (vouchSeat()) are OFF by default — leave CREDIT_SEAT_TOKEN_ADDRESS
// unset and the pool deploys with seats permanently disabled (no way to
// turn them on later; this contract has no admin). To enable:
//   CREDIT_SEAT_TOKEN_ADDRESS=0x...   The ERC-20 a seat locks (e.g. $AUEVO).
//   CREDIT_SEAT_RATIO_NUMERATOR=...   seatTokenRequired = vouchAmount *
//   CREDIT_SEAT_RATIO_DENOMINATOR=... numerator / denominator — a fixed,
//                                     deploy-time rate, not a live oracle
//                                     price (see AgentCreditPool.sol's own
//                                     doc comment for why). Both required
//                                     together if CREDIT_SEAT_TOKEN_ADDRESS
//                                     is set.
//
// DEPLOYER_PRIVATE_KEY is read from the environment only, never as a CLI
// argument (arguments can end up in shell history) and never written to
// a file by this script.

import fs from "node:fs";
import { createPublicClient, createWalletClient, http, parseUnits, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROBINHOOD_CHAIN_ID = 4663;
const ROBINHOOD_PUBLIC_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Set ${name} in your environment before running this. See this script's own header.`);
    process.exit(1);
  }
  return value;
}

const privateKey = requireEnv("DEPLOYER_PRIVATE_KEY");
const assetAddress = requireEnv("CREDIT_ASSET_ADDRESS");
const assetDecimals = Number(requireEnv("CREDIT_ASSET_DECIMALS"));
const identityAddress = requireEnv("CREDIT_IDENTITY_ADDRESS");
const reserveAddress = requireEnv("CREDIT_RESERVE_ADDRESS");

if (!Number.isInteger(assetDecimals) || assetDecimals < 0 || assetDecimals > 36) {
  console.error("CREDIT_ASSET_DECIMALS must be a small non-negative integer.");
  process.exit(1);
}

const minLoan = parseUnits(process.env.CREDIT_MIN_LOAN_USD || "5", assetDecimals);
const maxLoan = parseUnits(process.env.CREDIT_MAX_LOAN_USD || "500", assetDecimals);
const feeBps = Number(process.env.CREDIT_FEE_BPS || "100");
const minRootStake = parseUnits(process.env.CREDIT_MIN_ROOT_STAKE_USD || "10", assetDecimals);

const seatTokenAddress = process.env.CREDIT_SEAT_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000";
const seatsEnabled = seatTokenAddress !== "0x0000000000000000000000000000000000000000";
let seatRatioNumerator = 0n;
let seatRatioDenominator = 1n;
if (seatsEnabled) {
  seatRatioNumerator = BigInt(requireEnv("CREDIT_SEAT_RATIO_NUMERATOR"));
  seatRatioDenominator = BigInt(requireEnv("CREDIT_SEAT_RATIO_DENOMINATOR"));
}

const build = JSON.parse(fs.readFileSync(new URL("../build.json", import.meta.url)));
const { abi, evm } = build.contracts["src/AgentCreditPool.sol"].AgentCreditPool;
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
console.log("Asset (stablecoin):", assetAddress, `(${assetDecimals} decimals)`);
console.log("Identity registry:", identityAddress);
console.log("Reserve address (15% fee share):", reserveAddress);
console.log("Loan bounds:", process.env.CREDIT_MIN_LOAN_USD || "5", "-", process.env.CREDIT_MAX_LOAN_USD || "500");
console.log("Fee:", feeBps, "bps per 30-day term");
console.log("Min root stake:", process.env.CREDIT_MIN_ROOT_STAKE_USD || "10");
console.log(
  "Seats:",
  seatsEnabled
    ? `enabled, token ${seatTokenAddress}, ratio ${seatRatioNumerator}/${seatRatioDenominator}`
    : "disabled (permanently — no admin to turn on later)"
);
console.log("RPC:", rpcUrl);
console.log(
  "\nThis contract has NO owner and NO admin function — these parameters are permanent once deployed."
);
console.log("This deploys to Robinhood Chain MAINNET. Ctrl+C now to abort.");
console.log("Continuing in 10 seconds...\n");
await new Promise((resolve) => setTimeout(resolve, 10_000));

const hash = await walletClient.deployContract({
  abi,
  bytecode,
  args: [
    assetAddress,
    identityAddress,
    minLoan,
    maxLoan,
    feeBps,
    minRootStake,
    reserveAddress,
    seatTokenAddress,
    seatRatioNumerator,
    seatRatioDenominator,
  ],
});
console.log("Transaction sent:", hash);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("\nAgentCreditPool deployed at:", receipt.contractAddress);
