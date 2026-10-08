import { getRobinhoodClient } from "@/lib/evm/client";
import { ERC20_ABI } from "@/lib/erc20-abi";
import { AGENT_CREDIT_POOL_ABI, ERC721_OWNER_OF_ABI, LOAN_STATUS, STAKE_KIND } from "./abi";
import { CREDIT_IDENTITY_WRITE_ABI } from "./identity-abi";

/** The block CREDIT_IDENTITY_ADDRESS was deployed at (tx 0x85344514ef0267a06ef0e0d1528a68b7fde1623974fc223596ea084b5a2e868b, 2026-10-04) — a safe floor for the Registered-event scan below. */
export const CREDIT_IDENTITY_DEPLOY_BLOCK = 80042935n;

/**
 * Finds an owner's own credit agent id by scanning Registered events on the
 * identity registry — the one thing register-panel.tsx's in-memory state
 * (set only from the receipt of a register() the visitor JUST sent) can't
 * survive a page refresh without: this contract has no "ownerId" index or
 * ERC-721 enumeration, so a direct read can't answer "does this address
 * already have one." Cheap right now (a handful of registrations total);
 * becomes an indexer job once that stops being true. Picks the highest
 * (most recent) agentId if an owner somehow registered more than once.
 */
export async function findCreditAgentIdForOwner(owner: `0x${string}`): Promise<bigint | null> {
  const pool = getCreditPoolAddress();
  if (!pool) return null;

  const client = getRobinhoodClient();
  const identityAddress = await client.readContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "identity" });

  const logs = await client.getLogs({
    address: identityAddress,
    event: {
      type: "event",
      name: "Registered",
      inputs: [
        { name: "agentId", type: "uint256", indexed: true },
        { name: "owner", type: "address", indexed: true },
        { name: "agentURI", type: "string", indexed: false },
      ],
    },
    args: { owner },
    fromBlock: CREDIT_IDENTITY_DEPLOY_BLOCK,
    toBlock: "latest",
  });
  if (logs.length === 0) return null;

  return logs.reduce((max, log) => {
    const id = log.args.agentId as bigint;
    return id > max ? id : max;
  }, 0n);
}

/**
 * Server-only reads against AgentCreditPool (contracts/src/AgentCreditPool.sol).
 *
 * Deliberately NOT indexed yet: there is no deployed pool and no history to
 * index, so every read here goes live to the chain. Once there is real
 * activity worth caching (a leaderboard, "by address" reverse lookup),
 * that's an indexer to add, not a reason to hold this back — see
 * RWA_SPEC's own indexer for the pattern already established in this app.
 */

export type SponsorStake = {
  sponsor: `0x${string}`;
  amount: bigint;
  premiumBps: number;
  kind: (typeof STAKE_KIND)[number];
  seatTokenLocked: bigint;
};

export type AgentRecord = {
  agentId: bigint;
  sponsors: SponsorStake[];
  delegatedIn: bigint;
  principalOut: bigint;
  activeLoan: boolean;
  defaulted: boolean;
  loansRepaid: number;
  volumeRepaid: bigint;
  enrolledAt: bigint;
};

export type CreditVerdict = "no record" | "defaulted" | "no repayments yet" | "repaid";

/** Null when the pool has not been deployed yet — never a placeholder address. */
export function getCreditPoolAddress(): `0x${string}` | null {
  const raw = process.env.NEXT_PUBLIC_CREDIT_POOL_ADDRESS?.trim();
  if (!raw) return null;
  return raw as `0x${string}`;
}

