import Ganache from "ganache";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";

const build = JSON.parse(fs.readFileSync(new URL("../build.json", import.meta.url)));

function contractOf(file, name) {
  const c = build.contracts[file][name];
  return { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` };
}

const AgentIdentity = contractOf("src/AgentIdentity.sol", "AgentIdentity");

const CHAIN_ID = 4663;
const server = Ganache.server({ chain: { chainId: CHAIN_ID }, wallet: { totalAccounts: 5 } });
await new Promise((resolve, reject) => server.listen(8649, (err) => (err ? reject(err) : resolve())));

const transport = http("http://127.0.0.1:8649");
const initial = server.provider.getInitialAccounts();
const keys = Object.values(initial).map((info) => info.secretKey);
const [deployerAcct, ownerAcct, controllerAcct, strangerAcct, newOwnerAcct] = keys.map((k) => privateKeyToAccount(k));
const owner = ownerAcct.address;
const controller = controllerAcct.address;
const stranger = strangerAcct.address;
const newOwner = newOwnerAcct.address;

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
  const hash = await client.writeContract({ address, abi, functionName, args, account: client.account, chain: null, ...opts });
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
const ownerClient = walletFor(ownerAcct);
const strangerClient = walletFor(strangerAcct);
const newOwnerClient = walletFor(newOwnerAcct);

console.log("Deploying AgentIdentity...");
const identity = await deploy(deployerClient, AgentIdentity);
console.log("AgentIdentity deployed at", identity);

console.log("\n1) register mints an agent id, defaults controller/operatorWallet to the caller");
{
  await write(ownerClient, identity, AgentIdentity.abi, "register", ["ipfs://agent-0"]);
  const agentId = 0n;
  check("owner is set", (await read(identity, AgentIdentity.abi, "ownerOf", [agentId])).toLowerCase() === owner.toLowerCase());
  check("controller defaults to owner", (await read(identity, AgentIdentity.abi, "controllerOf", [agentId])).toLowerCase() === owner.toLowerCase());
  check("operatorWallet defaults to owner", (await read(identity, AgentIdentity.abi, "operatorWalletOf", [agentId])).toLowerCase() === owner.toLowerCase());
  check("agentURI stored", (await read(identity, AgentIdentity.abi, "agentURI", [agentId])) === "ipfs://agent-0");
}

console.log("\n2) only the owner can configure controller/operatorWallet/URI/metadata");
{
  const agentId = 0n;
  const rejected1 = await expectRevert(write(strangerClient, identity, AgentIdentity.abi, "setController", [agentId, controller]));
  check("a non-owner cannot set controller", rejected1);

  await write(ownerClient, identity, AgentIdentity.abi, "setController", [agentId, controller]);
  check("owner can set controller", (await read(identity, AgentIdentity.abi, "controllerOf", [agentId])).toLowerCase() === controller.toLowerCase());

  await write(ownerClient, identity, AgentIdentity.abi, "setMetadata", [agentId, "model", "0x67706534"]);
  const meta = await read(identity, AgentIdentity.abi, "getMetadata", [agentId, "model"]);
  check("metadata round-trips", meta === "0x67706534");

  const rejected2 = await expectRevert(write(strangerClient, identity, AgentIdentity.abi, "setMetadata", [agentId, "model", "0x00"]));
  check("a non-owner cannot set metadata", rejected2);
}

console.log("\n3) reads on a nonexistent agent id revert");
{
  const rejected = await expectRevert(read(identity, AgentIdentity.abi, "ownerOf", [999n]));
  check("ownerOf on a nonexistent agent reverts", rejected);
}

console.log("\n4) transferAgent clears controller and operatorWallet");
{
  const agentId = 0n;
  await write(ownerClient, identity, AgentIdentity.abi, "transferAgent", [agentId, newOwner]);
  check("owner updated", (await read(identity, AgentIdentity.abi, "ownerOf", [agentId])).toLowerCase() === newOwner.toLowerCase());
  check("controller cleared on transfer", (await read(identity, AgentIdentity.abi, "controllerOf", [agentId])) === "0x0000000000000000000000000000000000000000");
  check("operatorWallet cleared on transfer", (await read(identity, AgentIdentity.abi, "operatorWalletOf", [agentId])) === "0x0000000000000000000000000000000000000000");

  const rejected = await expectRevert(write(ownerClient, identity, AgentIdentity.abi, "setController", [agentId, controller]));
  check("the OLD owner can no longer configure the agent after transfer", rejected);

  await write(newOwnerClient, identity, AgentIdentity.abi, "setController", [agentId, controller]);
  check("the NEW owner can configure the agent", (await read(identity, AgentIdentity.abi, "controllerOf", [agentId])).toLowerCase() === controller.toLowerCase());
}

console.log("\n5) two agents get independent, incrementing ids");
{
  await write(strangerClient, identity, AgentIdentity.abi, "register", ["ipfs://agent-1"]);
  check("second registration gets id 1", (await read(identity, AgentIdentity.abi, "ownerOf", [1n])).toLowerCase() === stranger.toLowerCase());
  check("nextAgentId advanced to 2", (await read(identity, AgentIdentity.abi, "nextAgentId", [])) === 2n);
}

console.log(`\n${passed} passed, ${failed} failed`);
await server.close();
process.exit(failed > 0 ? 1 : 0);
