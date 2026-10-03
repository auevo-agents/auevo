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
  const age = Math.max(1, Math.min(7, Math.ceil(agent.ageDays / 60)));
  for (let r = 0; r < age; r++) {
    const side = (3.3 + r * 0.26) * scale;
    const y = 0.08 + r * 0.09;
    boxes.push({ x: ox, y, z: oz, sx: side, sy: 0.12 * scale, sz: side, color: [0.10, 0.11, 0.13], emissive: 0 });
  }

  const cats = agent.categories.length ? agent.categories : [{ category: "identity", attempted: 0, verified: 0, confidence: "INSUFFICIENT" }];
  cats.slice(0, 9).forEach((c, i) => {
    const angle = (i / 9) * Math.PI * 2;
    const radius = 0.82 + (i % 2) * 0.24;
    const d = volume(c.attempted);
    const height = (0.34 + d * 2.9) * scale;
    const width = (0.24 + d * 0.28) * scale;
    const x = ox + Math.cos(angle) * radius * scale;
    const z = oz + Math.sin(angle) * radius * scale;
    const color = CATEGORY_COLORS[c.category] ?? [0.52, 0.45, 0.78];
    const ratio = c.attempted ? c.verified / c.attempted : 0;
    const conf = CONFIDENCE[c.confidence] ?? 0.18;
    const tiers = Math.max(1, Math.min(6, Math.ceil(1 + d * 5)));

    for (let t = 0; t < tiers; t++) {
      const th = height / tiers;
      const taper = 1 - (t / tiers) * 0.34;
      const lit = t / tiers < ratio;
      boxes.push({
        x,
        y: 0.28 + t * th + th / 2,
        z,
        sx: width * taper,
        sy: Math.max(0.12, th * 0.88),
        sz: width * taper,
        color: lit ? color : [0.10, 0.12, 0.16],
        emissive: lit ? 0.22 + conf * 0.52 : 0,
      });
    }

    if (agent.pending > 0 && i === 0) {
      boxes.push({
        x,
        y: 0.32 + height + 0.12,
        z,
        sx: width * 0.72,
        sy: 0.12,
        sz: width * 0.72,
        color,
        emissive: 0.35,
      });
    }

    if (agent.rejected > 0 && i === 1) {
      boxes.push({
        x: x + 0.16 * scale,
        y: 0.35 + height * 0.42,
        z: z + 0.12 * scale,
        sx: width * 0.34,
        sy: 0.10,
        sz: width * 1.12,
        color: [0.88, 0.18, 0.24],
        emissive: 0.22,
      });
    }
  });

  const coreHeight = (0.58 + volume(agent.verified) * 3.2) * scale;
  const coreColor: [number, number, number] = [0.88, 0.65, 0.29];
  boxes.push({ x: ox, y: 0.35 + coreHeight / 2, z: oz, sx: 0.44 * scale, sy: coreHeight, sz: 0.44 * scale, color: coreColor, emissive: 0.46 });
  boxes.push({ x: ox, y: 0.35 + coreHeight + 0.13, z: oz, sx: 0.20 * scale, sy: 0.22 * scale, sz: 0.20 * scale, color: [0.60, 0.42, 1], emissive: 0.72 });

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
    <div className={"relative overflow-hidden bg-[#080a0e] "+className}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(112,86,214,.13),transparent_35%),radial-gradient(circle_at_65%_18%,rgba(205,157,74,.08),transparent_24%)]"/>
      <canvas ref={canvasRef} className={"relative block h-full w-full touch-none "+(active?"cursor-grabbing":"cursor-grab")}/>
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-white/[0.07] bg-black/35 px-3 py-1.5 text-[9px] uppercase tracking-[.12em] text-[#7e8793] backdrop-blur-md">
        Drag to orbit · Scroll to zoom
      </div>
    </div>
  );
}
