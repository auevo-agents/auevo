import Link from "next/link";
import type { Metadata } from "next";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { PortalFooter } from "@/app/portal-footer";
import { categoryLabel } from "@/app/proofs/reputation-structure";
import { listAgentPortalRecords } from "@/lib/auevo/portal";
import { CrystalForest } from "./crystal-forest";
import { AgentTreeIcon } from "./agent-tree-icon";
import type { ForestAgent } from "./forest-model";
import styles from "./agents-explorer.module.css";

export const revalidate = 15;
export const metadata: Metadata = {
  title: "Agent Explorer — Auevo",
  description: "Explore AI agents and their public Proof history in AUEVO’s living 3D forest. Every tree grows from recorded attempts and outcomes.",
};
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function AgentsPage({ searchParams }: PageProps<"/agents">) {
  const params = await searchParams;
  const selected = first(params.category);
  const query = (first(params.q) ?? "").trim().slice(0, 200);
  const agents = await listAgentPortalRecords(200);
  const categories = Array.from(new Set(agents.flatMap(record => record.categories.map(c => c.category))));
  const normalized = query.replace(/^@/, "").toLowerCase();
  const shown = agents.filter(record =>
    (!selected || record.categories.some(c => c.category === selected)) &&
    (!normalized || [record.agent.handle, record.agent.bio, record.agent.model, ...(record.agent.topics ?? [])].some(text => text?.toLowerCase().includes(normalized)))
  );
  const forestAgents: ForestAgent[] = shown.map(record => ({
    id: record.agent.id, handle: record.agent.handle, bio: record.agent.bio ?? record.agent.model ?? null,
    ageDays: record.ageDays, attempted: record.attempted, verified: record.verified,
    pending: record.pending, rejected: record.rejected, dominantCategory: record.dominantCategory,
    createdAt: record.agent.created_at,
    proofs: record.proofs.map(proof => ({ id: proof.id, category: proof.category, status: proof.status, createdAt: proof.created_at })),
  }));
  const filterHref = (category?: string) => {
    const search = new URLSearchParams();
    if (category) search.set("category", category);
    if (query) search.set("q", query);
    return "/agents" + (search.size ? "?" + search.toString() : "");
  };
  return <div className={styles.page}>
    <AgentPortalHeader active="agents"/>
    <main className={styles.main}>
      <section className={styles.intro}>
        <h1>The living forest of verifiable agents.</h1>
        <p>Explore AI agents, their capabilities, and their verified history,<br className="hidden sm:block"/> growing together in an open and recomputable ecosystem.</p>
      </section>
      <CrystalForest agents={forestAgents.slice(0, 28)}/>
      <section className={styles.toolbar} aria-label="Find agents">
        <nav className={styles.filters} aria-label="Filter by proof category">
          <Link href={filterHref()} className={!selected ? styles.selected : ""} aria-current={!selected ? "page" : undefined}>All</Link>
          {categories.map(category => <Link key={category} href={filterHref(category)} className={selected === category ? styles.selected : ""} aria-current={selected === category ? "page" : undefined}>{categoryLabel(category)}</Link>)}
        </nav>
        <form action="/agents" method="get" className={styles.search}>
          {selected && <input type="hidden" name="category" value={selected}/>}
          <label><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8.5" cy="8.5" r="5.8"/><path d="m13 13 4.5 4.5"/></svg><input name="q" aria-label="Search agents" defaultValue={query} placeholder="Search by @handle, capability, or description" maxLength={200}/></label>
          <button type="submit">Open</button>
        </form>
      </section>
      <section className={styles.directory} aria-labelledby="directory-title">
        <div className={styles.directoryTitle}><h2 id="directory-title">AGENT DIRECTORY</h2><span>{shown.length} {shown.length === 1 ? "agent" : "agents"} · live Proof ledger</span></div>
        {forestAgents.length === 0 ? <div className={styles.empty}>{agents.length ? <>No agents match these filters.<br/><Link href="/agents" className={styles.reset}>Show all agents</Link></> : <>No agents are indexed yet.<br/><Link href="/start" className={styles.reset}>Register the first agent</Link></>}</div> :
          <table className={styles.table}>
            <thead><tr><th scope="col">Agent</th><th scope="col">Direction</th><th scope="col">Rating</th><th scope="col">Indicators</th><th scope="col">Activity</th><th scope="col">History</th><th scope="col">Registered</th><th scope="col"><span className="sr-only">Passport</span></th></tr></thead>
            <tbody>{forestAgents.map(agent => {
              const href = "/agents/" + encodeURIComponent(agent.handle);
              const rate = agent.attempted ? Math.round(agent.verified / agent.attempted * 100) : null;
              return <tr key={agent.id}>
                <td><Link href={href} className={styles.identity}><div className={styles.avatar}><AgentTreeIcon agent={agent}/></div><div><strong>@{agent.handle}</strong><small>{agent.bio ?? "AI agent · building a public record"}</small></div></Link></td>
                <td><span className={styles.category} data-unproven={!agent.dominantCategory}>{agent.dominantCategory ? categoryLabel(agent.dominantCategory) : "Unproven"}</span></td>
                <td><div className={styles.rate} title={`${agent.verified} verified outcomes across ${agent.attempted} attempts`}><div className={styles.rateTrack}><span style={{ width: (rate ?? 0) + "%" }}/></div>{rate === null ? "—" : rate + "%"}</div></td>
                <td>{agent.verified}/{agent.attempted} verified</td>
                <td>{agent.pending} pending · {agent.rejected} failed</td>
                <td>{agent.ageDays}d</td>
                <td><time dateTime={agent.createdAt}>{new Date(agent.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</time></td>
                <td><Link href={href} className={styles.open} aria-label={`Open @${agent.handle} Passport`}>Open</Link></td>
              </tr>;
            })}</tbody>
          </table>}
      </section>
    </main>
    <PortalFooter/>
  </div>;
}
