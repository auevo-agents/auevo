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
  identity: [0.38, 0.42, 0.54],
  skill: [0.28, 0.14, 0.48],
  work: [0.07, 0.15, 0.40],
  performance: [0.42, 0.07, 0.27],
  economic_activity: [0.09, 0.32, 0.21],
  financial_performance: [0.60, 0.43, 0.13],
  prediction: [0.29, 0.13, 0.54],
  autonomy: [0.08, 0.28, 0.25],
  longevity: [0.38, 0.045, 0.09],
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

const BARK: [number, number, number] = [0.30, 0.17, 0.12];
const BARK_LIT: [number, number, number] = [0.38, 0.23, 0.16];
const GOLDEN_ANGLE = 2.399963229728653;

/** Deterministic Fibonacci-sphere point set — fills a cluster with as many little
 * leaf-cubes as it needs without ever looking like a random scatter or a grid. */
function fibSphere(n: number, rx: number, ry: number, rz: number): [number, number, number][] {
  if (n <= 1) return [[0, 0, 0]];
  const pts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const y = 1 - 2 * t;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = GOLDEN_ANGLE * i;
    pts.push([Math.cos(theta) * r * rx, y * ry, Math.sin(theta) * r * rz]);
  }
  return pts;
}

/**
 * A tree, not a tower — a plain bark trunk (trustworthy, undecorated, just elapsed time)
 * holding up a crown of cube clusters, one per fixed Proof category, scattered around the
 * top in three loose tiers (not a flat ring, not a single blob — a real canopy reads from
 * further off than any single branch does). Cluster size = how much the agent has
 * attempted there; glow = how much of that came back verified; a cold grey cluster means
 * never attempted. The point of a tree over a skyscraper: a verified cube, once placed,
 * can't be moved, resized, or quietly removed — only ever added to, same as a Proof.
 */
