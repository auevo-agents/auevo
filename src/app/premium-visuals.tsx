export function PortalSkyline({ className = "", dense = false }: { className?: string; dense?: boolean }) {
  const towers = dense
    ? [
        [7,70,22,22],[14,48,18,44],[21,62,20,30],[29,37,24,55],[37,58,20,34],[44,26,28,66],
        [53,51,22,41],[61,35,24,57],[70,61,18,31],[78,43,22,49],[86,67,16,25],[92,52,13,40],
      ]
    : [[8,68,20,24],[18,52,18,40],[31,63,18,29],[43,34,24,58],[58,55,20,37],[72,42,22,50],[86,63,17,29]];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="au-sky-building" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b2333"/>
          <stop offset="100%" stopColor="#0a0f18"/>
        </linearGradient>
        <linearGradient id="au-sky-violet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b39cff"/>
          <stop offset="100%" stopColor="#6f55de"/>
        </linearGradient>
        <linearGradient id="au-sky-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe09a"/>
          <stop offset="100%" stopColor="#c28e3d"/>
        </linearGradient>
        <filter id="au-sky-glow"><feGaussianBlur stdDeviation="1.1"/></filter>
      </defs>
      <g opacity=".88">
        {towers.map(([x,y,w,h],i)=>(
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} rx="1.4" fill="url(#au-sky-building)" stroke="#344058" strokeWidth=".24"/>
            <rect x={x+w*.49} y={y+3} width=".6" height={h-6} fill={i%3===0?"url(#au-sky-gold)":"url(#au-sky-violet)"} opacity={i%2?.38:.72} filter="url(#au-sky-glow)"/>
            {Array.from({length:4}).map((_,j)=><rect key={j} x={x+3+j*(w-6)/3.4} y={y+h*.32} width=".5" height={h*.38} fill="#d8c287" opacity={.08+(j%2)*.06}/>)}
          </g>
        ))}
      </g>
      <g fill="none" strokeLinecap="round">
        <path d="M-4 79 C18 58, 39 64, 55 51 S82 38, 106 45" stroke="#8b72ff" strokeWidth=".35" opacity=".34"/>
        <path d="M-3 84 C19 71, 38 78, 57 63 S81 52, 105 59" stroke="#d6ae61" strokeWidth=".35" opacity=".30"/>
      </g>
      <g>
        {[[20,58],[47,35],[64,48],[81,54]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r=".75" fill={i%2?"#d6ae61":"#8b72ff"} opacity=".9"/>)}
      </g>
    </svg>
  );
}