export async function readAgentRecord(agentId: bigint): Promise<AgentRecord | null> {
  const pool = getCreditPoolAddress();
  if (!pool) return null;

  const client = getRobinhoodClient();
  const [delegatedIn, principalOut, activeLoan, defaulted, loansRepaid, volumeRepaid, enrolledAt, sponsorCount] =
    await client.readContract({
      address: pool,
      abi: AGENT_CREDIT_POOL_ABI,
      functionName: "agentInfo",
      args: [agentId],
    });

  // No sponsors ever and nothing repaid means this agentId has never been
  // vouched for on this pool — distinct from "doesn't exist on the identity
  // registry", which this function doesn't check (callers that need that
  // should read the identity registry's own ownerOf separately).
  if (sponsorCount === 0n && loansRepaid === 0 && delegatedIn === 0n) {
    return null;
  }

  const sponsorAddresses = await client.readContract({
    address: pool,
    abi: AGENT_CREDIT_POOL_ABI,
    functionName: "sponsorsOf",
    args: [agentId],
  });

  const sponsors = await Promise.all(
    sponsorAddresses.map(async (sponsor) => {
      const [amount, premiumBps, kind, seatTokenLocked] = await client.readContract({
        address: pool,
        abi: AGENT_CREDIT_POOL_ABI,
        functionName: "sponsorStakeOf",
        args: [agentId, sponsor],
      });
      return { sponsor, amount, premiumBps, kind: STAKE_KIND[kind], seatTokenLocked };
    })
  );

  return {
    agentId,
    sponsors,
    delegatedIn,
    principalOut,
    activeLoan,
    defaulted,
    loansRepaid,
    volumeRepaid,
    enrolledAt,
  };
}

export function verdictOf(record: AgentRecord | null): CreditVerdict {
  if (!record) return "no record";
  if (record.defaulted) return "defaulted";
  if (record.loansRepaid === 0) return "no repayments yet";
  return "repaid";
}

/** Reads the agent identity registry's own ownerOf — null if the pool isn't deployed. */
export async function readIdentityOwner(agentId: bigint): Promise<`0x${string}` | null> {
  const pool = getCreditPoolAddress();
  if (!pool) return null;

  const client = getRobinhoodClient();
  const identityAddress = await client.readContract({
    address: pool,
    abi: AGENT_CREDIT_POOL_ABI,
    functionName: "identity",
  });

  try {
    return await client.readContract({
      address: identityAddress,
      abi: ERC721_OWNER_OF_ABI,
      functionName: "ownerOf",
      args: [agentId],
    });
  } catch {
    return null; // identity doesn't exist (ownerOf reverts for a nonexistent token)
  }
}

export async function readLoan(loanId: bigint) {
  const pool = getCreditPoolAddress();
  if (!pool) return null;

  const client = getRobinhoodClient();
  const [agentId, principal, fee, dueAt, defaultableAt, status] = await client.readContract({
    address: pool,
    abi: AGENT_CREDIT_POOL_ABI,
    functionName: "loanInfo",
    args: [loanId],
  });

  if (status === 0) return null; // LoanStatus.None — this loanId was never written

  const shares = await client.readContract({
    address: pool,
    abi: AGENT_CREDIT_POOL_ABI,
    functionName: "loanSharesOf",
    args: [loanId],
  });

  return {
    loanId,
    agentId,
    principal,
    fee,
    dueAt,
    defaultableAt,
    status: LOAN_STATUS[status],
    shares,
  };
}

export async function readPoolParams() {
  const pool = getCreditPoolAddress();
  if (!pool) return null;

  const client = getRobinhoodClient();
  const [minLoan, maxLoan, feeBps, minRootStake, asset] = await Promise.all([
    client.readContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "minLoan" }),
    client.readContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "maxLoan" }),
    client.readContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "feeBps" }),
    client.readContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "minRootStake" }),
    client.readContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "asset" }),
  ]);

  return { pool, minLoan, maxLoan, feeBps, minRootStake, asset };
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type SeatConfig =
  | { deployed: false }
  | { deployed: true; supported: false } // the live pool predates vouchSeat()/seatToken() — needs redeploy
  | {
      deployed: true;
      supported: true;
      enabled: boolean;
      seatToken: `0x${string}`;
      seatTokenDecimals: number | null;
      ratioNumerator: bigint;
      ratioDenominator: bigint;
      minRepaidLoans: number;
      burnBps: number;
    };