function cityForAgent(agent: ProofCityAgent, ox: number, oz: number, scale = 1, landmark = false): Box[] {
  const boxes: Box[] = [];
  const order = Object.keys(CATEGORY_COLORS);
  const cats = agent.categories;
  const age = Math.max(1, Math.min(7, Math.ceil(agent.ageDays / 45)));
  const activity = volume(agent.attempted + agent.verified);

  const baseR = ((landmark ? 0.30 : 0.26) + activity * (landmark ? 0.10 : 0.08)) * scale;
  const topR = baseR * 0.55;

  // Root flare, hugging the trunk's own base width.
  boxes.push({x:ox+.08*scale,y:.012,z:oz+.1*scale,sx:baseR*2.6,sy:.016,sz:baseR*2.3,color:[.01,.015,.02],emissive:0});
  for (let r = 0; r < 3; r++) {
    const side = baseR * (2.0 - r * 0.35);
    boxes.push({x:ox,y:0.045+r*0.05,z:oz,sx:side,sy:0.06*scale,sz:side,color:BARK,emissive:0.02});
  }

  // Trunk: plain bark, height purely from age — the undecorated passage of time the
  // canopy sits on top of. No category colour reaches down here.
  const trunkH = ((landmark ? 1.3 : 1.15) + age * (landmark ? 0.20 : 0.17)) * scale;
  const trunkSegs = Math.max(3, Math.min(7, age + 2));
  let y = 0.16 * scale;
  for (let s = 0; s < trunkSegs; s++) {
    const segH = trunkH / trunkSegs;
    const r = baseR + (topR - baseR) * (s / trunkSegs);
    boxes.push({x:ox,y:y+segH/2,z:oz,sx:r,sy:segH*0.96,sz:r,color:s%2?BARK:BARK_LIT,emissive:0.03});
    y += segH;
  }
  const canopyBaseY = y;

  let dominantIdx = 0, dominantAttempted = -1;
  const clusterCenters: { x: number; y: number; z: number }[] = [];

  order.forEach((category, i) => {
    const c = cats.find((item) => item.category === category) ?? { category, attempted: 0, verified: 0, confidence: "INSUFFICIENT" };
    if (c.attempted > dominantAttempted) { dominantAttempted = c.attempted; dominantIdx = i; }
    const d = volume(c.attempted);
    const conf = CONFIDENCE[c.confidence] ?? 0.18;
    const ratio = c.attempted ? c.verified / c.attempted : 0;
    const active = c.attempted > 0;
    const color = CATEGORY_COLORS[category] ?? [0.52,0.45,0.78];

    // Three tiers (low/mid/high), golden-angle spread within each — a rounded crown
    // wide enough to wrap the top of the trunk, with big enough cubes and tight enough
    // per-cluster jitter that neighbouring category clusters overlap into one canopy
    // instead of nine separate puffs with daylight between them.
    const tier = i % 3;
    const tierY = [0.30, 0.56, 0.84][tier];
    const tierR = [0.95, 0.72, 0.44][tier];
    const theta = GOLDEN_ANGLE * i;
    const branchLen = (landmark ? 0.48 : 0.45) * scale;
    const cx = ox + Math.cos(theta) * tierR * branchLen;
    const cz = oz + Math.sin(theta) * tierR * branchLen;
    const cy = canopyBaseY + tierY * (landmark ? 1.15 : 0.6) * scale;
    clusterCenters.push({ x: cx, y: cy, z: cz });

    // Branch stub: a short bark segment partway from the trunk toward the cluster.
    boxes.push({x:ox+(cx-ox)*.4,y:canopyBaseY+(cy-canopyBaseY)*.35,z:oz+(cz-oz)*.4,sx:.05*scale,sy:.05*scale,sz:.05*scale,color:BARK,emissive:.02});

    const maxCubes = landmark ? 18 : 9;
    const cubeCount = Math.max(1, Math.min(maxCubes, Math.round(1 + d * (maxCubes - 1))));
    const cubeSize = (landmark ? 0.19 : 0.17) * scale;
    const clusterOffsets = landmark ? fibSphere(cubeCount, 0.19, 0.17, 0.19) : fibSphere(cubeCount, 0.14, 0.11, 0.14);
    for (let p = 0; p < cubeCount; p++) {
      const [dx,dy,dz] = clusterOffsets[p];
      boxes.push({
        x: cx+dx*scale, y: cy+dy*scale, z: cz+dz*scale,
        sx: cubeSize, sy: cubeSize, sz: cubeSize,
        color: active ? color : [0.17, 0.20, 0.18],
        emissive: active ? 0.08 + conf * ratio * 0.26 : 0.02,
      });
    }
  });

  // A rejected proof is a scar embedded in the cluster where it happened — visible for
  // good, never papered over. Placed on whichever category has the most attempts
  // (per-category rejection counts aren't tracked yet, same aggregate-level approximation
  // the earlier design used).
  if (agent.rejected > 0) {
    const d0 = clusterCenters[dominantIdx];
    boxes.push({x:d0.x+.1*scale,y:d0.y-.08*scale,z:d0.z+.08*scale,sx:.09*scale,sy:.09*scale,sz:.09*scale,color:[.32,.13,.13],emissive:.14});
  }

  // Pending: new growth, still soft — a small pale cluster set slightly apart from the hardened canopy.
  if (agent.pending > 0) {
    const px = ox, py = canopyBaseY + (landmark?1.05:0.78)*scale, pz = oz;
    boxes.push({x:px,y:py,z:pz,sx:.13*scale,sy:.13*scale,sz:.13*scale,color:[.68,.62,.92],emissive:.24});
  }

  // Fallen seeds: this agent's cumulative record, settled at its own base — a forest
  // shares one ground, not a ring of satellites orbiting each tree.
  const seedCount = Math.max(2, Math.min(10, Math.round(activity * 10)));
  for (let i = 0; i < seedCount; i++) {
    const a = (i / seedCount) * Math.PI * 2 + 0.4;
    const rr = baseR * 1.9 + (i % 3) * 0.05 * scale;
    boxes.push({
      x: ox + Math.cos(a) * rr, y: (0.05 + (i % 2) * 0.02) * scale, z: oz + Math.sin(a) * rr,
      sx: 0.045 * scale, sy: 0.045 * scale, sz: 0.045 * scale,
      color: i % 2 ? [.72,.56,.3] : [.4,.48,.28], emissive: landmark ? 0.4 : 0.22,
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

function hash2(x: number, y: number) {
  const a = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  const b = Math.sin(x * 39.346 + y * 11.135) * 24634.6345;
  const h = (a - Math.floor(a)) * 0.6 + (b - Math.floor(b)) * 0.4;
  return h - Math.floor(h);
}

/** A fine pixel meadow — small voxel tiles in several grass shades plus rare dirt
 * flecks, not two alternating colours. Reads as noisy ground cover, never a game
 * board, however far the camera pulls back. */
function pixelGround(halfX: number, halfZ: number, cell: number): Box[] {
  const boxes: Box[] = [];
  const cols = Math.max(2, Math.round((halfX * 2) / cell));
  const rows = Math.max(2, Math.round((halfZ * 2) / cell));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n = hash2(c, r);
      const n2 = hash2(c + 91.3, r - 47.7);
      // Jitter every tile off the lattice so the grout lines never line up into a
      // literal board — reads as scattered ground cover, not a checkerboard.
      const jx = (hash2(c + 13.1, r + 4.7) - 0.5) * cell * 0.4;
      const jz = (hash2(c - 7.3, r + 19.2) - 0.5) * cell * 0.4;
      const jy = (n2 - 0.5) * 0.03;
      const x = -halfX + (c + 0.5) * cell + jx, z = -halfZ + (r + 0.5) * cell + jz;
      let color: [number, number, number];
      if (n > 0.95) color = [0.24, 0.19, 0.12]; // rare dirt fleck
      else if (n > 0.86) color = [0.07 + n2 * 0.02, 0.22 + n2 * 0.05, 0.09 + n2 * 0.02]; // dark moss patch
      else color = [0.06 + n2 * 0.025, 0.16 + n2 * 0.1, 0.065 + n2 * 0.03];
      boxes.push({ x, y: -0.05 + jy, z, sx: cell * 0.82, sy: 0.07, sz: cell * 0.82, color, emissive: 0.01 });
    }
  }
  return boxes;
}

function sceneBoxes(agents: ProofCityAgent[], single: boolean, landmark: boolean): Box[] {
  const layout = layoutAgents(agents, single);
  const boxes: Box[] = [];

  // The homepage hero tree floats free — no ground, no horizon, no shadow slab,
  // nothing under it at all.
  if (!single) {
    const reach = layout.reduce((m, l) => Math.max(m, Math.abs(l.x), Math.abs(l.z)), 0);
    const halfX = reach + 3.4, halfZ = reach + 3.0;
    boxes.push(...pixelGround(halfX, halfZ, 1.1));
    boxes.push({ x: 0, y: 0.04, z: -halfZ + 0.02, sx: halfX * 2, sy: 0.05, sz: 0.04, color: [0.62, 0.46, 0.3], emissive: 0.22 });
    layout.forEach((item) => {
      const shadowR = 0.42 * item.scale;
      boxes.push({ x: item.x + 0.12 * item.scale, y: 0, z: item.z + 0.18 * item.scale, sx: shadowR * 2, sy: 0.02, sz: shadowR * 1.5, color: [0.03, 0.035, 0.03], emissive: 0 });
    });
  }

  layout.forEach((item) => boxes.push(...cityForAgent(item.agent, item.x, item.z, item.scale, landmark)));
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
  float hemi=.26+.12*max(n.y,0.0);
  float rim=pow(1.0-max(dot(n,normalize(vec3(.15,.35,.92))),0.0),2.0)*.08;
  float heightGlow=clamp(v_worldPos.y/8.0,0.0,1.0)*.04;
  vec3 sunTint=vec3(1.05,1.0,0.94);
  float shade=hemi+rim+heightGlow+u_emissive*.55;
  vec3 c=u_color*shade+u_color*sunTint*d*.3;
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
    gl.uniform3f(lightLoc,-.52,.84,.3);
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
      <div className={"pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full blur-[55px] mix-blend-screen "+(landmark?"left-1/2 top-[38%] h-[46%] w-[46%] bg-[radial-gradient(circle_at_center,rgba(255,196,92,.26),rgba(155,124,255,.20)_42%,transparent_72%)]":"left-[70%] top-[14%] h-[28%] w-[28%] bg-[radial-gradient(circle_at_center,rgba(255,196,92,.20),rgba(155,124,255,.12)_46%,transparent_74%)]")}/>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[18%] bg-gradient-to-t from-[#0b121d]/70 to-transparent"/>
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
