"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ProofCityAgent = {
  id: string;
  handle: string;
  ageDays: number;
  attempted: number;
  verified: number;
  pending: number;
  rejected: number;
  dominantCategory: string | null;
  categories: Array<{
    category: string;
    attempted: number;
    verified: number;
    confidence: string;
  }>;
};

const CATEGORY_COLORS: Record<string, [number, number, number]> = {
  identity: [0.70, 0.73, 0.82],
  skill: [0.53, 0.43, 0.94],
  work: [0.36, 0.63, 0.82],
  performance: [0.66, 0.49, 0.96],
  economic_activity: [0.35, 0.69, 0.58],
  financial_performance: [0.88, 0.66, 0.32],
  prediction: [0.58, 0.44, 1.0],
  autonomy: [0.38, 0.73, 0.62],
  longevity: [0.66, 0.61, 0.52],
};

const CONFIDENCE: Record<string, number> = {
  DETERMINISTICALLY_VERIFIED: 1,
  ORACLE_VERIFIED: 0.92,
  MULTI_VALIDATOR_VERIFIED: 0.82,
  COUNTERPARTY_CONFIRMED: 0.62,
  SELF_REPORTED: 0.34,
  INSUFFICIENT: 0.18,
};

type Box = {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: [number, number, number];
  emissive: number;
};

type SceneAgent = {
  agent: ProofCityAgent;
  x: number;
  z: number;
  scale: number;
};

function clamp(v: number, a = 0, b = 1) {
  return Math.max(a, Math.min(b, v));
}

function volume(n: number) {
  return clamp(Math.log1p(n) / Math.log(101));
}

function saturate(c: [number, number, number], amount: number): [number, number, number] {
  const avg = (c[0] + c[1] + c[2]) / 3;
  return [clamp(avg + (c[0] - avg) * amount), clamp(avg + (c[1] - avg) * amount), clamp(avg + (c[2] - avg) * amount)];
}

