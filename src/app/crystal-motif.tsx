/** Decorative studio sculpture. Agent passports always render their live ledger geometry. */
export function CrystalMotif({stage=0,credit=false}:{stage?:number;credit?:boolean}) {
 const sculpture=credit ? stage===0?0:stage===1?1:2 : stage===0?0:stage===1?1:stage===2?2:3;
 return <div className={`crystal-motif sculpture-${sculpture}`} aria-hidden="true"><div className="sculpture-aura"/><div className="sculpture-art"/><div className="sculpture-dust"><i/><i/><i/></div></div>;
}
