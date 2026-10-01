import{scoreVariant,createGenome}from"./sovereign.js";
import{metricSnapshot,compare}from"./benchmark-x10.js";

export const DEFAULT_EVOLUTION={population:4,generations:2,elite:2,earlyStopDelta:1.5};

const STRATEGIES=[
 {id:"reliability",label:"Reliability-first",directive:"Prioritize correctness, tests, explicit error handling, health checks, data integrity and production robustness."},
 {id:"product",label:"Product-first",directive:"Prioritize user value, coherent flows, useful features, interaction quality and simplicity without removing required safeguards."},
 {id:"architecture",label:"Architecture-first",directive:"Prioritize clean boundaries, maintainability, modularity, API contracts, database design and deployability."},
 {id:"performance",label:"Performance-first",directive:"Prioritize low latency, small payloads, efficient rendering, caching opportunities and operational efficiency without fake optimizations."},
 {id:"security",label:"Security-first",directive:"Prioritize least privilege, validation, auth boundaries, secret safety and abuse resistance."},
 {id:"ux",label:"UX-first",directive:"Prioritize accessibility, responsive behavior, clarity, empty/error/loading states and polished interaction design."}
];

export function seedPopulation(size=4,generation=1){
 return Array.from({length:Math.max(2,Math.min(6,size))},(_,i)=>{const strategy=STRATEGIES[(i+generation-1)%STRATEGIES.length];return{...strategy,strategy,generation,index:i}});
}

export function candidateFitness({files=[],evidence=[],trust=null,latencyMs=0,status="UNVERIFIED"}={}){
 const base=scoreVariant(files,evidence),quality=metricSnapshot({files,evidence,status}).quality;
 const trustBonus=trust?.status==="PASS"?12:trust?.status==="PARTIAL"?2:trust?.status==="FAIL"?-18:0;
 const latencyPenalty=Math.min(12,Math.max(0,latencyMs)/10000);
 const failPenalty=evidence.filter(x=>x.status==="FAIL").length*14;
 return Math.round((base+quality*.32+trustBonus-latencyPenalty-failPenalty)*10)/10;
}

export function rankPopulation(items=[]){
 return items.slice().sort((a,b)=>(b.fitness??-Infinity)-(a.fitness??-Infinity)).map((x,i)=>({...x,rank:i+1}));
}

export function breedDirectives(elites=[],generation=2,size=4){
 if(!elites.length)return seedPopulation(size,generation);
 const out=[];
 for(let i=0;i<size;i++){
  const a=elites[i%elites.length],b=elites[(i+1)%elites.length],sa=a.strategy||{label:a.label||a.id},sb=b.strategy||{label:b.label||b.id};
  const mutation=STRATEGIES[(generation+i+1)%STRATEGIES.length];
  out.push({
   id:"g"+generation+"-"+i,
   label:"G"+generation+" · "+sa.label+" × "+sb.label+" + "+mutation.label,
   generation,index:i,
   directive:"CROSSOVER: retain the strongest verified traits of "+sa.label+" and "+sb.label+". MUTATION: "+mutation.directive,
   parents:[a.id,b.id],
   mutation:mutation.id,
   strategy:mutation
  });
 }
 return out;
}

export function evolutionDecision(previousBest,currentBest,earlyStopDelta=1.5){
 if(!previousBest)return{action:"CONTINUE",delta:null,reason:"baseline generation"};
 const delta=Math.round(((currentBest?.fitness??0)-(previousBest?.fitness??0))*10)/10;
 if(delta<0)return{action:"ROLLBACK",delta,reason:"best candidate regressed"};
 if(delta<earlyStopDelta)return{action:"EARLY_STOP",delta,reason:"marginal gain below threshold"};
 return{action:"CONTINUE",delta,reason:"meaningful fitness gain"};
}

export function makeEvolutionRecord({candidate,files,evidence,cfg,status,latencyMs,trust}){
 const fitness=candidateFitness({files,evidence,trust,latencyMs,status});
 const genome=createGenome({spec:candidate.spec,files,evidence,cfg,status,label:candidate.label,parent:candidate.parents?.join("+")||null});
 genome.mutation=candidate.mutation||candidate.strategy?.id||"seed";
 return{...candidate,fitness,latencyMs,status,trust,files,evidence,genome,metrics:metricSnapshot({files,evidence,startedAt:Date.now()-latencyMs,status})};
}

export function compareWinner(base,winner){
 return compare(metricSnapshot({files:base.files,evidence:base.evidence,status:base.status}),metricSnapshot({files:winner.files,evidence:winner.evidence,status:winner.status}));
}
