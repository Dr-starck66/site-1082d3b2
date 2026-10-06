const ENGINE_URL=String(Bun.env.C2LEDGER_ENGINE_URL||"http://engine:3000").replace(/\/$/,"");
const SENSOR_ID=String(Bun.env.C2LEDGER_SENSOR_ID||"sensor-local").slice(0,96);
const ENGINE_TOKEN=String(Bun.env.C2LEDGER_SENSOR_TOKEN||"");
const INGEST_TOKEN=String(Bun.env.C2LEDGER_SENSOR_INGEST_TOKEN||"");
const PORT=Number(Bun.env.PORT||3100);
const MAX_BODY=64*1024;

function sanitize(x:any){
  const out:any={
    sensorId:SENSOR_ID,
    time:new Date().toISOString(),
    type:String(x?.type||"telemetry").slice(0,48),
    source:String(x?.source||"local").slice(0,128),
    severity:String(x?.severity||"info").slice(0,16),
    message:String(x?.message||"").slice(0,2048),
    tags:Array.isArray(x?.tags)?x.tags.map((v:any)=>String(v).slice(0,48)).slice(0,20):[]
  };
  if(x?.chain) out.chain=String(x.chain).slice(0,24);
  if(x?.txHash) out.txHash=String(x.txHash).slice(0,130);
  if(x?.domain) out.domain=String(x.domain).slice(0,253);
  if(x?.rawIp) out.rawIp=String(x.rawIp).slice(0,64);
  if(x?.payloadHash) out.payloadHash=String(x.payloadHash).slice(0,130);
  return out;
}

function bearer(req:Request){
  const h=req.headers.get("authorization")||"";
  return h.startsWith("Bearer ")?h.slice(7).trim():"";
}

async function ship(event:any){
  if(!ENGINE_TOKEN) throw new Error("engine sensor token unconfigured");
  const body=sanitize(event);
  const res=await fetch(ENGINE_URL+"/api/sensor/events",{
    method:"POST",
    headers:{"content-type":"application/json","x-c2ledger-sensor":SENSOR_ID,authorization:"Bearer "+ENGINE_TOKEN},
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(5000)
  });
  if(!res.ok) throw new Error("engine rejected event: "+res.status);
  return await res.json();
}

Bun.serve({
  port:PORT,
  async fetch(req){
    const u=new URL(req.url);
    if(req.method==="GET"&&u.pathname==="/health") return Response.json({ok:true,sensorId:SENSOR_ID,engine:ENGINE_URL,mode:"PASSIVE_FORWARDER"});
    if(req.method==="POST"&&u.pathname==="/event"){
      if(!INGEST_TOKEN) return Response.json({error:"sensor ingest token unconfigured"},{status:503});
      if(bearer(req)!==INGEST_TOKEN) return Response.json({error:"unauthorized"},{status:401});
      const len=Number(req.headers.get("content-length")||0);
      if(len>MAX_BODY) return Response.json({error:"event too large"},{status:413});
      let body:any; try{body=await req.json()}catch{return Response.json({error:"invalid json"},{status:400})}
      try{return Response.json({ok:true,forwarded:await ship(body)})}
      catch(e:any){return Response.json({error:String(e?.message||e)},{status:502})}
    }
    return Response.json({error:"not found"},{status:404});
  }
});
console.log("C2LEDGER_SENSOR_READY",JSON.stringify({sensorId:SENSOR_ID,port:PORT,mode:"PASSIVE_FORWARDER"}));
