import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FOREST_COLORS, type ForestAgent } from '../forest-model';
import { createForestEntity, defaultEntityKind, isEntityKind, animateForestEntity, disposeForestEntity, type EntityKind } from './forest-entities';
import { gardenLayout, gardenFacets, noise, DEMO_DURATION, demoPose } from './garden-model';
import { CATEGORY_ORDER } from '../../proofs/reputation-structure';

export type GardenOptions = {
  agents: ForestAgent[]; single?: boolean; entityKinds?: Record<string,EntityKind>;
  onSelect?: (index: number, proofId?: string) => void;
  onPhase?: (phase: string) => void;
  onReady?: (mode: 'webgl' | 'software') => void;
  onLost?: () => void;
  onStationHover?: (info: { category: string; x: number; y: number } | null) => void;
  onAgentHover?: (info: { index: number; x: number; y: number } | null) => void;
};
export type GardenController = { setEntity: (index:number,kind:EntityKind)=>boolean; inspectEntity:()=>void; select: (index:number)=>void; zoom: (factor:number)=>void; reset:()=>void; demo:(index?:number,category?:string)=>boolean; celebrate:(index:number,category?:string)=>void; dispose:()=>void };
/** The 9 real Proof categories, each a distinct trial-court station in the multi-agent garden; a single-agent Passport collapses them onto its one court instead (see buildGarden). */
const STATION_CATEGORIES: string[] = CATEGORY_ORDER;

