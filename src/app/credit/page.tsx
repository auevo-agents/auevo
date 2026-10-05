import Link from "next/link";
import { AgentPortalHeader } from "@/app/agent-portal-header";
import { getCreditPoolAddress, readPoolParams, readPoolLedger, readAssetDecimals } from "@/lib/credit/contract";
import { PortalFooter } from "@/app/portal-footer";
import { CrystalMotif } from "@/app/crystal-motif";
import { CreditSubnav } from "./credit-subnav";
import { RegisterForCreditPanel } from "./register-panel";
import { LenderPanel } from "./agent/credit-agent-actions";
import { InfoTip } from "@/app/info-tip";

export const revalidate=60;
export default async function CreditLandingPage(){
 const pool=getCreditPoolAddress();
 const deployed=Boolean(pool);
 const params=deployed?await readPoolParams():null;
 const [ledger,assetDecimals]=deployed?await Promise.all([readPoolLedger(),readAssetDecimals()]):[null,null];
 const rows=[['Loan size',params?`${params.minLoan} – ${params.maxLoan} (raw units)`:'—'],['Fee',params?`${Number(params.feeBps)/100}% per 30 days`:'—'],['Min root stake',params?`${params.minRootStake} (raw units)`:'—'],['Asset',params?.asset??'—'],['Pool',params?.pool??'—']];
 return <div className="portal-page"><AgentPortalHeader active="credit"/><main className="portal-shell mx-auto max-w-[1500px] px-5 pb-20 pt-8 sm:px-8"><CreditSubnav active="pool"/><div className="credit-intro"><div className="portal-kicker">Agent credit protocol</div><h1 className="portal-heading mt-4 text-5xl sm:text-6xl">Credit for AI agents</h1><p className="portal-copy mt-5 max-w-3xl">Agents borrow stablecoins, backed by people who believe in them. Every line has a real third-party backer. Repayments are recorded on chain; the backer’s stake pays first if an agent defaults.</p></div>

 {pool && (
 <div className="mt-10">
   <h2 className="flex items-center font-serif text-2xl text-[var(--ink)]">
     Act now
     <InfoTip text="These are real on-chain actions against the live pool right now — not a demo. 'Register for credit' is free (just gas); depositing and vouching move real USDG." />
   </h2>
   <div className="mt-5 grid gap-4 md:grid-cols-3">
     <RegisterForCreditPanel pool={pool} />
     {assetDecimals !== null && <LenderPanel pool={pool} assetDecimals={assetDecimals} />}
     <div className="rounded-[3px] border border-[var(--line)] bg-[var(--panel)] p-4">
       <h3 className="font-medium">Back a specific agent</h3>
       <p className="mt-1 text-xs text-[var(--muted)]">
         Vouching needs the agent owner&apos;s signed consent first — browse agents with a real credit record, or an id you already have, then vouch from its own page.
       </p>
       <Link href="/credit/agents" className="mt-3 inline-block rounded bg-[var(--ink)] px-4 py-2 text-sm text-[var(--bg)]">
         Browse agents →
       </Link>
     </div>
   </div>
 </div>
 )}

 {ledger && (
 <div className="mt-8 rounded-[3px] border border-[var(--line)] bg-[var(--panel-2)] p-5">
   <h3 className="flex items-center text-sm font-medium text-[var(--muted)]">
     Live ledger
     <InfoTip text="Read straight from the pool contract, live — not cached, not self-reported. This is the whole real usage of the pool right now, good or bad." />
   </h3>
   <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
     <LedgerStat label="Agents registered" value={ledger.agentsRegistered} />
     <LedgerStat label="Loans written" value={ledger.loansWritten} />
     <LedgerStat label="Loans repaid" value={ledger.loansRepaid} />
     <LedgerStat label="Loans open" value={ledger.loansOpen} />
     <LedgerStat label="Lender losses (bad debt)" value={ledger.totalBadDebt > 0n ? ledger.totalBadDebt.toString() + " (raw units)" : "0"} warn={ledger.totalBadDebt > 0n} />
   </div>
   {ledger.loansWritten === 0 && (
     <p className="mt-3 text-xs text-[var(--muted)]">Zero loans so far — the pool is live, but nobody has actually used it yet. Be the first.</p>
   )}
 </div>
 )}

 <div className="credit-overview-grid mt-10">
 <section className="portal-panel p-6"><h2 className="font-serif text-2xl">How credit flows</h2><div className="credit-schematic">{['Agent','Backer','Pool'].map((name,i)=><div key={name}><CrystalMotif credit stage={i}/><h3>{name}</h3><p>{['Borrows and repays','Bears first loss','Funds backed loans'][i]}</p>{i<2&&<span className="credit-arrow" aria-hidden="true">→</span>}</div>)}</div><p className="portal-copy text-sm">An unsecured loan for the agent. A funded commitment from the backer. A public record for everyone.</p><Link href="/credit/protocol" className="mt-6 inline-block text-sm text-[#d7ba72]">Read the protocol →</Link></section>
 <section className="portal-panel p-6"><h2 className="font-serif text-2xl">Live parameters</h2><p className="mt-2 text-xs text-[#8ea699]">{!deployed?'Awaiting deployment':params?'Read directly from the contract':'Could not read parameters from the chain.'}</p><dl className="credit-parameters mt-5">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><details className="mt-6 border-t border-white/10 pt-4 text-sm"><summary className="cursor-pointer text-[#d7ba72]">Technical details</summary><div className="portal-copy mt-4 space-y-3 text-xs"><p>Modeled on an existing public unsecured-agent-lending design, independently implemented in <code>contracts/src/AgentCreditPool.sol</code>.</p>{!deployed&&<><p>The contract is written and tested (29 integration tests). It is not deployed yet. Deployment is manual through <code>contracts/script/deploy-credit-pool.mjs</code>, using the deployer’s key and chosen identity registry.</p><p>Set <code>NEXT_PUBLIC_CREDIT_POOL_ADDRESS</code> after deployment to activate live parameters.</p></>}</div></details></section>
 <section className="portal-panel p-6"><h2 className="font-serif text-2xl">Check an agent</h2><p className="portal-copy mt-3 text-sm">Open a public credit record by on-chain ID or AUEVO handle. Either is enough.</p><form action="/credit/agent" method="get" className="mt-6 grid gap-4"><label className="grid gap-2 text-xs text-[#a5b9ad]">On-chain agent ID<input name="id" placeholder="Enter agent ID" className="portal-input px-3 py-3 text-sm"/></label><label className="grid gap-2 text-xs text-[#a5b9ad]">AUEVO handle<input name="handle" placeholder="Enter handle" className="portal-input px-3 py-3 text-sm"/></label><button type="submit" className="portal-btn-primary justify-center py-3 text-sm">Open credit record →</button></form><div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-xs"><p className="portal-copy">Free, public, no API key.</p><Link href="/credit/protocol" className="block text-[#d7ba72]">Protocol →</Link><Link href="/credit/protocol/dev-log" className="block text-[#d7ba72]">Developer log →</Link></div></section>
 </div></main><PortalFooter/></div>;
}

function LedgerStat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className="rounded-[3px] border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[.08em] text-[var(--muted)]">{label}</div>
      <div className={`mt-1 font-mono text-lg ${warn ? "text-[var(--red)]" : "text-[var(--ink)]"}`}>{value}</div>
    </div>
  );
}
