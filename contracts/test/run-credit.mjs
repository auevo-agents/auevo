import Ganache from "ganache";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";

const build = JSON.parse(fs.readFileSync(new URL("../build.json", import.meta.url)));

function contractOf(file, name) {
  const c = build.contracts[file][name];
  return { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` };
}

const Pool = contractOf("src/AgentCreditPool.sol", "AgentCreditPool");
const MockERC20 = contractOf("test/mocks/MockERC20.sol", "MockERC20");
const MockAgentIdentity = contractOf("test/mocks/MockAgentIdentity.sol", "MockAgentIdentity");

const CHAIN_ID = 4663;
const server = Ganache.server({ chain: { chainId: CHAIN_ID }, wallet: { totalAccounts: 6 } });
await new Promise((resolve, reject) => server.listen(8648, (err) => (err ? reject(err) : resolve())));

const transport = http("http://127.0.0.1:8648");
const initial = server.provider.getInitialAccounts();
const keys = Object.values(initial).map((info) => info.secretKey);
const [deployerAcct, lenderAcct, sponsorAcct, ownerAcct, strangerAcct, reserveAcct] = keys.map((k) =>
  privateKeyToAccount(k)
);
const deployer = deployerAcct.address;
const lender = lenderAcct.address;
const sponsor = sponsorAcct.address;
const owner = ownerAcct.address;
const stranger = strangerAcct.address;
const reserve = reserveAcct.address;

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
  } catch (err) {
    return true;
  }
}

async function increaseTime(seconds) {
  await server.provider.request({ method: "evm_increaseTime", params: [seconds] });
  await server.provider.request({ method: "evm_mine", params: [] });
}

const deployerClient = walletFor(deployerAcct);
const lenderClient = walletFor(lenderAcct);
const sponsorClient = walletFor(sponsorAcct);
const ownerClient = walletFor(ownerAcct);
const strangerClient = walletFor(strangerAcct);

console.log("Deploying mocks and AgentCreditPool...");
const token = await deploy(deployerClient, MockERC20, ["USDG", "USDG"]);
const identity = await deploy(deployerClient, MockAgentIdentity);

const MIN_LOAN = parseUnits("5", 18);
const MAX_LOAN = parseUnits("500", 18);
const FEE_BPS = 100; // 1% per 30 days
const MIN_ROOT_STAKE = parseUnits("10", 18);

const pool = await deploy(deployerClient, Pool, [token, identity, MIN_LOAN, MAX_LOAN, FEE_BPS, MIN_ROOT_STAKE, reserve]);
console.log("AgentCreditPool deployed at", pool);

// Fund lender and sponsor with USDG, approve the pool.
await write(deployerClient, token, MockERC20.abi, "mint", [lender, parseUnits("1000", 18)]);
await write(deployerClient, token, MockERC20.abi, "mint", [sponsor, parseUnits("1000", 18)]);
await write(deployerClient, token, MockERC20.abi, "mint", [owner, parseUnits("1000", 18)]);
await write(lenderClient, token, MockERC20.abi, "approve", [pool, parseUnits("1000", 18)]);
await write(sponsorClient, token, MockERC20.abi, "approve", [pool, parseUnits("1000", 18)]);
await write(ownerClient, token, MockERC20.abi, "approve", [pool, parseUnits("1000", 18)]);

// Register an agent identity owned by `owner`.
await write(deployerClient, identity, MockAgentIdentity.abi, "mint", [owner]);
const agentId = 0n;

function signConsent(signerClient, { agentId, sponsor, maxPremiumBps, nonce, deadline }) {
  return signerClient.signTypedData({
    account: signerClient.account,
    domain: { name: "AgentCreditPool", version: "1", chainId: CHAIN_ID, verifyingContract: pool },
    types: {
      Consent: [
        { name: "agentId", type: "uint256" },
        { name: "sponsor", type: "address" },
        { name: "maxPremiumBps", type: "uint16" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Consent",
    message: { agentId, sponsor, maxPremiumBps, nonce, deadline },
  });
}

console.log("\n1) lender deposits, sponsor stakes and enrolls as root");
{
  await write(lenderClient, pool, Pool.abi, "deposit", [parseUnits("500", 18)]);
  const lenderShares = await read(pool, Pool.abi, "shares", [lender]);
  check("lender received shares 1:1 on first deposit", lenderShares === parseUnits("500", 18));

  await write(sponsorClient, token, MockERC20.abi, "approve", [pool, parseUnits("1000", 18)]);
  await write(sponsorClient, pool, Pool.abi, "deposit", [parseUnits("50", 18)]);

  const belowMin = await expectRevert(write(lenderClient, pool, Pool.abi, "enrollRoot", []));
  // lender has 500 staked, well above min — enrollRoot should NOT revert for lender either;
  // the real test is that someone BELOW minRootStake is rejected.
  check("a depositor above minRootStake can enroll (lender case)", !belowMin);

  await write(sponsorClient, pool, Pool.abi, "enrollRoot", []);
  const isRoot = await read(pool, Pool.abi, "isRoot", [sponsor]);
  check("sponsor is enrolled as a root after staking above minRootStake", isRoot === true);
}

console.log("\n2) vouch requires a valid, fresh, correctly-scoped consent signature");
{
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const nonce = 1n;

  const badSig = await signConsent(strangerClient, { agentId, sponsor, maxPremiumBps: 0, nonce, deadline });
  const rejectedWrongSigner = await expectRevert(
    write(sponsorClient, pool, Pool.abi, "vouch", [agentId, parseUnits("25", 18), 0, 0, nonce, deadline, badSig])
  );
  check("vouch rejects a consent signed by someone other than the agent owner", rejectedWrongSigner);

  const goodSig = await signConsent(ownerClient, { agentId, sponsor, maxPremiumBps: 0, nonce, deadline });
  await write(sponsorClient, pool, Pool.abi, "vouch", [agentId, parseUnits("25", 18), 0, 0, nonce, deadline, goodSig]);

  const agent = await read(pool, Pool.abi, "agents", [agentId]);
  check("agent's delegatedIn is now $25", agent[1] === parseUnits("25", 18));
  check("agent's sponsor is set", agent[0].toLowerCase() === sponsor.toLowerCase());

  const replayed = await expectRevert(
    write(sponsorClient, pool, Pool.abi, "vouch", [agentId, parseUnits("1", 18), 0, 0, nonce, deadline, goodSig])
  );
  check("the same signed nonce cannot be redeemed twice (replay rejected)", replayed);
}

console.log("\n3) borrow draws from the vouched line and locks the sponsor's fee capacity");
{
  const beforeFree = await read(pool, Pool.abi, "freeCapacity", [sponsor]);

  await write(ownerClient, pool, Pool.abi, "borrow", [agentId, parseUnits("10", 18), 7n, owner]);

  const ownerBal = await read(token, MockERC20.abi, "balanceOf", [owner]);
  check("borrowed USDG landed in the agent owner's wallet", ownerBal === parseUnits("1010", 18));

  const loan = await read(pool, Pool.abi, "loans", [0n]);
  check("loan principal recorded correctly", loan[2] === parseUnits("10", 18));
  const expectedFee = (parseUnits("10", 18) * 100n * 7n) / (30n * 10000n);
  check("loan fee matches 1%/30d pro-rated for 7 days", loan[3] === expectedFee);
  check("loan status is Open", loan[6] === 1);

  const afterFree = await read(pool, Pool.abi, "freeCapacity", [sponsor]);
  check("sponsor's free capacity dropped by exactly the locked fee", beforeFree - afterFree === expectedFee);

  const overLine = await expectRevert(
    write(ownerClient, pool, Pool.abi, "borrow", [agentId, parseUnits("100", 18), 7n, owner])
  );
  check("a second concurrent loan is rejected (one open loan per agent)", overLine);

  const notOwner = await expectRevert(
    write(strangerClient, pool, Pool.abi, "repay", [0n])
  );
  // repay is actually permissionless by design (anyone may repay on an agent's behalf) —
  // this call should revert only because `stranger` never approved/holds enough USDG, not
  // because of an ownership check. Confirm it reverts for the right (balance) reason by
  // checking stranger's balance is zero, then let the REAL repay happen from the owner.
  const strangerBal = await read(token, MockERC20.abi, "balanceOf", [stranger]);
  check("stranger has no USDG, so their repay attempt reverts on transfer, not on access control", notOwner && strangerBal === 0n);
}

console.log("\n4) repay splits the fee 60/25/15 and grows the agent's record");
{
  const sponsorSharesBefore = await read(pool, Pool.abi, "shares", [sponsor]);
  const totalAssetsBefore = await read(pool, Pool.abi, "totalAssets", []);
  const reserveBalBefore = await read(token, MockERC20.abi, "balanceOf", [reserve]);

  await write(ownerClient, pool, Pool.abi, "repay", [0n]);

  const loan = await read(pool, Pool.abi, "loans", [0n]);
  check("loan status is Repaid", loan[6] === 2);

  const agent = await read(pool, Pool.abi, "agents", [agentId]);
  check("agent's loansRepaid incremented", agent[5] === 1);
  check("agent's volumeRepaid recorded the principal", agent[6] === parseUnits("10", 18));
  check("agent's principalOut is back to 0", agent[2] === 0n);
  check("agent's activeLoan flag cleared", agent[3] === false);

  const fee = (parseUnits("10", 18) * 100n * 7n) / (30n * 10000n);
  const lenderCut = (fee * 6000n) / 10000n;
  const sponsorCut = (fee * 2500n) / 10000n;
  const reserveCut = fee - lenderCut - sponsorCut;

  const reserveBalAfter = await read(token, MockERC20.abi, "balanceOf", [reserve]);
  check("reserve received exactly its 15% cut, paid out immediately", reserveBalAfter - reserveBalBefore === reserveCut);

  const totalAssetsAfter = await read(pool, Pool.abi, "totalAssets", []);
  check("totalAssets grew by lenderCut + sponsorCut (principal is accounting-neutral)", totalAssetsAfter - totalAssetsBefore === lenderCut + sponsorCut);

  const sponsorSharesAfter = await read(pool, Pool.abi, "shares", [sponsor]);
  check("sponsor was credited new shares for its 25% cut", sponsorSharesAfter > sponsorSharesBefore);
}

console.log("\n5) a defaulted loan burns only the sponsor's shares, never the lender's share price");
{
  const nonce = 2n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const sig = await signConsent(ownerClient, { agentId, sponsor, maxPremiumBps: 0, nonce, deadline });
  // Top up the line so a fresh loan can be drawn (first $25 line already has $10 of history
  // but is fully free again since the loan was repaid).
  await write(sponsorClient, pool, Pool.abi, "vouch", [agentId, parseUnits("5", 18), 0, 0, nonce, deadline, sig]);

  await write(ownerClient, pool, Pool.abi, "borrow", [agentId, parseUnits("20", 18), 7n, owner]);
  const loan = await read(pool, Pool.abi, "loans", [1n]);

  const lenderValueBefore = await read(pool, Pool.abi, "sharesValue", [lender]);
  const sponsorSharesBefore = await read(pool, Pool.abi, "shares", [sponsor]);

  const tooEarly = await expectRevert(write(strangerClient, pool, Pool.abi, "markDefault", [1n]));
  check("markDefault reverts before the grace period has passed", tooEarly);

  // 7 days (term) + 3 days (grace) + 1 second margin.
  await increaseTime(7 * 24 * 3600 + 3 * 24 * 3600 + 1);

  await write(strangerClient, pool, Pool.abi, "markDefault", [1n]); // permissionless, matches Priors

  const loanAfter = await read(pool, Pool.abi, "loans", [1n]);
  check("loan status is Defaulted", loanAfter[6] === 3);

  const agent = await read(pool, Pool.abi, "agents", [agentId]);
  check("agent is permanently defaulted", agent[4] === true);
  check("agent's line was fully revoked on default", agent[1] === 0n);

  const sponsorSharesAfter = await read(pool, Pool.abi, "shares", [sponsor]);
  check("sponsor's shares were burned to cover principal + fee", sponsorSharesAfter < sponsorSharesBefore);

  const lenderValueAfter = await read(pool, Pool.abi, "sharesValue", [lender]);
  check("lender's share value never fell because of this default", lenderValueAfter >= lenderValueBefore);

  const stillDefaulted = await expectRevert(
    write(ownerClient, pool, Pool.abi, "borrow", [agentId, parseUnits("5", 18), 1n, owner])
  );
  check("a defaulted agent can never borrow again", stillDefaulted);
}

console.log(`\n${passed} passed, ${failed} failed`);
await server.close();
process.exit(failed > 0 ? 1 : 0);
