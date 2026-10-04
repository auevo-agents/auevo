export function HomeTreeBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="treeSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06110c"/>
            <stop offset="52%" stopColor="#0a1b12"/>
            <stop offset="100%" stopColor="#050d09"/>
          </linearGradient>
          <radialGradient id="treeGlow" cx="62%" cy="50%" r="46%">
            <stop offset="0%" stopColor="#f0cf83" stopOpacity=".28"/>
            <stop offset="27%" stopColor="#45c985" stopOpacity=".12"/>
            <stop offset="100%" stopColor="#06110c" stopOpacity="0"/>
          </radialGradient>
          <linearGradient id="treeGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffe3a0"/>
            <stop offset="44%" stopColor="#d7b56d"/>
            <stop offset="100%" stopColor="#7e5b25"/>
          </linearGradient>
          <linearGradient id="treeGreen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#173d2b"/>
            <stop offset="50%" stopColor="#0f281c"/>
            <stop offset="100%" stopColor="#07140e"/>
          </linearGradient>
          <filter id="treeBlur"><feGaussianBlur stdDeviation="24"/></filter>
          <filter id="treeGlowBlur"><feGaussianBlur stdDeviation="9"/></filter>
          <filter id="treeShadow"><feDropShadow dx="0" dy="20" stdDeviation="26" floodColor="#000" floodOpacity=".48"/></filter>
        </defs>

        <rect width="1600" height="900" fill="url(#treeSky)"/>
        <rect width="1600" height="900" fill="url(#treeGlow)"/>

        {/* distant monumental walls */}
        <g opacity=".48">
          <rect x="0" y="150" width="88" height="620" fill="#07120d"/>
          <rect x="84" y="260" width="56" height="500" fill="#0b1b13"/>
          <rect x="1460" y="135" width="140" height="650" fill="#07120d"/>
          <rect x="1398" y="278" width="70" height="490" fill="#0b1b13"/>
          <rect x="120" y="335" width="18" height="360" fill="#caa762" opacity=".08"/>
          <rect x="1476" y="230" width="15" height="410" fill="#d7b56d" opacity=".10"/>
        </g>

        {/* atmospheric forest silhouettes */}
        <g fill="#0b2519" opacity=".64">
          <ellipse cx="220" cy="560" rx="210" ry="118"/>
          <ellipse cx="408" cy="510" rx="180" ry="104"/>
          <ellipse cx="1260" cy="570" rx="270" ry="134"/>
          <ellipse cx="1430" cy="515" rx="168" ry="108"/>
        </g>

        {/* fog */}
        <g filter="url(#treeBlur)" opacity=".42" fill="#b9d7c3">
          <ellipse cx="820" cy="716" rx="560" ry="72"/>
          <ellipse cx="430" cy="650" rx="330" ry="52"/>
          <ellipse cx="1230" cy="650" rx="330" ry="58"/>
        </g>

        {/* central digital tree */}
        <g transform="translate(825 460)" filter="url(#treeShadow)">
          {/* trunk core */}
          <path d="M-58 258 C-34 172 -38 68 -24 -30 C-9 -138 -5 -245 0 -346 C7 -240 12 -132 29 -24 C43 75 40 170 64 258 Z" fill="#0b1d14"/>
          <path d="M-26 256 C-8 159 -10 31 -3 -323 L12 -323 C17 8 21 157 36 256 Z" fill="#163727"/>
          <rect x="-6" y="-328" width="13" height="575" fill="url(#treeGold)" opacity=".82" filter="url(#treeGlowBlur)"/>

          {/* architectural trunk blocks */}
          {[
            [-84,120,52,68],[-30,98,54,83],[28,118,62,70],[-69,47,48,78],[-13,24,54,92],[45,38,57,78],
            [-57,-42,42,74],[-8,-73,52,86],[38,-58,46,76],[-44,-131,38,70],[-2,-163,44,78],[37,-137,36,64],
            [-28,-220,34,66],[15,-246,32,72],
          ].map(([x,y,w,h],i)=><rect key={i} x={x} y={y} width={w} height={h} rx="3" fill={i%4===0?"#163324":"#0b1c14"} stroke="#365d45" strokeOpacity=".34"/>)}

          {/* branches */}
          <g fill="none" stroke="#173e2b" strokeWidth="25" strokeLinecap="round">
            <path d="M-28 32 C-150 -5 -188 -96 -300 -148"/>
            <path d="M-18 92 C-156 100 -234 40 -360 -12"/>
            <path d="M24 16 C140 -28 198 -105 315 -156"/>
            <path d="M33 92 C177 91 243 36 362 -20"/>
          </g>
          <g fill="none" stroke="url(#treeGold)" strokeWidth="2.5" strokeLinecap="round" opacity=".74">
            <path d="M-28 32 C-150 -5 -188 -96 -300 -148"/>
            <path d="M-18 92 C-156 100 -234 40 -360 -12"/>
            <path d="M24 16 C140 -28 198 -105 315 -156"/>
            <path d="M33 92 C177 91 243 36 362 -20"/>
          </g>

          {/* branch voxel architecture */}
          <g fill="#0e2419" stroke="#41684f" strokeOpacity=".30">
            {[
              [-196,-86,58,48],[-250,-124,48,42],[-303,-158,54,45],[-143,-39,52,43],[-225,26,63,46],[-302,-7,59,48],
              [139,-76,58,48],[203,-115,52,44],[263,-151,61,48],[114,-25,48,42],[215,20,62,46],[287,-18,58,48]
            ].map(([x,y,w,h],i)=><rect key={i} x={x} y={y} width={w} height={h} rx="3"/>)}
          </g>

          {/* foliage masses */}
          <g fill="url(#treeGreen)">
            <ellipse cx="-250" cy="-180" rx="142" ry="92"/>
            <ellipse cx="-137" cy="-224" rx="130" ry="92"/>
            <ellipse cx="-8" cy="-265" rx="150" ry="104"/>
            <ellipse cx="137" cy="-221" rx="142" ry="98"/>
            <ellipse cx="274" cy="-174" rx="135" ry="88"/>
            <ellipse cx="-338" cy="-82" rx="112" ry="76"/>
            <ellipse cx="335" cy="-78" rx="112" ry="76"/>
          </g>

          {/* luminous leaf / proof particles */}
          <g fill="#d7b56d" opacity=".9" filter="url(#treeGlowBlur)">
            {[
              [-302,-202],[-255,-163],[-226,-230],[-166,-183],[-122,-259],[-56,-230],[-9,-302],[48,-248],[104,-281],[164,-205],[221,-239],[278,-183],[330,-126],
              [-372,-93],[-290,-58],[-204,-98],[-136,-73],[92,-87],[178,-118],[260,-69],[354,-79]
            ].map(([x,y],i)=><circle key={i} cx={x} cy={y} r={i%4===0?5:3}/>)}
          </g>
          <g fill="#6de0a5" opacity=".55">
            {[
              [-350,-137],[-285,-243],[-188,-275],[-93,-314],[36,-325],[153,-279],[246,-233],[346,-124],
              [-322,-32],[-177,-128],[189,-145],[317,-34]
            ].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="3"/>)}
          </g>
        </g>

        {/* stepped base */}
        <g opacity=".92">
          <rect x="470" y="720" width="710" height="44" fill="#07120d"/>
          <rect x="540" y="680" width="580" height="42" fill="#0a1b13"/>
          <rect x="610" y="642" width="440" height="40" fill="#10261a"/>
          <rect x="704" y="606" width="252" height="38" fill="#13301f"/>
          <rect x="765" y="582" width="132" height="26" fill="#173727"/>
          <g fill="url(#treeGold)" opacity=".68">
            <rect x="614" y="642" width="4" height="40"/>
            <rect x="956" y="606" width="4" height="38"/>
            <rect x="1116" y="680" width="4" height="42"/>
          </g>
        </g>

        {/* water reflection */}
        <g opacity=".22" filter="url(#treeBlur)">
          <rect x="0" y="770" width="1600" height="130" fill="#10291d"/>
          <rect x="820" y="742" width="10" height="140" fill="#f0cb79"/>
        </g>
      </svg>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,12,8,.92)_0%,rgba(4,12,8,.72)_25%,rgba(4,12,8,.16)_52%,rgba(4,12,8,.05)_100%)]"/>
      <div className="absolute inset-x-0 bottom-0 h-[36%] bg-gradient-to-t from-[#06100c] via-[#06100c]/55 to-transparent"/>
    </div>
  );
}
