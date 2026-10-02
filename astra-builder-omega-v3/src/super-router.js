const now=()=>Date.now();
const state={
  circuits:new Map(),
  metrics:new Map(),
  negative:new Map(),
  evidence:[],
  health:{at:0,data:null},
  lastRoute:null
};
const HEALTH_TTL=10000,CIRCUIT_MS=15000,FAIL_THRESHOLD=2,MAX_EVIDENCE=120;

const roleRules=[
  ["adversary",/adversary|skeptic|red.?team|false.?pass|attack/i],
  ["verifier",/verify|verification|fact.?check|audit/i],
  ["security",/security|auth|rbac|permission|secret|credential|oauth|session/i],
  ["database",/database|postgres|sql|schema|migration/i],
  ["ops",/devops|deploy|docker|railway|vercel|netlify|healthcheck|runtime/i],
  ["backend",/backend|api|server|webhook|endpoint/i],
  ["frontend",/frontend|ui|ux|responsive|css|html|react|vue/i],
  ["architect",/architect|architecture|spec|design system/i],
  ["repair",/repair|fix|debug|improve|refactor/i]
];

export function profileTask(system="",user="",requestedModel=""){
  const systemText=String(system).toLowerCase(),text=(String(system)+"\n"+String(user)+"\n"+String(requestedModel)).toLowerCase();
  let role="general";
  for(const [r,re] of roleRules){if(re.test(systemText)){role=r;break}}
  if(role==="general")for(const [r,re] of roleRules){if(re.test(text)){role=r;break}}
  let complexity=0,risk=0;
  const complexitySignals=[/full.?stack/,/multi.?agent/,/repository|codebase/,/authentication|oauth|session/,/database|postgres|migration/,/deploy|docker|railway/,/tests?|benchmark/,/integration|webhook/,/refactor|architecture/,/search|pipeline|dashboard/];
  for(const re of complexitySignals)if(re.test(text))complexity++;
  const riskSignals=[/auth|oauth|session|rbac|permission/,/security|secret|credential/,/deploy|production|railway|docker/,/database|migration|delete|destructive/,/payment|stripe|billing/];
  for(const re of riskSignals)if(re.test(text))risk++;
  if(text.length>12000)complexity+=3;else if(text.length>6000)complexity+=2;else if(text.length>2500)complexity++;
  const requiresJson=/json only|json_object|\{summary|files:\s*\[|structured json/i.test(text);
  const criticRole=/adversary|verifier|security/.test(role)||/gemma|deepseek|critic|skeptic|verify|adversary/i.test(String(requestedModel));
  const mode=complexity+risk>=7?"DEEP":complexity+risk>=3?"STANDARD":"FAST";
  const tokenBudget=criticRole?(mode==="DEEP"?1536:mode==="STANDARD"?1024:640):(mode==="DEEP"?3072:mode==="STANDARD"?2400:1024);
  return{role,complexity,risk,requiresJson,criticRole,mode,tokenBudget,contextChars:text.length};
}

function providerId(kind){return kind}
function modelFor(kind){return kind==="critic"?"gemma-critic-local":kind==="fast"?"qwen-fast-local":kind==="standard"?"qwen-standard-local":"qwen-coder-local"}
function circuit(kind){
  const id=providerId(kind),c=state.circuits.get(id)||{failures:0,openUntil:0,lastError:""};
  if(c.openUntil&&c.openUntil<=now()){c.openUntil=0;c.failures=0}
  state.circuits.set(id,c);return c;
}
function circuitOpen(kind){return circuit(kind).openUntil>now()}
function markSuccess(kind,latency){
  const id=providerId(kind),c=circuit(kind);c.failures=0;c.openUntil=0;c.lastError="";
  const m=state.metrics.get(id)||{calls:0,success:0,fail:0,ewmaLatency:0};
  m.calls++;m.success++;m.ewmaLatency=m.ewmaLatency?Math.round(m.ewmaLatency*.75+latency*.25):latency;state.metrics.set(id,m);
}
function classifyError(msg=""){
  const s=String(msg).toLowerCase();
  if(/401|403|unauthor|forbidden|token|credential/.test(s))return"AUTH";
  if(/429|quota|rate.?limit/.test(s))return"RATE_LIMIT";
  if(/timeout|abort|502|503|504|fetch|network|socket|econn/.test(s))return"TRANSIENT";
  if(/json|parse|format|empty|invalid/.test(s))return"FORMAT";
  return"PROVIDER";
}
function markFailure(kind,error,profile){
  const id=providerId(kind),c=circuit(kind),errorKind=classifyError(error);c.failures++;c.lastError=String(error).slice(0,240);
  if(c.failures>=FAIL_THRESHOLD&&["TRANSIENT","RATE_LIMIT","PROVIDER","AUTH"].includes(errorKind))c.openUntil=now()+CIRCUIT_MS;
  const m=state.metrics.get(id)||{calls:0,success:0,fail:0,ewmaLatency:0};m.calls++;m.fail++;state.metrics.set(id,m);
  const sig=id+":"+profile.role+":"+classifyError(error),n=state.negative.get(sig)||{count:0,lastAt:0};n.count++;n.lastAt=now();state.negative.set(sig,n);
}
function evidence(event){
  state.evidence.push({at:new Date().toISOString(),...event});
  if(state.evidence.length>MAX_EVIDENCE)state.evidence.splice(0,state.evidence.length-MAX_EVIDENCE);
}
async function health(){
  if(state.health.data&&now()-state.health.at<HEALTH_TTL)return state.health.data;
  try{
    const r=await fetch("/api/local_model_status",{cache:"no-store"});
    const data=await r.json();
    state.health={at:now(),data};
    return data;
  }catch(error){
    const data={status:"UNVERIFIED",fast:{status:"UNVERIFIED"},standard:{status:"UNVERIFIED"},builder:{status:"UNVERIFIED"},critic:{status:"UNVERIFIED"},reason:String(error)};
    state.health={at:now(),data};return data;
  }
}
function healthRank(x){return x==="PASS"?3:x==="PARTIAL"?2:x==="UNVERIFIED"?1:0}
function reconcileHealthyCircuits(h){
  for(const kind of ["fast","standard","builder","critic"]){
    if(h?.[kind]?.status==="PASS"){const c=circuit(kind);c.failures=0;c.openUntil=0;c.lastError=""}
  }
}
function negativePenalty(kind,profile){
  let p=0;for(const [sig,v] of state.negative){if(sig.startsWith(providerId(kind)+":"+profile.role+":")&&now()-v.lastAt<300000)p+=Math.min(30,v.count*8)}return p;
}
function score(kind,profile,h){
  const id=providerId(kind),m=state.metrics.get(id)||{},hs=healthRank(h?.[id]?.status||"UNVERIFIED");
  let s=hs*30-(m.ewmaLatency||0)/10000-negativePenalty(kind,profile);
  if(profile.criticRole){
    s+=kind==="critic"?85:kind==="standard"?20:kind==="builder"?10:-35;
  }else if(profile.mode==="FAST"){
    s+=kind==="fast"?85:kind==="standard"?35:kind==="builder"?5:-30;
  }else if(profile.mode==="STANDARD"){
    s+=kind==="standard"?90:kind==="builder"?45:kind==="fast"?15:-20;
  }else{
    s+=kind==="builder"?95:kind==="standard"?55:kind==="critic"?0:-60;
  }
  if(profile.role==="security"&&kind==="critic")s+=15;
  if(circuitOpen(kind))s-=1000;
  return s;
}
export async function routePlan(system,user,requestedModel){
  const profile=profileTask(system,user,requestedModel),h=await health();reconcileHealthyCircuits(h);
  const pool=profile.criticRole?["critic","standard","builder","fast"]:profile.mode==="FAST"?["fast","standard","builder","critic"]:profile.mode==="STANDARD"?["standard","builder","fast","critic"]:["builder","standard","critic","fast"];
  const choices=pool.map(kind=>({kind,model:modelFor(kind),score:score(kind,profile,h),health:h?.[providerId(kind)]?.status||"UNVERIFIED",circuitOpen:circuitOpen(kind)})).sort((a,b)=>b.score-a.score);
  return{profile,healthStatus:h?.status||"UNVERIFIED",choices,policy:{zeroCostFirst:true,localFirst:true,failClosed:true,expressLane:true,standardLane:true,circuitMs:CIRCUIT_MS,failThreshold:FAIL_THRESHOLD}};
}
function parseMaybeJson(text){
  const s=String(text||"").trim().replace(/^```(?:json)?/i,"").replace(/```$/,"").trim();
  try{return JSON.parse(s)}catch{}
  const a=s.indexOf("{"),b=s.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(s.slice(a,b+1));
  throw new Error("structured JSON missing");
}
function validateOutput(text,profile){
  if(!String(text||"").trim())throw new Error("empty model output");
  if(profile.requiresJson)parseMaybeJson(text);
  return true;
}
async function localCall(kind,system,user,profile){
  const started=now(),model=modelFor(kind);
  const r=await fetch("/api/local_text",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({system,user,requestedModel:model,maxTokens:profile.tokenBudget})});
  const raw=await r.text();let data={};try{data=JSON.parse(raw)}catch{}
  if(!r.ok)throw new Error("local "+kind+" "+r.status+": "+String(data?.reason||raw).slice(0,260));
  const text=String(data?.text||"");validateOutput(text,profile);
  return{text,data,latencyMs:now()-started,kind,model};
}
function shouldEscalate(profile,first){
  if(profile.criticRole)return false;
  if(profile.mode!=="DEEP"&&profile.risk<2)return false;
  return first?.data?.status==="PARTIAL"||profile.risk>=3;
}
async function compactCriticCheck(system,user,candidate,profile){
  const payload=JSON.stringify({role:profile.role,risk:profile.risk,request:String(user).slice(0,2600),candidate:String(candidate).slice(0,6500)});
  const p={...profile,criticRole:true,requiresJson:true,tokenBudget:640};
  const check=await localCall("critic","You are DUALITY-X route verifier. JSON only: {verdict:'PASS|PARTIAL|FAIL',issues:[]}. Check only obvious contradictions, malformed output, unsafe claims, or missing required structure. Do not rewrite the answer.",payload,p);
  const parsed=parseMaybeJson(check.text),verdict=String(parsed?.verdict||"UNVERIFIED").toUpperCase();
  return{...check,verdict,issues:Array.isArray(parsed?.issues)?parsed.issues.slice(0,8):[]};
}
export async function superRoute({system="",user="",requestedModel=""}={}){
  const plan=await routePlan(system,user,requestedModel),traceId=crypto.randomUUID?.()||String(now()),failures=[];
  if(plan.choices.length&&plan.choices.every(x=>x.circuitOpen)){
    const probe=plan.choices.find(x=>x.health==="PASS")||plan.choices[0],c=circuit(probe.kind);
    c.openUntil=0;c.failures=Math.min(c.failures,1);probe.circuitOpen=false;
    evidence({traceId,type:"CIRCUIT_HALF_OPEN",status:"PARTIAL",provider:probe.kind,detail:"all routes were open; forced one recovery probe"});
  }
  evidence({traceId,type:"ROUTE_PLAN",status:"PASS",role:plan.profile.role,mode:plan.profile.mode,choices:plan.choices.map(x=>({kind:x.kind,score:Math.round(x.score),health:x.health,circuitOpen:x.circuitOpen}))});
  for(const choice of plan.choices){
    if(choice.circuitOpen){failures.push(choice.kind+": circuit open");continue}
    try{
      const out=await localCall(choice.kind,system,user,plan.profile);markSuccess(choice.kind,out.latencyMs);
      let gate={verdict:"PASS",issues:[]};
      if(shouldEscalate(plan.profile,out)){
        try{
          const audit=await compactCriticCheck(system,user,out.text,plan.profile);markSuccess("critic",audit.latencyMs);
          gate={verdict:audit.verdict,issues:audit.issues};
          if(audit.verdict==="FAIL")throw new Error("DUALITY-X route gate rejected primary output: "+audit.issues.join("; ").slice(0,220));
        }catch(e){
          if(choice.kind!=="critic"){markFailure("critic",e,plan.profile);evidence({traceId,type:"DUALITY_X",status:"PARTIAL",detail:String(e).slice(0,240)})}
          else throw e;
        }
      }
      const result={status:failures.length?"PARTIAL":"PASS",text:out.text,provider:"ASTRA SUPER ROUTER Ω",model:out.model,kind:out.kind,routeMode:plan.profile.mode,routeRole:plan.profile.role,tokenBudget:plan.profile.tokenBudget,latencyMs:out.latencyMs,fallback:failures.length>0,failures,duality:gate,traceId};
      state.lastRoute=result;evidence({traceId,type:"ROUTE_RESULT",status:result.status,provider:out.kind,latencyMs:out.latencyMs,fallback:result.fallback,duality:gate.verdict});
      return result;
    }catch(error){
      markFailure(choice.kind,error,plan.profile);failures.push(choice.kind+": "+String(error?.message||error).slice(0,220));evidence({traceId,type:"PROVIDER_FAIL",status:"FAIL",provider:choice.kind,error:String(error?.message||error).slice(0,240)});
    }
  }
  const err=new Error("ASTRA SUPER ROUTER Ω fail-closed: no healthy local route; "+failures.join(" | "));
  err.astra={traceId,plan,failures};state.lastRoute={status:"FAIL",traceId,failures,routeMode:plan.profile.mode,routeRole:plan.profile.role};throw err;
}
export function routerTelemetry(){
  return{
    status:state.lastRoute?.status||"UNVERIFIED",
    lastRoute:state.lastRoute,
    circuits:Object.fromEntries([...state.circuits]),
    metrics:Object.fromEntries([...state.metrics]),
    negativeKnowledge:[...state.negative].map(([signature,v])=>({signature,...v})).sort((a,b)=>b.count-a.count).slice(0,20),
    evidence:state.evidence.slice(-30)
  };
}
export function superRouterSelfTest(){
  const a=profileTask("You are frontend builder","Create a responsive landing page","qwen-coder-local");
  const b=profileTask("You are adversary verifier","Audit auth security and deployment","gemma-critic-local");
  const c=profileTask("You are full-stack architect","Build auth database API tests Docker Railway deployment","qwen-coder-local");
  const ok=a.role==="frontend"&&!a.criticRole&&b.criticRole&&c.mode==="DEEP"&&c.tokenBudget===3072;
  return{ok,cases:{frontend:a,critic:b,deep:c}};
}
if(typeof window!=="undefined")window.__ASTRA_SUPER_ROUTER__={telemetry:routerTelemetry,selfTest:superRouterSelfTest};
