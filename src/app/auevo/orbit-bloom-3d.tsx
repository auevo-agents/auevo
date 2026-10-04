"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type OrbitProof = {
  id: string;
  category: string;
  status: string;
  verification_method?: string;
  created_at?: string;
};

export type OrbitBloomAgent = {
  id: string;
  handle: string;
  ageDays: number;
  attempted: number;
  verified: number;
  pending: number;
  rejected: number;
  dominantCategory: string | null;
  proofs: OrbitProof[];
};

type Box={x:number;y:number;z:number;sx:number;sy:number;sz:number;color:[number,number,number];emissive:number};
type Node={agent:OrbitBloomAgent;x:number;z:number;scale:number};

const SLATE:[number,number,number]=[0.15,0.19,0.29];
const SLATE_2:[number,number,number]=[0.10,0.13,0.21];
const VIOLET:[number,number,number]=[0.56,0.39,1.0];
const VIOLET_SOFT:[number,number,number]=[0.72,0.64,1.0];
const GOLD:[number,number,number]=[0.90,0.67,0.30];
const RED:[number,number,number]=[0.94,0.22,0.28];

const CATEGORY_INDEX:Record<string,number>={
  identity:0,skill:1,work:2,performance:3,economic_activity:4,
  financial_performance:5,prediction:6,autonomy:7,longevity:8,
};

function clamp(v:number,a=0,b=1){return Math.max(a,Math.min(b,v))}
function statusColor(p:OrbitProof):[number,number,number]{
  const method=(p.verification_method||"").toUpperCase();
  if(p.status==="rejected"||p.status==="disputed") return RED;
  if(p.status==="pending") return VIOLET_SOFT;
  if(p.status==="verified" && (method.includes("DETERMINISTIC")||method.includes("ORACLE"))) return GOLD;
  if(p.status==="verified") return VIOLET;
  return SLATE;
}
function statusEmissive(p:OrbitProof){
  if(p.status==="rejected"||p.status==="disputed") return .42;
  if(p.status==="pending") return .26;
  if(p.status==="verified" && ((p.verification_method||"").toUpperCase().includes("DETERMINISTIC")||(p.verification_method||"").toUpperCase().includes("ORACLE"))) return .72;
  if(p.status==="verified") return .58;
  return .03;
}

function ring(boxes:Box[],cx:number,cz:number,r:number,y:number,count:number,color:[number,number,number],emissive:number,scale=1){
  for(let i=0;i<count;i++){
    const a=(i/count)*Math.PI*2;
    boxes.push({x:cx+Math.cos(a)*r*scale,y,z:cz+Math.sin(a)*r*scale,sx:.055*scale,sy:.035*scale,sz:.055*scale,color,emissive});
  }
}

