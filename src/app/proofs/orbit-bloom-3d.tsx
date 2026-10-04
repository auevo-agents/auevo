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

type Box={x:number;y:number;z:number;sx:number;sy:number;sz:number;color:[number,number,number];emissive:number;ry?:number};
type Node={agent:OrbitBloomAgent;x:number;z:number;scale:number};

const SLATE:[number,number,number]=[0.10,0.19,0.14];
const SLATE_2:[number,number,number]=[0.07,0.15,0.10];
const VIOLET:[number,number,number]=[0.26,0.85,0.56];
const VIOLET_SOFT:[number,number,number]=[0.56,0.92,0.72];
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

function arcRing(boxes:Box[],cx:number,cz:number,r:number,y:number,count:number,color:[number,number,number],emissive:number,scale=1,width=.045){
  const circumference=Math.PI*2*r*scale;
  const segLen=(circumference/count)*.88;
  for(let i=0;i<count;i++){
    const a=(i/count)*Math.PI*2;
    boxes.push({
      x:cx+Math.cos(a)*r*scale,y,z:cz+Math.sin(a)*r*scale,
      sx:segLen,sy:width*scale,sz:width*scale,
      color,emissive,ry:-a,
    });
  }
}

function radialPetals(boxes:Box[],cx:number,cz:number,scale:number,count=12){
  for(let i=0;i<count;i++){
    const a=(i/count)*Math.PI*2;
    const r=.72*scale;
    boxes.push({
      x:cx+Math.cos(a)*r,y:.16*scale,z:cz+Math.sin(a)*r,
      sx:.64*scale,sy:.10*scale,sz:.28*scale,
      color:i%3===0?[.12,.24,.17]:[.08,.18,.12],
      emissive:.018,ry:-a,
    });
  }
}

function bloomForAgent(agent:OrbitBloomAgent,ox:number,oz:number,scale=1,detail=true):Box[]{
  const boxes:Box[]=[];
  const age=Math.max(1,Math.min(8,Math.ceil(agent.ageDays/45)));

  boxes.push({x:ox+.05*scale,y:.018,z:oz+.08*scale,sx:3.0*scale,sy:.03,sz:2.65*scale,color:[.018,.025,.040],emissive:0});
  for(let i=0;i<Math.min(4,age);i++){
    const side=(2.32-i*.18)*scale;
    boxes.push({x:ox,y:.055+i*.06,z:oz,sx:side,sy:.075*scale,sz:side,color:i===Math.min(4,age)-1?[.12,.23,.16]:[.10,.14,.22],emissive:.018});
  }

  radialPetals(boxes,ox,oz,scale,12);
  arcRing(boxes,ox,oz,.95,.20*scale,44,[.24,.58,.39],.055,scale,.038);
  arcRing(boxes,ox,oz,1.28,.155*scale,56,[.52,.40,.18],.045,scale,.032);

  const maturity=.30+Math.min(.55,Math.log1p(agent.ageDays)/9);
  boxes.push({x:ox,y:.27*scale,z:oz,sx:.82*scale,sy:.24*scale,sz:.82*scale,color:[.10,.21,.14],emissive:.02});
  boxes.push({x:ox,y:.40*scale,z:oz,sx:.54*scale,sy:.22*scale,sz:.54*scale,color:[.13,.25,.17],emissive:.035});
  boxes.push({x:ox,y:(.52+maturity*.08)*scale,z:oz,sx:.26*scale,sy:(.24+maturity*.10)*scale,sz:.26*scale,color:[.22,.54,.36],emissive:.12});

  const proofs=[...agent.proofs].sort((a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||"")));
  const byCategory=new Map<string,OrbitProof[]>();
  proofs.forEach(p=>{const arr=byCategory.get(p.category)||[];arr.push(p);byCategory.set(p.category,arr)});

  Object.entries(CATEGORY_INDEX).forEach(([category,cat])=>{
    const lane=(cat/9)*Math.PI*2-.35;
    const items=byCategory.get(category)||[];
    const sr=.66*scale;

    boxes.push({
      x:ox+Math.cos(lane)*sr,y:.30*scale,z:oz+Math.sin(lane)*sr,
      sx:.12*scale,sy:.07*scale,sz:.12*scale,
      color:[.13,.24,.17],emissive:.025,ry:-lane,
    });

    items.forEach((p,j)=>{
      const radial=.76+(j%5)*.20;
      const tier=Math.floor(j/5);
      const sideways=(j%2===0?-.08:.08);
      const x=ox+Math.cos(lane)*(radial*scale)+Math.cos(lane+Math.PI/2)*(sideways*scale);
      const z=oz+Math.sin(lane)*(radial*scale)+Math.sin(lane+Math.PI/2)*(sideways*scale);
      const y=(.38+tier*.20+(j%3)*.035)*scale;
      const size=(p.status==="verified" ? .17 : .15)*scale;
      boxes.push({x,y,z,sx:size,sy:size,sz:size,color:statusColor(p),emissive:statusEmissive(p),ry:-lane});
      if(p.status==="verified"){
        boxes.push({x,y:y-.105*scale,z,sx:size*.58,sy:.028*scale,sz:size*.58,color:statusColor(p),emissive:.18,ry:-lane});
      }
    });
  });

  if(proofs.length===0){
    boxes.push({x:ox+.72*scale,y:.36*scale,z:oz,sx:.13*scale,sy:.13*scale,sz:.13*scale,color:[.28,.32,.42],emissive:.03});
  }

  if(detail){
    const signal=Math.min(9,Math.max(2,agent.verified+agent.pending));
    for(let i=0;i<signal;i++){
      const a=(i/signal)*Math.PI*2+.23*(i%3);
      const rr=(1.48+(i%2)*.11)*scale;
      boxes.push({
        x:ox+Math.cos(a)*rr,y:(.27+(i%3)*.075)*scale,z:oz+Math.sin(a)*rr,
        sx:.045*scale,sy:.045*scale,sz:.045*scale,
        color:i%4===0?GOLD:VIOLET,emissive:.42,
      });
    }
  }
  return boxes;
}

