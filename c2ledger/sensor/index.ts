const ENGINE_URL=String(Bun.env.C2LEDGER_ENGINE_URL||"http://engine:3000").replace(/\/$/,"");
const SENSOR_ID=String(Bun.env.C2LEDGER_SENSOR_ID||"sensor-local").slice(0,96);
const TOKEN=String(Bun.env.C2LEDGER_SENSOR_TOKEN||"");
const MAX_LINE=64*1024;

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

async function ship(event:any){
  const body=sanitize(event);
  const headers:any={"content-type":"application/json","x-c2ledger-sensor":SENSOR_ID};
  if(TOKEN) headers.authorization="Bearer "+TOKEN;
  const res=await fetch(ENGINE_URL+"/api/sensor/events",{method:"POST",headers,body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
  if(!res.ok) throw new Error("engine rejected event: "+res.status);
}

if(import.meta.main){
  const reader=Bun.stdin.stream().getReader();
  const decoder=new TextDecoder();
  let buf="";
  while(true){
    const {done,value}=await reader.read();
    if(done) break;
    buf+=decoder.decode(value,{stream:true});
    if(buf.length>MAX_LINE*4) buf=buf.slice(-MAX_LINE*2);
    let p;
    while((p=buf.indexOf("\n"))>=0){
      const line=buf.slice(0,p).trim(); buf=buf.slice(p+1);
      if(!line) continue;
      if(line.length>MAX_LINE){console.error("SENSOR_DROP oversized");continue;}
      try{await ship(JSON.parse(line));console.log("SENSOR_SENT")}
      catch(e:any){console.error("SENSOR_FAIL",String(e?.message||e))}
    }
  }
}
