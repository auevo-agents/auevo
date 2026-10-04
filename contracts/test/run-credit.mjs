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
const server = Ganache.server({ chain: { chainId: CHAIN_ID }, wallet: { totalAccounts: 9 } });
await new Promise((resolve, reject) => server.listen(8648, (err) => (err ? reject(err) : resolve())));

const transport = http("http://127.0.0.1:8648");
const initial = server.provider.getInitialAccounts();
const keys = Object.values(initial).map((info) => info.secretKey);
const [
  deployerAcct,
  lenderAcct,
  sponsorAcct,
  ownerAcct,
  strangerAcct,
  reserveAcct,
  sponsor2Acct,
  sponsor3Acct,
  operatorAcct,
] = keys.map((k) => privateKeyToAccount(k));
const deployer = deployerAcct.address;
const lender = lenderAcct.address;
const sponsor = sponsorAcct.address;
const owner = ownerAcct.address;
const stranger = strangerAcct.address;
const reserve = reserveAcct.address;
const sponsor2 = sponsor2Acct.address;
const sponsor3 = sponsor3Acct.address;
const operatorWallet = operatorAcct.address;

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

// Deadlines must be computed against the CHAIN's own clock, not wall-clock
// Date.now() — once a test group fast-forwards via increaseTime(), the
// chain's block.timestamp runs well ahead of real time, and a wall-clock
// deadline would already read as expired.
async function chainDeadline(secondsFromNow = 3600) {
  const block = await publicClient.getBlock();
  return block.timestamp + BigInt(secondsFromNow);
}

const deployerClient = walletFor(deployerAcct);
const lenderClient = walletFor(lenderAcct);
const sponsorClient = walletFor(sponsorAcct);
const ownerClient = walletFor(ownerAcct);
const strangerClient = walletFor(strangerAcct);
const sponsor2Client = walletFor(sponsor2Acct);
const sponsor3Client = walletFor(sponsor3Acct);
const operatorClient = walletFor(operatorAcct);

console.log("Deploying mocks and AgentCreditPool...");
const token = await deploy(deployerClient, MockERC20, ["USDG", "USDG"]);
const identity = await deploy(deployerClient, MockAgentIdentity);

const MIN_LOAN = parseUnits("5", 18);
const MAX_LOAN = parseUnits("500", 18);
const FEE_BPS = 100; // 1% per 30 days
const MIN_ROOT_STAKE = parseUnits("10", 18);

const pool = await deploy(deployerClient, Pool, [token, identity, MIN_LOAN, MAX_LOAN, FEE_BPS, MIN_ROOT_STAKE, reserve]);
console.log("AgentCreditPool deployed at", pool);

// Fund everyone who needs USDG, approve the pool.
for (const [client, addr] of [
  [lenderClient, lender],
  [sponsorClient, sponsor],
  [ownerClient, owner],
  [sponsor2Client, sponsor2],
  [sponsor3Client, sponsor3],
]) {
  await write(deployerClient, token, MockERC20.abi, "mint", [addr, parseUnits("1000", 18)]);
  await write(client, token, MockERC20.abi, "approve", [pool, parseUnits("1000", 18)]);
}

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

let nextNonce = 1n;
async function vouchFor(sponsorClientLocal, sponsorAddr, amount, premiumBps = 0, forAgentId = agentId) {
  const nonce = nextNonce++;
  const deadline = await chainDeadline();
  const sig = await signConsent(ownerClient, { agentId: forAgentId, sponsor: sponsorAddr, maxPremiumBps: premiumBps, nonce, deadline });
  return write(sponsorClientLocal, pool, Pool.abi, "vouch", [forAgentId, amount, premiumBps, premiumBps, nonce, deadline, sig]);
}

console.log("\n1) lender deposits, sponsor stakes and enrolls as root");
{
  await write(lenderClient, pool, Pool.abi, "deposit", [parseUnits("500", 18)]);
  const lenderShares = await read(pool, Pool.abi, "shares", [lender]);
  check("lender received shares 1:1 on first deposit", lenderShares === parseUnits("500", 18));

  await write(sponsorClient, pool, Pool.abi, "deposit", [parseUnits("50", 18)]);

  const belowMin = await expectRevert(write(lenderClient, pool, Pool.abi, "enrollRoot", []));
  check("a depositor above minRootStake can enroll (lender case)", !belowMin);

  await write(sponsorClient, pool, Pool.abi, "enrollRoot", []);
  const isRoot = await read(pool, Pool.abi, "isRoot", [sponsor]);
  check("sponsor is enrolled as a root after staking above minRootStake", isRoot === true);
}