function bloomForAgent(agent:OrbitBloomAgent,ox:number,oz:number,scale=1,detail=true):Box[]{
  const boxes:Box[]=[];
  const age=Math.max(1,Math.min(8,Math.ceil(agent.ageDays/45)));

  // layered pedestal: identity age
  for(let i=0;i<Math.min(5,age);i++){
    const side=(2.15-i*.20)*scale;
    boxes.push({x:ox,y:.05+i*.075,z:oz,sx:side,sy:.09*scale,sz:side,color:i===Math.min(5,age)-1?[.18,.22,.33]:SLATE_2,emissive:.02});
  }

  // core spire
  const coreH=(.78+Math.log1p(Math.max(1,agent.proofs.length))*.33)*scale;
  boxes.push({x:ox,y:.34+coreH/2,z:oz,sx:.38*scale,sy:coreH,sz:.38*scale,color:SLATE,emissive:.03});
  boxes.push({x:ox,y:.42+coreH*.72,z:oz,sx:.17*scale,sy:coreH*.62,sz:.17*scale,color:GOLD,emissive:.62});
  boxes.push({x:ox,y:.38+coreH+.12,z:oz,sx:.18*scale,sy:.18*scale,sz:.18*scale,color:GOLD,emissive:.86});

  // local orbit guides
  ring(boxes,ox,oz,.82,.25*scale,32,VIOLET,.13,scale);
  ring(boxes,ox,oz,1.22,.20*scale,44,GOLD,.10,scale);

  // One real Proof Event = one real voxel. Category determines angular lane.
  const proofs=[...agent.proofs].sort((a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||"")));
  proofs.forEach((p,i)=>{
    const cat=CATEGORY_INDEX[p.category]??0;
    const lane=(cat/9)*Math.PI*2;
    const localIndex=Math.floor(i/9);
    const radius=(.55 + (localIndex%5)*.16 + (cat%2)*.06)*scale;
    const wobble=((i*2.399963229728653)%0.46)-.23;
    const angle=lane+wobble;
    const layer=Math.floor(localIndex/5);
    const y=(.44 + layer*.16 + (i%3)*.045)*scale;
    const size=(.11+(p.status==="verified"?.025:0))*scale;
    boxes.push({
      x:ox+Math.cos(angle)*radius,
      y,
      z:oz+Math.sin(angle)*radius,
      sx:size,sy:size,sz:size,
      color:statusColor(p),
      emissive:statusEmissive(p),
    });
  });

  // If the ledger has no events yet, keep a visible seed.
  if(proofs.length===0){
    boxes.push({x:ox+.62*scale,y:.48*scale,z:oz,sx:.12*scale,sy:.12*scale,sz:.12*scale,color:SLATE,emissive:.04});
  }

  // Failures leave an explicit scar near the base.
  if(agent.rejected>0){
    boxes.push({x:ox-.52*scale,y:.36*scale,z:oz+.42*scale,sx:.18*scale,sy:.18*scale,sz:.18*scale,color:RED,emissive:.42});
  }

  if(detail){
    // subtle signal pixels around the bloom
    const signal=Math.min(10,Math.max(2,agent.verified));
    for(let i=0;i<signal;i++){
      const a=(i/signal)*Math.PI*2+.4;
      boxes.push({x:ox+Math.cos(a)*1.48*scale,y:(.32+(i%3)*.08)*scale,z:oz+Math.sin(a)*1.48*scale,sx:.05*scale,sy:.05*scale,sz:.05*scale,color:i%3===0?GOLD:VIOLET,emissive:.55});
    }
  }
  return boxes;
}

function layoutAgents(agents:OrbitBloomAgent[],single:boolean):Node[]{
  if(single) return agents.length?[{agent:agents[0],x:0,z:0,scale:1.75}]:[];
  const shown=agents.slice(0,18);
  return shown.map((agent,i)=>{
    const count=Math.max(1,shown.length);
    const a=(i/count)*Math.PI*2-.45;
    const r=count<=6?5.2:6.0+(i%2)*1.25;
    return {agent,x:Math.cos(a)*r,z:Math.sin(a)*r,scale:count<=6?1.25:.92};
  });
}

function sceneBoxes(agents:OrbitBloomAgent[],single:boolean):Box[]{
  const boxes:Box[]=[];
  if(single){
    boxes.push({x:0,y:-.12,z:0,sx:9.5,sy:.16,sz:9.5,color:[.07,.10,.16],emissive:.01});
    ring(boxes,0,0,2.4,.01,72,VIOLET,.12,1);
    ring(boxes,0,0,3.25,.008,88,GOLD,.08,1);
  }else{
    boxes.push({x:0,y:-.15,z:0,sx:22,sy:.18,sz:22,color:[.07,.10,.16],emissive:.01});
    ring(boxes,0,0,4.2,.015,96,VIOLET,.14,1);
    ring(boxes,0,0,6.25,.012,128,GOLD,.09,1);
    ring(boxes,0,0,8.0,.01,160,VIOLET,.07,1);
    // central AUEVO hub
    boxes.push({x:0,y:.55,z:0,sx:.92,sy:1.05,sz:.92,color:SLATE,emissive:.03});
    boxes.push({x:0,y:.82,z:0,sx:.35,sy:1.30,sz:.35,color:GOLD,emissive:.62});
    boxes.push({x:0,y:1.58,z:0,sx:.26,sy:.26,sz:.26,color:GOLD,emissive:.90});
  }
  const nodes=layoutAgents(agents,single);
  nodes.forEach(n=>boxes.push(...bloomForAgent(n.agent,n.x,n.z,n.scale,true)));
  return boxes;
}

