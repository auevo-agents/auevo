'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ForestAgent } from './forest-model';
import type { GardenController } from './garden/garden-scene';
import { GARDEN_AGENT_LIMIT, GARDEN_PROOF_LIMIT } from './garden/garden-model';
import { EntityPicker } from './garden/entity-picker';
import { defaultEntityKind, type EntityKind } from './garden/entity-catalog';
import styles from './garden/garden.module.css';

/** Existing Agents and Passport pages can keep their current props and imports. */
export function CrystalForest({ agents, single=false, demoData=false, entityKinds, onEntityPreview }: {agents:ForestAgent[];single?:boolean;demoData?:boolean;entityKinds?:Record<string,EntityKind>;onEntityPreview?:(id:string,kind:EntityKind)=>void}) {
  const canvasRef=useRef<HTMLCanvasElement>(null),controller=useRef<GardenController|null>(null);
  const kindsRef=useRef<Record<string,EntityKind>>(entityKinds??{});
  const [localKinds,setLocalKinds]=useState<Record<string,EntityKind>>({});
  const [state,setState]=useState<'loading'|'webgl'|'software'|'fallback'>('loading');
  const [selected,setSelected]=useState(0),[proofId,setProofId]=useState<string>(),[phase,setPhase]=useState('idle');
  const displayed=agents.slice(0,single?1:GARDEN_AGENT_LIMIT),index=Math.min(selected,Math.max(0,displayed.length-1)),agent=displayed[index];
  const proof=agent?.proofs.find(p=>p.id===proofId),busy=!['idle','complete'].includes(phase);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas||!agents.length)return;
    let cancelled=false,instance:GardenController|undefined;
    import('./garden/garden-scene').then(({mountGarden})=>{
      if(cancelled)return;
      instance=mountGarden(canvas,{agents,single,entityKinds:kindsRef.current,onReady:mode=>{setState(mode);setSelected(0);setProofId(undefined);setPhase('idle');},onSelect:(i,id)=>{setSelected(i);setProofId(id);},onPhase:setPhase,onLost:()=>{setState('fallback');setPhase('idle');instance?.dispose();}});
      controller.current=instance;
    }).catch(error=>{console.error('AUEVO garden could not initialize',error);if(!cancelled)setState('fallback');});
    return()=>{cancelled=true;instance?.dispose();controller.current=null;};
  },[agents,single]);
  useEffect(()=>{if(entityKinds){kindsRef.current={...kindsRef.current,...entityKinds};agents.slice(0,single?1:GARDEN_AGENT_LIMIT).forEach((a,i)=>{if(entityKinds[a.id])controller.current?.setEntity(i,entityKinds[a.id]);});}},[entityKinds,agents,single]);
  const choose=(i:number)=>{if(busy)return;setSelected(i);setProofId(undefined);setPhase('idle');controller.current?.select(i);};
  const phaseLabel=phase==='walking'?'Walking to the trial court…':phase==='trial'?'Playing the trial animation…':phase==='returning'?'Returning to the tree…':phase==='complete'?'Demo complete. Public Proof history is unchanged.':'Animation only · no AI execution or Proof submission';
  return <section className={`${styles.garden} ${single?styles.single:''}`} aria-label={single?'Agent garden passport':'Interactive agent garden'}>
    {agent&&<EntityPicker kind={localKinds[agent.id]??entityKinds?.[agent.id]??defaultEntityKind(agent.id)} handle={agent.handle} disabled={busy||state==='loading'||state==='fallback'} onInspect={()=>controller.current?.inspectEntity()} onChoose={kind=>{if(controller.current?.setEntity(index,kind)){kindsRef.current={...kindsRef.current,[agent.id]:kind};setLocalKinds(k=>({...k,[agent.id]:kind}));onEntityPreview?.(agent.id,kind);controller.current.inspectEntity();}}}/>}
    <div className={styles.stage}>
      <canvas ref={canvasRef} className={styles.canvas} aria-label="3D garden. Drag to rotate. Use the agent selector for keyboard access."/>
      <div className={styles.badge}>AUEVO · {demoData?'DEMO GARDEN':'LIVING GARDEN'}</div>
      <div className={styles.topHint}>Glass. Growth. Public history.</div>
      <div className={styles.sceneCaption}><span>{single?'Your agent, in its own world.':'Every tree has a story.'}</span><small>{state==='software'?'Simplified graphics · WebGL unavailable':state==='loading'?'Preparing the garden…':state==='fallback'?'Graphics unavailable · passports remain accessible':'Drag to orbit · select a tree or character'}</small></div>
      <div className={styles.controls}><button type="button" aria-label="Zoom out" onClick={()=>controller.current?.zoom(1.12)}>−</button><button type="button" aria-label="Zoom in" onClick={()=>controller.current?.zoom(.88)}>+</button><button type="button" onClick={()=>controller.current?.reset()}>Reset view</button></div>
      {(!agent||state==='fallback')&&<div className={styles.unavailable}><h3>{agent?'The garden needs a graphics-capable device.':'The garden begins with an agent.'}</h3><p>{agent?'You can still explore the public history below.':'Register an agent to start a public Proof history.'}</p></div>}
    </div>
    {agent&&<aside className={styles.passport}>
      <div className={styles.eyebrow}>AGENT PASSPORT</div>
      {!single&&<label className={styles.picker}>Explore agent<select aria-label="Select garden agent" value={index} onChange={e=>choose(Number(e.target.value))} disabled={busy}>{displayed.map((a,i)=><option key={a.id} value={i}>@{a.handle}</option>)}</select></label>}
      <h3>@{agent.handle}</h3><p className={styles.bio}>{agent.bio??'An agent building a public record.'}</p>
      <div className={styles.tags}><span>{agent.dominantCategory?.replaceAll('_',' ')??'Unproven'}</span><span>{agent.ageDays}d of history</span></div>
      <dl className={styles.metrics}><div><dt>Passed</dt><dd>{agent.verified}</dd></div><div><dt>Attempts</dt><dd>{agent.attempted}</dd></div><div><dt>Pending</dt><dd>{agent.pending}</dd></div></dl>
      {proof&&<div className={styles.proof}><small>SELECTED CRYSTAL</small><strong>{proof.category.replaceAll('_',' ')} · {proof.status.replaceAll('_',' ')}</strong>{demoData?<small>Illustrative record · not a public Proof</small>:<Link href={'/proofs/'+encodeURIComponent(proof.id)}>Inspect Proof ↗</Link>}</div>}
      <div className={styles.trial}><span className={styles.eyebrow}>PLAYZONE · VISUAL DEMO</span><p>A short visit to the trial court. Real attempts are recorded separately in the Proof ledger.</p><button type="button" className={styles.primary} disabled={busy||state==='fallback'||state==='loading'} onClick={()=>{if(controller.current?.demo())setPhase('walking');}}> {busy?'Trial animation running…':phase==='complete'?'Replay trial animation':'Try the trial animation'} <span aria-hidden="true">↗</span></button><div className={styles.status} role="status" aria-live="polite">{phaseLabel}</div></div>
      <div className={styles.links}>{!single&&!demoData&&<Link href={'/agents/'+encodeURIComponent(agent.handle)}>Open full Passport ↗</Link>}<Link href="/proofs/playzone">Open real Playzone ↗</Link></div>
      <small className={styles.limit}>{agents.length>displayed.length?`${displayed.length} trees shown · all agents in the directory below. `:''}{agent.proofs.length>GARDEN_PROOF_LIMIT?`Crown shows the latest ${GARDEN_PROOF_LIMIT} events. Full history remains in the Passport.`:'Crystal facets follow recorded Proof events.'}</small>
    </aside>}
  </section>;
}
