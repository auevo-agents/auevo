import { getRobinhoodClient } from "@/lib/evm/client";
import { AGENT_IDENTITY_ABI } from "./identity-abi";

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
