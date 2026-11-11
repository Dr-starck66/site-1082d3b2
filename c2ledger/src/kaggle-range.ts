export const KAGGLE_RANGE_PROFILE={
  mode:"KAGGLE_ACCELERATED_RANGE_INTELLIGENCE",
  deployable:true,
  executionBoundary:"EPHEMERAL_PRIVATE_LAB_ONLY",
  notebook:{
    internet:false,
    gpuOptional:true,
    tpuOptional:true,
    arbitraryNetworkTargets:false
  },
  plan:{
    targets:["lab-edge","lab-ci","lab-data"],
    effects:["plant-marker","stage-synthetic-data","rotate-canary","degrade-service","recover"],
    arbitraryTargets:false,
    arbitraryCommands:false,
    exploitDelivery:false,
    credentialTheft:false,
    propagation:false,
    destructiveActions:false
  }
} as const;

export function validateKagglePlan(plan:any){
  const allowedTargets=new Set(KAGGLE_RANGE_PROFILE.plan.targets as readonly string[]);
  const allowedEffects=new Set(KAGGLE_RANGE_PROFILE.plan.effects as readonly string[]);
  if(!plan||plan.schema!=="c2ledger-kaggle-plan/v1"||!Array.isArray(plan.steps)) throw new Error("invalid Kaggle range plan");
  if(plan.steps.length<1||plan.steps.length>24) throw new Error("invalid Kaggle range step count");
  const normalized=plan.steps.map((x:any,i:number)=>{
    const target=String(x?.target||"");
    const effect=String(x?.effect||"");
    if(!allowedTargets.has(target)) throw new Error("Kaggle range target blocked: "+target);
    if(!allowedEffects.has(effect)) throw new Error("Kaggle range effect blocked: "+effect);
    return {
      order:i+1,
      target,
      effect,
      id:String(x?.id||("kaggle-step-"+(i+1))).replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,80),
      service:String(x?.service||"synthetic-service").replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,80),
      count:Math.max(1,Math.min(50,Number(x?.count||5)||5))
    };
  });
  return {status:"PASS",mode:KAGGLE_RANGE_PROFILE.mode,steps:normalized,safety:KAGGLE_RANGE_PROFILE.plan};
}
