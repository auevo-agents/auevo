import type { ProofEvent } from "@/lib/auevo/db";

const STATUS_COLOR: Record<string,string> = {
  verified:"#d6ae61",
  pending:"#8b72ff",
  rejected:"#ff6672",
  disputed:"#e89061",
};

function shade(hex:string,m:number){
  const v=parseInt(hex.slice(1),16);
  const r=(v>>16)&255,g=(v>>8)&255,b=v&255;
  const f=(x:number)=>Math.max(0,Math.min(255,Math.round(x*m)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function Cube({x,y,s,color,muted=false}:{x:number;y:number;s:number;color:string;muted?:boolean}){
  const d=s*.42;
  return <g opacity={muted ? .48 : 1}>
    <polygon points={`${x},${y} ${x+s},${y-d} ${x+s+d},${y} ${x+d},${y+d}`} fill={shade(color,1.1)} stroke="rgba(255,255,255,.08)" strokeWidth=".55"/>
    <polygon points={`${x},${y} ${x+d},${y+d} ${x+d},${y+s+d} ${x},${y+s}`} fill={shade(color,.58)} stroke="rgba(255,255,255,.06)" strokeWidth=".55"/>
    <polygon points={`${x+d},${y+d} ${x+s+d},${y} ${x+s+d},${y+s} ${x+d},${y+s+d}`} fill={shade(color,.76)} stroke="rgba(255,255,255,.06)" strokeWidth=".55"/>
  </g>;
}

export function ProofDNA({proofs,className=""}:{proofs:ProofEvent[];className?:string}) {
  const shown=[...proofs].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime()).slice(-72);
  const items=shown.map((p,i)=>{
    const t=shown.length<=1?0:i/(shown.length-1);
    const x=55+t*470+Math.sin(t*Math.PI*4)*34;
    const y=360-t*245+Math.cos(t*Math.PI*3)*36;
    return {p,x,y,t};
  });

  return (
    <svg viewBox="0 0 600 430" className={"block h-auto w-full "+className} role="img" aria-label="AUEVO proof history rendered as a deterministic architectural timeline">
      <defs>
        <radialGradient id="dna-bg" cx="58%" cy="36%" r="78%">
          <stop offset="0%" stopColor="#171321"/>
          <stop offset="48%" stopColor="#0b0d12"/>
          <stop offset="100%" stopColor="#07080b"/>
        </radialGradient>
        <filter id="dna-glow"><feGaussianBlur stdDeviation="2.4"/></filter>
      </defs>
      <rect width="600" height="430" rx="26" fill="url(#dna-bg)"/>
      <path d="M45 378 C150 300, 112 232, 235 214 S355 164, 410 110 S505 72, 555 42" fill="none" stroke="#2b2c36" strokeWidth="18" opacity=".5"/>
      <path d="M45 378 C150 300, 112 232, 235 214 S355 164, 410 110 S505 72, 555 42" fill="none" stroke="#8b72ff" strokeWidth="1.1" opacity=".26"/>

      {items.map(({p,x,y},i)=>{
        const c=STATUS_COLOR[p.status]??"#68717e";
        const s=7+(i%5===0?2:0);
        return <g key={p.id}>
          {p.status==="verified"&&<circle cx={x+s*.7} cy={y+s*.2} r="7" fill={c} opacity=".12" filter="url(#dna-glow)"/>}
          <Cube x={x} y={y} s={s} color={c} muted={p.status==="pending"}/>
        </g>;
      })}

      <g>
        <text x="26" y="30" fill="#8f7cf0" fontSize="9" letterSpacing="2.4">PROOF HISTORY</text>
        <text x="574" y="30" textAnchor="end" fill="#5d6673" fontSize="9">{shown.length} EVENTS</text>
      </g>

      <g fill="#596270" fontSize="8">
        <text x="38" y="407">earlier</text>
        <text x="562" y="62" textAnchor="end">latest</text>
      </g>

      <g transform="translate(28 52)">
        {[
          ["verified","#d6ae61"],
          ["pending","#8b72ff"],
          ["failed","#ff6672"],
        ].map(([label,color],i)=><g key={label} transform={`translate(0 ${i*19})`}><rect width="7" height="7" rx="1.5" fill={color}/><text x="14" y="7" fill="#7a8390" fontSize="8">{label}</text></g>)}
      </g>
    </svg>
  );
}
