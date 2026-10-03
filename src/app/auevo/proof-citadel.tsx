import type { CategoryAggregate } from "@/lib/auevo/score";
import type { ProofCategory, ProofEvent } from "@/lib/auevo/db";

const ORDER: ProofCategory[] = [
  "identity","skill","work","performance","economic_activity",
  "financial_performance","prediction","autonomy","longevity",
];

const COLOR: Record<ProofCategory,string> = {
  identity:"#c6b892",
  skill:"#8068ee",
  work:"#579bc1",
  performance:"#a37cf1",
  economic_activity:"#4ea787",
  financial_performance:"#d2a554",
  prediction:"#8c6fff",
  autonomy:"#4fa98c",
  longevity:"#91836f",
};

const CONF: Record<string,number> = {
  DETERMINISTICALLY_VERIFIED:1,
  ORACLE_VERIFIED:.92,
  MULTI_VALIDATOR_VERIFIED:.82,
  COUNTERPARTY_CONFIRMED:.62,
  SELF_REPORTED:.34,
  INSUFFICIENT:.16,
};

function clamp(v:number,a=0,b=1){return Math.max(a,Math.min(b,v));}
function depth(n:number){return clamp(Math.log1p(n)/Math.log(101));}
function hexToRgb(hex:string){
  const v=parseInt(hex.slice(1),16);
  return {r:(v>>16)&255,g:(v>>8)&255,b:v&255};
}
function shade(hex:string,m:number){
  const {r,g,b}=hexToRgb(hex);
  const f=(x:number)=>Math.round(clamp(x*m,0,255));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function IsoBlock({
  x,y,w,h,color,alpha=1,ghost=false,fractured=false,
}:{
  x:number;y:number;w:number;h:number;color:string;alpha?:number;ghost?:boolean;fractured?:boolean;
}){
  const d=w*.38;
  const top=`${x},${y-h} ${x+w},${y-h-d} ${x+w+d},${y-h} ${x+d},${y-h+d}`;
  const left=`${x},${y-h} ${x+d},${y-h+d} ${x+d},${y+d} ${x},${y}`;
  const right=`${x+d},${y-h+d} ${x+w+d},${y-h} ${x+w+d},${y} ${x+d},${y+d}`;
  return <g opacity={alpha}>
    <polygon points={left} fill={ghost?"none":shade(color,.58)} stroke={ghost?color:"rgba(255,255,255,.07)"} strokeWidth={ghost?1.2:.6} strokeDasharray={ghost?"3 2":undefined}/>
    <polygon points={right} fill={ghost?"none":shade(color,.76)} stroke={ghost?color:"rgba(255,255,255,.07)"} strokeWidth={ghost?1.2:.6} strokeDasharray={ghost?"3 2":undefined}/>
    <polygon points={top} fill={ghost?"rgba(139,114,255,.035)":shade(color,1.12)} stroke={ghost?color:"rgba(255,255,255,.1)"} strokeWidth={ghost?1.2:.6} strokeDasharray={ghost?"3 2":undefined}/>
    {fractured&&<><line x1={x+w*.2} y1={y-h*.55} x2={x+w*.7} y2={y-h*.28} stroke="#ff6975" strokeWidth="1.2"/><line x1={x+w*.55} y1={y-h*.34} x2={x+w*.92} y2={y-h*.48} stroke="#ff6975" strokeWidth=".8"/></>}
  </g>;
}

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
  const W=compact?320:600,H=compact?320:500,cx=W/2;
  const baseY=compact?245:390;
  const s=compact ? .55 : 1;
  const foundation=Math.max(1,Math.min(7,Math.ceil(ageDays/60)));
  const positions=[
    [0,-18],[-74,2],[72,-6],[-128,38],[124,42],[-66,70],[64,78],[-112,100],[108,106],
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={"block h-auto w-full "+className} role="img" aria-label="AUEVO proof citadel generated from live proof data">
      <defs>
        <radialGradient id={compact?"iso-bg-mini":"iso-bg"} cx="50%" cy="45%" r="72%">
          <stop offset="0%" stopColor="#171321"/>
          <stop offset="48%" stopColor="#0b0d12"/>
          <stop offset="100%" stopColor="#07080b"/>
        </radialGradient>
        <filter id={compact?"iso-glow-mini":"iso-glow"}><feGaussianBlur stdDeviation={compact?"1.5":"2.8"}/></filter>
      </defs>
      <rect width={W} height={H} rx={compact ? 20 : 30} fill={`url(#${compact?"iso-bg-mini":"iso-bg"})`}/>
      <ellipse cx={cx} cy={baseY+42*s} rx={compact ? 118 : 230} ry={compact ? 28 : 50} fill="#000" opacity=".42"/>

      {Array.from({length:foundation}).map((_,i)=>{
        const width=(compact ? 195 : 360)-i*(compact ? 11 : 19);
        const y=baseY+28*s-i*(compact ? 4 : 8);
        return <g key={i} opacity={.82}>
          <polygon points={`${cx-width/2},${y} ${cx},${y-width*.16} ${cx+width/2},${y} ${cx},${y+width*.16}`} fill={i===foundation-1?"#17131d":"#101319"} stroke="#2b2c35" strokeWidth=".7"/>
        </g>;
      })}

      {ORDER.map((category,index)=>{
        const a=map.get(category);
        const attempted=a?.attempted??0;
        const verified=a?.verified??0;
        const ratio=attempted?verified/attempted:0;
        const d=depth(attempted);
        const conf = CONF[a?.confidence ?? "INSUFFICIENT"] ?? 0.16;
        const blocks=Math.max(1,Math.min(8,Math.ceil(1+d*7)));
        const verifiedBlocks=Math.round(blocks*ratio);
        const [px,pz]=positions[index];
        const x=cx+(px-pz*.55)*s-12*s;
        const y=baseY+(px*.18+pz*.42)*s;
        const bw=(compact ? 22 : 34)*(1+d*.22);
        const bh=(compact ? 12 : 19);
        const color=COLOR[category];
        const failed=(a?attempted-verified:0)+byStatus(category,"rejected")+byStatus(category,"disputed");
        const pending=byStatus(category,"pending");

        return <g key={category}>
          {Array.from({length:blocks}).map((_,j)=>{
            const lit=j<verifiedBlocks;
            const blockColor=lit?color:"#232630";
            const alpha=lit ? .48 + .48 * conf : .86;
            return <IsoBlock key={j} x={x} y={y-j*bh*.86} w={bw} h={bh} color={blockColor} alpha={alpha} fractured={failed>0&&j===Math.max(0,Math.floor(blocks*.38))}/>;
          })}
          {pending>0&&<IsoBlock x={x+bw*.08} y={y-blocks*bh*.86-4*s} w={bw*.84} h={bh*.8} color={color} alpha={.55} ghost/>}
          {verified>0&&<circle cx={x+bw*.72} cy={y-blocks*bh*.86-bh*.35} r={compact ? 2.2 : 3.5} fill={color} opacity=".95" filter={`url(#${compact?"iso-glow-mini":"iso-glow"})`}/>}
        </g>;
      })}

      <g>
        <IsoBlock x={cx-(compact ? 14 : 22)} y={baseY-16*s} w={compact ? 28 : 44} h={(compact ? 18 : 28)+depth(categories.reduce((n,c)=>n+c.verified,0))*(compact ? 65 : 105)} color="#d3a552" alpha=".98"/>
        <circle cx={cx+(compact ? 4 : 7)} cy={baseY-(compact ? 55 : 92)} r={compact ? 4 : 7} fill="#8b72ff" opacity=".95"/>
        <circle cx={cx+(compact ? 4 : 7)} cy={baseY-(compact ? 55 : 92)} r={compact ? 9 : 15} fill="none" stroke="#8b72ff" strokeOpacity=".24"/>
      </g>

      {!compact&&<><text x="28" y="32" fill="#8b72ff" fontSize="9" letterSpacing="2.4">PROOF CITADEL</text><text x={W-28} y="32" textAnchor="end" fill="#5d6673" fontSize="9">{categories.reduce((n,c)=>n+c.verified,0)} VERIFIED</text></>}
    </svg>
  );
}