/** Procedural artwork: no asset downloads, generated portrait backgrounds or server credentials. */
export function buildGarden(agents: ForestAgent[], single=false, mobile=false, entityKinds:Record<string,EntityKind>={}) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#183526'); scene.fog = new THREE.FogExp2('#183526',.026);
  const layout = gardenLayout(agents,single), picks: THREE.Object3D[] = [], creatures: THREE.Group[] = [], homes: THREE.Vector3[] = [], anchors: THREE.Vector3[] = [], selections: THREE.Mesh[] = [];
  const court = new THREE.Vector3(single ? 1.8 : 0,.12,single ? 1.55 : 3.1);
  const box = new RoundedBoxGeometry(1,1,1,2,.045), crystal = new THREE.IcosahedronGeometry(1,0);
  const stoneTextureCanvas = document.createElement('canvas');stoneTextureCanvas.width=stoneTextureCanvas.height=128;
  const sc=stoneTextureCanvas.getContext('2d');if(sc){const im=sc.createImageData(128,128);for(let i=0;i<im.data.length;i+=4){const x=(i/4)%128,y=Math.floor(i/512),n=noise(x*37+y*73),vein=Math.abs(Math.sin(x*.061+y*.11+Math.sin(y*.13))),v=35+n*25+(vein>.97?12:0);im.data.set([v*.84,v,v*.89,255],i);}sc.putImageData(im,0,0);}
  const stoneTexture=new THREE.CanvasTexture(stoneTextureCanvas);stoneTexture.wrapS=stoneTexture.wrapT=THREE.RepeatWrapping;stoneTexture.colorSpace=THREE.SRGBColorSpace;
  const darkStone=new THREE.MeshStandardMaterial({color:'#18251e',map:stoneTexture,roughness:.68,metalness:.16});
  const moss = new THREE.MeshStandardMaterial({color:'#506d36',roughness:.98});
  const gold = new THREE.MeshPhysicalMaterial({color:'#b5a16e',metalness:.84,roughness:.28,clearcoat:.4});
  const glow = new THREE.MeshStandardMaterial({color:'#e7ca88',emissive:'#e6bf70',emissiveIntensity:2.2,roughness:.35});
  const leaves = new THREE.MeshStandardMaterial({color:'#5d7d47',roughness:.8,side:THREE.DoubleSide});
  const glass = new Map<string,THREE.MeshPhysicalMaterial>();
  for(const [key,value] of Object.entries(FOREST_COLORS)) {
    if(key==='trunk')continue; const failed=['failed','cancelled','inconclusive'].includes(key),pending=['scheduled','running','awaiting_settlement'].includes(key),color=value;
    glass.set(key,new THREE.MeshPhysicalMaterial({color,roughness:failed?.52:.1,metalness:.07,transmission:failed?.08:mobile?.28:.68,thickness:.42,ior:1.47,attenuationColor:color,attenuationDistance:1.2,clearcoat:1,clearcoatRoughness:.11,envMapIntensity:1.5,emissive:color,emissiveIntensity:pending?.08:.015}));
  }
  const highlight=new THREE.MeshBasicMaterial({color:'#d8c58e',transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false});
  function instances(geometry:THREE.BufferGeometry,material:THREE.Material,ps:number[][],ss:number[][],rotations?:number[]) {
    const mesh=new THREE.InstancedMesh(geometry,material,ps.length),mat=new THREE.Matrix4(),q=new THREE.Quaternion();
    ps.forEach((p,i)=>{q.setFromAxisAngle(new THREE.Vector3(0,1,0),rotations?.[i]??0);mat.compose(new THREE.Vector3(...p as [number,number,number]),q,new THREE.Vector3(...ss[i] as [number,number,number]));mesh.setMatrixAt(i,mat);});mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);return mesh;
  }
  // A continuous surface extends far beyond the camera; fog conceals its remote edge.
  // World-scale agent streaming is deliberately separate from this visual ground.
  const groundTexture=stoneTexture.clone();groundTexture.repeat.set(500,500);groundTexture.needsUpdate=true;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.MeshStandardMaterial({color:'#477148',bumpMap:groundTexture,bumpScale:.018,roughness:1}));
  ground.name='continuous-forest-ground';ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  function mesh(geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number,sx=1,sy=sx,sz=sx,parent:THREE.Object3D=scene){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  // The single-agent Passport keeps one plain trial ring (glow/gold, as before) —
  // no room or need for 9 separate buildings around one tree. The multi-agent
  // garden instead gets one small station per real Proof category, built from
  // that category's own glass color, so a creature visibly walks to the right
  // building for what it's actually attempting — and every viewer sees it.
  const stations: Record<string,THREE.Vector3> = {}, stationRings: Record<string,THREE.Mesh> = {}, stationHits: THREE.Object3D[] = [];
  let trialRing: THREE.Mesh;
  if (single) {
    const ringG=new THREE.RingGeometry(.56,.567,64); trialRing=mesh(ringG,glow,court.x,.026,court.z); trialRing.rotation.x=-Math.PI/2;
    const trialOuter=mesh(new THREE.RingGeometry(.84,.848,64),gold,court.x,.027,court.z); trialOuter.rotation.x=-Math.PI/2;
    for (const category of STATION_CATEGORIES) { stations[category]=court; stationRings[category]=trialRing; }
  } else {
    // Each landmark gets its own compass direction and distance from the
    // court — a fan spanning left-far to right-far, angled outward so no
    // two buildings share a bearing, never a grid. (angleDeg, radiusX,
    // radiusZ) per station: x = sin(angle)*radiusX, z = cos(angle)*radiusZ
    // (always positive — buildings stay in front of the trees, never
    // behind the court where they'd collide with the forest).
    const STATION_FAN: [number,number,number][] = [
      [-80,5.8,2.0],[-60,4.6,2.6],[-40,6.2,1.8],[-20,5.0,3.2],[0,3.6,3.6],[20,5.4,2.4],[40,6.4,2.0],[60,4.8,2.8],[80,5.6,1.6],
    ];
    const buildStation=(category:string,x:number,z:number):THREE.Mesh=>{
      const material=glass.get(category)??glass.get('inconclusive')!;
      mesh(box,darkStone,x,.16,z,2.6,.3,2.6);
      // Each category gets its own silhouette, not just its own color.
      if(category==='identity'){
        mesh(box,darkStone,x,1.0,z,.5,1.9,.5);
        mesh(new THREE.TorusGeometry(1.15,.22,10,24),material,x,2.1,z).rotation.x=Math.PI/2;
      }else if(category==='skill'){
        mesh(box,material,x,.9,z,2.6,1.5,2.6);
        mesh(box,material,x,2.1,z,1.9,1.0,1.9);
        mesh(box,material,x,3.0,z,1.1,.8,1.1);
      }else if(category==='work'){
        mesh(new THREE.CylinderGeometry(1.1,1.3,2.6,10),material,x,1.5,z);
        mesh(new THREE.ConeGeometry(1.3,1.2,10),material,x,3.3,z);
        mesh(new THREE.CylinderGeometry(.28,.32,1.8,8),material,x+1.0,2.6,z-.6);
      }else if(category==='performance'){
        mesh(box,darkStone,x,1.1,z,.6,2.2,.6);
        mesh(new THREE.IcosahedronGeometry(1,0),material,x,3.3,z,1.1,2.0,1.1);
      }else if(category==='economic_activity'){
        mesh(new THREE.CylinderGeometry(1.5,1.6,1.4,16),material,x,1.0,z);
        mesh(new THREE.SphereGeometry(1.5,16,12,0,Math.PI*2,0,Math.PI/2),material,x,1.7,z);
      }else if(category==='financial_performance'){
        mesh(new THREE.ConeGeometry(1.7,3.6,4),material,x,2.0,z);
      }else if(category==='prediction'){
        mesh(new THREE.CylinderGeometry(.5,.7,3.4,10),material,x,1.9,z);
        mesh(new THREE.ConeGeometry(.75,1.3,10),material,x,4.2,z);
      }else if(category==='autonomy'){
        mesh(new THREE.ConeGeometry(1.1,1.9,8),material,x,1.95,z);
        mesh(new THREE.ConeGeometry(1.1,1.9,8),material,x,3.85,z).rotation.x=Math.PI;
      }else{
        [1.4,1.1,.8,.5].forEach((r,i)=>mesh(new THREE.CylinderGeometry(r,r*1.15,.5,14),material,x,.6+i*.65,z));
      }
      const ring=mesh(new THREE.RingGeometry(1.5,1.56,48),material,x,.032,z); ring.rotation.x=-Math.PI/2;
      return ring;
    };
    STATION_CATEGORIES.forEach((category,i)=>{
      const [angleDeg,radiusX,radiusZ]=STATION_FAN[i]??[0,5,3], rad=angleDeg*Math.PI/180;
      const x=court.x+Math.sin(rad)*radiusX, z=court.z+Math.cos(rad)*radiusZ;
      const ring=buildStation(category,x,z);
      stations[category]=new THREE.Vector3(x,court.y,z); stationRings[category]=ring;
      // A big invisible hit-box (taller/wider than any single silhouette) is what hover-picking tests against — simpler than raycasting every decorative mesh.
      const hit=mesh(new THREE.CylinderGeometry(1.9,1.9,5.2,10,1,true),new THREE.MeshBasicMaterial({visible:false}),x,2.6,z);
      hit.userData.station=category; stationHits.push(hit);
    });
    trialRing=stationRings[STATION_CATEGORIES[0]];
  }
  const lampG=new THREE.CylinderGeometry(.055,.07,.27,8);
  function lamp(x:number,y:number,z:number){mesh(box,darkStone,x,y-.025,z,.18,.09,.18);mesh(lampG,gold,x,y+.13,z);mesh(box,glow,x,y+.2,z,.06,.15,.06);}
  for(let i=0;i<8;i++)lamp((i%2?1:-1)*2.2,.06,-2.4+Math.floor(i/2)*1.85);
  const mossPositions:number[][]=[],mossSizes:number[][]=[],fernPositions:number[][]=[],fernSizes:number[][]=[],fernRot:number[]=[];
  layout.forEach((item,index)=>{
    const {x,y,z,agent,seed}=item,model=gardenFacets(agent),tree=new THREE.Group();tree.position.set(x,y,z);scene.add(tree);
    for(let k=0;k<4;k++){const shadow=mesh(new THREE.CircleGeometry(1.05-k*.2,32),new THREE.MeshBasicMaterial({color:'#06140c',transparent:true,opacity:.09,depthWrite:false}),x,y+.021+k*.001,z);shadow.rotation.x=-Math.PI/2;shadow.castShadow=false;}
    // The real proof crown is instanced by material; all facets retain their event ID.
    const buckets=new Map<string,typeof model.facets>();
    model.facets.forEach(f=>{const list=buckets.get(f.material)??[];list.push(f);buckets.set(f.material,list);});
    buckets.forEach((facets,key)=>{
      const crown=instances(box,glass.get(key)??glass.get('inconclusive')!,facets.map(f=>[x+f.x,y+f.y,z+f.z]),facets.map(f=>[f.size,f.size,f.size]));
      crown.userData.agentIndex=index;crown.userData.proofIds=facets.map(f=>f.proofId);picks.push(crown);
    });
    const cylinders:THREE.BufferGeometry[]=[];
    const branch=(a:THREE.Vector3,b:THREE.Vector3,r:number)=>{const dir=b.clone().sub(a),g=new THREE.CylinderGeometry(r*.62,r,dir.length(),7);const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),q,new THREE.Vector3(1,1,1)));cylinders.push(g);};
    branch(new THREE.Vector3(0,0,0),new THREE.Vector3(.05,model.stem+.14,0),.075);
    for(let i=0;i<model.facets.length;i+=3){const f=model.facets[i],a=new THREE.Vector3(0,model.stem*.68+(i%7)*.055,0),b=new THREE.Vector3(f.x,f.y-.08,f.z);const bend=a.clone().lerp(b,.56);bend.y-=.12;branch(a,bend,.025);branch(bend,b,.016);}
    for(let i=0;i<4;i++){const a=i*Math.PI/2;branch(new THREE.Vector3(0,.17,0),new THREE.Vector3(Math.cos(a)*.39,.03,Math.sin(a)*.39),.055);}
    const merged=mergeGeometries(cylinders);cylinders.forEach(g=>g.dispose());if(merged)mesh(merged,gold,0,0,0,1,1,1,tree);
    const proxy=mesh(new THREE.CylinderGeometry(1.2,1.2,model.stem+1.8,8),new THREE.MeshBasicMaterial({visible:false}),x,y+(model.stem+1.8)/2,z);proxy.userData.agentIndex=index;picks.push(proxy);
    const selection=mesh(new THREE.RingGeometry(1.25,1.265,80),highlight,x,y+.013,z);selection.rotation.x=-Math.PI/2;selection.visible=index===0;selections.push(selection);
    anchors.push(new THREE.Vector3(x,y+.12,z+1.4));
    const home=new THREE.Vector3(x-.8,y+.055,z+.82),creature=createForestEntity(isEntityKind(entityKinds[agent.id])?entityKinds[agent.id]:defaultEntityKind(agent.id),mobile);creature.scale.setScalar(1.25);creature.position.copy(home);scene.add(creature);creatures.push(creature);homes.push(home);
    creature.traverse(o=>{o.userData.agentIndex=index;});picks.push(...creature.children);
    // Fern fronds and moss islands stay decorative; they never represent proofs.
    for(let i=0;i<(mobile?32:65);i++){
      const a=noise(seed+i)*Math.PI*2,r=.95+noise(seed+i+1)*.55,mx=x+Math.cos(a)*r,mz=z+Math.sin(a)*r;
      mossPositions.push([mx,y+.01,mz]);mossSizes.push([.08+noise(seed+i+3)*.13,.045,.08+noise(seed+i+2)*.15]);
      if(i%3===0)for(let k=0;k<5;k++){const fa=a+k*.5;fernPositions.push([mx+Math.sin(fa)*.065,y+.07+k*.018,mz+Math.cos(fa)*.06]);fernSizes.push([.027,.012,.16-k*.017]);fernRot.push(fa);}
    }

  });
  if(mossPositions.length)instances(crystal,moss,mossPositions,mossSizes);
  if(fernPositions.length)instances(crystal,leaves,fernPositions,fernSizes,fernRot);
  // Background vegetation provides depth but doesn't fabricate extra agents.
  const bps:number[][]=[],bss:number[][]=[];for(let i=0;i<(mobile?40:100);i++){const x=(noise(i+80)-.5)*30,z=-8-noise(i+7)*18;bps.push([x,.1,z]);bss.push([.4+noise(i)*.7,.25+noise(i+2)*.8,.4+noise(i+9)*.6]);}instances(crystal,new THREE.MeshStandardMaterial({color:'#142c1d',roughness:1}),bps,bss);
  scene.add(new THREE.HemisphereLight('#dbeac1','#132119',1.2));
  const sun=new THREE.DirectionalLight('#ffe5b1',3.5);sun.position.set(-6,11,4);sun.castShadow=true;sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);sun.shadow.camera.left=-15;sun.shadow.camera.right=15;sun.shadow.camera.top=15;sun.shadow.camera.bottom=-15;sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;sun.shadow.radius=3;scene.add(sun);
  const fill=new THREE.DirectionalLight('#aac9ae',1);fill.position.set(6,7,-7);scene.add(fill);
  const rim=new THREE.DirectionalLight('#b8d19a',1.8);rim.position.set(-3,4,-10);scene.add(rim);
  return {scene,layout,picks,creatures,homes,anchors,selections,court,trialRing,stations,stationRings,stationHits,stoneTexture,groundTexture,sun};
}

