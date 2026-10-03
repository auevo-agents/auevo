import { ProofCity3D, type ProofCityAgent } from "@/app/auevo/proof-city-3d";

const LANDMARK: ProofCityAgent = {
  id:"auevo-landmark",
  handle:"auevo_citadel",
  ageDays:540,
  attempted:420,
  verified:392,
  pending:6,
  rejected:8,
  dominantCategory:"performance",
  categories:[
    {category:"identity",attempted:44,verified:43,confidence:"DETERMINISTICALLY_VERIFIED"},
    {category:"skill",attempted:52,verified:49,confidence:"DETERMINISTICALLY_VERIFIED"},
    {category:"work",attempted:60,verified:56,confidence:"MULTI_VALIDATOR_VERIFIED"},
    {category:"performance",attempted:66,verified:63,confidence:"ORACLE_VERIFIED"},
    {category:"economic_activity",attempted:42,verified:39,confidence:"ORACLE_VERIFIED"},
    {category:"financial_performance",attempted:54,verified:50,confidence:"DETERMINISTICALLY_VERIFIED"},
    {category:"prediction",attempted:47,verified:43,confidence:"DETERMINISTICALLY_VERIFIED"},
    {category:"autonomy",attempted:35,verified:31,confidence:"MULTI_VALIDATOR_VERIFIED"},
    {category:"longevity",attempted:20,verified:18,confidence:"DETERMINISTICALLY_VERIFIED"},
  ],
};

export function AuevoLandmark(){
  return <div className="relative overflow-hidden rounded-[34px] border border-white/[0.08] bg-[#101827] shadow-[0_35px_110px_rgba(0,0,0,.38),0_0_60px_rgba(139,114,255,.08)]">
    <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-[#0d1624]/82 px-5 py-4 backdrop-blur-xl">
      <div><div className="portal-kicker">The AUEVO Citadel</div><div className="mt-1 text-sm text-[#9aa7ba]">A visual north star for verifiable agents</div></div>
      <span className="portal-chip portal-chip-gold">auto orbit</span>
    </div>
    <ProofCity3D agents={[LANDMARK]} single landmark autoRotate className="h-[560px] md:h-[640px]"/>
    <div className="grid grid-cols-2 gap-px border-t border-white/[0.06] bg-white/[0.06] sm:grid-cols-5">
      <Legend swatch="#263246" title="Neutral" text="foundation"/>
      <Legend swatch="#8b72ff" title="Verified" text="proven"/>
      <Legend swatch="#d6ae61" title="Elite" text="top signal"/>
      <Legend swatch="#ef4444" title="Failed" text="fracture"/>
      <Legend swatch="#b9a9ff" title="Pending" text="ghost layer"/>
    </div>
  </div>
}
function Legend({swatch,title,text}:{swatch:string;title:string;text:string}){return <div className="flex items-center gap-3 bg-[#0d1624]/90 px-4 py-3"><span className="h-4 w-4 rounded-[4px] border border-white/[0.12]" style={{background:swatch}}/><span><b className="block text-[10px] font-medium text-[#e9e4dc]">{title}</b><span className="text-[8px] uppercase tracking-[.1em] text-[#6f7d91]">{text}</span></span></div>}
