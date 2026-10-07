/* eslint-disable @next/next/no-img-element -- These small embedded previews also run outside Next.js. */
import { ENTITY_CHOICES, type EntityKind } from './entity-catalog';
import beetle from './entity-thumbnails/beetle.png';
import ant from './entity-thumbnails/ant.png';
import caterpillar from './entity-thumbnails/caterpillar.png';
import bird from './entity-thumbnails/bird.png';
import fox from './entity-thumbnails/fox.png';
import styles from './garden.module.css';
const thumbnails={beetle,ant,caterpillar,bird,fox};
export function EntityPicker({kind,disabled,onChoose,onInspect,handle}:{kind:EntityKind;disabled:boolean;onChoose:(kind:EntityKind)=>void;onInspect:()=>void;handle:string}){
 return <div className={styles.entityPicker}><div className={styles.entityPickerTitle}><div><span>CHOOSE A FOREST COMPANION</span><small>Appearance preview for @{handle} · the tree records Proof history</small></div><button type="button" onClick={onInspect} disabled={disabled}>Inspect creature ↗</button></div><div className={styles.entityOptions} role="group" aria-label="Choose entity appearance">{ENTITY_CHOICES.map(choice=>{const image=thumbnails[choice.id];return <button key={choice.id} type="button" aria-pressed={kind===choice.id} disabled={disabled} onClick={()=>onChoose(choice.id)}><img src={typeof image==='string'?image:image.src} alt="" width={144} height={112}/><span>{choice.name}<small style={{color:choice.color}}>{choice.palette}</small></span></button>;})}</div><p>{ENTITY_CHOICES.find(c=>c.id===kind)?.description} <span>Species is cosmetic; it does not set capabilities or reputation.</span></p></div>;
}