/** Real WebGL renderer; public controller also works with a software preview when GPU is absent. */
export function mountGarden(canvas:HTMLCanvasElement,options:GardenOptions):GardenController {
  const mobile=canvas.clientWidth<650,reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const data=buildGarden(options.agents,options.single,mobile,options.entityKinds), {scene}=data;
  const camera=new THREE.PerspectiveCamera(36,1,.1,120);
  let selected=0,disposed=false,frame=0,visible=true,inView=true,last=0,elapsed=0,software:SoftwareGarden|null=null;
  // One active walk-to-station-and-back per agent index, so several agents can
  // visibly be mid-attempt at once (the live Proof feed can trigger any of
  // them, not just the one the viewer happens to have selected).
  const trials=new Map<number,{start:number;category:string;phase:string}>();
  const sparks:{mesh:THREE.Mesh;start:number;from:THREE.Vector3;to:THREE.Vector3}[]=[];
  const sparkGeo=new THREE.IcosahedronGeometry(.1,0);
  const SPARK_DURATION=1.1;
  function spawnSpark(from:THREE.Vector3,to:THREE.Vector3,color:string){
    const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:1});
    const m=new THREE.Mesh(sparkGeo,material);m.position.copy(from);scene.add(m);
    sparks.push({mesh:m,start:elapsed,from:from.clone(),to:to.clone()});
  }
  let renderer:THREE.WebGLRenderer|null=null,composer:EffectComposer|null=null,env:THREE.WebGLRenderTarget|null=null,orbit:OrbitControls|null=null;
  // Multi-mode pulled back a bit further than before (17/24 -> 21/28) — the
  // station buildings are now landmark-scaled (4-5x the old booths), so the
  // default framing needs more room to show both the plaza and the trees.
  let yaw=.44,pitch=.61,distance=options.single?9.5:options.agents.length>3?28:21;const target=new THREE.Vector3(0,1.25,options.single?-.2:options.agents.length>3?-3:0);
  const cameraHome=()=>{if(options.single){distance=9.4;target.set(0,1.35,0);}else{distance=options.agents.length>3?28:21;target.set(0,1.3,options.agents.length>3?-3:0);}yaw=.44;pitch=.61;};
  try {
    // Fail before binding to WebGL so a 2D fallback can use this same canvas.
    const probe=document.createElement('canvas'),probeGL=probe.getContext('webgl2');if(!probeGL)throw new Error('WebGL2 unavailable');probeGL.getExtension('WEBGL_lose_context')?.loseContext();
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'default'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile?1.25:1.7));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;renderer.outputColorSpace=THREE.SRGBColorSpace;
    const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
    const panels:THREE.Mesh[]=[];for(const [x,c] of [[-4,0xffe8be],[4,0xb1dbc1]] as const){const p=new THREE.Mesh(new THREE.PlaneGeometry(2,5),new THREE.MeshBasicMaterial({color:c,side:THREE.DoubleSide}));p.position.set(x,2,-2);p.rotation.y=x<0?.7:-.7;room.add(p);panels.push(p);}env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.72;room.dispose();panels.forEach(p=>{p.geometry.dispose();(p.material as THREE.Material).dispose();});pmrem.dispose();
    composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));composer.addPass(new UnrealBloomPass(new THREE.Vector2(1,1),mobile?.12:.23,.5,1.35));composer.addPass(new OutputPass());
    orbit=new OrbitControls(camera,canvas);orbit.enablePan=false;orbit.enableDamping=true;orbit.dampingFactor=.07;orbit.enableZoom=true;orbit.zoomSpeed=.7;orbit.minDistance=options.single?5:9;orbit.maxDistance=options.single?18:45;orbit.minPolarAngle=.4;orbit.maxPolarAngle=1.28;orbit.autoRotate=!reduced.matches;orbit.autoRotateSpeed=.4;
    options.onReady?.('webgl');
  } catch {
    if(renderer){composer?.dispose();env?.dispose();renderer.dispose();renderer=null;composer=null;env=null;}
    software=new SoftwareGarden(canvas,scene);options.onReady?.('software');
  }
  const setCamera=()=>{const ratio=Math.max(.6,camera.aspect),reach=distance/Math.min(1.6,ratio);camera.position.set(target.x+Math.sin(yaw)*Math.cos(pitch)*reach,target.y+Math.sin(pitch)*reach,target.z+Math.cos(yaw)*Math.cos(pitch)*reach);camera.lookAt(target);if(orbit){orbit.target.copy(target);orbit.update();}};
  const resize=()=>{const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer?.setSize(w,h,false);composer?.setSize(w,h);software?.resize(w,h);setCamera();};
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down:{x:number;y:number;yaw:number;pitch:number}|null=null;
  const pick=(e:PointerEvent)=>{const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hits=ray.intersectObjects(data.picks,false);const h=hits.find(hit=>{const material=(hit.object as THREE.Mesh).material;return Array.isArray(material)?material.some(m=>m.visible):material?.visible;})??hits[0];if(!h)return;const index=h.object.userData.agentIndex as number;select(index);options.onSelect?.(index,h.instanceId===undefined?undefined:h.object.userData.proofIds?.[h.instanceId]);};
  const select=(index:number)=>{if(index<0||index>=data.layout.length||trials.has(selected))return;selected=index;data.selections.forEach((m,i)=>m.visible=i===index);};
  const onDown=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY,yaw,pitch};if(software)canvas.setPointerCapture(e.pointerId);};
  const onMove=(e:PointerEvent)=>{if(!down||!software)return;yaw=down.yaw+(e.clientX-down.x)*.006;pitch=THREE.MathUtils.clamp(down.pitch+(e.clientY-down.y)*.004,.35,1.25);setCamera();};
  const onUp=(e:PointerEvent)=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<6&&!trials.has(selected))pick(e);down=null;};const onCancel=()=>{down=null;};
  const onLost=(e:Event)=>{e.preventDefault();visible=false;options.onLost?.();};
  const onVisibility=()=>{visible=!document.hidden;};
  // What's under the cursor right now — a separate, lighter raycast than
  // click-picking, run on every pointer move so a label follows the cursor
  // instead of only updating on click. An agent (tree/creature) wins over a
  // station building when both are hit, since it's the more specific target.
  const hoverRay=new THREE.Raycaster(),hoverPointer=new THREE.Vector2();let hoveredStation:string|null=null,hoveredAgent:number|null=null;
  const onHoverMove=(e:PointerEvent)=>{
    const r=canvas.getBoundingClientRect();
    hoverPointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
    hoverRay.setFromCamera(hoverPointer,camera);
    if(options.onAgentHover){
      const hits=hoverRay.intersectObjects(data.picks,false);
      const h=hits.find(hit=>{const material=(hit.object as THREE.Mesh).material;return Array.isArray(material)?material.some(m=>m.visible):material?.visible;})??hits[0];
      const idx=h?.object.userData.agentIndex as number|undefined;
      if(idx!==undefined){
        if(idx!==hoveredAgent){hoveredAgent=idx;options.onAgentHover({index:idx,x:e.clientX-r.left,y:e.clientY-r.top});}
        else options.onAgentHover({index:idx,x:e.clientX-r.left,y:e.clientY-r.top});
        if(hoveredStation){hoveredStation=null;options.onStationHover?.(null);}
        return;
      }
      if(hoveredAgent!==null){hoveredAgent=null;options.onAgentHover(null);}
    }
    if(!data.stationHits.length||!options.onStationHover)return;
    const hit=hoverRay.intersectObjects(data.stationHits,false)[0];
    const category=hit?.object.userData.station as string|undefined;
    hoveredStation=category??null;
    options.onStationHover(category?{category,x:e.clientX-r.left,y:e.clientY-r.top}:null);
  };
  const onHoverLeave=()=>{if(hoveredStation){hoveredStation=null;options.onStationHover?.(null);}if(hoveredAgent!==null){hoveredAgent=null;options.onAgentHover?.(null);}};
  canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('pointermove',onMove);canvas.addEventListener('pointerup',onUp);canvas.addEventListener('pointercancel',onCancel);canvas.addEventListener('webglcontextlost',onLost);document.addEventListener('visibilitychange',onVisibility);
  canvas.addEventListener('pointermove',onHoverMove);canvas.addEventListener('pointerleave',onHoverLeave);
  const io=new IntersectionObserver(entries=>{inView=entries[0]?.isIntersecting??true;});io.observe(canvas);
  const render=(now:number)=>{if(disposed)return;frame=requestAnimationFrame(render);if(!visible||!inView||now-last<(software?50:mobile?33:20)){last=(!visible||!inView)?now:last;return;}const dt=last?Math.min(.1,(now-last)/1000):0;last=now;elapsed+=dt;
    data.creatures.forEach((c,i)=>{if(!trials.has(i)){c.position.copy(data.homes[i]);if(!reduced.matches)c.position.y+=Math.sin(elapsed*2+i)*.018;}});
    for(const [i,trial] of trials){
      const home=data.homes[i],station=data.stations[trial.category]??data.court,t=elapsed-trial.start,p=demoPose(t,home,station,reduced.matches),c=data.creatures[i];
      if(!c)continue;
      c.position.set(p.x,p.y,p.z);
      if(p.phase!==trial.phase){trial.phase=p.phase;if(i===selected)options.onPhase?.(p.phase);}
      c.rotation.y=p.phase==='walking'?Math.atan2(station.x-home.x,station.z-home.z):p.phase==='returning'?Math.atan2(home.x-station.x,home.z-station.z):0;
      const ring=data.stationRings[trial.category]??data.trialRing;
      ring.scale.setScalar(p.pulse?1+(reduced.matches?0:Math.sin(elapsed*5)*.06):1);
      if(t>=DEMO_DURATION){trials.delete(i);c.rotation.y=0;ring.scale.setScalar(1);}
    }
    data.creatures.forEach((c,i)=>{const trial=trials.get(i);animateForestEntity(c,elapsed,!!trial&&(trial.phase==='walking'||trial.phase==='returning'),reduced.matches);});
    for(let i=sparks.length-1;i>=0;i--){const s=sparks[i],t=(elapsed-s.start)/SPARK_DURATION;if(t>=1){scene.remove(s.mesh);(s.mesh.material as THREE.Material).dispose();sparks.splice(i,1);continue;}const q=t*t*(3-2*t);s.mesh.position.lerpVectors(s.from,s.to,q);s.mesh.position.y+=Math.sin(Math.PI*t)*.9;s.mesh.scale.setScalar(1-t*.3);(s.mesh.material as THREE.MeshBasicMaterial).opacity=1-t;}
    orbit?.update(dt);scene.updateMatrixWorld();camera.updateMatrixWorld();if(composer)composer.render();else software?.render(camera);
  };
  frame=requestAnimationFrame(render);
  return {select,setEntity(index,kind){if(!isEntityKind(kind))return false;if(trials.has(index)||index<0||index>=data.creatures.length)return false;const old=data.creatures[index];if(old.userData.entityKind===kind)return true;const creature=createForestEntity(kind,mobile);creature.scale.copy(old.scale);creature.position.copy(data.homes[index]);creature.traverse(o=>{o.userData.agentIndex=index;});for(const part of old.children){const at=data.picks.indexOf(part);if(at>=0)data.picks.splice(at,1);}scene.remove(old);disposeForestEntity(old);scene.add(creature);data.creatures[index]=creature;data.picks.push(...creature.children);return true;},inspectEntity(){if(trials.has(selected))return;target.copy(data.homes[selected]).add(new THREE.Vector3(0,.42,0));distance=3.8;yaw=.22;pitch=.32;setCamera();},zoom(factor){if(orbit){const v=camera.position.clone().sub(orbit.target);camera.position.copy(orbit.target).add(v.multiplyScalar(factor).clampLength(options.single?5:9,options.single?18:45));orbit.update();}else{distance=THREE.MathUtils.clamp(distance*factor,options.single?5:9,options.single?18:45);setCamera();}},reset(){cameraHome();setCamera();},
  demo(index=selected,category){
    if(index<0||index>=data.creatures.length||trials.has(index))return false;
    const cat=category&&data.stations[category]?category:STATION_CATEGORIES[0];
    if(index===selected){cameraHome();setCamera();options.onPhase?.('');}
    trials.set(index,{start:elapsed,category:cat,phase:''});
    return true;
  },
  celebrate(index,category){
    if(disposed||index<0||index>=data.layout.length)return;
    const cat=category&&data.stations[category]?category:STATION_CATEGORIES[0];
    const from=(data.stations[cat]??data.court).clone();from.y+=.5;
    const item=data.layout[index];
    spawnSpark(from,new THREE.Vector3(item.x,item.y+1.6,item.z),FOREST_COLORS[cat]??'#8cf0bd');
  },
  dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();io.disconnect();orbit?.dispose();canvas.removeEventListener('pointerdown',onDown);canvas.removeEventListener('pointermove',onMove);canvas.removeEventListener('pointerup',onUp);canvas.removeEventListener('pointercancel',onCancel);canvas.removeEventListener('webglcontextlost',onLost);document.removeEventListener('visibilitychange',onVisibility);canvas.removeEventListener('pointermove',onHoverMove);canvas.removeEventListener('pointerleave',onHoverLeave);sparks.forEach(s=>{scene.remove(s.mesh);(s.mesh.material as THREE.Material).dispose();});sparks.length=0;sparkGeo.dispose();const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>();scene.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])ms.add(m);}if(o instanceof THREE.InstancedMesh)o.dispose();});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());data.stoneTexture.dispose();data.groundTexture.dispose();data.sun.shadow.dispose();env?.dispose();composer?.passes.forEach(p=>p.dispose());composer?.dispose();renderer?.dispose();software?.dispose();}};
}

