export const ENTITY_CHOICES = [
  {id:'beetle',name:'Beetle',description:'A compact explorer with a glass shell.',color:'#36a879',palette:'Emerald'},
  {id:'ant',name:'Ant',description:'A curious companion with a segmented body.',color:'#dba462',palette:'Amber'},
  {id:'caterpillar',name:'Caterpillar',description:'A gentle crawler made of soft glass blocks.',color:'#afc65b',palette:'Lime'},
  {id:'bird',name:'Bird',description:'A light forest scout with crystalline wings.',color:'#86c3d1',palette:'Ice teal'},
  {id:'fox',name:'Fox',description:'An alert companion with a stepped glass tail.',color:'#c99b96',palette:'Rose'},
] as const;
export type EntityKind = typeof ENTITY_CHOICES[number]['id'];
export function isEntityKind(value:unknown):value is EntityKind {return ENTITY_CHOICES.some(c=>c.id===value);}
export function defaultEntityKind(id:string):EntityKind {let hash=0;for(const c of id)hash=(hash*31+c.charCodeAt(0))>>>0;return ENTITY_CHOICES[hash%ENTITY_CHOICES.length].id;}