const VS=`
attribute vec3 a_position;
attribute vec3 a_normal;
uniform mat4 u_matrix;
uniform mat4 u_world;
varying vec3 v_normal;
varying vec3 v_worldPos;
void main(){
  vec4 wp=u_world*vec4(a_position,1.0);
  gl_Position=u_matrix*wp;
  v_worldPos=wp.xyz;
  v_normal=mat3(u_world)*a_normal;
}
`;

const FS=`
precision mediump float;
uniform vec3 u_color;
uniform float u_emissive;
uniform vec3 u_light;
varying vec3 v_normal;
varying vec3 v_worldPos;
void main(){
  vec3 n=normalize(v_normal);
  float d=max(dot(n,normalize(u_light)),0.0);
  float hemi=.36+.16*max(n.y,0.0);
  float rim=pow(1.0-max(dot(n,normalize(vec3(.18,.38,.90))),0.0),2.0)*.20;
  float heightGlow=clamp(v_worldPos.y/6.0,0.0,1.0)*.10;
  float shade=hemi+d*.54+rim+heightGlow+u_emissive;
  gl_FragColor=vec4(u_color*shade,1.0);
}
`;

const cubePositions=new Float32Array([
 -1,-1,1,1,-1,1,1,1,1,-1,-1,1,1,1,1,-1,1,1,
 1,-1,-1,-1,-1,-1,-1,1,-1,1,-1,-1,-1,1,-1,1,1,-1,
 -1,1,1,1,1,1,1,1,-1,-1,1,1,1,1,-1,-1,1,-1,
 -1,-1,-1,1,-1,-1,1,-1,1,-1,-1,-1,1,-1,1,-1,-1,1,
 1,-1,1,1,-1,-1,1,1,-1,1,-1,1,1,1,-1,1,1,1,
 -1,-1,-1,-1,-1,1,-1,1,1,-1,-1,-1,-1,1,1,-1,1,-1,
].map(v=>v*.5));
const cubeNormals=new Float32Array([
 0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,
 0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,
 0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,
 0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,
 1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,
 -1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,
]);

function m4Identity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}
function m4Multiply(a:Float32Array,b:Float32Array){const o=new Float32Array(16);for(let r=0;r<4;r++)for(let c=0;c<4;c++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o}
function m4Perspective(fov:number,aspect:number,near:number,far:number){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0])}
function v3Normalize(v:number[]){const l=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/l,v[1]/l,v[2]/l]}
function v3Cross(a:number[],b:number[]){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function v3Sub(a:number[],b:number[]){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]]}
function m4LookAt(eye:number[],target:number[],up:number[]){const z=v3Normalize(v3Sub(eye,target)),x=v3Normalize(v3Cross(up,z)),y=v3Cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),-(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),-(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]),1])}
function m4World(b:Box){const m=m4Identity();m[0]=b.sx;m[5]=b.sy;m[10]=b.sz;m[12]=b.x;m[13]=b.y;m[14]=b.z;return m}
function transformPoint(m:Float32Array,p:[number,number,number]){const[x,y,z]=p;return[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14],m[3]*x+m[7]*y+m[11]*z+m[15]]}
function shader(gl:WebGLRenderingContext,type:number,src:string){const s=gl.createShader(type)!;gl.shaderSource(s,src);gl.compileShader(s);return s}
function program(gl:WebGLRenderingContext){const p=gl.createProgram()!;gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,VS));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,FS));gl.linkProgram(p);return p}

