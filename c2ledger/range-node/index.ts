import {mkdir,rm} from "node:fs/promises";
import {join} from "node:path";

const PORT=Number(Bun.env.PORT||3200);
const TOKEN=String(Bun.env.C2LEDGER_RANGE_TOKEN||"");
const ROOT=String(Bun.env.C2LEDGER_RANGE_ROOT||"/var/lib/c2ledger-range").replace(/\/+$/,"");
let state:any={mode:"NORMAL",degradedServices:[],lastEffect:null,canaryGeneration:0,syntheticFiles:0};

function bearer(req:Request){
  const h=req.headers.get("authorization")||"";
  return h.startsWith("Bearer ")?h.slice(7).trim():"";
}
function safeName(v:any){
  return String(v||"item").replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,80)||"item";
}
async function writeText(rel:string,body:string){
  const p=join(ROOT,rel);
  if(!p.startsWith(ROOT+"/")) throw new Error("unsafe range path");
  await mkdir(p.slice(0,p.lastIndexOf("/")),{recursive:true});
  await Bun.write(p,body);
  return p;
}
async function applyEffect(body:any){
  const effect=String(body?.effect||"");
  const id=safeName(body?.id||crypto.randomUUID());
  if(effect==="plant-marker"){
    const p=await writeText("artifacts/marker-"+id+".txt","C2LEDGER_RANGE_MARKER "+new Date().toISOString()+"\n");
    state.lastEffect={effect,id,time:new Date().toISOString()};
    return {effect,id,artifact:p};
  }
  if(effect==="degrade-service"){
    const service=safeName(body?.service||"mock-service");
    state.mode="DEGRADED";
    state.degradedServices=Array.from(new Set([...(state.degradedServices||[]),service])).slice(0,20);
    state.lastEffect={effect,service,time:new Date().toISOString()};
    return {effect,service,state:state.mode};
  }
  if(effect==="stage-synthetic-data"){
    const count=Math.max(1,Math.min(50,Number(body?.count||5)||5));
    for(let i=0;i<count;i++) await writeText("staging/synthetic-"+id+"-"+i+".json",JSON.stringify({synthetic:true,id,index:i,time:new Date().toISOString()}));
    state.syntheticFiles=(state.syntheticFiles||0)+count;
    state.lastEffect={effect,id,count,time:new Date().toISOString()};
    return {effect,id,count};
  }
  if(effect==="rotate-canary"){
    state.canaryGeneration=(state.canaryGeneration||0)+1;
    const fake="C2LEDGER_FAKE_CANARY_"+crypto.randomUUID().replaceAll("-","");
    const p=await writeText("canary/fake-credential.txt",fake+"\n");
    state.lastEffect={effect,generation:state.canaryGeneration,time:new Date().toISOString()};
    return {effect,generation:state.canaryGeneration,artifact:p,realCredential:false};
  }
  if(effect==="recover"){
    await rm(join(ROOT,"artifacts"),{recursive:true,force:true});
    await rm(join(ROOT,"staging"),{recursive:true,force:true});
    await mkdir(ROOT,{recursive:true});
    state={mode:"NORMAL",degradedServices:[],lastEffect:{effect,time:new Date().toISOString()},canaryGeneration:state.canaryGeneration||0,syntheticFiles:0};
    return {effect,state:state.mode};
  }
  throw new Error("unsupported effect");
}

Bun.serve({
  port:PORT,
  async fetch(req){
    const u=new URL(req.url);
    if(req.method==="GET"&&u.pathname==="/health") return Response.json({ok:true,mode:"AUTHORIZED_RANGE_NODE",effects:["plant-marker","degrade-service","stage-synthetic-data","rotate-canary","recover"]});
    if(req.method==="GET"&&u.pathname==="/state"){
      if(!TOKEN||bearer(req)!==TOKEN) return Response.json({error:"unauthorized"},{status:401});
      return Response.json({schema:"c2ledger-range-state/v1",...state});
    }
    if(req.method==="POST"&&u.pathname==="/effect"){
      if(!TOKEN) return Response.json({error:"range token unconfigured"},{status:503});
      if(bearer(req)!==TOKEN) return Response.json({error:"unauthorized"},{status:401});
      let body:any;try{body=await req.json()}catch{return Response.json({error:"invalid json"},{status:400})}
      try{
        const result=await applyEffect(body);
        return Response.json({status:"PASS",nodeMode:"AUTHORIZED_RANGE_NODE",result,state});
      }catch(e:any){
        return Response.json({error:String(e?.message||e)},{status:400});
      }
    }
    return Response.json({error:"not found"},{status:404});
  }
});
console.log("C2LEDGER_RANGE_NODE_READY",JSON.stringify({port:PORT,mode:"AUTHORIZED_RANGE_NODE"}));