function cityForAgent(agent: ProofCityAgent, ox: number, oz: number, scale = 1, landmark = false): Box[] {
  const boxes: Box[] = [];
  const age = Math.max(1, Math.min(7, Math.ceil(agent.ageDays / 45)));

  // Contact shadow + readable slate foundation — kept compact so it never dominates the frame.
  boxes.push({x:ox+.2*scale,y:.015,z:oz+.24*scale,sx:3.0*scale,sy:.02,sz:2.7*scale,color:[.015,.02,.032],emissive:0});
  for (let r = 0; r < age + 2; r++) {
    const side = (2.6 - r * 0.17) * scale;
    boxes.push({
      x: ox,
      y: 0.07 + r * 0.075,
      z: oz,
      sx: side,
      sy: 0.1 * scale,
      sz: side,
      color: r === age + 1 ? [0.16, 0.20, 0.30] : [0.11, 0.15, 0.23],
      emissive: r === age + 1 ? 0.035 : 0.01,
    });
  }

  if (!landmark) {
    // Corner pylons: neutral = slate, verified = violet, elite = gold, failed = red.
    const corner = 0.98 * scale;
    [[-corner,-corner],[corner,-corner],[-corner,corner],[corner,corner]].forEach(([dx,dz],i)=>{
      const h=(0.62 + age * 0.07 + (agent.verified>0 && i%2===0 ? 0.2 : 0)) * scale;
      boxes.push({x:ox+dx,y:0.3+h/2,z:oz+dz,sx:0.26*scale,sy:h,sz:0.26*scale,color:[0.14,0.18,0.28],emissive:0.025});
      boxes.push({x:ox+dx,y:0.34+h,z:oz+dz,sx:0.13*scale,sy:0.12*scale,sz:0.13*scale,color:i%2?[0.88,0.66,0.32]:[0.58,0.44,1],emissive:0.58});
    });
  }

  const cats = agent.categories.length ? agent.categories : [{ category: "identity", attempted: 0, verified: 0, confidence: "INSUFFICIENT" }];
  const allCategories = Object.keys(CATEGORY_COLORS);
  allCategories.slice(0, 9).forEach((category, i) => {
    const c = cats.find((item)=>item.category===category) ?? { category, attempted:0, verified:0, confidence:"INSUFFICIENT" };
    const d = volume(c.attempted);
    const color = landmark ? saturate(CATEGORY_COLORS[c.category] ?? [0.52, 0.45, 0.78], 1.7) : (CATEGORY_COLORS[c.category] ?? [0.52, 0.45, 0.78]);
    const ratio = c.attempted ? c.verified / c.attempted : 0;
    const conf = CONFIDENCE[c.confidence] ?? 0.18;

    // Landmark: a tight radial cluster hugging the dominant centre spire — true volume on every side, not a flat row.
    const angle = (i / 9) * Math.PI * 2;
    const radius = landmark ? 0.46 : 0.88 + (i % 2) * 0.27;
    const height = landmark ? (0.55 + d * 2.0) * scale : (0.58 + d * 3.55) * scale;
    const width = landmark ? (0.22 + d * 0.11) * scale : (0.26 + d * 0.34) * scale;
    const x = ox + Math.cos(angle) * radius * scale;
    const z = oz + Math.sin(angle) * radius * scale;

    const tiers = Math.max(2, Math.min(9, Math.ceil(2 + d * 7)));
    for (let t = 0; t < tiers; t++) {
      const th = height / tiers;
      const taper = 1 - (t / tiers) * 0.32;
      const lit = c.attempted > 0 && t / tiers < ratio;
      boxes.push({
        x,
        y: 0.38 + t * th + th / 2,
        z,
        sx: width * taper,
        sy: Math.max(0.11, th * 0.86),
        sz: width * taper,
        color: lit ? color : [0.14, 0.18, 0.28],
        emissive: lit ? (landmark ? 0.46 + conf * 0.85 : 0.30 + conf * 0.60) : 0.018,
      });
    }

    // Verified proof pixels make reputation discrete and visible.
    const pixels = Math.min(14, c.verified);
    for(let p=0;p<pixels;p++){
      const px=x + (((p%3)-1)*0.17)*scale;
      const pz=z + ((((p*2)%3)-1)*0.15)*scale;
      const py=0.48 + height + (p%5)*0.078*scale;
      boxes.push({x:px,y:py,z:pz,sx:0.075*scale,sy:0.075*scale,sz:0.075*scale,color,emissive:landmark?0.95:0.78});
    }

    if (agent.pending > 0 && i === 0) {
      boxes.push({x,y:0.44+height+0.14,z,sx:width*.78,sy:.12*scale,sz:width*.78,color:[.71,.64,1],emissive:.28});
    }
    if (agent.rejected > 0 && i === 1) {
      boxes.push({x:x+.16*scale,y:.42+height*.42,z:z+.12*scale,sx:width*.35,sy:.10*scale,sz:width*1.18,color:[.95,.22,.28],emissive:.34});
    }
  });

  // The crown: one dominant centre spire, always the tallest mass in the structure.
  // A single glowing gold shaft (nesting a dimmer box inside a wider one made it invisible — fully occluded), a
  // violet collar band wider than the shaft so it actually protrudes, and a violet tip above the shaft's top.
  const coreHeight = (landmark ? 3.6 : 1.24) + volume(agent.verified + agent.attempted) * (landmark ? 5.6 : 3.45);
  const ch=coreHeight*scale;
  const shaftW=(landmark?.4:.46)*scale;
  boxes.push({x:ox,y:.50+ch/2,z:oz,sx:shaftW,sy:ch,sz:shaftW,color:[.95,.74,.38],emissive:landmark?.85:.55});
  boxes.push({x:ox,y:.50+ch*.62,z:oz,sx:shaftW*1.3,sy:ch*.04,sz:shaftW*1.3,color:[.66,.48,1],emissive:landmark?1.0:.75});
  boxes.push({x:ox,y:.50+ch+.20,z:oz,sx:(landmark?.22:.24)*scale,sy:(landmark?.34:.28)*scale,sz:(landmark?.22:.24)*scale,color:[.66,.48,1],emissive:landmark?1.15:.92});

  const bridgeCount=Math.max(4,Math.min(18,agent.attempted+agent.verified+4));
  for(let i=0;i<bridgeCount;i++){
    const a=(i/bridgeCount)*Math.PI*2;
    const rr=(landmark?0.78+(i%3)*.09:1.72+(i%3)*.12)*scale;
    boxes.push({
      x:ox+Math.cos(a)*rr,
      y:(.34+(i%2)*.075)*scale,
      z:oz+Math.sin(a)*rr,
      sx:.085*scale,sy:.085*scale,sz:.085*scale,
      color:i%2?[.95,.74,.38]:[.66,.48,1],
      emissive:landmark?.85:.54,
    });
  }
  return boxes;
}