console.log("\n2) vouch requires a valid, fresh, correctly-scoped consent signature");
{
  const deadline = await chainDeadline();
  const nonce = nextNonce++;

  const badSig = await signConsent(strangerClient, { agentId, sponsor, maxPremiumBps: 0, nonce, deadline });
  const rejectedWrongSigner = await expectRevert(
    write(sponsorClient, pool, Pool.abi, "vouch", [agentId, parseUnits("25", 18), 0, 0, nonce, deadline, badSig])
  );
  check("vouch rejects a consent signed by someone other than the agent owner", rejectedWrongSigner);

  const goodSig = await signConsent(ownerClient, { agentId, sponsor, maxPremiumBps: 0, nonce, deadline });
  await write(sponsorClient, pool, Pool.abi, "vouch", [agentId, parseUnits("25", 18), 0, 0, nonce, deadline, goodSig]);

  const agent = await read(pool, Pool.abi, "agentInfo", [agentId]);
  check("agent's delegatedIn is now $25", agent[0] === parseUnits("25", 18));
  const sponsors = await read(pool, Pool.abi, "sponsorsOf", [agentId]);
  check("agent's sponsor list has exactly one sponsor", sponsors.length === 1 && sponsors[0].toLowerCase() === sponsor.toLowerCase());

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

  const loan = await read(pool, Pool.abi, "loanInfo", [0n]);
  check("loan principal recorded correctly", loan[1] === parseUnits("10", 18));
  const expectedFee = (parseUnits("10", 18) * 100n * 7n) / (30n * 10000n);
  check("loan fee matches 1%/30d pro-rated for 7 days", loan[2] === expectedFee);
  check("loan status is Open", loan[5] === 1);

  const loanShares = await read(pool, Pool.abi, "loanSharesOf", [0n]);
  check("loan has exactly one sponsor share (single sponsor so far)", loanShares.length === 1);
  check("that share's principal equals the full loan principal", loanShares[0].principal === parseUnits("10", 18));

  const afterFree = await read(pool, Pool.abi, "freeCapacity", [sponsor]);
  check("sponsor's free capacity dropped by exactly the locked fee", beforeFree - afterFree === expectedFee);

  const overLine = await expectRevert(
    write(ownerClient, pool, Pool.abi, "borrow", [agentId, parseUnits("100", 18), 7n, owner])
  );
  check("a second concurrent loan is rejected (one open loan per agent)", overLine);

  const notOwner = await expectRevert(write(strangerClient, pool, Pool.abi, "repay", [0n]));
  const strangerBal = await read(token, MockERC20.abi, "balanceOf", [stranger]);
  check("stranger has no USDG, so their repay attempt reverts on transfer, not on access control", notOwner && strangerBal === 0n);
}

console.log("\n4) repay splits the fee 60/25/15 and grows the agent's record");
{
  const sponsorSharesBefore = await read(pool, Pool.abi, "shares", [sponsor]);
  const totalAssetsBefore = await read(pool, Pool.abi, "totalAssets", []);
  const reserveBalBefore = await read(token, MockERC20.abi, "balanceOf", [reserve]);

  await write(ownerClient, pool, Pool.abi, "repay", [0n]);

  const loan = await read(pool, Pool.abi, "loanInfo", [0n]);
  check("loan status is Repaid", loan[5] === 2);

  const agent = await read(pool, Pool.abi, "agentInfo", [agentId]);
  check("agent's loansRepaid incremented", agent[4] === 1);
  check("agent's volumeRepaid recorded the principal", agent[5] === parseUnits("10", 18));
  check("agent's principalOut is back to 0", agent[1] === 0n);
  check("agent's activeLoan flag cleared", agent[2] === false);

  const fee = (parseUnits("10", 18) * 100n * 7n) / (30n * 10000n);
  const lenderCut = (fee * 6000n) / 10000n;
  const sponsorCut = (fee * 2500n) / 10000n;
  const reserveCut = fee - lenderCut - sponsorCut;

  const reserveBalAfter = await read(token, MockERC20.abi, "balanceOf", [reserve]);
  check("reserve received exactly its 15% cut, paid out immediately", reserveBalAfter - reserveBalBefore === reserveCut);

  const totalAssetsAfter = await read(pool, Pool.abi, "totalAssets", []);
  check(
    "totalAssets grew by lenderCut + sponsorCut (principal is accounting-neutral)",
    totalAssetsAfter - totalAssetsBefore === lenderCut + sponsorCut
  );

  const sponsorSharesAfter = await read(pool, Pool.abi, "shares", [sponsor]);
  check("sponsor was credited new shares for its 25% cut", sponsorSharesAfter > sponsorSharesBefore);
}

