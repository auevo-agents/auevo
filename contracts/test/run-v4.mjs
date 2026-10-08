import Ganache from "ganache";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";

/**
 * DcaVaultV4's own integration suite — separate script from run.mjs (the
 * V3 vault's), same reasoning as run-v4.integration.test.ts in the main
 * app: proves the v4 path end-to-end in isolation, and guarantees the
 * pre-existing V3 suite's fixtures/assertions are never touched by this
 * work. See DcaVaultV4.sol's own doc comment before reading these
 * assertions — the no-oracle path here is a REAL, documented weakening
 * versus DcaVault.sol's TWAP floor, not a bug in this test.
 */

const build = JSON.parse(fs.readFileSync(new URL("../build.json", import.meta.url)));

function contractOf(file, name) {
  const c = build.contracts[file][name];
  return { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` };
}

const DcaVaultV4 = contractOf("src/DcaVaultV4.sol", "DcaVaultV4");
const MockERC20 = contractOf("test/mocks/MockERC20.sol", "MockERC20");
const MockPoolManagerV4 = contractOf("test/mocks/MockPoolManagerV4.sol", "MockPoolManagerV4");
const MockPriceOracle = contractOf("test/mocks/MockPriceOracle.sol", "MockPriceOracle");
const ReentrantERC20 = contractOf("test/mocks/MockUniswap.sol", "ReentrantERC20");

const server = Ganache.server({ chain: { chainId: 4663 }, wallet: { totalAccounts: 3 } });
await new Promise((resolve, reject) => server.listen(8647, (err) => (err ? reject(err) : resolve())));

const transport = http("http://127.0.0.1:8647");
const initial = server.provider.getInitialAccounts();
const keys = Object.values(initial).map((info) => info.secretKey);
const [deployerAcct, aliceAcct, keeperAcct] = keys.map((k) => privateKeyToAccount(k));
const deployer = deployerAcct.address;
const alice = aliceAcct.address;
const keeper = keeperAcct.address;

const publicClient = createPublicClient({ transport });
const walletFor = (account) => createWalletClient({ transport, account });

let failed = 0;
let passed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
    console.log(`  ok  - ${name}`);
  } else {
    failed++;
    console.log(`FAIL  - ${name}`);
  }
}

async function deploy(client, { abi, bytecode }, args = []) {
  const hash = await client.deployContract({ abi, bytecode, args, account: client.account, chain: null });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return receipt.contractAddress;
}

async function write(client, address, abi, functionName, args = [], opts = {}) {
  const hash = await client.writeContract({
    address,
    abi,
    functionName,
    args,
    account: client.account,
    chain: null,
    ...opts,
  });
  return publicClient.waitForTransactionReceipt({ hash });
}

async function read(address, abi, functionName, args = []) {
  return publicClient.readContract({ address, abi, functionName, args });
}

async function expectRevert(promise) {
  try {
    await promise;
    return false;
  } catch {
    return true;
  }
}

const deployerClient = walletFor(deployerAcct);
const aliceClient = walletFor(aliceAcct);
const keeperClient = walletFor(keeperAcct);

console.log("Deploying mocks and DcaVaultV4...");
const currency0 = await deploy(deployerClient, MockERC20, ["Zero", "ZERO"]);
const currency1 = await deploy(deployerClient, MockERC20, ["One", "ONE"]);
// currency0/currency1 must sort the way v4 expects (currency0 < currency1)
// for the poolKey to be well-formed; MockPoolManagerV4 doesn't actually
// enforce this (it never reads the addresses), but positions built for
// real Uniswap tooling should always respect it, so the test does too.
const [tokenIn, tokenOut, zeroForOne] =
  currency0.toLowerCase() < currency1.toLowerCase() ? [currency0, currency1, true] : [currency1, currency0, false];

const poolManager = await deploy(deployerClient, MockPoolManagerV4);
const vault = await deploy(deployerClient, DcaVaultV4, [poolManager, deployer]);
console.log("DcaVaultV4 deployed at", vault);

const poolKey = { currency0, currency1, fee: 3000, tickSpacing: 60, hooks: zeroAddress };

await write(deployerClient, tokenIn, MockERC20.abi, "mint", [alice, parseUnits("1000", 18)]);
await write(deployerClient, tokenOut, MockERC20.abi, "mint", [poolManager, parseUnits("1000000", 18)]);
await write(aliceClient, tokenIn, MockERC20.abi, "approve", [vault, parseUnits("1000", 18)]);

function deltaFor(amountIn, amountOut) {
  // BalanceDelta is (amount0, amount1); tokenIn's leg is negative (paid),
  // tokenOut's leg is positive (received) — map by zeroForOne exactly the
  // way DcaVaultV4.unlockCallback itself reads it back.
  return zeroForOne ? [-amountIn, amountOut] : [amountOut, -amountIn];
}

console.log("\n1) create + fund a position (no price oracle)");
{
  const trancheAmount = parseUnits("10", 18);
  const principal = parseUnits("100", 18);
  await write(aliceClient, vault, DcaVaultV4.abi, "createPosition", [
    poolKey, zeroForOne, trancheAmount, 3600n, 300, principal, zeroAddress, // 3% max slippage, no oracle
  ]);
  const pos = await read(vault, DcaVaultV4.abi, "positions", [0n]);
  check("position owner is alice", pos[0].toLowerCase() === alice.toLowerCase());
  check("remaining equals principal", pos[5] === principal);
  const vaultBal = await read(tokenIn, MockERC20.abi, "balanceOf", [vault]);
  check("vault holds the deposited principal", vaultBal === principal);
}

console.log("\n2) with no oracle configured, executeBuy rejects a zero minAmountOut outright");
{
  const [amount0, amount1] = deltaFor(parseUnits("10", 18), parseUnits("9.8", 18));
  await write(deployerClient, poolManager, MockPoolManagerV4.abi, "setNextDelta", [amount0, amount1]);
  const reverted = await expectRevert(write(keeperClient, vault, DcaVaultV4.abi, "executeBuy", [0n, 0n]));
  check("zero minAmountOut reverts when no priceOracle is set", reverted);
}

console.log("\n3) with no oracle, executeBuy trusts the caller's own minAmountOut (the documented weaker mode)");
{
  const reverted = await expectRevert(
    write(keeperClient, vault, DcaVaultV4.abi, "executeBuy", [0n, parseUnits("50", 18)])
  );
  check("a minAmountOut above what the pool actually returns reverts (SlippageExceeded)", reverted);

  await write(keeperClient, vault, DcaVaultV4.abi, "executeBuy", [0n, parseUnits("9.8", 18)]);
  const outBal = await read(tokenOut, MockERC20.abi, "balanceOf", [alice]);
  check("alice received the swap output directly, not the vault", outBal === parseUnits("9.8", 18));
  const pos = await read(vault, DcaVaultV4.abi, "positions", [0n]);
  check("remaining decreased by exactly the tranche", pos[5] === parseUnits("90", 18));
  const managerBal = await read(tokenIn, MockERC20.abi, "balanceOf", [poolManager]);
  check("the pool manager received tokenIn via the settle-push", managerBal === parseUnits("10", 18));
}

console.log("\n4) executeBuy again immediately reverts (TooSoon)");
{
  const reverted = await expectRevert(write(keeperClient, vault, DcaVaultV4.abi, "executeBuy", [0n, 1n]));
  check("calling before the interval elapses reverts", reverted);
}

console.log("\n5) a position WITH a price oracle enforces max(callerMinOut, oracleFloor)");
{
  const oracle = await deploy(deployerClient, MockPriceOracle);
  await write(aliceClient, vault, DcaVaultV4.abi, "createPosition", [
    poolKey, zeroForOne, parseUnits("10", 18), 60n, 300, parseUnits("50", 18), oracle, // 3% max slippage
  ]);
  // Position id 1. Oracle says fair value is 10 tokenOut for 10 tokenIn; 3% slippage -> floor 9.7.
  await write(deployerClient, oracle, MockPriceOracle.abi, "setNextQuote", [parseUnits("10", 18)]);

  const [badAmount0, badAmount1] = deltaFor(parseUnits("10", 18), parseUnits("9", 18));
  await write(deployerClient, poolManager, MockPoolManagerV4.abi, "setNextDelta", [badAmount0, badAmount1]);
  const reverted = await expectRevert(write(keeperClient, vault, DcaVaultV4.abi, "executeBuy", [1n, 0n]));
  check("a fill below the oracle's slippage-adjusted floor reverts even with minAmountOut=0", reverted);

  const [goodAmount0, goodAmount1] = deltaFor(parseUnits("10", 18), parseUnits("9.8", 18));
  await write(deployerClient, poolManager, MockPoolManagerV4.abi, "setNextDelta", [goodAmount0, goodAmount1]);
  await write(keeperClient, vault, DcaVaultV4.abi, "executeBuy", [1n, 0n]);
  check("a fair-priced fill succeeds even with a zero caller-supplied minAmountOut, because the oracle floor covers it", true);
}

console.log("\n6) only the position owner can withdraw, and pause never blocks it");
{
  const reverted = await expectRevert(write(keeperClient, vault, DcaVaultV4.abi, "withdraw", [0n, parseUnits("1", 18)]));
  check("a non-owner withdraw call reverts", reverted);

  await write(deployerClient, vault, DcaVaultV4.abi, "pause", []);
  await write(aliceClient, vault, DcaVaultV4.abi, "withdraw", [0n, parseUnits("20", 18)]);
  check("withdraw still works while paused", true);

  const blockedCreate = await expectRevert(
    write(aliceClient, vault, DcaVaultV4.abi, "createPosition", [
      poolKey, zeroForOne, parseUnits("1", 18), 60n, 300, parseUnits("1", 18), zeroAddress,
    ])
  );
  check("createPosition reverts while paused", blockedCreate);
  await write(deployerClient, vault, DcaVaultV4.abi, "unpause", []);
}

console.log("\n7) reentrancy via a malicious tokenIn's transfer(), called from unlockCallback's settle-push");
{
  const evilToken = await deploy(deployerClient, ReentrantERC20);
  const [evilPoolKey, evilZeroForOne] =
    evilToken.toLowerCase() < currency1.toLowerCase()
      ? [{ currency0: evilToken, currency1, fee: 3000, tickSpacing: 60, hooks: zeroAddress }, true]
      : [{ currency0: currency1, currency1: evilToken, fee: 3000, tickSpacing: 60, hooks: zeroAddress }, false];

  await write(deployerClient, evilToken, ReentrantERC20.abi, "mint", [alice, parseUnits("100", 18)]);
  await write(aliceClient, evilToken, ReentrantERC20.abi, "approve", [vault, parseUnits("100", 18)]);
  await write(aliceClient, vault, DcaVaultV4.abi, "createPosition", [
    evilPoolKey, evilZeroForOne, parseUnits("10", 18), 60n, 300, parseUnits("50", 18), zeroAddress,
  ]);
  // Position id 2.
  await write(deployerClient, evilToken, ReentrantERC20.abi, "configureAttack", [vault, 2n, true, false]);

  const [amount0, amount1] = evilZeroForOne
    ? [-parseUnits("10", 18), parseUnits("9.8", 18)]
    : [parseUnits("9.8", 18), -parseUnits("10", 18)];
  await write(deployerClient, poolManager, MockPoolManagerV4.abi, "setNextDelta", [amount0, amount1]);

  const reverted = await expectRevert(write(keeperClient, vault, DcaVaultV4.abi, "executeBuy", [2n, parseUnits("9.8", 18)]));
  check("a token that re-enters through transfer() during unlockCallback's settle-push is blocked", reverted);
}

console.log(`\n${passed} passed, ${failed} failed`);
await server.close();
process.exit(failed > 0 ? 1 : 0);