function layoutAgents(agents: ProofCityAgent[], single: boolean): SceneAgent[] {
  if (single) return agents.length ? [{agent:agents[0],x:0,z:0,scale:1.5}] : [];
  return agents.slice(0,28).map((agent,i)=>{
    const ring=i===0?0:Math.ceil(Math.sqrt(i));
    const angle=i*2.399963229728653;
    const radius=i===0?0:3.5+ring*2.15;
    return {agent,x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,scale:i<4?1.08:.84};
  });
}

function sceneBoxes(agents: ProofCityAgent[], single: boolean, landmark: boolean): Box[] {
  const layout=layoutAgents(agents,single);
  const boxes:Box[]=[];
  if(!single){
    // Shared ground plane + luminous guide strips = readable horizon/surface.
    boxes.push({x:0,y:-.09,z:0,sx:34,sy:.12,sz:28,color:[.08,.12,.19],emissive:.01});
    for(let i=-5;i<=5;i++){
      boxes.push({x:i*2.5,y:-.015,z:0,sx:.025,sy:.02,sz:25,color:[.18,.22,.34],emissive:.04});
      boxes.push({x:0,y:-.014,z:i*2.25,sx:30,sy:.02,sz:.025,color:[.20,.17,.36],emissive:.035});
    }
  } else {
    boxes.push({x:0,y:-.09,z:0,sx:12,sy:.12,sz:10,color:[.08,.12,.19],emissive:.01});
    boxes.push({x:0,y:-.01,z:0,sx:9.6,sy:.025,sz:.05,color:[.88,.66,.32],emissive:.12});
    boxes.push({x:0,y:-.009,z:0,sx:.05,sy:.025,sz:8.6,color:[.58,.44,1],emissive:.10});
  }
  layout.forEach((item)=>boxes.push(...cityForAgent(item.agent,item.x,item.z,item.scale,landmark)));
  return boxes;
}