/** GPU-less preview uses the exact same model and perspective, with simpler shaded materials. */
export class SoftwareGarden {
  private ctx:CanvasRenderingContext2D; private width=1;private height=1; private box=new THREE.BoxGeometry(1,1,1);
  constructor(private canvas:HTMLCanvasElement,private scene:THREE.Scene){const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');this.ctx=ctx;}
  dispose(){this.box.dispose();}
  resize(w:number,h:number){this.width=w;this.height=h;const d=Math.min(devicePixelRatio||1,1.5);this.canvas.width=w*d;this.canvas.height=h*d;this.ctx.setTransform(d,0,0,d,0,0);}
  render(camera:THREE.Camera){
    const ctx=this.ctx,w=this.width,h=this.height;ctx.clearRect(0,0,w,h);const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#304333');bg.addColorStop(.38,'#10291d');bg.addColorStop(1,'#06150e');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    camera.updateMatrixWorld();
    const floorRay=new THREE.Raycaster(),floorColor=new THREE.Color('#477148'),fogColor=new THREE.Color('#183526');
    for(let row=0;row<h;row+=3){floorRay.setFromCamera(new THREE.Vector2(0,1-(row+1.5)/h*2),camera);const ray=floorRay.ray;if(ray.direction.y>=0)continue;const distance=-ray.origin.y/ray.direction.y;if(distance<=0)continue;const c=floorColor.clone().lerp(fogColor,1-Math.exp(-distance*distance*.000676));ctx.fillStyle='#'+c.getHexString();ctx.fillRect(0,row,w,3);}
    this.scene.updateMatrixWorld();camera.updateMatrixWorld();const triangles:{xy:number[];depth:number;fill:string}[]=[],v=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()],normal=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),matrix=new THREE.Matrix4(),inst=new THREE.Matrix4(),light=new THREE.Vector3(-.6,1,.5).normalize();
    this.scene.traverse(o=>{if(!(o instanceof THREE.Mesh)||!o.visible||o.name==='continuous-forest-ground')return;let parent=o.parent;while(parent){if(!parent.visible)return;parent=parent.parent;}const material=(Array.isArray(o.material)?o.material[0]:o.material) as THREE.MeshStandardMaterial;if(!material.visible)return;const geometry=o.geometry instanceof RoundedBoxGeometry?this.box:o.geometry;const pos=geometry.attributes.position,idx=geometry.index,count=idx?idx.count:pos.count,amount=o instanceof THREE.InstancedMesh?o.count:1;
      for(let k=0;k<amount;k++){if(o instanceof THREE.InstancedMesh){o.getMatrixAt(k,inst);matrix.multiplyMatrices(o.matrixWorld,inst);}else matrix.copy(o.matrixWorld);for(let j=0;j<count;j+=3){for(let t=0;t<3;t++)v[t].fromBufferAttribute(pos,idx?idx.getX(j+t):j+t).applyMatrix4(matrix);normal.crossVectors(a.subVectors(v[1],v[0]),b.subVectors(v[2],v[0])).normalize();const midpoint=a.copy(v[0]).add(v[1]).add(v[2]).multiplyScalar(1/3);if(material.side!==THREE.DoubleSide&&normal.dot(b.copy(camera.position).sub(midpoint))<0)continue;const depth=midpoint.distanceToSquared(camera.position);const pp=v.map(p=>p.clone().project(camera));if(pp.some(p=>p.z>1||p.z< -1)||pp.every(p=>Math.abs(p.x)>1.1)||pp.every(p=>Math.abs(p.y)>1.1))continue;const brightness=.35+Math.max(0,normal.dot(light))*.8,c=material.color?.clone()??new THREE.Color('#bcb889');if(material.emissive&&material.emissiveIntensity>1)c.lerp(material.emissive,.5);c.multiplyScalar(brightness);let alpha=1;if(material instanceof THREE.MeshPhysicalMaterial&&material.transmission>.1){alpha=.73;const spec=Math.pow(Math.max(0,normal.dot(b.copy(camera.position).sub(midpoint).normalize().add(light).normalize())),18);c.lerp(new THREE.Color('#e5e4c3'),spec*.7);}if(material.transparent)alpha=material.opacity;c.convertLinearToSRGB();const fogAmount=1-Math.exp(-depth*.0011);c.lerp(new THREE.Color().setRGB(.04,.1,.06),fogAmount);triangles.push({xy:pp.flatMap(p=>[(p.x*.5+.5)*w,(-p.y*.5+.5)*h]),depth,fill:`rgba(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)},${alpha})`});}}
    });triangles.sort((a,b)=>b.depth-a.depth);for(const t of triangles){ctx.beginPath();ctx.moveTo(t.xy[0],t.xy[1]);ctx.lineTo(t.xy[2],t.xy[3]);ctx.lineTo(t.xy[4],t.xy[5]);ctx.closePath();ctx.fillStyle=t.fill;ctx.fill();}
    const shade=ctx.createRadialGradient(w*.42,h*.4,h*.1,w*.5,h*.5,w*.68);shade.addColorStop(0,'#00000000');shade.addColorStop(1,'#000c0890');ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
  }
}

export { createForestEntity, ENTITY_CHOICES } from './forest-entities';
