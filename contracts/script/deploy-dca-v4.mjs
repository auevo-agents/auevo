// Deploys DcaVaultV4 to Robinhood Chain.
//
// DcaVaultV4.sol's OWN doc comment says this contract "must not be
// deployed to mainnet before an external audit" — the no-oracle fallback
// mode lets executeBuy() trust a caller's own minAmountOut outright
// (rejecting only a literal zero), which is a real, material weakening
// of the anti-sandwich guarantee DcaVault.sol (the V3 version) otherwise
// promises. That choice is made PER POSITION by whoever calls
// createPosition() (an address(0) priceOracle argument disables the
// floor for that position only) — there is no deploy-time flag that can
// close this gap; it is live the moment this contract exists on chain,
// for any position that chooses not to supply an oracle.
//
// This script exists because the decision to accept that risk and
// deploy anyway was made consciously, not because the gap was
// mitigated. Run it yourself, from your own machine, with your own key.
//
// Usage:
//   DEPLOYER_PRIVATE_KEY=0x... node script/deploy-dca-v4.mjs
//   # optional:
//   ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com \
//   DCA_V4_OWNER_ADDRESS=0x... \
//   DEPLOYER_PRIVATE_KEY=0x... node script/deploy-dca-v4.mjs
//
// DEPLOYER_PRIVATE_KEY is read from the environment only, never as a CLI
// argument (arguments can end up in shell history) and never written to
// a file by this script.
//
// The deployed contract's `owner` (able only to pause new activity —
// never withdraw/withdrawAllAndClose, see DcaVaultV4.sol's own docs) is
// set to the same address that deploys it, unless DCA_V4_OWNER_ADDRESS
// names a different one (e.g. a multisig).
//
// POOL_MANAGER below is copied from src/lib/rwa/dex/addresses.ts in the
// main Next.js app (not imported — that file is TypeScript, this is a
// standalone Node script in a separate package.json with no TS loader
// configured) — see that file's own doc comment for the three
// independent sources it was cross-checked against. Keep the two in
// sync by hand if either changes.

import fs from "node:fs";
import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROBINHOOD_CHAIN_ID = 4663;
const ROBINHOOD_PUBLIC_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";

const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!privateKey) {
  console.error("Set DEPLOYER_PRIVATE_KEY in your environment before running this.");
  process.exit(1);
}

const build = JSON.parse(fs.readFileSync(new URL("../build.json", import.meta.url)));
const { abi, evm } = build.contracts["src/DcaVaultV4.sol"].DcaVaultV4;
const bytecode = `0x${evm.bytecode.object}`;

const account = privateKeyToAccount(privateKey);
const ownerAddress = process.env.DCA_V4_OWNER_ADDRESS || account.address;
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
console.log("PoolManager (Uniswap v4):", POOL_MANAGER);
console.log("RPC:", rpcUrl);
console.log(
  "\nWARNING: this contract's own doc comment says it should not go to mainnet before an external audit"
);
console.log("(the no-oracle fallback mode is a real, material sandwich-protection gap — see script header).");
console.log("This deploys to Robinhood Chain MAINNET. Ctrl+C now to abort.");
console.log("Continuing in 10 seconds...\n");
await new Promise((resolve) => setTimeout(resolve, 10_000));

const hash = await walletClient.deployContract({
  abi,
  bytecode,
  args: [POOL_MANAGER, ownerAddress],
});
console.log("Transaction sent:", hash);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("\nDcaVaultV4 deployed at:", receipt.contractAddress);
console.log(
  "\nSet NEXT_PUBLIC_DCA_VAULT_V4_ADDRESS to this address in Vercel to bring the v4/USDG DCA UI live (still behind its own feature flag — see contracts/README.md)."
);