/**
 * Reads seat config from the live pool. A pool deployed before vouchSeat()
 * existed simply has no such function on its deployed bytecode — that read
 * reverts, not "seats disabled" (which is a real, distinct on-chain state:
 * seatToken() returning address(0) on a pool that DOES have the function).
 * Both cases are reported honestly rather than collapsed into one.
 */
export async function readSeatConfig(): Promise<SeatConfig> {
  const pool = getCreditPoolAddress();
  if (!pool) return { deployed: false };

  const client = getRobinhoodClient();
  try {
    const [seatToken, ratioNumerator, ratioDenominator, minRepaidLoans, burnBps] = await Promise.all([
      client.readContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "seatToken" }),
      client.readContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "seatRatioNumerator" }),
      client.readContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "seatRatioDenominator" }),
      client.readContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "SEAT_MIN_REPAID_LOANS" }),
      client.readContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "SEAT_BURN_BPS" }),
    ]);

    const enabled = seatToken.toLowerCase() !== ZERO_ADDRESS;
    const seatTokenDecimals = enabled
      ? await client.readContract({ address: seatToken, abi: ERC20_ABI, functionName: "decimals" }).catch(() => null)
      : null;

    return {
      deployed: true,
      supported: true,
      enabled,
      seatToken,
      seatTokenDecimals,
      ratioNumerator,
      ratioDenominator,
      minRepaidLoans,
      burnBps,
    };
  } catch {
    return { deployed: true, supported: false };
  }
}

export type PoolLedger = {
  agentsRegistered: number;
  loansWritten: number;
  loansRepaid: number;
  loansDefaulted: number;
  loansOpen: number;
  totalBadDebt: bigint;
};

/**
 * The live, chain-read stats a backer actually wants to see before
 * trusting the pool — "has this ever been used, and did it work" — the
 * thing the priors.trade-inspired landing page's own ledger section
 * shows and this app's /credit page didn't have at all. nextLoanId is
 * tiny right now (a brand-new pool), so a direct loop over every loan is
 * cheap; this is the first thing to turn into an indexed count once real
 * volume makes it not be.
 */
export async function readPoolLedger(): Promise<PoolLedger | null> {
  const pool = getCreditPoolAddress();
  if (!pool) return null;

  const client = getRobinhoodClient();
  const [nextLoanId, totalBadDebt, identityAddress] = await Promise.all([
    client.readContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "nextLoanId" }),
    client.readContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "totalBadDebt" }),
    client.readContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "identity" }),
  ]);

  const agentsRegistered = await client
    .readContract({ address: identityAddress, abi: CREDIT_IDENTITY_WRITE_ABI, functionName: "nextAgentId" })
    .catch(() => 0n);

  let loansRepaid = 0;
  let loansDefaulted = 0;
  let loansOpen = 0;
  const loanIds = Array.from({ length: Number(nextLoanId) }, (_, i) => BigInt(i));
  const statuses = await Promise.all(
    loanIds.map((id) => client.readContract({ address: pool, abi: AGENT_CREDIT_POOL_ABI, functionName: "loanInfo", args: [id] }))
  );
  for (const [, , , , , status] of statuses) {
    if (status === 2) loansRepaid++;
    else if (status === 3) loansDefaulted++;
    else if (status === 1) loansOpen++;
  }

  return {
    agentsRegistered: Number(agentsRegistered),
    loansWritten: Number(nextLoanId),
    loansRepaid,
    loansDefaulted,
    loansOpen,
    totalBadDebt,
  };
}

/** Null when the pool isn't deployed — the asset's own decimals(), read live. */
export async function readAssetDecimals(): Promise<number | null> {
  const pool = getCreditPoolAddress();
  if (!pool) return null;

  const client = getRobinhoodClient();
  const assetAddress = await client.readContract({
    address: pool,
    abi: AGENT_CREDIT_POOL_ABI,
    functionName: "asset",
  });
  return client.readContract({ address: assetAddress, abi: ERC20_ABI, functionName: "decimals" });
}