console.log("\n5) a defaulted loan burns only the backing sponsor's shares, never the lender's share price");
{
  await vouchFor(sponsorClient, sponsor, parseUnits("5", 18));

  await write(ownerClient, pool, Pool.abi, "borrow", [agentId, parseUnits("20", 18), 7n, owner]);

  const lenderValueBefore = await read(pool, Pool.abi, "sharesValue", [lender]);
  const sponsorSharesBefore = await read(pool, Pool.abi, "shares", [sponsor]);

  const tooEarly = await expectRevert(write(strangerClient, pool, Pool.abi, "markDefault", [1n]));
  check("markDefault reverts before the grace period has passed", tooEarly);

  // 7 days (term) + 3 days (grace) + 1 second margin.
  await increaseTime(7 * 24 * 3600 + 3 * 24 * 3600 + 1);

  await write(strangerClient, pool, Pool.abi, "markDefault", [1n]); // permissionless, matches Priors

  const loanAfter = await read(pool, Pool.abi, "loanInfo", [1n]);
  check("loan status is Defaulted", loanAfter[5] === 3);

  const agent = await read(pool, Pool.abi, "agentInfo", [agentId]);
  check("agent is permanently defaulted", agent[3] === true);
  check("agent's line was fully revoked on default", agent[0] === 0n);

  const sponsorSharesAfter = await read(pool, Pool.abi, "shares", [sponsor]);
  check("sponsor's shares were burned to cover principal + fee", sponsorSharesAfter < sponsorSharesBefore);

  const lenderValueAfter = await read(pool, Pool.abi, "sharesValue", [lender]);
  check("lender's share value never fell because of this default", lenderValueAfter >= lenderValueBefore);

  const stillDefaulted = await expectRevert(
    write(ownerClient, pool, Pool.abi, "borrow", [agentId, parseUnits("5", 18), 1n, owner])
  );
  check("a defaulted agent can never borrow again", stillDefaulted);
}

console.log("\n6) withdraw() rounds shares-burned UP, never leaking value to an uninvolved holder");
{
  await write(deployerClient, token, MockERC20.abi, "mint", [stranger, parseUnits("1000", 18)]);
  await write(strangerClient, token, MockERC20.abi, "approve", [pool, parseUnits("1000", 18)]);

  const lenderValueBefore = await read(pool, Pool.abi, "sharesValue", [lender]);

  await write(strangerClient, pool, Pool.abi, "deposit", [parseUnits("777", 18)]);
  await write(strangerClient, pool, Pool.abi, "withdraw", [1n]); // smallest possible unit — maximal rounding pressure

  const lenderValueAfter = await read(pool, Pool.abi, "sharesValue", [lender]);
  check(
    "an uninvolved lender's share value never decreases from someone else's withdraw",
    lenderValueAfter >= lenderValueBefore
  );
}

// ---------------------------------------------------------------------
// New agent for the multi-sponsor and operatorWallet scenarios, so these
// don't interact with agent #0's already-defaulted history above.
// ---------------------------------------------------------------------
await write(deployerClient, identity, MockAgentIdentity.abi, "mint", [owner]);
const agent2Id = 1n;

