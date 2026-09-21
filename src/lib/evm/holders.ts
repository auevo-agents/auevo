import { getAddress, parseAbi, parseAbiItem, zeroAddress, type Address } from "viem";
import type { RobinhoodClient } from "./client";
import type { Deadline } from "./deadline";
import { isEmptyCode } from "./bytecode";
import { readBalanceOf } from "./erc20";

/**
 * Holder concentration, reconstructed from Transfer logs without an indexer.
 *
 * Concentration is the signal that catches what bytecode analysis cannot:
 * a contract with no privileged functions at all is still a rug if one
 * wallet holds 92% of supply. There is no indexer on this chain yet, so
 * the candidate set is gathered from Transfer logs and every balance is
 * then read from current state.
 *
 * That split is what makes the numbers honest. Balances are exact — they
 * come from balanceOf, not from replaying transfers. What can be
 * incomplete is the candidate set, when log scanning hits its caps. The
 * report says which of the two happened rather than presenting a partial
 * scan as a full one.
 *
 * Two windows are scanned instead of one: the blocks just after
 * deployment, where initial distribution and the first LP happen, and the
 * blocks just before head, where current activity is. A whale that
 * received early and never moved is caught by the first window, which a
 * recent-activity-only scan would miss entirely.
 */

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

const BALANCE_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);

/** Canonical Multicall3 deployment address, identical across chains. */
const MULTICALL3_ADDRESS: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";

const CHUNK_BLOCKS = 10_000n;
const MAX_CHUNKS = 16;
const MAX_LOGS = 20_000;
const MAX_CANDIDATES_WITH_MULTICALL = 150;
const MAX_CANDIDATES_WITHOUT_MULTICALL = 40;
const MULTICALL_BATCH = 50;
const TOP_N = 10;

/** Addresses whose balance is out of circulation, not someone's position. */
const BURN_ADDRESSES: Address[] = [
  "0x000000000000000000000000000000000000dEaD",
  "0x0000000000000000000000000000000000000001",
];

export interface HolderEntry {
  address: Address;
  balance: string;
  percent: number;
}

export interface HolderDistribution {
  /** Block range(s) the candidate set was gathered from. */
  scannedRanges: { fromBlock: string; toBlock: string }[];
  /** How many blocks of history the candidate set was gathered from. */
  blocksScanned: string;
  /**
   * True unless the scan provably covered every block since deployment.
   * Anything less means a larger holder may exist outside the window, so
   * a low concentration number here proves nothing.
   */
  partial: boolean;
  candidatesConsidered: number;
  top: HolderEntry[];
  /** Largest single holder, burn addresses excluded. */
  topPercent: number;
  top10Percent: number;
  burnedPercent: number;
  usedMulticall: boolean;
}

async function hasMulticall3(client: RobinhoodClient): Promise<boolean> {
  try {
    return !isEmptyCode(await client.getCode({ address: MULTICALL3_ADDRESS }));
  } catch {
    return false;
  }
}

interface Window {
  from: bigint;
  to: bigint;
}

/** Non-overlapping scan windows, newest activity first. */
function planWindows(headBlock: bigint, deploymentBlock: bigint | null): Window[] {
  const span = CHUNK_BLOCKS * BigInt(MAX_CHUNKS / 2);

  const recent: Window = {
    from: headBlock > span ? headBlock - span : 0n,
    to: headBlock,
  };

  if (deploymentBlock === null) return [recent];

  const early: Window = {
    from: deploymentBlock,
    to:
      deploymentBlock + span > headBlock ? headBlock : deploymentBlock + span,
  };

  // One window is enough when the token is young enough that they overlap.
  if (early.to >= recent.from) return [{ from: early.from, to: recent.to }];
  return [recent, early];
}

async function collectCandidates(
  client: RobinhoodClient,
  token: Address,
  windows: Window[],
  deadline: Deadline
): Promise<{
  counts: Map<Address, number>;
  scannedRanges: { fromBlock: string; toBlock: string }[];
  partial: boolean;
}> {
  const counts = new Map<Address, number>();
  const scannedRanges: { fromBlock: string; toBlock: string }[] = [];
  let chunksUsed = 0;
  let logsSeen = 0;
  let partial = false;

  for (const window of windows) {
    let cursor = window.to;
    let lowestScanned = window.to;

    while (cursor >= window.from) {
      if (chunksUsed >= MAX_CHUNKS || logsSeen >= MAX_LOGS || deadline.expired) {
        partial = true;
        break;
      }

      const chunkFrom =
        cursor > window.from + CHUNK_BLOCKS ? cursor - CHUNK_BLOCKS : window.from;

      try {
        const logs = await client.getLogs({
          address: token,
          event: TRANSFER_EVENT,
          fromBlock: chunkFrom,
          toBlock: cursor,
        });

        logsSeen += logs.length;
        for (const log of logs) {
          const to = log.args.to;
          const from = log.args.from;
          // Receiving is what makes an address a candidate holder; sending
          // only earns half the weight, since it may have sold out since.
          if (to) counts.set(to, (counts.get(to) ?? 0) + 2);
          if (from) counts.set(from, (counts.get(from) ?? 0) + 1);
        }
      } catch {
        // Range too wide for this node, or the endpoint rate-limited us.
        partial = true;
        break;
      }

      chunksUsed += 1;
      lowestScanned = chunkFrom;
      if (chunkFrom === window.from) break;
      cursor = chunkFrom - 1n;
    }

    scannedRanges.push({
      fromBlock: lowestScanned.toString(),
      toBlock: window.to.toString(),
    });
  }

  counts.delete(zeroAddress);
  return { counts, scannedRanges, partial };
}

