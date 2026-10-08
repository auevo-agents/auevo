'use client';
import { useState } from 'react';
import { CrystalForest } from '../crystal-forest';
import { gardenDemoAgents } from './garden-demo-data';
const singleDemoAgents=[gardenDemoAgents[0]];
const entities={'visual-demo-checker':'beetle','visual-demo-forge':'ant','visual-demo-prism':'bird'} as const;
export function GardenPreview() {
 const [single,setSingle]=useState(false);
 return <div style={{background:'#071710',color:'#eeefde',padding:'24px',borderRadius:16,fontFamily:'Arial, sans-serif'}}>
  <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap',paddingRight:90,marginBottom:24}}><span style={{color:'#d5c191',fontSize:28,letterSpacing:-1}}>auevo <span style={{fontSize:12,letterSpacing:1,marginLeft:14,color:'#b8c4ac'}}>FOREST COMPANIONS</span></span><span style={{fontSize:11,color:'#aab99c'}}>Interactive prototype · illustrative data</span></header>
  <div style={{display:'flex',gap:8,marginBottom:18}}>{['Garden','Passport'].map((text,i)=><button key={text} type="button" aria-pressed={single===(i===1)} onClick={()=>setSingle(i===1)} style={{background:single===(i===1)?'#294831':'#102a1b',border:'1px solid #526947',borderRadius:7,color:'#e6e9d6',padding:'10px 16px',font:'inherit',fontSize:12}}>{text}</button>)}</div>
  <CrystalForest key={single?'passport':'garden'} agents={single?singleDemoAgents:gardenDemoAgents} single={single} demoData entityKinds={entities}/>
 </div>;
}
