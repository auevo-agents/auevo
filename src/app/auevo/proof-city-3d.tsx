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
  identity: [0.78, 0.70, 0.55],
  skill: [0.49, 0.38, 0.92],
  work: [0.31, 0.58, 0.78],
  performance: [0.63, 0.45, 0.95],
  economic_activity: [0.28, 0.68, 0.55],
  financial_performance: [0.84, 0.62, 0.27],
  prediction: [0.56, 0.39, 1.0],
  autonomy: [0.32, 0.72, 0.58],
  longevity: [0.58, 0.52, 0.43],
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

function clamp(v: number, a = 0, b = 1) {
  return Math.max(a, Math.min(b, v));
}

function volume(n: number) {
  return clamp(Math.log1p(n) / Math.log(101));
}

function cityForAgent(agent: ProofCityAgent, ox: number, oz: number, scale = 1): Box[] {
  const boxes: Box[] = [];
  const age = Math.max(1, Math.min(7, Math.ceil(agent.ageDays / 45)));

  // Foundation terraces: identity age is always visible, even before the first Proof.
  for (let r = 0; r < age + 2; r++) {
    const side = (3.7 - r * 0.22) * scale;
    boxes.push({
      x: ox,
      y: 0.06 + r * 0.085,
      z: oz,
      sx: side,
      sy: 0.11 * scale,
      sz: side,
      color: r === age + 1 ? [0.12, 0.15, 0.22] : [0.07, 0.10, 0.16],
      emissive: r === age + 1 ? 0.03 : 0,
    });
  }

  // Architectural corner pylons make the identity readable before it has a large history.
  const corner = 1.34 * scale;
  [[-corner,-corner],[corner,-corner],[-corner,corner],[corner,corner]].forEach(([dx,dz],i)=>{
    const h=(0.52 + age * 0.07 + (agent.verified>0 && i%2===0 ? 0.22 : 0)) * scale;
    boxes.push({x:ox+dx,y:0.28+h/2,z:oz+dz,sx:0.28*scale,sy:h,sz:0.28*scale,color:[0.10,0.13,0.20],emissive:0.02});
    boxes.push({x:ox+dx,y:0.31+h,z:oz+dz,sx:0.13*scale,sy:0.12*scale,sz:0.13*scale,color:i%2?[0.86,0.63,0.28]:[0.56,0.39,1],emissive:0.52});
  });

  const cats = agent.categories.length ? agent.categories : [{ category: "identity", attempted: 0, verified: 0, confidence: "INSUFFICIENT" }];
  const allCategories = Object.keys(CATEGORY_COLORS);
  allCategories.slice(0, 9).forEach((category, i) => {
    const c = cats.find((item)=>item.category===category) ?? { category, attempted:0, verified:0, confidence:"INSUFFICIENT" };
    const angle = (i / 9) * Math.PI * 2;
    const radius = 0.83 + (i % 2) * 0.27;
    const d = volume(c.attempted);
    const height = (0.46 + d * 3.45) * scale;
    const width = (0.23 + d * 0.34) * scale;
    const x = ox + Math.cos(angle) * radius * scale;
    const z = oz + Math.sin(angle) * radius * scale;
    const color = CATEGORY_COLORS[c.category] ?? [0.52, 0.45, 0.78];
    const ratio = c.attempted ? c.verified / c.attempted : 0;
    const conf = CONFIDENCE[c.confidence] ?? 0.18;
    const tiers = Math.max(2, Math.min(8, Math.ceil(2 + d * 6)));

    for (let t = 0; t < tiers; t++) {
      const th = height / tiers;
      const taper = 1 - (t / tiers) * 0.30;
      const lit = c.attempted > 0 && t / tiers < ratio;
      boxes.push({
        x,
        y: 0.34 + t * th + th / 2,
        z,
        sx: width * taper,
        sy: Math.max(0.10, th * 0.86),
        sz: width * taper,
        color: lit ? color : [0.075, 0.095, 0.145],
        emissive: lit ? 0.28 + conf * 0.58 : 0.012,
      });
    }

    // Tiny proof pixels make growth visibly discrete.
    const pixels = Math.min(10, c.verified);
    for(let p=0;p<pixels;p++){
      const px=x + (((p%3)-1)*0.16)*scale;
      const pz=z + ((((p*2)%3)-1)*0.14)*scale;
      const py=0.42 + height + (p%4)*0.075*scale;
      boxes.push({x:px,y:py,z:pz,sx:0.07*scale,sy:0.07*scale,sz:0.07*scale,color,emissive:0.72});
    }

    if (agent.pending > 0 && i === 0) {
      boxes.push({x,y:0.38+height+0.13,z,sx:width*.76,sy:.12*scale,sz:width*.76,color,emissive:.38});
    }
    if (agent.rejected > 0 && i === 1) {
      boxes.push({x:x+.16*scale,y:.38+height*.42,z:z+.12*scale,sx:width*.34,sy:.10*scale,sz:width*1.15,color:[.90,.18,.25],emissive:.28});
    }
  });

  const coreHeight = (1.12 + volume(agent.verified + agent.attempted) * 3.3) * scale;
  boxes.push({x:ox,y:.42+coreHeight/2,z:oz,sx:.58*scale,sy:coreHeight,sz:.58*scale,color:[.10,.13,.20],emissive:.02});
  boxes.push({x:ox,y:.42+coreHeight*.58,z:oz,sx:.36*scale,sy:coreHeight*.75,sz:.36*scale,color:[.88,.65,.29],emissive:.54});
  boxes.push({x:ox,y:.42+coreHeight+.18,z:oz,sx:.25*scale,sy:.28*scale,sz:.25*scale,color:[.60,.42,1],emissive:.86});

  // Gold/violet bridge pixels are derived from total verified/attempted history.
  const bridgeCount=Math.max(2,Math.min(14,agent.attempted+agent.verified+2));
  for(let i=0;i<bridgeCount;i++){
    const a=(i/bridgeCount)*Math.PI*2;
    const rr=(1.55+(i%3)*.12)*scale;
    boxes.push({
      x:ox+Math.cos(a)*rr,
      y:(.30+(i%2)*.07)*scale,
      z:oz+Math.sin(a)*rr,
      sx:.08*scale,sy:.08*scale,sz:.08*scale,
      color:i%2?[.84,.62,.27]:[.56,.39,1],
      emissive:.48,
    });
  }
  return boxes;
}
function sceneBoxes(agents: ProofCityAgent[], single: boolean): Box[] {
  if (single) return agents.length ? cityForAgent(agents[0], 0, 0, 1.55) : [];
  const boxes: Box[] = [];
  const shown = agents.slice(0, 28);
  shown.forEach((agent, i) => {
    const ring = i === 0 ? 0 : Math.ceil(Math.sqrt(i));
    const angle = i * 2.399963229728653;
    const radius = i === 0 ? 0 : 3.1 + ring * 2.0;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const s = i < 4 ? 1.05 : 0.82;
    boxes.push(...cityForAgent(agent, x, z, s));
  });
  return boxes;
}

