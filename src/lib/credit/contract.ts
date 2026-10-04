import { getRobinhoodClient } from "@/lib/evm/client";
import { ERC20_ABI } from "@/lib/erc20-abi";
import { AGENT_CREDIT_POOL_ABI, ERC721_OWNER_OF_ABI, LOAN_STATUS, STAKE_KIND } from "./abi";

/**
 * Server-only reads against AgentCreditPool (contracts/src/AgentCreditPool.sol).
 *
 * Deliberately NOT indexed yet: there is no deployed pool and no history to
 * index, so every read here goes live to the chain, same as Priors' own
 * free /api/check does. Once there is real activity worth caching (a
 * leaderboard, "by address" reverse lookup), that's an indexer to add, not
 * a reason to hold this back — see RWA_SPEC's own indexer for the pattern
 * already established in this app.
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
