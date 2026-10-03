import assert from "node:assert/strict";
import { verifyMessage } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { canonicalMessage, hashBody, registerMessage } from "../src/client.mjs";

/**
 * Plain node assertions, same style as contracts/test/run-*.mjs — no
 * vitest dependency inside this standalone package. Covers the two
 * things that would actually break an agent integrating this SDK: the
 * wire format (fixed vectors, so drift from src/lib/social/auth.ts is
 * caught even without importing it) and that a real signature this
 * package produces verifies the way the server's viem.verifyMessage
 * would check it.
 */
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    throw err;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    throw err;
  }
}

test("hashBody matches the known sha256 hex of 'hello'", () => {
  assert.equal(hashBody("hello"), "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});

test("hashBody matches the known sha256 hex of the empty string", () => {
  assert.equal(hashBody(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("canonicalMessage joins fields with newlines in the fixed order method/path/timestamp/nonce/bodyHash", () => {
  const message = canonicalMessage("POST", "/api/auevo/x/enter", 1700000000000, "abc123", "deadbeef");
  assert.equal(message, "POST\n/api/auevo/x/enter\n1700000000000\nabc123\ndeadbeef");
});

await asyncTest("a signature produced over the canonical message verifies against the signer's address", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const rawBody = JSON.stringify({ agentId: "1", operatorWallet: "0x0000000000000000000000000000000000000001" });
  const timestamp = Date.now();
  const nonce = "fixed-nonce";
  const message = canonicalMessage("POST", "/api/auevo/challenges/financial-league/c1/enter", timestamp, nonce, hashBody(rawBody));
  const signature = await account.signMessage({ message });

  const valid = await verifyMessage({ address: account.address, message, signature });
  assert.equal(valid, true);
});

test("registerMessage matches the fixed register\\n<handle>\\n<timestamp> format the server verifies", () => {
  assert.equal(registerMessage("auevo_test", 1700000000000), "register\nauevo_test\n1700000000000");
});

await asyncTest("a registerMessage signature verifies against the signer's address, same as the server's own check", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const timestamp = Date.now();
  const message = registerMessage("auevo_test_agent", timestamp);
  const signature = await account.signMessage({ message });

  const valid = await verifyMessage({ address: account.address, message, signature });
  assert.equal(valid, true);
});

await asyncTest("a signature does not verify against a different signer's address", async () => {
  const signer = privateKeyToAccount(generatePrivateKey());
  const other = privateKeyToAccount(generatePrivateKey());
  const message = canonicalMessage("POST", "/api/auevo/x/enter", Date.now(), "n", hashBody("{}"));
  const signature = await signer.signMessage({ message });

  const valid = await verifyMessage({ address: other.address, message, signature });
  assert.equal(valid, false);
});

console.log(`\n${passed} passed`);
