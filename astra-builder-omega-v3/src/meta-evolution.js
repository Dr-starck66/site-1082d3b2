const KEY="astra-meta-evolution-v1";
export const META_RAILS=Object.freeze({
 zeroCostGate:true,agentShield:true,evidenlock:true,publicHealthGate:true,rollback:true,failClosedDeploy:true,minTrustThreshold:76,maxPopulation:5,maxGenerations:3,maxRescueAttempts:4,maxAdversaryPasses:2
});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||a));
const uid=(p="MP")=>p+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7);

export function defaultMetaPolicy(){
 return normalizePolicy({id:"meta-balanced-v1",name:"Balanced Sovereign",generation:1,lineage:[],buildMode:"parallel",population:4,generations:2,elite:2,earlyStopDelta:1.5,trustThreshold:78,rescueAttempts:3,adversaryPasses:1,routerBias:"balanced",explorationRate:.15});
}
export function normalizePolicy(p={}){
 return{
  id:String(p.id||uid()),name:String(p.name||"Meta Policy"),generation:clamp(p.generation,1,999),lineage:Array.isArray(p.lineage)?p.lineage.slice(-8):[],
  buildMode:["parallel","staged"].includes(p.buildMode)?p.buildMode:"parallel",
  population:clamp(p.population,2,META_RAILS.maxPopulation),generations:clamp(p.generations,1,META_RAILS.maxGenerations),elite:clamp(p.elite,1,2),
  earlyStopDelta:clamp(p.earlyStopDelta,.5,6),trustThreshold:clamp(p.trustThreshold,META_RAILS.minTrustThreshold,94),
  rescueAttempts:clamp(p.rescueAttempts,2,META_RAILS.maxRescueAttempts),adversaryPasses:clamp(p.adversaryPasses,1,META_RAILS.maxAdversaryPasses),
  routerBias:["balanced","builder","critic"].includes(p.routerBias)?p.routerBias:"balanced",explorationRate:clamp(p.explorationRate,.05,.3),
  rails:META_RAILS
 };
}
export function policyFingerprint(p){const x=normalizePolicy(p);return[x.buildMode,x.population,x.generations,x.elite,x.earlyStopDelta,x.trustThreshold,x.rescueAttempts,x.adversaryPasses,x.routerBias].join("|")}
export function rewardOutcome(o={}){
 const quality=Number(o.quality)||0,trust=Number(o.trustScore)||0,fail=Number(o.fail)||0,partial=Number(o.partial)||0,lat=Math.max(0,Number(o.latencyMs)||0),tests=Number(o.tests)||0;
 const statusBonus=o.status==="PASS"?12:o.status==="PARTIAL"?2:-20,deploy=o.deployPass?10:0;
 return Math.round((quality*.42+trust*.28+Math.min(12,tests*2.4)+statusBonus+deploy-fail*18-partial*3-Math.min(12,lat/12000))*10)/10;
}
export function policyStats(history=[]){
 const m={};for(const h of history){if(!h?.policyId)continue;(m[h.policyId]??=[]).push(h)}
 return Object.fromEntries(Object.entries(m).map(([id,a])=>{const rewards=a.map(x=>Number(x.reward)||0);return[id,{samples:a.length,avgReward:Math.round(rewards.reduce((n,x)=>n+x,0)/(rewards.length||1)*10)/10,bestReward:Math.max(...rewards),lastReward:rewards.at(-1)}]}));
}
export function mutatePolicies(active,count=4){
 const a=normalizePolicy(active),g=a.generation+1,variants=[
  {...a,id:uid("META"),name:"Reliability mutation",generation:g,lineage:[...a.lineage,a.id],buildMode:"staged",trustThreshold:a.trustThreshold+3,adversaryPasses:2,population:Math.max(3,a.population-1),routerBias:"critic"},
  {...a,id:uid("META"),name:"Efficiency mutation",generation:g,lineage:[...a.lineage,a.id],buildMode:"parallel",population:Math.max(2,a.population-1),generations:Math.max(1,a.generations-1),earlyStopDelta:a.earlyStopDelta+1,rescueAttempts:Math.max(2,a.rescueAttempts-1),routerBias:"builder"},
  {...a,id:uid("META"),name:"Exploration mutation",generation:g,lineage:[...a.lineage,a.id],population:Math.min(META_RAILS.maxPopulation,a.population+1),generations:Math.min(META_RAILS.maxGenerations,a.generations+1),earlyStopDelta:Math.max(.5,a.earlyStopDelta-.5),explorationRate:Math.min(.3,a.explorationRate+.05)},
  {...a,id:uid("META"),name:"Verification mutation",generation:g,lineage:[...a.lineage,a.id],trustThreshold:a.trustThreshold+5,adversaryPasses:2,rescueAttempts:Math.min(META_RAILS.maxRescueAttempts,a.rescueAttempts+1),routerBias:"critic"}
 ].slice(0,Math.max(2,Math.min(4,count)));
 return variants.map(normalizePolicy);
}
export function freshMetaState(){
 const activePolicy=defaultMetaPolicy();return{version:"META-1",generation:1,activePolicy,trialPolicy:null,candidates:mutatePolicies(activePolicy),history:[],decisions:[],runCounter:0,lastDecision:"BASELINE"};
}
export function loadMetaState(){
 try{const x=JSON.parse(localStorage.getItem(KEY)||"null");if(!x)return freshMetaState();return{...freshMetaState(),...x,activePolicy:normalizePolicy(x.activePolicy),trialPolicy:x.trialPolicy?normalizePolicy(x.trialPolicy):null,candidates:(x.candidates||[]).map(normalizePolicy),history:Array.isArray(x.history)?x.history.slice(-200):[],decisions:Array.isArray(x.decisions)?x.decisions.slice(-80):[]}}catch{return freshMetaState()}
}
export function saveMetaState(s){const clean={...s,history:(s.history||[]).slice(-200),decisions:(s.decisions||[]).slice(-80)};localStorage.setItem(KEY,JSON.stringify(clean));return clean}
export function beginMetaRun(meta){
 const s={...meta,runCounter:(meta.runCounter||0)+1};let policy=s.activePolicy,mode="ACTIVE";
 if(s.trialPolicy){policy=s.trialPolicy;mode="TRIAL"}
 else if(s.candidates?.length&&s.runCounter%Math.max(3,Math.round(1/(s.activePolicy.explorationRate||.15)))===0){policy=s.candidates[0];s.trialPolicy=policy;mode="TRIAL"}
 return{meta:s,policy:normalizePolicy(policy),mode,runId:uid("RUN")};
}
export function finishMetaRun(meta,run,outcome){
 const reward=rewardOutcome(outcome),entry={at:new Date().toISOString(),runId:run.runId,policyId:run.policy.id,policyName:run.policy.name,mode:run.mode,reward,...outcome};
 let s={...meta,history:[...(meta.history||[]),entry].slice(-200)},decision={action:"KEEP",reason:"insufficient evidence",reward};
 const stats=policyStats(s.history),active=stats[s.activePolicy.id],trial=s.trialPolicy&&stats[s.trialPolicy.id];
 if(s.trialPolicy&&trial?.samples>=2&&active?.samples>=2){
  if(trial.avgReward>active.avgReward+2){const old=s.activePolicy;s.activePolicy=normalizePolicy({...s.trialPolicy,generation:Math.max(s.generation+1,s.trialPolicy.generation)});s.generation=s.activePolicy.generation;s.candidates=mutatePolicies(s.activePolicy);s.trialPolicy=null;decision={action:"PROMOTE",reason:"trial beat active by "+Math.round((trial.avgReward-active.avgReward)*10)/10,from:old.id,to:s.activePolicy.id}}
  else if(trial.avgReward<active.avgReward-1){decision={action:"REJECT",reason:"trial underperformed active",trial:s.trialPolicy.id};s.candidates=(s.candidates||[]).filter(x=>x.id!==s.trialPolicy.id);s.trialPolicy=null;if(!s.candidates.length)s.candidates=mutatePolicies(s.activePolicy)}
  else{decision={action:"MORE_EVIDENCE",reason:"difference not decisive",trial:s.trialPolicy.id}}
 }
 s.lastDecision=decision.action;s.decisions=[...(s.decisions||[]),{at:new Date().toISOString(),...decision}].slice(-80);return{meta:saveMetaState(s),entry,decision,stats:policyStats(s.history)};
}
export function forceMetaEvolution(meta){
 const stats=policyStats(meta.history),s={...meta};if(!s.candidates?.length)s.candidates=mutatePolicies(s.activePolicy);
 const ranked=s.candidates.map(p=>({p,stat:stats[p.id]||{samples:0,avgReward:-Infinity}})).sort((a,b)=>b.stat.avgReward-a.stat.avgReward);
 const eligible=ranked.find(x=>x.stat.samples>=2);
 if(eligible&&eligible.stat.avgReward>(stats[s.activePolicy.id]?.avgReward??-Infinity)+2){const old=s.activePolicy;s.activePolicy=eligible.p;s.generation=s.activePolicy.generation;s.candidates=mutatePolicies(s.activePolicy);s.trialPolicy=null;s.lastDecision="PROMOTE";s.decisions=[...(s.decisions||[]),{at:new Date().toISOString(),action:"PROMOTE",from:old.id,to:s.activePolicy.id,reason:"manual meta-evolution evidence gate"}].slice(-80)}
 else{s.trialPolicy=ranked[0]?.p||s.candidates[0]||null;s.lastDecision=s.trialPolicy?"TRIAL_QUEUED":"NO_CANDIDATE"}
 return saveMetaState(s);
}
export function metaSummary(meta){return{generation:meta.generation,active:normalizePolicy(meta.activePolicy),trial:meta.trialPolicy?normalizePolicy(meta.trialPolicy):null,candidates:(meta.candidates||[]).map(normalizePolicy),stats:policyStats(meta.history),lastDecision:meta.lastDecision,historyCount:(meta.history||[]).length,rails:META_RAILS}}
