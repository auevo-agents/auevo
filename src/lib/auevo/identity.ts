import { getRobinhoodClient } from "@/lib/evm/client";
import { AGENT_IDENTITY_ABI, AGENT_IDENTITY_TRANSFERRED_EVENT } from "./identity-abi";
import { createProofEvent, getChallengeBySlug, getLatestProofEventForAgent } from "./db";

/**
 * Server-only reads against AgentIdentity (contracts/src/AgentIdentity.sol).
 * Null (never a placeholder address) until NEXT_PUBLIC_AUEVO_IDENTITY_ADDRESS
 * is set, same "not deployed yet" convention as src/lib/credit/contract.ts.
 */
export function getAgentIdentityAddress(): `0x${string}` | null {
  const raw = process.env.NEXT_PUBLIC_AUEVO_IDENTITY_ADDRESS?.trim();
  if (!raw) return null;
  return raw as `0x${string}`;
}

export type AgentIdentityRecord = {
  agentId: bigint;
  owner: `0x${string}`;
  controller: `0x${string}`;
  operatorWallet: `0x${string}`;
  agentURI: string;
  registeredAt: bigint;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Null if the registry isn't deployed, or if this agentId doesn't exist. */
export async function readAgentIdentity(agentId: bigint): Promise<AgentIdentityRecord | null> {
  const registry = getAgentIdentityAddress();
  if (!registry) return null;

  const client = getRobinhoodClient();
  try {
    const [owner, controller, operatorWallet, agentURI, registeredAt] = await Promise.all([
      client.readContract({ address: registry, abi: AGENT_IDENTITY_ABI, functionName: "ownerOf", args: [agentId] }),
      client.readContract({ address: registry, abi: AGENT_IDENTITY_ABI, functionName: "controllerOf", args: [agentId] }),
      client.readContract({ address: registry, abi: AGENT_IDENTITY_ABI, functionName: "operatorWalletOf", args: [agentId] }),
      client.readContract({ address: registry, abi: AGENT_IDENTITY_ABI, functionName: "agentURI", args: [agentId] }),
      client.readContract({ address: registry, abi: AGENT_IDENTITY_ABI, functionName: "registeredAt", args: [agentId] }),
    ]);
    return { agentId, owner, controller, operatorWallet, agentURI, registeredAt };
  } catch {
    return null; // nonexistent agent — ownerOf reverts
  }
}

/** The address a Proof submission's signature must recover to, for this agentId. Null if not deployed/doesn't exist. */
export async function readControllerAddress(agentId: bigint): Promise<`0x${string}` | null> {
  const record = await readAgentIdentity(agentId);
  if (!record || record.controller.toLowerCase() === ZERO_ADDRESS) return null;
  return record.controller;
}

/**
 * Block NEXT_PUBLIC_AUEVO_IDENTITY_ADDRESS (the AUEVO-protocol
 * AgentIdentity registry, separate from Credit's own registry) was
 * deployed at — tx
 * 0x1fda88b813f40e2e18979121adb267327fc0d886a3720361104ac1e5cf1c8622,
 * 2026-10-04. A safe floor for event scans on this contract: nothing
 * relevant to it exists before this block, so scans never need to walk
 * the chain's full history the way src/lib/indexer/scan.ts's chunked
 * crawl does for much older, much busier contracts.
 */
export const AUEVO_IDENTITY_DEPLOY_BLOCK = 80206254n;

export interface AgentTransferEvent {
  from: `0x${string}`;
  to: `0x${string}`;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

/** Full ownership-transfer history for one agentId, oldest first. Empty if never transferred (including "not deployed"). */
export async function listTransferEvents(agentId: bigint): Promise<AgentTransferEvent[]> {
  const registry = getAgentIdentityAddress();
  if (!registry) return [];

  const client = getRobinhoodClient();
  const logs = await client.getLogs({
    address: registry,
    event: AGENT_IDENTITY_TRANSFERRED_EVENT,
    args: { agentId },
    fromBlock: AUEVO_IDENTITY_DEPLOY_BLOCK,
    toBlock: "latest",
  });

  return logs
    .map((log) => ({
      from: log.args.from as `0x${string}`,
      to: log.args.to as `0x${string}`,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
    }))
    .sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : 0));
}

const IDENTITY_CHALLENGE_SLUG = "agent-identity-stability";
const IDENTITY_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Identity is the on-chain-only counterpart to Longevity (§4h of
 * docs/AUEVO_PROTOCOL_SPEC.md) — passive, no attempt to make, but
 * unlike Longevity it has a real signal the social-agent branch never
 * could: an agentId's ownership CAN actually change hands
 * (transferAgent), so "days since the identity last changed owner"
 * genuinely differs between agents, rather than producing the same
 * value for everyone (the two off-chain ideas this category rejected —
 * see §4h). `transfer_count` and `days_since_last_change` both come
 * straight from the registry's own state and event log; nothing here
 * is self-reported.
 *
 * Every registered agentId (0..nextAgentId-1) always exists once
 * registered — this contract has no burn/unregister path — so unlike
 * listActiveAgents() for the social branch, there is no "active" filter
 * to apply here.
 */
export async function recordIdentityProofs(): Promise<{ checked: number; recorded: number }> {
  const registry = getAgentIdentityAddress();
  if (!registry) return { checked: 0, recorded: 0 };

  const challenge = await getChallengeBySlug(IDENTITY_CHALLENGE_SLUG);
  if (!challenge) throw new Error(`Identity challenge '${IDENTITY_CHALLENGE_SLUG}' is not seeded`);

  const client = getRobinhoodClient();
  const nextAgentId = await client.readContract({
    address: registry,
    abi: AGENT_IDENTITY_ABI,
    functionName: "nextAgentId",
  });

  const now = Date.now();
  let recorded = 0;

  for (let id = 0n; id < nextAgentId; id++) {
    const latest = await getLatestProofEventForAgent(id.toString(), "identity");
    if (latest && now - new Date(latest.created_at).getTime() < IDENTITY_PERIOD_MS) continue;

    const registeredAtSec = await client.readContract({
      address: registry,
      abi: AGENT_IDENTITY_ABI,
      functionName: "registeredAt",
      args: [id],
    });
    const transfers = await listTransferEvents(id);

    let lastChangeMs = Number(registeredAtSec) * 1000;
    if (transfers.length > 0) {
      const lastTransfer = transfers[transfers.length - 1];
      const block = await client.getBlock({ blockNumber: lastTransfer.blockNumber });
      lastChangeMs = Number(block.timestamp) * 1000;
    }
    const daysSinceLastChange = Math.floor((now - lastChangeMs) / (24 * 60 * 60 * 1000));

    await createProofEvent({
      agentId: id.toString(),
      challengeId: challenge.id,
      category: "identity",
      rulesHash: challenge.rules_hash,
      verificationMethod: "deterministic",
      status: "passed",
      endAt: new Date(now).toISOString(),
      result: {
        transfer_count: transfers.length,
        days_since_last_change: daysSinceLastChange,
        registered_at: new Date(Number(registeredAtSec) * 1000).toISOString(),
      },
    });
    recorded++;
  }

  return { checked: Number(nextAgentId), recorded };
}
