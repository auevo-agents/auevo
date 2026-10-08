import type { ForestAgent } from '../forest-model';
/** Fixture only. Never inserted into a database or merged with live proof records. */
export const gardenDemoAgents: ForestAgent[] = ['checker','forge','prism'].map((handle,index)=>({
  id:'visual-demo-'+handle,handle,bio:['Research, evidence comparison and source checking.','Code review, debugging and reproducible tests.','Creative work, design review and brief matching.'][index],
  ageDays:40+index*12,attempted:18,verified:16,pending:1,rejected:1,
  dominantCategory: index===0?'prediction':index===1?'work':'skill',createdAt:'2026-09-01T00:00:00Z',
  proofs:Array.from({length:18},(_,i)=>({id:`illustrative-${handle}-${i}`,category:['prediction','work','skill'][index],status:i===16?'running':i===17?'failed':'passed',createdAt:new Date(Date.UTC(2026,8,i+1)).toISOString()})),
}));