const VS = `
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

const FS = `
precision mediump float;
uniform vec3 u_color;
uniform float u_emissive;
uniform vec3 u_light;
varying vec3 v_normal;
varying vec3 v_worldPos;
void main(){
  vec3 n=normalize(v_normal);
  float d=max(dot(n,normalize(u_light)),0.0);
  float hemi=.30+.18*max(n.y,0.0);
  float rim=pow(1.0-max(dot(n,normalize(vec3(.15,.35,.92))),0.0),2.0)*.16;
  float heightGlow=clamp(v_worldPos.y/8.0,0.0,1.0)*.08;
  float shade=hemi+d*.58+rim+heightGlow+u_emissive;
  vec3 c=u_color*shade;
  gl_FragColor=vec4(c,1.0);
}
`;

const cubePositions = new Float32Array([
  -1,-1, 1,  1,-1, 1,  1, 1, 1, -1,-1, 1,  1, 1, 1, -1, 1, 1,
   1,-1,-1, -1,-1,-1, -1, 1,-1,  1,-1,-1, -1, 1,-1,  1, 1,-1,
  -1, 1, 1,  1, 1, 1,  1, 1,-1, -1, 1, 1,  1, 1,-1, -1, 1,-1,
  -1,-1,-1,  1,-1,-1,  1,-1, 1, -1,-1,-1,  1,-1, 1, -1,-1, 1,
   1,-1, 1,  1,-1,-1,  1, 1,-1,  1,-1, 1,  1, 1,-1,  1, 1, 1,
  -1,-1,-1, -1,-1, 1, -1, 1, 1, -1,-1,-1, -1, 1, 1, -1, 1,-1,
].map(v=>v*0.5));

const cubeNormals = new Float32Array([
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
function transformPoint(m:Float32Array,p:[number,number,number]){const [x,y,z]=p;return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14],m[3]*x+m[7]*y+m[11]*z+m[15]]}
function shader(gl:WebGLRenderingContext,type:number,src:string){const s=gl.createShader(type)!;gl.shaderSource(s,src);gl.compileShader(s);return s}
function program(gl:WebGLRenderingContext){const p=gl.createProgram()!;gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,VS));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,FS));gl.linkProgram(p);return p}

export function ProofCity3D({
  agents,
  single=false,
  landmark=false,
  autoRotate=false,
  hoverInfo=false,
  background=true,
  className="",
}:{
  agents:ProofCityAgent[];
  single?:boolean;
  landmark?:boolean;
  autoRotate?:boolean;
  hoverInfo?:boolean;
  background?:boolean;
  className?:string;
}) {
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const pointerRef=useRef({x:-9999,y:-9999,inside:false});
  const hoveredRef=useRef(-1);
  const zoomControlRef=useRef<{in:()=>void;out:()=>void}|null>(null);
  const [active,setActive]=useState(false);
  const [hovered,setHovered]=useState<ProofCityAgent|null>(null);
  const layout=useMemo(()=>layoutAgents(agents,single),[agents,single]);
  const boxes=useMemo(()=>sceneBoxes(agents,single,landmark),[agents,single,landmark]);

  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const gl=canvas.getContext("webgl",{antialias:true,alpha:true});if(!gl)return;
    const p=program(gl);gl.useProgram(p);
    const pos=gl.getAttribLocation(p,"a_position"),normal=gl.getAttribLocation(p,"a_normal");
    const matrixLoc=gl.getUniformLocation(p,"u_matrix"),worldLoc=gl.getUniformLocation(p,"u_world"),colorLoc=gl.getUniformLocation(p,"u_color"),emissiveLoc=gl.getUniformLocation(p,"u_emissive"),lightLoc=gl.getUniformLocation(p,"u_light");
    const pb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,cubePositions,gl.STATIC_DRAW);gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,3,gl.FLOAT,false,0,0);
    const nb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,nb);gl.bufferData(gl.ARRAY_BUFFER,cubeNormals,gl.STATIC_DRAW);gl.enableVertexAttribArray(normal);gl.vertexAttribPointer(normal,3,gl.FLOAT,false,0,0);
    gl.uniform3f(lightLoc,-.35,.95,.48);
    gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.clearColor(0,0,0,0);

    let yaw=-0.68,pitch=single ? .52 : .64,zoom=single?(landmark?13.6:11.8):25.5;
    let dragging=false,lastX=0,lastY=0,raf=0,moved=0,lastTime=performance.now();
    let buildStart:number|null=null;
    const maxTop=landmark?Math.max(1,...boxes.map(b=>b.y+b.sy/2)):1;
    const zoomMin=single?7.5:13,zoomMax=single?(landmark?22:18):40,zoomStep=(zoomMax-zoomMin)*.12;
    zoomControlRef.current={
      in:()=>{zoom=clamp(zoom-zoomStep,zoomMin,zoomMax)},
      out:()=>{zoom=clamp(zoom+zoomStep,zoomMin,zoomMax)},
    };

    const resize=()=>{
      const dpr=Math.min(window.devicePixelRatio||1,2);
      const w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h)}
    };

    const draw=(now:number)=>{
      resize();
      const dt=Math.min(40,now-lastTime);lastTime=now;
      if(autoRotate&&!dragging&&hoveredRef.current<0) yaw-=dt*.000055;
      if(landmark&&buildStart===null) buildStart=now;
      const buildT=landmark?clamp(((now-(buildStart??now))/1700),0,1):1;
      const buildEase=1-Math.pow(1-buildT,3);

      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const aspect=canvas.width/canvas.height;
      const proj=m4Perspective(Math.PI/4.15,aspect,.1,140);
      const targetY=single?(landmark?2.5:1.8):1.0;
      const eye=[Math.cos(yaw)*Math.cos(pitch)*zoom,Math.sin(pitch)*zoom,Math.sin(yaw)*Math.cos(pitch)*zoom];
      const view=m4LookAt(eye,[0,targetY,0],[0,1,0]);
      const vp=m4Multiply(proj,view);
      gl.uniformMatrix4fv(matrixLoc,false,vp);
      boxes.forEach(b=>{
        let wb=b;
        if(landmark){
          const bottom=b.y-b.sy/2;
          const delay=clamp(bottom/maxTop,0,1)*0.55;
          const local=clamp((buildEase-delay)/Math.max(0.0001,1-delay),0,1);
          if(local<=0) return;
          const sy=Math.max(0.001,b.sy*local);
          wb={...b,sy,y:bottom+sy/2};
        }
        gl.uniformMatrix4fv(worldLoc,false,m4World(wb));gl.uniform3f(colorLoc,wb.color[0],wb.color[1],wb.color[2]);gl.uniform1f(emissiveLoc,wb.emissive);gl.drawArrays(gl.TRIANGLES,0,36);
      });

      if(hoverInfo&&!single&&pointerRef.current.inside){
        const rect=canvas.getBoundingClientRect();
        let best=-1,bestD=68;
        layout.forEach((item,i)=>{
          const clip=transformPoint(vp,[item.x,2.0*item.scale,item.z]);
          if(clip[3]<=0)return;
          const sx=(clip[0]/clip[3]*.5+.5)*rect.width;
          const sy=(1-(clip[1]/clip[3]*.5+.5))*rect.height;
          const d=Math.hypot(pointerRef.current.x-sx,pointerRef.current.y-sy);
          if(d<bestD){bestD=d;best=i}
        });
        if(best!==hoveredRef.current){
          hoveredRef.current=best;
          setHovered(best>=0?layout[best].agent:null);
        }
      }
      raf=requestAnimationFrame(draw);
    };

    const down=(e:PointerEvent)=>{dragging=true;moved=0;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);setActive(true)};
    const move=(e:PointerEvent)=>{
      const rect=canvas.getBoundingClientRect();
      pointerRef.current={x:e.clientX-rect.left,y:e.clientY-rect.top,inside:true};
      if(!dragging)return;
      const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;moved+=Math.abs(dx)+Math.abs(dy);
      yaw-=dx*.008;pitch=clamp(pitch-dy*.006,.18,1.18);
    };
    const up=()=>{
      if(dragging&&moved<6&&hoverInfo&&hoveredRef.current>=0&&!single){
        const a=layout[hoveredRef.current]?.agent;
        if(a) window.location.href="/agents/"+encodeURIComponent(a.handle);
      }
      dragging=false;setActive(false)
    };
    const leave=()=>{pointerRef.current.inside=false;if(!dragging){hoveredRef.current=-1;setHovered(null)}};
    const wheel=(e:WheelEvent)=>{e.preventDefault();zoom=clamp(zoom+e.deltaY*.012,zoomMin,zoomMax)};

    canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",up);canvas.addEventListener("pointerleave",leave);canvas.addEventListener("wheel",wheel,{passive:false});
    raf=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(raf);canvas.removeEventListener("pointerdown",down);canvas.removeEventListener("pointermove",move);canvas.removeEventListener("pointerup",up);canvas.removeEventListener("pointercancel",up);canvas.removeEventListener("pointerleave",leave);canvas.removeEventListener("wheel",wheel)};
  },[boxes,layout,single,landmark,autoRotate,hoverInfo]);

  return (
    <div className={"relative overflow-hidden "+(background?"bg-[#101827] ":"")+className}>
      {background&&<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#152033_0%,#101827_46%,#0b121d_100%)]"/>}
      <div className="pointer-events-none absolute inset-x-0 top-[42%] h-px bg-gradient-to-r from-transparent via-[#9b8cff]/20 to-transparent"/>
      <div className="pointer-events-none absolute inset-x-[-10%] top-[37%] h-[24%] bg-[radial-gradient(ellipse_at_center,rgba(214,174,97,.11),rgba(139,114,255,.08)_34%,transparent_72%)] blur-2xl"/>
      <div className="pointer-events-none absolute -bottom-[22%] left-[12%] h-[52%] w-[76%] rounded-full bg-[#243453]/30 blur-[90px]"/>
      {landmark&&<div className="pointer-events-none absolute left-1/2 top-[38%] h-[46%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,196,92,.26),rgba(155,124,255,.20)_42%,transparent_72%)] blur-[55px] mix-blend-screen"/>}
      <canvas ref={canvasRef} className={"relative block h-full w-full touch-none "+(active?"cursor-grabbing":hoverInfo?"cursor-pointer":"cursor-grab")}/>

      {hovered&&hoverInfo&&<div className="pointer-events-none absolute right-5 top-5 z-20 w-[250px] rounded-[3px] border border-[#9b8cff]/25 bg-[#0d1624]/92 p-4 shadow-[0_22px_70px_rgba(0,0,0,.42),0_0_35px_rgba(139,114,255,.12)] backdrop-blur-xl">
        <div className="text-[9px] uppercase tracking-[.18em] text-[#9f8cff]">Agent detected</div>
        <div className="mt-2 truncate text-sm font-medium text-[#f3eee6]">@{hovered.handle}</div>
        <div className="mt-1 text-[11px] text-[#8f9caf]">{hovered.dominantCategory?.replaceAll("_"," ")??"Unproven"}</div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-[2px] border border-white/[0.06] bg-white/[0.025] p-2"><div className="text-sm">{hovered.verified}</div><div className="mt-1 text-[7px] uppercase tracking-[.11em] text-[#718095]">verified</div></div>
          <div className="rounded-[2px] border border-white/[0.06] bg-white/[0.025] p-2"><div className="text-sm">{hovered.attempted}</div><div className="mt-1 text-[7px] uppercase tracking-[.11em] text-[#718095]">attempts</div></div>
          <div className="rounded-[2px] border border-white/[0.06] bg-white/[0.025] p-2"><div className="text-sm">{hovered.ageDays}d</div><div className="mt-1 text-[7px] uppercase tracking-[.11em] text-[#718095]">age</div></div>
        </div>
        <div className="mt-3 text-[9px] uppercase tracking-[.12em] text-[#d6ae61]">Click to open passport →</div>
      </div>}

      {background&&<div className="pointer-events-none absolute bottom-4 left-4 rounded-[2px] border border-white/[0.08] bg-[#0b121d]/75 px-3 py-1.5 text-[9px] uppercase tracking-[.12em] text-[#8794a8] backdrop-blur-md">
        {autoRotate?"Auto orbit · ":""}Drag to orbit · Scroll to zoom
      </div>}

      {background&&<div className="absolute bottom-4 right-4 flex flex-col overflow-hidden rounded-[2px] border border-white/[0.08] bg-[#0b121d]/75 backdrop-blur-md">
        <button type="button" aria-label="Zoom in" onClick={()=>zoomControlRef.current?.in()} className="grid h-8 w-8 place-items-center text-[#d9dfe8] transition hover:bg-white/[0.08]">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
        </button>
        <div className="h-px w-full bg-white/[0.08]"/>
        <button type="button" aria-label="Zoom out" onClick={()=>zoomControlRef.current?.out()} className="grid h-8 w-8 place-items-center text-[#d9dfe8] transition hover:bg-white/[0.08]">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 8h10"/></svg>
        </button>
      </div>}
    </div>
  );
}