const VS = `
attribute vec3 a_position;
attribute vec3 a_normal;
uniform mat4 u_matrix;
uniform mat4 u_world;
varying vec3 v_normal;
void main(){
  gl_Position = u_matrix * u_world * vec4(a_position,1.0);
  v_normal = mat3(u_world) * a_normal;
}
`;

const FS = `
precision mediump float;
uniform vec3 u_color;
uniform float u_emissive;
uniform vec3 u_light;
varying vec3 v_normal;
void main(){
  vec3 n=normalize(v_normal);
  float d=max(dot(n,normalize(u_light)),0.0);
  float shade=0.24+d*0.68+u_emissive;
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

function m4Identity() {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}
function m4Multiply(a: Float32Array,b: Float32Array){
  const o=new Float32Array(16);
  for(let r=0;r<4;r++) for(let c=0;c<4;c++) o[c*4+r]=a[0*4+r]*b[c*4+0]+a[1*4+r]*b[c*4+1]+a[2*4+r]*b[c*4+2]+a[3*4+r]*b[c*4+3];
  return o;
}
function m4Perspective(fov:number,aspect:number,near:number,far:number){
  const f=1/Math.tan(fov/2), nf=1/(near-far);
  return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
}
function v3Normalize(v:number[]){const l=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l]}
function v3Cross(a:number[],b:number[]){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function v3Sub(a:number[],b:number[]){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]}
function m4LookAt(eye:number[],target:number[],up:number[]){
  const z=v3Normalize(v3Sub(eye,target)), x=v3Normalize(v3Cross(up,z)), y=v3Cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),-(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),-(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]),1]);
}
function m4World(b:Box){
  const m=m4Identity();
  m[0]=b.sx;m[5]=b.sy;m[10]=b.sz;m[12]=b.x;m[13]=b.y;m[14]=b.z;
  return m;
}
function shader(gl:WebGLRenderingContext,type:number,src:string){const s=gl.createShader(type)!;gl.shaderSource(s,src);gl.compileShader(s);return s}
function program(gl:WebGLRenderingContext){
  const p=gl.createProgram()!;gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,VS));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,FS));gl.linkProgram(p);return p;
}

export function ProofCity3D({
  agents,
  single=false,
  className="",
}:{
  agents:ProofCityAgent[];
  single?:boolean;
  className?:string;
}) {
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const boxes=useMemo(()=>sceneBoxes(agents,single),[agents,single]);
  const [active,setActive]=useState(false);

  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const gl=canvas.getContext("webgl",{antialias:true,alpha:true});if(!gl)return;
    const p=program(gl);gl.useProgram(p);
    const pos=gl.getAttribLocation(p,"a_position"), normal=gl.getAttribLocation(p,"a_normal");
    const matrixLoc=gl.getUniformLocation(p,"u_matrix"),worldLoc=gl.getUniformLocation(p,"u_world"),colorLoc=gl.getUniformLocation(p,"u_color"),emissiveLoc=gl.getUniformLocation(p,"u_emissive"),lightLoc=gl.getUniformLocation(p,"u_light");
    const pb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,cubePositions,gl.STATIC_DRAW);gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,3,gl.FLOAT,false,0,0);
    const nb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,nb);gl.bufferData(gl.ARRAY_BUFFER,cubeNormals,gl.STATIC_DRAW);gl.enableVertexAttribArray(normal);gl.vertexAttribPointer(normal,3,gl.FLOAT,false,0,0);
    gl.uniform3f(lightLoc,0.45,0.9,0.35);
    gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.clearColor(0,0,0,0);

    let yaw=-0.65,pitch=single?0.58:0.72,zoom=single?11.5:24;
    let dragging=false,lastX=0,lastY=0,raf=0;

    const resize=()=>{
      const dpr=Math.min(window.devicePixelRatio||1,2);
      const w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h)}
    };
    const draw=()=>{
      resize();gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const aspect=canvas.width/canvas.height;
      const proj=m4Perspective(Math.PI/4.2,aspect,.1,120);
      const eye=[Math.cos(yaw)*Math.cos(pitch)*zoom,Math.sin(pitch)*zoom,Math.sin(yaw)*Math.cos(pitch)*zoom];
      const view=m4LookAt(eye,[0,single?1.5:0.9,0],[0,1,0]);
      const vp=m4Multiply(proj,view);
      gl.uniformMatrix4fv(matrixLoc,false,vp);
      boxes.forEach(b=>{gl.uniformMatrix4fv(worldLoc,false,m4World(b));gl.uniform3f(colorLoc,b.color[0],b.color[1],b.color[2]);gl.uniform1f(emissiveLoc,b.emissive);gl.drawArrays(gl.TRIANGLES,0,36)});
      raf=requestAnimationFrame(draw);
    };
    const down=(e:PointerEvent)=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);setActive(true)};
    const move=(e:PointerEvent)=>{if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;yaw-=dx*.008;pitch=clamp(pitch-dy*.006,.18,1.2)};
    const up=()=>{dragging=false;setActive(false)};
    const wheel=(e:WheelEvent)=>{e.preventDefault();zoom=clamp(zoom+e.deltaY*.012,single?7:12,single?18:38)};
    canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",up);canvas.addEventListener("wheel",wheel,{passive:false});
    draw();
    return()=>{cancelAnimationFrame(raf);canvas.removeEventListener("pointerdown",down);canvas.removeEventListener("pointermove",move);canvas.removeEventListener("pointerup",up);canvas.removeEventListener("pointercancel",up);canvas.removeEventListener("wheel",wheel)};
  },[boxes,single]);

  return (
    <div className={"relative overflow-hidden bg-[#0b111a] "+className}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(139,114,255,.18),transparent_35%),radial-gradient(circle_at_65%_18%,rgba(214,174,97,.12),transparent_24%)]"/>
      <canvas ref={canvasRef} className={"relative block h-full w-full touch-none "+(active?"cursor-grabbing":"cursor-grab")}/>
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-white/[0.07] bg-black/35 px-3 py-1.5 text-[9px] uppercase tracking-[.12em] text-[#7e8793] backdrop-blur-md">
        Drag to orbit · Scroll to zoom
      </div>
    </div>
  );
}