function layoutAgents(agents:OrbitBloomAgent[],single:boolean):Node[]{
  if(single) return agents.length?[{agent:agents[0],x:0,z:0,scale:1.90}]:[];
  const shown=agents.slice(0,14);
  if(shown.length<=1) return shown.map(agent=>({agent,x:0,z:0,scale:1.35}));
  return shown.map((agent,i)=>{
    const a=(i/shown.length)*Math.PI*2-.35;
    const ring=shown.length<=7?5.1:(i%2===0?4.9:7.2);
    const scale=shown.length<=7?1.28:.98;
    return {agent,x:Math.cos(a)*ring,z:Math.sin(a)*ring,scale};
  });
}

function sceneBoxes(agents:OrbitBloomAgent[],single:boolean):Box[]{
  const boxes:Box[]=[];
  if(single){
    boxes.push({x:0,y:-.16,z:0,sx:7.6,sy:.12,sz:7.6,color:[.035,.085,.055],emissive:.008});
    arcRing(boxes,0,0,2.55,.005,96,[.21,.55,.35],.07,1,.026);
    arcRing(boxes,0,0,3.25,.002,116,[.56,.42,.18],.045,1,.022);
  }else{
    boxes.push({x:0,y:-.18,z:0,sx:18.0,sy:.10,sz:18.0,color:[.03,.075,.05],emissive:.004});
    arcRing(boxes,0,0,4.15,.004,120,[.18,.52,.33],.065,1,.028);
    arcRing(boxes,0,0,6.45,.002,154,[.56,.42,.18],.045,1,.024);
    arcRing(boxes,0,0,8.25,.001,188,[.17,.48,.31],.035,1,.022);

    for(let i=0;i<3;i++){
      boxes.push({x:0,y:.05+i*.09,z:0,sx:2.15-i*.28,sy:.10,sz:2.15-i*.28,color:i===2?[.12,.24,.17]:[.10,.14,.22],emissive:.02});
    }
    radialPetals(boxes,0,0,1.45,16);
    boxes.push({x:0,y:.36,z:0,sx:.78,sy:.34,sz:.78,color:[.14,.27,.19],emissive:.05});
    boxes.push({x:0,y:.58,z:0,sx:.32,sy:.48,sz:.32,color:GOLD,emissive:.62});
    boxes.push({x:0,y:.88,z:0,sx:.22,sy:.22,sz:.22,color:GOLD,emissive:.90});
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
function m4World(b:Box){
  const a=b.ry??0,c=Math.cos(a),s=Math.sin(a);
  const m=m4Identity();
  m[0]=c*b.sx;m[2]=-s*b.sx;
  m[5]=b.sy;
  m[8]=s*b.sz;m[10]=c*b.sz;
  m[12]=b.x;m[13]=b.y;m[14]=b.z;
  return m;
}
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

    let yaw=-.62,pitch=single ? .44 : .50,zoom=single ? 11.6 : 23.8,dragging=false,lastX=0,lastY=0,moved=0,lastTime=performance.now(),raf=0;
    const resize=()=>{const dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h)}};
    const draw=(now:number)=>{
      resize();const dt=Math.min(40,now-lastTime);lastTime=now;if(autoRotate&&!dragging&&hoveredRef.current<0)yaw-=dt*.00005;
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const proj=m4Perspective(Math.PI/4.15,canvas.width/canvas.height,.1,140);
      const targetY=single ? .58 : .38;
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

  return <div className={"relative overflow-hidden bg-[#07130e] "+className}>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_47%,rgba(66,217,149,.18),transparent_30%),radial-gradient(circle_at_56%_40%,rgba(214,174,97,.10),transparent_19%),linear-gradient(180deg,#0d2418_0%,#091a12_46%,#050e0a_100%)]"/>
    <div className="pointer-events-none absolute inset-x-0 top-[44%] h-px bg-gradient-to-r from-transparent via-[#60e1a0]/20 to-transparent"/>
    <div className="pointer-events-none absolute -bottom-[20%] left-[8%] h-[48%] w-[84%] rounded-full bg-[#1d5134]/32 blur-[110px]"/><div className="pointer-events-none absolute left-1/2 top-[48%] h-[36%] w-[64%] -translate-x-1/2 rounded-full bg-[#42d995]/[0.07] blur-[70px]"/>
    <canvas ref={canvasRef} className={"relative block h-full w-full touch-none "+(active?"cursor-grabbing":hoverInfo?"cursor-pointer":"cursor-grab")}/>
    {hovered&&hoverInfo&&<div className="pointer-events-none absolute right-5 top-5 z-20 w-[260px] rounded-2xl border border-[#55e1a0]/25 bg-[#0d1624]/92 p-4 shadow-[0_22px_70px_rgba(0,0,0,.42),0_0_35px_rgba(66,217,149,.12)] backdrop-blur-xl">
      <div className="text-[9px] uppercase tracking-[.18em] text-[#73e5aa]">Reputation Bloom</div>
      <div className="mt-2 truncate text-sm font-medium text-[#f3eee6]">@{hovered.handle}</div>
      <div className="mt-4 grid grid-cols-4 gap-1.5 text-center">
        <Metric v={hovered.verified} l="verified" c="#42d995"/><Metric v={hovered.proofs.filter(p=>p.status==="verified"&&((p.verification_method||"").toUpperCase().includes("DETERMINISTIC")||(p.verification_method||"").toUpperCase().includes("ORACLE"))).length} l="elite" c="#d6ae61"/><Metric v={hovered.pending} l="pending" c="#8fe8ba"/><Metric v={hovered.rejected} l="failed" c="#ef4444"/>
      </div>
      <div className="mt-3 text-[9px] uppercase tracking-[.12em] text-[#d6ae61]">Click to open passport →</div>
    </div>}
    <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-white/[0.08] bg-[#07140e]/75 px-3 py-1.5 text-[9px] uppercase tracking-[.12em] text-[#879b8e] backdrop-blur-md">Auto orbit · drag · scroll to zoom</div>
  </div>
}
function Metric({v,l,c}:{v:number;l:string;c:string}){return <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-2"><span className="mx-auto mb-1 block h-1.5 w-1.5 rounded-full" style={{background:c}}/><div className="text-xs text-[#eee9e1]">{v}</div><div className="mt-1 text-[6px] uppercase tracking-[.09em] text-[#718095]">{l}</div></div>}
