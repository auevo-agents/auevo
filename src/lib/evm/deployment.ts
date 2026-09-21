import { isEmptyCode } from "./bytecode";
import type { Deadline } from "./deadline";
import type { RobinhoodClient } from "./client";
import type { Address } from "viem";

/**
 * When a contract was deployed, found by binary search over eth_getCode.
 *
 * There is no RPC method for this, and an explorer API would be another
 * dependency on infrastructure we do not control — but the answer is
 * monotonic (no code before deployment, code ever after), so ~log2(head)
 * calls pin it down exactly. On a chain with 10M blocks that is 24 calls.
 *
 * It needs historical state, which a pruning node will not serve. Any
 * failure returns null and the report says the age is unknown, because a
 * wrong age is worse than a missing one: "deployed 3 minutes ago" is one
 * of the strongest rug signals there is, and it has to be trustworthy.
 */
export interface DeploymentInfo {
  blockNumber: string;
  timestamp: number | null;
  ageDays: number | null;
}

export async function findDeployment(
  client: RobinhoodClient,
  address: Address,
  headBlock: bigint,
  deadline: Deadline
): Promise<DeploymentInfo | null> {
  try {
    // Predeploys exist from genesis; the search below assumes they don't.
    const genesisCode = await client.getCode({ address, blockNumber: 0n });
    if (!isEmptyCode(genesisCode)) {
      return await describeBlock(client, 0n);
    }

    let low = 0n;
    let high = headBlock;

    while (low < high) {
      if (deadline.expired) return null;

      const mid = (low + high) / 2n;
      const code = await client.getCode({ address, blockNumber: mid });
      if (isEmptyCode(code)) low = mid + 1n;
      else high = mid;
    }

    if (low > headBlock) return null;
    return await describeBlock(client, low);
  } catch {
    // No archive state, or the node rejected a historical call.
    return null;
  }
}

async function describeBlock(
  client: RobinhoodClient,
  blockNumber: bigint
): Promise<DeploymentInfo> {
  let timestamp: number | null = null;
  try {
    const block = await client.getBlock({ blockNumber });
    timestamp = Number(block.timestamp);
  } catch {
    // Block body unavailable — the block number alone is still useful.
  }

  const ageDays =
    timestamp === null
      ? null
      : Math.max(0, (Date.now() / 1000 - timestamp) / 86_400);

  return { blockNumber: blockNumber.toString(), timestamp, ageDays };
}
