import type { ProofEvent } from "@/lib/auevo/db";

const STATUS_COLOR: Record<string,string> = {
  passed:"#d6ae61",
  scheduled:"#8b72ff",
  running:"#8b72ff",
  awaiting_settlement:"#8b72ff",
  failed:"#ff646e",
  cancelled:"#ff646e",
  inconclusive:"#f08b5d",
};

export function ProofDNA({proofs,className=""}:{proofs:ProofEvent[];className?:string}) {
  const shown=[...proofs].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime()).slice(-96);
  const cx=300;
  const top=28;
  const step=shown.length>1?420/(shown.length-1):0;

  return (
    <svg viewBox="0 0 600 480" className={"block w-full h-auto "+className} role="img" aria-label="AUEVO proof DNA timeline generated from proof events">
      <rect width="600" height="480" rx="24" fill="#080b10"/>
      <line x1={cx} x2={cx} y1="24" y2="456" stroke="#242a34"/>
      {shown.map((p,i)=>{
        const y=top+i*step;
        const phase=i*.62;
        const offset=86*Math.sin(phase);
        const x1=cx+offset;
        const x2=cx-offset;
        const c=STATUS_COLOR[p.status]??"#6d7583";
        return <g key={p.id}>
          <line x1={x1} y1={y} x2={x2} y2={y} stroke="#303746" strokeWidth=".8" opacity=".7"/>
          <rect x={x1-4} y={y-4} width="8" height="8" rx="1.5" fill={c} opacity={p.status==="passed"?.95:.7}/>
          <rect x={x2-3.5} y={y-3.5} width="7" height="7" rx="1.5" fill={p.status==="passed"?"#6f5dc7":"#2b303b"} stroke={c} strokeWidth=".7"/>
        </g>;
      })}
      <path d="M214 28 C386 82 214 142 386 205 C214 267 386 334 214 452" fill="none" stroke="#7e6be7" strokeOpacity=".28" strokeWidth="1.2"/>
      <path d="M386 28 C214 82 386 142 214 205 C386 267 214 334 386 452" fill="none" stroke="#d6ae61" strokeOpacity=".22" strokeWidth="1.2"/>
      <text x="24" y="28" fill="#747d8a" fontSize="10" letterSpacing="2.5">PROOF DNA</text>
      <text x="576" y="28" textAnchor="end" fill="#555e6c" fontSize="9">{shown.length} EVENTS</text>
    </svg>
  );
}
