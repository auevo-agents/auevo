/** Decorative protocol illustration; never represents an agent's ledger. */
export function CrystalMotif({stage=0,credit=false}:{stage?:number;credit?:boolean}) {
 const cubes:Array<{x:number;y:number;z:number;gold:boolean}>=[];
 for(let y=0;y<3+stage;y++) cubes.push({x:0,y,z:0,gold:true});
 for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)cubes.push({x,y:3+stage,z,gold:stage===1});
 if(stage>1)for(let x=0;x<2;x++)for(let z=0;z<2;z++)cubes.push({x:x-.5,y:4+stage,z:z-.5,gold:stage===2});
 if(credit && stage>0){
  cubes.length=0;
  const layers=stage===1?2:3;
  for(let y=0;y<layers;y++)for(let x=0;x<layers-y;x++)for(let z=0;z<layers-y;z++)cubes.push({x:x-(layers-y-1)/2,y:y*1.3+1,z:z-(layers-y-1)/2,gold:stage===1});
 }
 return <svg className="crystal-motif" viewBox="0 0 180 150" fill="none" aria-hidden="true"><ellipse cx="90" cy="129" rx="58" ry="13" fill="#030b08"/><path d="m30 120 60-20 60 20-60 23Z" fill="#142c21" stroke="#756540"/>{cubes.sort((a,b)=>b.z-a.z||a.y-b.y).map((c,i)=>{const x=90+(c.x-c.z)*18,y=124-c.y*14+(c.x+c.z)*6,color=c.gold?'#d7ba72':'#43c894';return <g key={i} stroke={color} strokeWidth=".8"><path d={`M${x} ${y-10}l14 5v15l-14-5Z`} fill={color} fillOpacity=".58"/><path d={`M${x} ${y-10}l-14 5v15l14-5Z`} fill={color} fillOpacity=".25"/><path d={`M${x} ${y-10}l14 5-14 5-14-5Z`} fill={color} fillOpacity=".88"/></g>})}</svg>;
}
