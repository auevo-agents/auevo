import { AgentPortalHeader } from "@/app/agent-portal-header";
import { PortalFog, PortalSkyline } from "@/app/premium-visuals";
import { getCreditPoolAddress, readAgentRecord, readAssetDecimals, readIdentityOwner, verdictOf } from "@/lib/credit/contract";
import { CreditAgentActions } from "./credit-agent-actions";
import { ProofRecordPanel } from "./proof-record";
import { CreditSubnav } from "../credit-subnav";

export const revalidate = 15;

function verdictChip(verdict: string) {
  if (verdict === "repaid") return { label: "✓ repaid", className: "text-[var(--green)] border-[var(--green)]/40 bg-[var(--green)]/10" };
  if (verdict === "defaulted") return { label: "✗ defaulted", className: "text-[var(--red)] border-[var(--red)]/40 bg-[var(--red)]/10" };
  if (verdict === "no repayments yet") return { label: "no repayments yet", className: "text-[var(--muted)] border-[var(--line-2)]" };
  return { label: "no record", className: "text-[var(--muted)] border-[var(--line-2)]" };
}

export default async function CreditAgentPage({ searchParams }: PageProps<"/credit/agent">) {
  const { id, handle } = await searchParams;
  const idStr = Array.isArray(id) ? id[0] : id;
  const handleStr = Array.isArray(handle) ? handle[0] : handle;

  return (
    <div className="portal-page">
      <AgentPortalHeader />

      <section className="portal-shell relative mx-auto max-w-[1100px] px-5 pt-10 pb-20 sm:px-8">
        <CreditSubnav active="agents" />

        {handleStr && (
          <div className="mb-6">
            <ProofRecordPanel handle={handleStr} />
          </div>
        )}

        <form action="/credit/agent" method="get" className="mb-6 flex flex-wrap items-end gap-2">
          {handleStr && <input type="hidden" name="handle" value={handleStr} />}
          <label className="flex-1">
            <span className="mb-1 block text-xs text-[var(--muted)]">On-chain agent id</span>
            <input
              name="id"
              defaultValue={idStr}
              placeholder="agent id (uint256)"
              className="w-full portal-input rounded-[3px] px-3 py-2 text-sm"
            />
          </label>
          <button className="portal-btn-secondary rounded-[3px] px-4 py-2 text-sm" type="submit">
            {idStr ? "Update" : "Check credit record"}
          </button>
        </form>

        {!idStr ? (
          !handleStr && <p className="text-[var(--muted)]">No agent id or handle given.</p>
        ) : (
          <AgentLookup idStr={idStr} />
        )}
      </section>
    </div>
  );
}

async function AgentLookup({ idStr }: { idStr: string }) {
  let agentId: bigint;
  try {
    agentId = BigInt(idStr);
  } catch {
    return <p className="text-[var(--muted)]">&quot;{idStr}&quot; is not a valid agent id.</p>;
  }

  if (!getCreditPoolAddress()) {
    return (
      <div className="portal-panel rounded-[3px] p-6 text-[var(--muted)]">
        AgentCreditPool has not been deployed yet — see <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">contracts/README.md</code>.
      </div>
    );
  }

  const [record, owner, assetDecimals] = await Promise.all([
    readAgentRecord(agentId),
    readIdentityOwner(agentId),
    readAssetDecimals(),
  ]);
  const verdict = verdictOf(record);
  const chip = verdictChip(verdict);
  const pool = getCreditPoolAddress();

  return (
    <div>
      <h1 className="portal-heading text-3xl">Agent #{idStr}</h1>
      {owner && <p className="mt-1 text-sm text-[var(--muted)] break-all">owner: {owner}</p>}

      <div className="mt-4 flex items-center gap-2 text-sm">
        <span className={`rounded-[2px] border px-2 py-0.5 ${chip.className}`}>{chip.label}</span>
      </div>

      {record ? (
        <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <dt className="text-[var(--muted)]">Sponsors ({record.sponsors.length})</dt>
          <dd className="break-all">
            {record.sponsors.length === 0 ? (
              "none"
            ) : (
              <ul className="flex flex-col gap-1">
                {record.sponsors.map((s) => (
                  <li key={s.sponsor}>
                    {s.sponsor} — {s.amount.toString()} (raw units) @ {s.premiumBps}bps
                  </li>
                ))}
              </ul>
            )}
          </dd>
          <dt className="text-[var(--muted)]">Line (delegatedIn)</dt>
          <dd>{record.delegatedIn.toString()} (raw units)</dd>
          <dt className="text-[var(--muted)]">Currently borrowed</dt>
          <dd>{record.principalOut.toString()} (raw units)</dd>
          <dt className="text-[var(--muted)]">Open loan right now</dt>
          <dd>{record.activeLoan ? "yes" : "no"}</dd>
          <dt className="text-[var(--muted)]">Loans repaid</dt>
          <dd>{record.loansRepaid}</dd>
          <dt className="text-[var(--muted)]">Volume repaid</dt>
          <dd>{record.volumeRepaid.toString()} (raw units)</dd>
        </dl>
      ) : (
        <p className="mt-6 text-[var(--muted)]">
          No credit record for this agent id — it has never been vouched for on this pool.
        </p>
      )}

      {pool && assetDecimals !== null && <CreditAgentActions agentId={agentId} pool={pool} assetDecimals={assetDecimals} />}
    </div>
  );
}
