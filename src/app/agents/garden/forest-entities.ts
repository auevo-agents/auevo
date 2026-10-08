import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { ENTITY_CHOICES, type EntityKind } from './entity-catalog';
export { ENTITY_CHOICES, defaultEntityKind, isEntityKind, type EntityKind } from './entity-catalog';

/** AUEVO creatures share a chamfered glass-block vocabulary, not a reputation tier. */
export function createForestEntity(kind:EntityKind,mobile=false) {
 const group=new THREE.Group();group.userData.entityKind=kind;
 const box=new RoundedBoxGeometry(1,1,1,2,.06),color=ENTITY_CHOICES.find(c=>c.id===kind)!.color;
 const glass=new THREE.MeshPhysicalMaterial({color,roughness:.14,metalness:.07,transmission:mobile?.2:.48,thickness:.32,ior:1.46,clearcoat:1,clearcoatRoughness:.1,emissive:color,emissiveIntensity:.045});
 const pale=new THREE.MeshPhysicalMaterial({color:new THREE.Color(color).lerp(new THREE.Color('#f5eddb'),.6),roughness:.13,transmission:mobile?.18:.58,thickness:.2,ior:1.44,clearcoat:1});
 const trim=new THREE.MeshStandardMaterial({color:'#ad9b70',metalness:.7,roughness:.32});
 const eyes=new THREE.MeshBasicMaterial({color:'#fff1c2'}),dark=new THREE.MeshStandardMaterial({color:'#183124',roughness:.52});
 const animated:THREE.Mesh[]=[];
 function block(name:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:THREE.Material=glass,rz=0){const mesh=new THREE.Mesh(box,mat);mesh.name=name;mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.rotation.z=rz;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);if(/leg|wing|segment|tail/.test(name)){mesh.userData.restY=y;mesh.userData.restRZ=rz;animated.push(mesh);}return mesh;}
 function face(x:number,y:number,z:number,spacing=.075){for(const side of [-1,1]){block('eye socket',x+side*spacing,y,z,.069,.072,.025,dark);block('eye',x+side*spacing,y,z+.016,.037,.038,.015,eyes);}}
 function antenna(x:number,y:number,z:number,side:number){block('antenna',x,y,z,.027,.18,.027,trim,side*-.3);block('antenna tip',x+side*.02,y+.1,z,.055,.047,.048,pale);}
 if(kind==='beetle'){
  block('shell left',-.11,.29,-.05,.24,.31,.47);block('shell right',.11,.29,-.05,.24,.31,.47);block('shell seam',0,.32,-.05,.023,.29,.47,trim);
  block('head',0,.23,.3,.3,.22,.24,pale);face(0,.26,.427,.075);
  for(const side of [-1,1]){antenna(side*.12,.41,.33,side);for(let i=0;i<3;i++)block('leg '+i,side*.27,.075,-.21+i*.2,.22,.055,.062,trim,side*.18);}
 }else if(kind==='ant'){
  block('abdomen',0,.22,-.3,.32,.29,.31);block('thorax',0,.22,0,.22,.22,.25,pale);block('head',0,.31,.29,.3,.27,.28);face(0,.35,.437,.075);
  for(const side of [-1,1]){antenna(side*.105,.51,.3,side);for(let i=0;i<3;i++)block('leg '+i,side*.23,.085,-.19+i*.19,.29,.045,.048,trim,side*.34);}
 }else if(kind==='caterpillar'){
  for(let i=0;i<5;i++){const z=-.4+i*.19;block('segment '+i,0,.2+(i===4?.075:0),z,.32+(i===4?.035:0),.3,.25,i%2?pale:glass);for(const side of [-1,1])block('leg '+i,side*.14,.045,z,.11,.072,.08,trim);}
  face(0,.32,.496,.087);antenna(-.11,.52,.36,-1);antenna(.11,.52,.36,1);
 }else if(kind==='bird'){
  block('body',0,.29,-.04,.32,.37,.3);block('breast',0,.29,.11,.22,.25,.045,pale);block('head',0,.55,.08,.29,.27,.27,pale);face(0,.58,.225,.07);
  block('beak',0,.49,.285,.075,.057,.12,trim);
  for(const side of [-1,1]){block('wing upper',side*.27,.35,-.03,.23,.14,.39,glass,side*-.4);block('wing tip',side*.43,.29,-.09,.14,.1,.25,pale,side*-.6);block('leg',side*.09,.065,.03,.045,.11,.06,trim);block('foot',side*.09,.015,.085,.1,.035,.13,trim);}
  for(let i=0;i<3;i++)block('tail '+i,(i-1)*.085,.24,-.29,.075,.06,.27,i%2?pale:glass);
  block('crest',0,.735,.04,.07,.11,.09,glass);
 }else{
  block('body',0,.28,-.055,.31,.29,.46);block('chest',0,.31,.17,.24,.25,.08,pale);block('head',0,.5,.22,.32,.29,.29);block('muzzle',0,.435,.405,.23,.13,.14,pale);block('nose',0,.465,.48,.065,.05,.038,dark);face(0,.53,.373,.085);
  for(const side of [-1,1]){block('ear',side*.115,.715,.22,.095,.19,.11,glass,side*-.16);block('ear inset',side*.115,.72,.278,.048,.1,.015,trim,side*-.16);for(const z of [-.22,.11])block('leg',side*.11,.085,z,.083,.17,.11,trim);}
  for(let i=0;i<3;i++){const m=block('tail '+i,.075+i*.055,.26+i*.07,-.39-i*.11,.21-i*.028,.22-i*.028,.2,i===2?pale:glass);m.rotation.x=-.4;}
 }
 group.userData.animatedParts=animated;
 return group;
}
export function animateForestEntity(group:THREE.Group,time:number,moving:boolean,reduced=false){
 const kind=group.userData.entityKind as EntityKind;
 for(const [i,part] of (group.userData.animatedParts as THREE.Mesh[]).entries()){
  part.position.y=part.userData.restY;part.rotation.z=part.userData.restRZ;
  if(reduced)continue;
  if(moving&&part.name.startsWith('leg'))part.rotation.z+=Math.sin(time*12+i*2)*.2;
  if(moving&&kind==='caterpillar'&&part.name.startsWith('segment'))part.position.y+=Math.sin(time*9+i*.9)*.028;
  if(kind==='bird'&&part.name.startsWith('wing'))part.rotation.z+=Math.sin(time*(moving?12:2.2)+i%2*Math.PI)*(moving?.32:.025);
  if(part.name.startsWith('tail'))part.rotation.z+=Math.sin(time*2+i*.4)*.025;
 }
}
export function disposeForestEntity(group:THREE.Group){const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>();group.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])ms.add(m);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}