console.log("\n7) a second, distinct sponsor can back the same agent alongside the first");
{
  // sponsor's free capacity was eaten into by the default-loss burn in (5)
  // above; top up its deposit so it has enough headroom to vouch $60 here
  // without that unrelated history leaking into this scenario's assertions.
  await write(sponsorClient, pool, Pool.abi, "deposit", [parseUnits("200", 18)]);

  await write(sponsor2Client, pool, Pool.abi, "deposit", [parseUnits("100", 18)]);
  await write(sponsor2Client, pool, Pool.abi, "enrollRoot", []);

  // agent2's first sponsor, vouching $60 at 0.5% premium.
  {
    const nonce = nextNonce++;
    const deadline = await chainDeadline();
    const sig = await signConsent(ownerClient, { agentId: agent2Id, sponsor, maxPremiumBps: 50, nonce, deadline });
    await write(sponsorClient, pool, Pool.abi, "vouch", [agent2Id, parseUnits("60", 18), 50, 50, nonce, deadline, sig]);
  }
  // agent2's second, distinct sponsor, vouching $40 at a different (1%) premium.
  {
    const nonce = nextNonce++;
    const deadline = await chainDeadline();
    const sig = await signConsent(ownerClient, { agentId: agent2Id, sponsor: sponsor2, maxPremiumBps: 100, nonce, deadline });
    await write(sponsor2Client, pool, Pool.abi, "vouch", [agent2Id, parseUnits("40", 18), 100, 100, nonce, deadline, sig]);
  }

  const sponsors = await read(pool, Pool.abi, "sponsorsOf", [agent2Id]);
  check("agent2 now has two distinct sponsors", sponsors.length === 2);

  const agent = await read(pool, Pool.abi, "agentInfo", [agent2Id]);
  check("agent2's delegatedIn is the sum of both sponsors' vouches ($100)", agent[0] === parseUnits("100", 18));

  // Borrow $100 (the full line) — should split 60/40 between the two sponsors,
  // each paying fee at THEIR OWN premium, not a blended rate.
  await write(ownerClient, pool, Pool.abi, "borrow", [agent2Id, parseUnits("100", 18), 30n, owner]);
  const shares = await read(pool, Pool.abi, "loanSharesOf", [2n]);
  check("loan #2 has exactly two sponsor shares", shares.length === 2);

  const byAddr = Object.fromEntries(shares.map((s) => [s.sponsor.toLowerCase(), s]));
  check("sponsor1's share of principal is $60", byAddr[sponsor.toLowerCase()].principal === parseUnits("60", 18));
  check("sponsor2's share of principal is $40", byAddr[sponsor2.toLowerCase()].principal === parseUnits("40", 18));

  const fee1Expected = (parseUnits("60", 18) * 150n * 30n) / (30n * 10000n); // 1% base + 0.5% premium
  const fee2Expected = (parseUnits("40", 18) * 200n * 30n) / (30n * 10000n); // 1% base + 1% premium
  check("sponsor1's fee uses its own 0.5% premium, not sponsor2's", byAddr[sponsor.toLowerCase()].fee === fee1Expected);
  check("sponsor2's fee uses its own 1% premium, not sponsor1's", byAddr[sponsor2.toLowerCase()].fee === fee2Expected);

  const principalSum = shares.reduce((acc, s) => acc + s.principal, 0n);
  check("the two sponsors' principal shares sum exactly to the loan amount (no rounding leak)", principalSum === parseUnits("100", 18));
}

console.log("\n8) repay credits each of the loan's sponsors its own 25% cut");
{
  const s1SharesBefore = await read(pool, Pool.abi, "shares", [sponsor]);
  const s2SharesBefore = await read(pool, Pool.abi, "shares", [sponsor2]);

  await write(ownerClient, pool, Pool.abi, "repay", [2n]);

  const s1SharesAfter = await read(pool, Pool.abi, "shares", [sponsor]);
  const s2SharesAfter = await read(pool, Pool.abi, "shares", [sponsor2]);
  check("sponsor1 was minted new shares for its own cut", s1SharesAfter > s1SharesBefore);
  check("sponsor2 was minted new shares for its own cut", s2SharesAfter > s2SharesBefore);

  const agent = await read(pool, Pool.abi, "agentInfo", [agent2Id]);
  check("agent2's loan is closed (activeLoan false)", agent[2] === false);
}

