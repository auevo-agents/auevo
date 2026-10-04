import { NextRequest, NextResponse } from "next/server";
import { getCreditPoolAddress, readAgentRecord, readIdentityOwner, verdictOf } from "@/lib/credit/contract";

export const runtime = "nodejs";

/**
 * Free, public, no-key check against AgentCreditPool — same shape of
 * answer Priors' own /api/check gives, read live from the chain rather
 * than from any cache, since there is no indexer yet (see contract.ts).
 *
 * Only `?agent=<id>` is supported today, not `?address=`: a reverse
 * lookup ("which agents does this address own or get paid to") needs an
 * index of every registered identity, which doesn't exist until there is
 * real activity worth indexing. Documented here rather than silently
 * returning nothing for an address query.
 */
export async function GET(req: NextRequest) {
  const agentParam = req.nextUrl.searchParams.get("agent");
  const addressParam = req.nextUrl.searchParams.get("address");

  if (addressParam) {
    return NextResponse.json(
      { error: "address lookup is not available yet — query by ?agent=<id> instead" },
      { status: 501 }
    );
  }

  if (!agentParam) {
    return NextResponse.json({ error: "send ?agent=<id>" }, { status: 400 });
  }

  let agentId: bigint;
  try {
    agentId = BigInt(agentParam);
  } catch {
    return NextResponse.json({ error: "agent must be an integer id" }, { status: 400 });
  }
  if (agentId < 0n) {
    return NextResponse.json({ error: "agent must be an integer id" }, { status: 400 });
  }

  const pool = getCreditPoolAddress();
  if (!pool) {
    return NextResponse.json({
      query: { agent: agentParam },
      deployed: false,
      note: "AgentCreditPool has not been deployed yet — see contracts/README.md",
    });
  }

  const [record, owner] = await Promise.all([readAgentRecord(agentId), readIdentityOwner(agentId)]);

  return NextResponse.json({
    query: { agent: agentParam },
    deployed: true,
    pool,
    owner,
    verdict: verdictOf(record),
    record: record
      ? {
          sponsors: record.sponsors.map((s) => ({
            sponsor: s.sponsor,
            amount: s.amount.toString(),
            premiumBps: s.premiumBps,
          })),
          delegatedIn: record.delegatedIn.toString(),
          principalOut: record.principalOut.toString(),
          activeLoan: record.activeLoan,
          defaulted: record.defaulted,
          loansRepaid: record.loansRepaid,
          volumeRepaid: record.volumeRepaid.toString(),
          enrolledAt: record.enrolledAt.toString(),
        }
      : null,
  });
}
