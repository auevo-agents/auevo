import type { CategoryAggregate } from "@/lib/auevo/score";
import type { ProofCategory, ProofEvent } from "@/lib/auevo/db";

const ORDER: ProofCategory[] = [
  "identity","skill","work","performance","economic_activity",
  "financial_performance","prediction","autonomy","longevity",
];

const COLOR: Record<ProofCategory,string> = {
  identity:"#d7c7a2",
  skill:"#7b68ee",
  work:"#5ca8c8",
  performance:"#9e7ff1",
  economic_activity:"#5eb69f",
  financial_performance:"#d3a85b",
  prediction:"#8d73ff",
  autonomy:"#58b9a0",
  longevity:"#9a8e7b",
};

const CONF: Record<string,number> = {
  DETERMINISTICALLY_VERIFIED:1,
  ORACLE_VERIFIED:.9,
  MULTI_VALIDATOR_VERIFIED:.82,
  COUNTERPARTY_CONFIRMED:.6,
  SELF_REPORTED:.3,
  INSUFFICIENT:.12,
};

function clamp(v:number,a=0,b=1){return Math.max(a,Math.min(b,v));}
function depth(n:number){return clamp(Math.log1p(n)/Math.log(101));}

export function ProofCitadel({
  categories,
  proofs,
  ageDays,
  compact=false,
  className="",
}:{
  categories:CategoryAggregate[];
  proofs?:ProofEvent[];
  ageDays:number;
  compact?:boolean;
  className?:string;
}) {
  const map=new Map(categories.map(c=>[c.category as ProofCategory,c]));
  const byStatus=(category:ProofCategory,status:string)=>proofs?.filter(p=>p.category===category&&p.status===status).length ?? 0;
  const cx=compact?160:300, baseY=compact?258:430;
  const baseW=compact?34:62, gap=compact?7:12;
  const maxH=compact?112:230;
  const ground=compact?290:470;
  const terraces=Math.max(1,Math.min(7,Math.ceil(ageDays/60)));
  const totalW=ORDER.length*(baseW+gap)-gap;
  const startX=cx-totalW/2;

  return (
    <svg viewBox={compact?"0 0 320 320":"0 0 600 500"} className={"block w-full h-auto "+className} role="img" aria-label="Deterministic proof citadel generated from AUEVO proof ledger">
      <defs>
        <linearGradient id={compact?"pc-bg-mini":"pc-bg"} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0c1017"/>
          <stop offset="100%" stopColor="#07090d"/>
        </linearGradient>
        <filter id={compact?"pc-soft-mini":"pc-soft"}>
          <feGaussianBlur stdDeviation={compact?"1.2":"2.2"}/>
        </filter>
      </defs>

      <rect width="100%" height="100%" fill={"url(#"+(compact?"pc-bg-mini":"pc-bg")+")"} rx={compact?20:28}/>
      <ellipse cx={cx} cy={ground} rx={compact?125:250} ry={compact?20:34} fill="#000" opacity=".35"/>

      {Array.from({length:terraces}).map((_,i)=>{
        const w=(compact?210:420)-i*(compact?15:26);
        const h=compact?7:11;
        return <rect key={i} x={cx-w/2} y={ground-8-i*h} width={w} height={h} rx={2} fill={i===terraces-1?"#1a1820":"#11151c"} stroke="#2a2f39" strokeWidth=".7"/>;
      })}

      {ORDER.map((category,index)=>{
        const a=map.get(category);
        const attempted=a?.attempted??0;
        const verified=a?.verified??0;
        const ratio=attempted?verified/attempted:0;
        const d=depth(attempted);
        const h=(compact?18:28)+maxH*d;
        const w=baseW+(compact?5:10)*d;
        const x=startX+index*(baseW+gap)+(baseW-w)/2;
        const y=baseY-h;
        const conf=CONF[a?.confidence??"INSUFFICIENT"]??.12;
        const failed=(a?attempted-verified:0)+byStatus(category,"rejected")+byStatus(category,"disputed");
        const pending=byStatus(category,"pending");
        const fillH=h*ratio;

        return <g key={category}>
          <rect x={x} y={y} width={w} height={h} rx={compact?2:3} fill="#0f131a" stroke="#303745" strokeWidth={compact?.8:1.2}/>
          {verified>0 && <rect x={x+2} y={baseY-fillH} width={Math.max(2,w-4)} height={fillH} rx={2} fill={COLOR[category]} opacity={.18+.52*conf}/>}
          {Array.from({length:Math.min(8,attempted)}).map((_,j)=>{
            const yy=baseY-((j+1)/(Math.min(8,attempted)+1))*h;
            return <line key={j} x1={x+2} x2={x+w-2} y1={yy} y2={yy} stroke={COLOR[category]} strokeOpacity={.18+.12*conf} strokeWidth={compact?.55:.8}/>;
          })}
          {pending>0 && <rect x={x+4} y={y-7} width={w-8} height={5} fill="none" stroke={COLOR[category]} strokeDasharray="2 2" opacity=".55"/>}
          {failed>0 && Array.from({length:Math.min(3,failed)}).map((_,j)=><line key={j} x1={x+3} y1={y+h*(.32+j*.16)} x2={x+w-3} y2={y+h*(.24+j*.16)} stroke="#ff6b72" strokeWidth={compact?.9:1.5} opacity=".8"/>)}
          <rect x={x+w*.35} y={y-(compact?7:12)} width={w*.3} height={compact?7:12} fill={COLOR[category]} opacity={.22+.45*conf}/>
          {!compact && attempted>0 && <text x={x+w/2} y={ground+18} textAnchor="middle" fill="#697281" fontSize="9">{verified}/{attempted}</text>}
        </g>
      })}

      <circle cx={cx} cy={ground-terraces*(compact?7:11)-8} r={compact?6:9} fill="#d8b66c" opacity=".95"/>
      <circle cx={cx} cy={ground-terraces*(compact?7:11)-8} r={compact?13:20} fill="none" stroke="#8b72ff" strokeOpacity=".35"/>

      {!compact && <text x={cx} y="34" textAnchor="middle" fill="#6e7685" fontSize="10" letterSpacing="3">PROOF CITADEL</text>}
    </svg>
  );
}