export function OrbitBloom3D({agents,single=false,autoRotate=true,hoverInfo=false,className=""}:{agents:OrbitBloomAgent[];single?:boolean;autoRotate?:boolean;hoverInfo?:boolean;className?:string}){
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const pointerRef=useRef({x:-9999,y:-9999,inside:false});
  const hoveredRef=useRef(-1);
  const [hovered,setHovered]=useState<OrbitBloomAgent|null>(null);
  const [active,setActive]=useState(false);
  const nodes=useMemo(()=>layoutAgents(agents,single),[agents,single]);
  const boxes=useMemo(()=>sceneBoxes(agents,single),[agents,single]);

  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const gl=canvas.getContext("webgl",{antialias:true,alpha:true});if(!gl)return;
    const p=program(gl);gl.useProgram(p);
    const pos=gl.getAttribLocation(p,"a_position"),normal=gl.getAttribLocation(p,"a_normal");
    const matrixLoc=gl.getUniformLocation(p,"u_matrix"),worldLoc=gl.getUniformLocation(p,"u_world"),colorLoc=gl.getUniformLocation(p,"u_color"),emissiveLoc=gl.getUniformLocation(p,"u_emissive"),lightLoc=gl.getUniformLocation(p,"u_light");
    const pb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,cubePositions,gl.STATIC_DRAW);gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,3,gl.FLOAT,false,0,0);
    const nb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,nb);gl.bufferData(gl.ARRAY_BUFFER,cubeNormals,gl.STATIC_DRAW);gl.enableVertexAttribArray(normal);gl.vertexAttribPointer(normal,3,gl.FLOAT,false,0,0);
    gl.uniform3f(lightLoc,-.45,.95,.52);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.clearColor(0,0,0,0);

    let yaw=-.58,pitch=single?.54:.62,zoom=single?12.8:25.5,dragging=false,lastX=0,lastY=0,moved=0,lastTime=performance.now(),raf=0;
    const resize=()=>{const dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h)}};
    const draw=(now:number)=>{
      resize();const dt=Math.min(40,now-lastTime);lastTime=now;if(autoRotate&&!dragging&&hoveredRef.current<0)yaw-=dt*.00005;
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const proj=m4Perspective(Math.PI/4.15,canvas.width/canvas.height,.1,140);
      const targetY=single?1.15:.65;
      const eye=[Math.cos(yaw)*Math.cos(pitch)*zoom,Math.sin(pitch)*zoom,Math.sin(yaw)*Math.cos(pitch)*zoom];
      const vp=m4Multiply(proj,m4LookAt(eye,[0,targetY,0],[0,1,0]));gl.uniformMatrix4fv(matrixLoc,false,vp);
      boxes.forEach(b=>{gl.uniformMatrix4fv(worldLoc,false,m4World(b));gl.uniform3f(colorLoc,...b.color);gl.uniform1f(emissiveLoc,b.emissive);gl.drawArrays(gl.TRIANGLES,0,36)});
      if(hoverInfo&&!single&&pointerRef.current.inside){
        const rect=canvas.getBoundingClientRect();let best=-1,bestD=82;
        nodes.forEach((n,i)=>{const clip=transformPoint(vp,[n.x,1.2*n.scale,n.z]);if(clip[3]<=0)return;const sx=(clip[0]/clip[3]*.5+.5)*rect.width,sy=(1-(clip[1]/clip[3]*.5+.5))*rect.height,d=Math.hypot(pointerRef.current.x-sx,pointerRef.current.y-sy);if(d<bestD){bestD=d;best=i}});
        if(best!==hoveredRef.current){hoveredRef.current=best;setHovered(best>=0?nodes[best].agent:null)}
      }
      raf=requestAnimationFrame(draw);
    };
    const down=(e:PointerEvent)=>{dragging=true;moved=0;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);setActive(true)};
    const move=(e:PointerEvent)=>{const r=canvas.getBoundingClientRect();pointerRef.current={x:e.clientX-r.left,y:e.clientY-r.top,inside:true};if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;moved+=Math.abs(dx)+Math.abs(dy);yaw-=dx*.008;pitch=clamp(pitch-dy*.006,.20,1.16)};
    const up=()=>{if(dragging&&moved<6&&hoverInfo&&hoveredRef.current>=0&&!single){const a=nodes[hoveredRef.current]?.agent;if(a)window.location.href="/agents/"+encodeURIComponent(a.handle)}dragging=false;setActive(false)};
    const leave=()=>{pointerRef.current.inside=false;if(!dragging){hoveredRef.current=-1;setHovered(null)}};
    const wheel=(e:WheelEvent)=>{e.preventDefault();zoom=clamp(zoom+e.deltaY*.012,single?8:15,single?18:38)};
    canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",up);canvas.addEventListener("pointerleave",leave);canvas.addEventListener("wheel",wheel,{passive:false});raf=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(raf);canvas.removeEventListener("pointerdown",down);canvas.removeEventListener("pointermove",move);canvas.removeEventListener("pointerup",up);canvas.removeEventListener("pointercancel",up);canvas.removeEventListener("pointerleave",leave);canvas.removeEventListener("wheel",wheel)};
  },[boxes,nodes,single,autoRotate,hoverInfo]);

  return <div className={"relative overflow-hidden bg-[#0d1421] "+className}>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(139,114,255,.16),transparent_34%),radial-gradient(circle_at_56%_42%,rgba(214,174,97,.08),transparent_22%),linear-gradient(180deg,#121d30_0%,#0d1522_54%,#091019_100%)]"/>
    <div className="pointer-events-none absolute inset-x-0 top-[44%] h-px bg-gradient-to-r from-transparent via-[#9d8dff]/20 to-transparent"/>
    <div className="pointer-events-none absolute -bottom-[18%] left-[10%] h-[45%] w-[80%] rounded-full bg-[#293a5d]/25 blur-[100px]"/>
    <canvas ref={canvasRef} className={"relative block h-full w-full touch-none "+(active?"cursor-grabbing":hoverInfo?"cursor-pointer":"cursor-grab")}/>
    {hovered&&hoverInfo&&<div className="pointer-events-none absolute right-5 top-5 z-20 w-[260px] rounded-2xl border border-[#9b8cff]/25 bg-[#0d1624]/92 p-4 shadow-[0_22px_70px_rgba(0,0,0,.42),0_0_35px_rgba(139,114,255,.12)] backdrop-blur-xl">
      <div className="text-[9px] uppercase tracking-[.18em] text-[#9f8cff]">Reputation Bloom</div>
      <div className="mt-2 truncate text-sm font-medium text-[#f3eee6]">@{hovered.handle}</div>
      <div className="mt-4 grid grid-cols-4 gap-1.5 text-center">
        <Metric v={hovered.verified} l="verified" c="#8b72ff"/><Metric v={hovered.proofs.filter(p=>p.status==="verified"&&((p.verification_method||"").toUpperCase().includes("DETERMINISTIC")||(p.verification_method||"").toUpperCase().includes("ORACLE"))).length} l="elite" c="#d6ae61"/><Metric v={hovered.pending} l="pending" c="#b9a9ff"/><Metric v={hovered.rejected} l="failed" c="#ef4444"/>
      </div>
      <div className="mt-3 text-[9px] uppercase tracking-[.12em] text-[#d6ae61]">Click to open passport →</div>
    </div>}
    <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-white/[0.08] bg-[#0b121d]/75 px-3 py-1.5 text-[9px] uppercase tracking-[.12em] text-[#8794a8] backdrop-blur-md">Auto orbit · drag · scroll to zoom</div>
  </div>
}
function Metric({v,l,c}:{v:number;l:string;c:string}){return <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-2"><span className="mx-auto mb-1 block h-1.5 w-1.5 rounded-full" style={{background:c}}/><div className="text-xs text-[#eee9e1]">{v}</div><div className="mt-1 text-[6px] uppercase tracking-[.09em] text-[#718095]">{l}</div></div>}