async function readBalances(
  client: RobinhoodClient,
  token: Address,
  holders: Address[],
  useMulticall: boolean,
  deadline: Deadline
): Promise<Map<Address, bigint>> {
  const balances = new Map<Address, bigint>();

  if (useMulticall) {
    for (let i = 0; i < holders.length; i += MULTICALL_BATCH) {
      if (deadline.expired) break;
      const batch = holders.slice(i, i + MULTICALL_BATCH);

      try {
        const results = await client.multicall({
          multicallAddress: MULTICALL3_ADDRESS,
          allowFailure: true,
          contracts: batch.map((holder) => ({
            address: token,
            abi: BALANCE_ABI,
            functionName: "balanceOf" as const,
            args: [holder] as const,
          })),
        });

        results.forEach((result, index) => {
          if (result.status === "success" && typeof result.result === "bigint") {
            balances.set(batch[index], result.result);
          }
        });
        continue;
      } catch {
        // Fall through to one-at-a-time for this batch.
      }

      for (const holder of batch) {
        if (deadline.expired) break;
        const balance = await readBalanceOf(client, token, holder);
        if (balance !== null) balances.set(holder, balance);
      }
    }

    return balances;
  }

  for (const holder of holders) {
    if (deadline.expired) break;
    const balance = await readBalanceOf(client, token, holder);
    if (balance !== null) balances.set(holder, balance);
  }

  return balances;
}

function percentOf(value: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  // Scale before dividing so sub-1% holdings don't collapse to zero.
  return Number((value * 1_000_000n) / total) / 10_000;
}

export async function analyseHolders(
  client: RobinhoodClient,
  token: Address,
  totalSupply: bigint,
  headBlock: bigint,
  deploymentBlock: bigint | null,
  deadline: Deadline
): Promise<HolderDistribution | null> {
  if (totalSupply <= 0n || deadline.expired) return null;

  const usedMulticall = await hasMulticall3(client);
  const { counts, scannedRanges, partial } = await collectCandidates(
    client,
    token,
    planWindows(headBlock, deploymentBlock),
    deadline
  );

  if (counts.size === 0) return null;

  const cap = usedMulticall
    ? MAX_CANDIDATES_WITH_MULTICALL
    : MAX_CANDIDATES_WITHOUT_MULTICALL;

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, cap)
    .map(([address]) => address);

  const candidates = [...new Set([...ranked, ...BURN_ADDRESSES])];
  const balances = await readBalances(
    client,
    token,
    candidates,
    usedMulticall,
    deadline
  );

  if (balances.size === 0) return null;

  const burnSet = new Set(BURN_ADDRESSES.map((address) => getAddress(address)));
  let burned = 0n;
  const holders: HolderEntry[] = [];

  for (const [address, balance] of balances) {
    if (balance <= 0n) continue;
    if (burnSet.has(getAddress(address))) {
      burned += balance;
      continue;
    }
    holders.push({
      address,
      balance: balance.toString(),
      percent: percentOf(balance, totalSupply),
    });
  }

  holders.sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));
  const top = holders.slice(0, TOP_N);

  // Completeness has to be demonstrated: one uninterrupted range reaching
  // back to deployment. Without a deployment block we cannot know how much
  // history exists, so the scan is partial by definition — on a chain
  // producing sub-second blocks, the window covers hours, not months.
  const complete =
    deploymentBlock !== null &&
    !partial &&
    ranked.length < cap &&
    scannedRanges.length === 1 &&
    BigInt(scannedRanges[0].fromBlock) <= deploymentBlock &&
    BigInt(scannedRanges[0].toBlock) >= headBlock;

  const blocksScanned = scannedRanges.reduce(
    (total, range) => total + (BigInt(range.toBlock) - BigInt(range.fromBlock)),
    0n
  );

  return {
    scannedRanges,
    blocksScanned: blocksScanned.toString(),
    partial: !complete,
    candidatesConsidered: candidates.length,
    top,
    topPercent: top[0]?.percent ?? 0,
    top10Percent: top.reduce((sum, holder) => sum + holder.percent, 0),
    burnedPercent: percentOf(burned, totalSupply),
    usedMulticall,
  };
}
