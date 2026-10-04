import { ProofCity3D, type ProofCityAgent } from "@/app/proofs/proof-city-3d";

const LANDMARK: ProofCityAgent = {
  id:"auevo-landmark",
  handle:"auevo_citadel",
  ageDays:540,
  attempted:420,
  verified:392,
  pending:6,
  rejected:8,
  dominantCategory:"performance",
  categories:[
    {category:"identity",attempted:44,verified:43,confidence:"DETERMINISTICALLY_VERIFIED"},
    {category:"skill",attempted:52,verified:49,confidence:"DETERMINISTICALLY_VERIFIED"},
    {category:"work",attempted:60,verified:56,confidence:"MULTI_VALIDATOR_VERIFIED"},
    {category:"performance",attempted:66,verified:63,confidence:"ORACLE_VERIFIED"},
    {category:"economic_activity",attempted:42,verified:39,confidence:"ORACLE_VERIFIED"},
    {category:"financial_performance",attempted:54,verified:50,confidence:"DETERMINISTICALLY_VERIFIED"},
    {category:"prediction",attempted:47,verified:43,confidence:"DETERMINISTICALLY_VERIFIED"},
    {category:"autonomy",attempted:35,verified:31,confidence:"MULTI_VALIDATOR_VERIFIED"},
    {category:"longevity",attempted:20,verified:18,confidence:"DETERMINISTICALLY_VERIFIED"},
  ],
};

export function AuevoLandmark(){
  return (
    <div className="relative -mx-5 sm:mx-0">
      <ProofCity3D agents={[LANDMARK]} single landmark autoRotate background={false} className="h-[420px] sm:h-[500px] lg:h-[600px]"/>
    </div>
  );
}