export function PortalFog({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute -left-[8%] top-[12%] h-[44%] w-[44%] rounded-full bg-[#6f55de]/10 blur-[110px]"/>
      <div className="absolute right-[2%] top-[8%] h-[34%] w-[34%] rounded-full bg-[#d6ae61]/[0.07] blur-[120px]"/>
      <div className="absolute bottom-[-18%] left-[22%] h-[50%] w-[58%] rounded-full bg-[#22304a]/30 blur-[130px]"/>
      <div className="absolute inset-x-0 bottom-0 h-[34%] bg-gradient-to-t from-[#0a0f18]/90 via-[#111827]/35 to-transparent"/>
    </div>
  );
}

export function ProofMonolith({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 360" className={className} role="img" aria-label="AUEVO proof monolith">
      <defs>
        <linearGradient id="pm-body" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#1a2130"/><stop offset="1" stopColor="#090d15"/></linearGradient>
        <linearGradient id="pm-v" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#d1c3ff"/><stop offset=".45" stopColor="#8b72ff"/><stop offset="1" stopColor="#5f47d6"/></linearGradient>
        <linearGradient id="pm-g" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ffe2a4"/><stop offset="1" stopColor="#bc8736"/></linearGradient>
        <filter id="pm-glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <ellipse cx="210" cy="314" rx="118" ry="24" fill="#000" opacity=".38"/>
      <g>
        <path d="M126 280 210 326 294 280 210 238Z" fill="#0d121d" stroke="#2e3649"/>
        <path d="M153 246 210 278 267 246 210 218Z" fill="#121823" stroke="#364057"/>
      </g>
      <g>
        <rect x="176" y="86" width="68" height="154" rx="6" fill="url(#pm-body)" stroke="#3a4560"/>
        <rect x="188" y="102" width="44" height="122" rx="4" fill="#0b0f18" stroke="#514b77"/>
        <path d="M210 107 228 117 210 127 192 117Z" fill="none" stroke="#a790ff" strokeWidth="2" filter="url(#pm-glow)"/>
        <path d="M192 117v21l18 10 18-10v-21M210 127v21" fill="none" stroke="#8b72ff" strokeWidth="1.4"/>
        <rect x="205" y="149" width="10" height="56" rx="4" fill="url(#pm-v)" opacity=".9" filter="url(#pm-glow)"/>
        <rect x="170" y="166" width="6" height="50" rx="3" fill="url(#pm-g)" opacity=".8"/>
        <rect x="244" y="142" width="6" height="74" rx="3" fill="url(#pm-g)" opacity=".8"/>
      </g>
      <g opacity=".82">
        <rect x="96" y="145" width="57" height="92" rx="8" fill="#0c111b" stroke="#303a51"/>
        <rect x="268" y="122" width="57" height="112" rx="8" fill="#0c111b" stroke="#303a51"/>
        <rect x="106" y="160" width="37" height="4" rx="2" fill="#8b72ff" opacity=".65"/>
        <rect x="106" y="176" width="28" height="3" rx="1.5" fill="#758198" opacity=".42"/>
        <rect x="106" y="187" width="32" height="3" rx="1.5" fill="#758198" opacity=".35"/>
        <rect x="279" y="140" width="34" height="4" rx="2" fill="#d6ae61" opacity=".72"/>
        <circle cx="286" cy="172" r="10" fill="none" stroke="#8b72ff" strokeWidth="2"/>
        <path d="m281 172 4 4 7-9" fill="none" stroke="#d6ae61" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </g>
      <g fill="none" strokeLinecap="round">
        <path d="M48 270 C105 226, 132 218, 175 190" stroke="#8b72ff" strokeWidth="1.1" opacity=".45"/>
        <path d="M244 190 C293 203, 333 226, 374 260" stroke="#d6ae61" strokeWidth="1.1" opacity=".4"/>
      </g>
      <circle cx="210" cy="75" r="4" fill="#c8b7ff" filter="url(#pm-glow)"/>
      <path d="M210 70V44" stroke="#8b72ff" strokeWidth="2" strokeLinecap="round" filter="url(#pm-glow)"/>
    </svg>
  );
}

export function PremiumIcon({ kind, className = "" }: { kind: "prediction"|"longevity"|"financial"|"identity"|"skill"|"work"|"performance"|"economic"|"autonomy"; className?: string }) {
  const common = "currentColor";
  const map: Record<string, React.ReactNode> = {
    prediction:<><circle cx="16" cy="16" r="10"/><path d="M8 18c3-5 5-6 8-2s5 3 8-3"/><circle cx="16" cy="16" r="2" fill={common}/></>,
    longevity:<><path d="M9 5h14M9 27h14M11 6c0 6 4 7 5 10-1 3-5 4-5 10M21 6c0 6-4 7-5 10 1 3 5 4 5 10"/></>,
    financial:<><ellipse cx="16" cy="8" rx="8" ry="3"/><path d="M8 8v5c0 1.6 3.6 3 8 3s8-1.4 8-3V8M8 13v5c0 1.6 3.6 3 8 3s8-1.4 8-3v-5M8 18v5c0 1.6 3.6 3 8 3s8-1.4 8-3v-5"/></>,
    identity:<><path d="M16 5c-5 0-9 4-9 9 0 4 2 6 4 8M16 9c-3 0-5 2-5 5 0 4 3 4 3 8M16 13c-1 0-2 1-2 2 0 4-1 8-3 11M19 10c3 1 5 3 5 6 0 4-2 7-4 10M19 15c2 3 1 7-1 11"/></>,
    skill:<><circle cx="16" cy="16" r="3"/><path d="M16 4v5M16 23v5M4 16h5M23 16h5M7.5 7.5l3.5 3.5M21 21l3.5 3.5M24.5 7.5 21 11M11 21l-3.5 3.5"/></>,
    work:<><rect x="6" y="9" width="20" height="15" rx="2"/><path d="M12 9V6h8v3M6 14h20"/></>,
    performance:<><path d="m6 23 6-7 4 3 9-11"/><path d="M21 8h4v4"/></>,
    economic:<><circle cx="16" cy="16" r="10"/><path d="M12 12h8M12 16h8M12 20h8M16 6v20"/></>,
    autonomy:<><path d="M16 4 27 24H5Z"/><circle cx="16" cy="18" r="2"/></>,
  };
  return <svg viewBox="0 0 32 32" className={className} fill="none" stroke={common} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{map[kind]}</svg>;
}