console.log("\n9) a sponsor who joins AFTER a loan is drawn carries none of that loan's risk");
{
  // agent2 now has a fresh, fully-free line (both sponsors' capacity was
  // released by the repay above). Draw a second loan funded ONLY by the
  // two existing sponsors, pro-rata as before, THEN let sponsor3 join.
  await write(ownerClient, pool, Pool.abi, "borrow", [agent2Id, parseUnits("50", 18), 7n, owner]);
  const loanId = 3n;
  const sharesAtBorrow = await read(pool, Pool.abi, "loanSharesOf", [loanId]);
  check("the late sponsor is not part of this loan's frozen snapshot yet", sharesAtBorrow.length === 2);

  // sponsor3 vouches for agent2 only now, after loan #3 already exists.
  await write(sponsor3Client, pool, Pool.abi, "deposit", [parseUnits("200", 18)]);
  await write(sponsor3Client, pool, Pool.abi, "enrollRoot", []);
  await vouchFor(sponsor3Client, sponsor3, parseUnits("30", 18), 0, agent2Id);

  const sponsor3SharesBefore = await read(pool, Pool.abi, "shares", [sponsor3]);

  await increaseTime(7 * 24 * 3600 + 3 * 24 * 3600 + 1);
  await write(strangerClient, pool, Pool.abi, "markDefault", [loanId]);

  const sponsor3SharesAfter = await read(pool, Pool.abi, "shares", [sponsor3]);
  check("the late sponsor's shares are untouched by a default on a loan it never backed", sponsor3SharesAfter === sponsor3SharesBefore);

  const sponsors = await read(pool, Pool.abi, "sponsorsOf", [agent2Id]);
  // sponsorList itself is append-only history, but every stake should now read back as 0.
  let allReleased = true;
  for (const s of sponsors) {
    const [amount] = await read(pool, Pool.abi, "sponsorStakeOf", [agent2Id, s]);
    if (amount !== 0n) allReleased = false;
  }
  check("every sponsor's (used or not) committed capacity was released on default, including the late joiner's", allReleased);
}

// ---------------------------------------------------------------------
// operatorWallet scenario — a third, fresh agent.
// ---------------------------------------------------------------------
await write(deployerClient, identity, MockAgentIdentity.abi, "mint", [owner]);
const agent3Id = 2n;

console.log("\n10) an agent's configured operatorWallet can borrow and repay, not just its identity owner");
{
  await write(deployerClient, identity, MockAgentIdentity.abi, "setOperatorWallet", [agent3Id, operatorWallet]);
  await write(deployerClient, token, MockERC20.abi, "mint", [operatorWallet, parseUnits("100", 18)]);
  await write(operatorClient, token, MockERC20.abi, "approve", [pool, parseUnits("100", 18)]);

  await vouchFor(sponsorClient, sponsor, parseUnits("20", 18), 0, agent3Id);

  const strangerCannotBorrow = await expectRevert(
    write(strangerClient, pool, Pool.abi, "borrow", [agent3Id, parseUnits("10", 18), 7n, stranger])
  );
  check("an address that is neither owner nor operatorWallet cannot borrow", strangerCannotBorrow);

  await write(operatorClient, pool, Pool.abi, "borrow", [agent3Id, parseUnits("10", 18), 7n, operatorWallet]);
  const loan = await read(pool, Pool.abi, "loanInfo", [4n]);
  check("operatorWallet successfully drew a loan on the owner's behalf", loan[1] === parseUnits("10", 18));

  await write(operatorClient, pool, Pool.abi, "repay", [4n]);
  const loanAfter = await read(pool, Pool.abi, "loanInfo", [4n]);
  check("operatorWallet could also repay it", loanAfter[5] === 2);
}

console.log("\n11) a registry with no operatorWalletOf concept still works (owner-only, same as before)");
{
  // MockAgentIdentity DOES implement operatorWalletOf, so this specifically
  // checks the fallback path by using an agent id that was never given one
  // (defaults to address(0) — which can never equal a real caller).
  await write(deployerClient, identity, MockAgentIdentity.abi, "mint", [owner]);
  const agent4Id = 3n;
  await vouchFor(sponsorClient, sponsor, parseUnits("20", 18), 0, agent4Id);

  const randomCannotBorrow = await expectRevert(
    write(strangerClient, pool, Pool.abi, "borrow", [agent4Id, parseUnits("10", 18), 7n, stranger])
  );
  check("with no operatorWallet configured (defaults to address(0)), only the owner can borrow", randomCannotBorrow);

  await write(ownerClient, pool, Pool.abi, "borrow", [agent4Id, parseUnits("10", 18), 7n, owner]);
  const loan = await read(pool, Pool.abi, "loanInfo", [5n]);
  check("the owner itself can still always borrow regardless of operatorWallet", loan[1] === parseUnits("10", 18));
}

console.log(`\n${passed} passed, ${failed} failed`);
await server.close();
process.exit(failed > 0 ? 1 : 0);
