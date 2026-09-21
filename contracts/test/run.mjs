import Ganache from "ganache";
import {
  createPublicClient,
  createWalletClient,
  http,
  custom,
  parseUnits,
  getContractAddress,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";

const build = JSON.parse(fs.readFileSync(new URL("../build.json", import.meta.url)));

function contractOf(file, name) {
  const c = build.contracts[file][name];
  return { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` };
}

const DcaVault = contractOf("src/DcaVault.sol", "DcaVault");
const MockERC20 = contractOf("test/mocks/MockERC20.sol", "MockERC20");
const Factory = contractOf("test/mocks/MockUniswap.sol", "MockUniswapV3Factory");
const Pool = contractOf("test/mocks/MockUniswap.sol", "MockUniswapV3Pool");
const Router = contractOf("test/mocks/MockUniswap.sol", "MockSwapRouter02");
const ReentrantERC20 = contractOf("test/mocks/MockUniswap.sol", "ReentrantERC20");

const server = Ganache.server({ chain: { chainId: 4663 }, wallet: { totalAccounts: 3 } });
await new Promise((resolve, reject) => server.listen(8646, (err) => (err ? reject(err) : resolve())));

const transport = http("http://127.0.0.1:8646");
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

async function expectRevert(promise, label) {
  try {
    await promise;
    return false;
  } catch (err) {
    return true;
  }
}

const deployerClient = walletFor(deployerAcct);
const aliceClient = walletFor(aliceAcct);
const keeperClient = walletFor(keeperAcct);

console.log("Deploying mocks and DcaVault...");
const tokenIn = await deploy(deployerClient, MockERC20, ["In", "IN"]);
const tokenOut = await deploy(deployerClient, MockERC20, ["Out", "OUT"]);
const pool = await deploy(deployerClient, Pool);
const factory = await deploy(deployerClient, Factory);
const router = await deploy(deployerClient, Router);
await write(deployerClient, factory, Factory.abi, "setPool", [pool]);

const vault = await deploy(deployerClient, DcaVault, [router, factory, deployer]);
console.log("DcaVault deployed at", vault);

// Fund alice with tokenIn, fund the router with tokenOut (its "liquidity").
await write(deployerClient, tokenIn, MockERC20.abi, "mint", [alice, parseUnits("1000", 18)]);
await write(deployerClient, tokenOut, MockERC20.abi, "mint", [router, parseUnits("1000000", 18)]);
await write(aliceClient, tokenIn, MockERC20.abi, "approve", [vault, parseUnits("1000", 18)]);

// Set a TWAP tick of 0 (price ratio 1:1-ish) for straightforward math.
await write(deployerClient, pool, Pool.abi, "setMockTick", [0n]);

console.log("\n1) create + fund a position");
{
  const trancheAmount = parseUnits("10", 18);
  const principal = parseUnits("100", 18);
  await write(aliceClient, vault, DcaVault.abi, "createPosition", [
    tokenIn, tokenOut, 3000, trancheAmount, 3600n, 300, principal, // 3% max slippage
  ]);
  const pos = await read(vault, DcaVault.abi, "positions", [0n]);
  check("position owner is alice", pos[0].toLowerCase() === alice.toLowerCase());
  check("remaining equals principal", pos[7] === principal);
  const vaultBal = await read(tokenIn, MockERC20.abi, "balanceOf", [vault]);
  check("vault holds the deposited principal", vaultBal === principal);
}

console.log("\n2) executeBuy respects the TWAP floor — rejects a bad-price fill");
{
  // tick=0 with roughly equal decimals => fair quote is ~= amountIn (1:1).
  // Router offers far less than the 3%-slippage floor allows.
  await write(deployerClient, router, Router.abi, "setNextAmountOut", [parseUnits("5", 18)]);
  const reverted = await expectRevert(
    write(keeperClient, vault, DcaVault.abi, "executeBuy", [0n, 0n]),
    "bad price"
  );
  check("a fill far below the TWAP floor reverts", reverted);
}

console.log("\n3) executeBuy succeeds at a fair price, permissionless keeper");
{
  await write(deployerClient, router, Router.abi, "setNextAmountOut", [parseUnits("9.8", 18)]);
  await write(keeperClient, vault, DcaVault.abi, "executeBuy", [0n, 0n]);
  const outBal = await read(tokenOut, MockERC20.abi, "balanceOf", [alice]);
  check("alice received the swap output directly, not the vault", outBal === parseUnits("9.8", 18));
  const pos = await read(vault, DcaVault.abi, "positions", [0n]);
  check("remaining decreased by exactly the tranche", pos[7] === parseUnits("90", 18));
}

console.log("\n4) executeBuy again immediately reverts (TooSoon)");
{
  const reverted = await expectRevert(
    write(keeperClient, vault, DcaVault.abi, "executeBuy", [0n, 0n]),
    "too soon"
  );
  check("calling before the interval elapses reverts", reverted);
}

console.log("\n5) only the position owner can withdraw");
{
  const reverted = await expectRevert(
    write(keeperClient, vault, DcaVault.abi, "withdraw", [0n, parseUnits("1", 18)]),
    "not owner"
  );
  check("a non-owner withdraw call reverts", reverted);

  await write(aliceClient, vault, DcaVault.abi, "withdraw", [0n, parseUnits("20", 18)]);
  const aliceBal = await read(tokenIn, MockERC20.abi, "balanceOf", [alice]);
  check("owner withdraw succeeds and funds land with the owner", aliceBal === parseUnits("920", 18));
}

console.log("\n6) pause blocks new activity but never blocks withdraw");
{
  await write(deployerClient, vault, DcaVault.abi, "pause", []);

  const blockedCreate = await expectRevert(
    write(aliceClient, vault, DcaVault.abi, "createPosition", [
      tokenIn, tokenOut, 3000, parseUnits("1", 18), 60n, 300, parseUnits("1", 18),
    ]),
    "paused create"
  );
  check("createPosition reverts while paused", blockedCreate);

  await write(aliceClient, vault, DcaVault.abi, "withdraw", [0n, parseUnits("10", 18)]);
  check("withdraw still works while paused", true);

  await write(deployerClient, vault, DcaVault.abi, "unpause", []);
}

console.log("\n7) reentrancy via a malicious tokenIn's transfer(), called from withdraw()");
{
  const evilToken = await deploy(deployerClient, ReentrantERC20);
  await write(deployerClient, evilToken, ReentrantERC20.abi, "mint", [alice, parseUnits("100", 18)]);
  await write(aliceClient, evilToken, ReentrantERC20.abi, "approve", [vault, parseUnits("100", 18)]);

  await write(aliceClient, vault, DcaVault.abi, "createPosition", [
    evilToken, tokenOut, 3000, parseUnits("10", 18), 60n, 300, parseUnits("50", 18),
  ]);
  // Position id 1 (id 0 was created earlier).
  await write(deployerClient, evilToken, ReentrantERC20.abi, "configureAttack", [vault, 1n, true, false]);

  const reverted = await expectRevert(
    write(aliceClient, vault, DcaVault.abi, "withdraw", [1n, parseUnits("5", 18)]),
    "reentrancy via transfer"
  );
  check("a token that re-enters through transfer() during withdraw() is blocked", reverted);
}

console.log("\n8) reentrancy via a malicious tokenIn's transferFrom(), called from executeBuy()'s pull");
{
  const evilToken2 = await deploy(deployerClient, ReentrantERC20);
  await write(deployerClient, evilToken2, ReentrantERC20.abi, "mint", [alice, parseUnits("100", 18)]);
  await write(aliceClient, evilToken2, ReentrantERC20.abi, "approve", [vault, parseUnits("100", 18)]);

  await write(aliceClient, vault, DcaVault.abi, "createPosition", [
    evilToken2, tokenOut, 3000, parseUnits("10", 18), 60n, 300, parseUnits("50", 18),
  ]);
  // Position id 2.
  await write(deployerClient, evilToken2, ReentrantERC20.abi, "configureAttack", [vault, 2n, false, true]);
  await write(deployerClient, router, Router.abi, "setNextAmountOut", [parseUnits("9.8", 18)]);

  const reverted = await expectRevert(
    write(keeperClient, vault, DcaVault.abi, "executeBuy", [2n, 0n]),
    "reentrancy via transferFrom"
  );
  check("a token that re-enters through transferFrom() during executeBuy()'s pull is blocked", reverted);
}

console.log(`\n${passed} passed, ${failed} failed`);
await server.close();
process.exit(failed > 0 ? 1 : 0);
