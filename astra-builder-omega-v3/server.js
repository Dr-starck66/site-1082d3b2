import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { seedPopulation, rankPopulation, evolutionDecision } from "./src/evolution-engine.js";
import { defaultMetaPolicy, normalizePolicy, mutatePolicies, rewardOutcome } from "./src/meta-evolution.js";
import { prompts } from "./src/prompts.js";
import { compileSecondBrain, createTeamPlan, buildProofGraph, summarizeRouteCost, workspace7SelfTest } from "./src/workspace7-server.js";
import { compactBrain, normalizeSkill, saveRecord, loadRecord, listRecords, workspace8SelfTest } from "./src/workspace8-server.js";
import { runClaw, clawSelfTest } from "./src/claw.js";
import { runMemoryVaultProbe } from "./src/memory-vault-probe.js";
import { inspectActionSurface, normalizeActionPlan, executeApprovedActions, clawActionSelfTest } from "./src/claw-action.js";
import { runOwnerActionProbe } from "./src/owner-action-probe.js";

const root=process.cwd(),port=Number(process.env.PORT||3000),MAX=4*1024*1024;
const rescueEvents=[];const pendingClawPlans=new Map();const rescueLog=(type,detail)=>{rescueEvents.push({at:new Date().toISOString(),type,detail:String(detail).slice(0,500)});if(rescueEvents.length>50)rescueEvents.shift();console.error("[ASTRA RESCUE Ω]",type,detail)};
let shuttingDown=false;const fatal=(type,err)=>{if(shuttingDown)return;shuttingDown=true;rescueLog(type,err?.stack||err);setTimeout(()=>process.exit(1),75).unref()};
process.on("uncaughtException",e=>fatal("uncaughtException",e));process.on("unhandledRejection",e=>fatal("unhandledRejection",e));
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml"};
const send=(res,code,obj)=>{res.writeHead(code,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(obj))};
async function body(req){let n=0,ch=[];for await(const c of req){n+=c.length;if(n>MAX)throw Object.assign(new Error("payload too large"),{status:413});ch.push(c)}return ch.length?JSON.parse(Buffer.concat(ch).toString("utf8")):{}}
const safePath=p=>typeof p==="string"&&p.length>0&&!p.startsWith("/")&&!p.includes("..")&&!p.includes("\\");
const slug=s=>String(s||"astra-app").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,54)||"astra-app";
const timeoutFetch=(url,opts={},ms=15000)=>fetch(url,{...opts,signal:AbortSignal.timeout(ms)});
const routerToken=()=>String(process.env.ASTRA_ROUTER_TOKEN||"").trim();
function routerAuthorized(req){
 const token=routerToken();if(!token)return false;
 const auth=String(req.headers?.authorization||"");
 return auth===("Bearer "+token);
}
const localModelBase=kind=>String(kind==="chat"?(process.env.ASTRA_LOCAL_CHAT_BASE||""):kind==="critic"?(process.env.ASTRA_LOCAL_CRITIC_BASE||process.env.ASTRA_LOCAL_DEEPSEEK_BASE||""):kind==="fast"?(process.env.ASTRA_LOCAL_QWEN_FAST_BASE||""):kind==="standard"?(process.env.ASTRA_LOCAL_QWEN_STANDARD_BASE||""):(process.env.ASTRA_LOCAL_QWEN_BASE||"")).replace(/\/+$/,"");
async function localModelHealth(kind){
 const base=localModelBase(kind);if(!base)return{status:"UNVERIFIED",kind,reason:"private model base not configured"};
 const root=base.replace(/\/v1$/,"");
 try{const r=await timeoutFetch(root+"/health",{},30000),raw=await r.text();return{status:r.ok?"PASS":"PARTIAL",kind,httpStatus:r.status,body:raw.slice(0,180),baseConfigured:true}}catch(e){return{status:"PARTIAL",kind,reason:String(e?.message||e),baseConfigured:true}}
}
function localKind(requestedModel="",system=""){
 const m=String(requestedModel||"").toLowerCase();
 if(/qwen-fast|fast-local/.test(m))return"fast";
 if(/qwen-standard|standard-local/.test(m))return"standard";
 if(/qwen-chat|chat-local|sports-chat/.test(m))return"chat";
 if(/qwen|coder-local|builder/.test(m))return"builder";
 if(/gemma|deepseek|critic/.test(m))return"critic";
 const s=String(system||"").toLowerCase();
 return/(gemma|deepseek|adversary|critic|verify|skeptic)/.test(s)?"critic":"builder";
}
function builderRouteProfile(system,user,requestedModel,maxTokens){
 const s=(String(system||"")+" "+String(user||"")+" "+String(requestedModel||"")).toLowerCase();
 let score=0;
 const signals=[/full[- ]?stack/,/authentication|oauth|session/,/database|postgres|schema|migration/,/deploy|docker|railway|vercel|netlify/,/security|rbac|permission/,/backend|api|webhook/,/refactor|architecture|multi-agent|repository/,/payment|stripe|billing/];
 for(const re of signals)if(re.test(s))score++;
 const len=s.length;if(len>12000)score+=3;else if(len>6000)score+=2;else if(len>2500)score+=1;
 if(score>=4)return{mode:"DEEP",score,maxTokens:Math.max(1536,Math.min(3072,Number(maxTokens)||3072)),timeoutMs:240000,temperature:.1};
 if(score>=2)return{mode:"STANDARD",score,maxTokens:Math.max(1024,Math.min(2048,Number(maxTokens)||2048)),timeoutMs:210000,temperature:.12};
 return{mode:"FAST",score,maxTokens:Math.max(512,Math.min(1024,Number(maxTokens)||1024)),timeoutMs:150000,temperature:.1};
}
const modelLaneTails=new Map();
function withModelLane(kind,fn){
 if(kind!=="builder")return fn();
 const prev=modelLaneTails.get(kind)||Promise.resolve();
 const run=prev.catch(()=>{}).then(fn);
 const tail=run.then(()=>undefined,()=>undefined);
 modelLaneTails.set(kind,tail);
 tail.finally(()=>{if(modelLaneTails.get(kind)===tail)modelLaneTails.delete(kind)});
 return run;
}
async function localText(system,user,requestedModel,maxTokens=1536){
 const kind=localKind(requestedModel,system),base=localModelBase(kind);if(!base)throw new Error("local "+kind+" model endpoint not configured");
 const model=kind==="critic"?"gemma-critic-local":kind==="fast"?"qwen-fast-local":kind==="standard"?"qwen-standard-local":kind==="chat"?"qwen-chat-local":"qwen-coder-local";
 const profile=kind==="critic"?{mode:"CRITIC",score:0,maxTokens:Math.max(128,Math.min(768,Number(maxTokens)||512)),timeoutMs:90000,temperature:.15}:kind==="fast"?{mode:"FAST",score:0,maxTokens:Math.max(96,Math.min(384,Number(maxTokens)||256)),timeoutMs:60000,temperature:.1}:kind==="standard"?{mode:"STANDARD",score:2,maxTokens:Math.max(512,Math.min(2600,Number(maxTokens)||1800)),timeoutMs:150000,temperature:.12}:kind==="chat"?{mode:"CHAT",score:0,maxTokens:Math.max(96,Math.min(384,Number(maxTokens)||256)),timeoutMs:60000,temperature:.05}:builderRouteProfile(system,user,requestedModel,maxTokens);
 return withModelLane(kind,async()=>{
  const r=await timeoutFetch(base+"/chat/completions",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer astra-private"},body:JSON.stringify({model,temperature:profile.temperature,max_tokens:profile.maxTokens,response_format:{type:"json_object"},messages:[{role:"system",content:String(system||"")},{role:"user",content:String(user||"")} ]})},profile.timeoutMs);
  const raw=await r.text();if(!r.ok)throw new Error("local "+kind+" inference "+r.status+": "+raw.slice(0,280));
  let data;try{data=JSON.parse(raw)}catch{throw new Error("local "+kind+" inference non-JSON")}
  let text=String(data?.choices?.[0]?.message?.content||"");
  if(kind==="critic")text=text.replace(/<think>[\s\S]*?<\/think>/gi,"").trim();
  if(!text)throw new Error("local "+kind+" inference empty");
  return{text,provider:"ASTRA private llama.cpp",model,kind,route:"railway-private",routeMode:profile.mode,routeScore:profile.score,tokenBudget:profile.maxTokens};
 });
}
function parseProbeJson(text){
 const s=String(text||"").trim().replace(/^```(?:json)?/i,"").replace(/```$/,"").trim();
 try{return JSON.parse(s)}catch{}
 const a=s.indexOf("{"),b=s.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(s.slice(a,b+1));
 throw new Error("structured JSON missing");
}
async function routedLocalText(system,user,requestedModel,maxTokens=1536){
 try{return{status:"PASS",...(await localText(system,user,requestedModel,maxTokens)),fallback:false,fallbackScope:"NONE"}}
 catch(localError){
  const primaryKind=localKind(requestedModel,system);
  const rescueModels=primaryKind==="chat"?["qwen-fast-local","qwen-standard-local","gemma-critic-local"]:primaryKind==="critic"?["qwen-standard-local","qwen-coder-local","qwen-fast-local"]:primaryKind==="fast"?["qwen-standard-local","qwen-chat-local","gemma-critic-local"]:primaryKind==="standard"?["qwen-coder-local","qwen-fast-local","gemma-critic-local"]:["qwen-standard-local","qwen-fast-local","gemma-critic-local"];
  const failures=[String(localError?.message||localError).slice(0,220)];
  for(const rescueModel of rescueModels){
   try{
    const fb=await localText(system,user,rescueModel,Math.min(Number(maxTokens)||1536,rescueModel==="qwen-fast-local"?768:rescueModel==="gemma-critic-local"?768:1536));
    return{status:"PARTIAL",...fb,fallback:true,fallbackScope:"LOCAL_FABRIC",primaryKind,localError:failures[0],rescueModel};
   }catch(rescueError){failures.push(String(rescueError?.message||rescueError).slice(0,220))}
  }
  throw new Error("ASTRA local inference failed; "+failures.join(" | "));
 }
}
function unwrapChatText(text){
 const raw=String(text||"").trim();if(!raw)return"";
 try{
  const parsed=parseProbeJson(raw);
  const answer=String(parsed?.answer??parsed?.text??parsed?.response??"").trim();
  return answer||raw;
 }catch{return raw}
}
async function routedChatText(system,user,requestedModel,maxTokens=768){
 const outputContract='\n\nASTRA CHAT GROUNDING GATE — OBLIGATOIRE: Toute information factuelle de la réponse doit être directement présente dans SYSTEM ou USER. N introduis JAMAIS de nom propre sportif, équipe, joueur, adversaire, score, cote, date, horaire, compétition, classement, blessure ou résultat absent des données fournies. Si une information demandée manque, dis explicitement qu elle n est pas disponible; ne la déduis pas et ne la complète pas de mémoire.\nASTRA CHAT OUTPUT CONTRACT: return valid JSON only with exactly one top-level string field "answer". Put the complete natural-language answer in that field. Do not expose chain-of-thought.';
 const out=await routedLocalText(String(system||"")+outputContract,String(user||""),requestedModel||"qwen-chat-local",Math.max(96,Math.min(384,Number(maxTokens)||256)));
 const text=unwrapChatText(out.text);if(!text)throw new Error("ASTRA router chat returned empty answer");
 return{...out,text,router:"ASTRA SUPER ROUTER Ω"};
}
const sandboxBase=()=>String(process.env.ASTRA_SANDBOX_BASE||"").replace(/\/+$/,"");
async function sandboxStatus(){
 const base=sandboxBase();if(!base)return{status:"UNVERIFIED",reason:"sandbox base not configured"};
 try{const r=await timeoutFetch(base+"/health",{},15000),raw=await r.text();return{status:r.ok?"PASS":"FAIL",httpStatus:r.status,detail:raw.slice(0,220)}}catch(e){return{status:"FAIL",reason:String(e?.message||e)}}
}
async function sandboxRun(project){
 const base=sandboxBase(),token=String(process.env.ASTRA_SANDBOX_TOKEN||"");if(!base||!token)throw new Error("sandbox private route not configured");
 const r=await timeoutFetch(base+"/run",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+token},body:JSON.stringify({spec:project.spec||{},files:project.files||[]})},240000);
 const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{throw new Error("sandbox non-JSON response")}
 if(!r.ok)throw new Error("sandbox "+r.status+": "+String(data?.reason||raw).slice(0,300));return data;
}
const goldenState={status:"IDLE",startedAt:null,finishedAt:null,phase:"IDLE",summary:null,error:null,manifest:[],evidence:[],seal:null,repairs:0};
function parseModelJson(text){return parseProbeJson(text)}
function filesFrom(x){return Array.isArray(x?.files)?x.files.filter(f=>safePath(f?.path)&&typeof f?.content==="string").map(f=>({path:f.path,content:f.content})):[]}
function mergeProjectFiles(...sets){const m=new Map();for(const set of sets)for(const f of set||[])if(safePath(f?.path)&&typeof f?.content==="string")m.set(f.path,f);return[...m.values()]}
function goldenLog(phase,detail){goldenState.phase=phase;console.log("[ASTRA GOLDEN RUN]",phase,detail||"")}
function goldenCompactFiles(files,issuePaths=[],maxChars=11000){
 const preferred=["public/app.js","public/index.html","package.json","server.js","lib/auth.js","lib/repository.js","tests/server.test.js","tests/auth.test.js","deploy.json","Dockerfile","database/schema.sql"];
 const wanted=[...new Set([...issuePaths,...preferred])],out=[];let used=0;
 const ordered=[...wanted.map(p=>files.find(f=>f.path===p)).filter(Boolean),...files.filter(f=>!wanted.includes(f.path))];
 for(const f of ordered){
  if(used>=maxChars)break;
  const cap=issuePaths.includes(f.path)?8000:1800,room=Math.min(cap,maxChars-used),content=String(f.content||"").slice(0,room);
  out.push({path:f.path,excerpt:content,truncated:String(f.content||"").length>content.length});used+=content.length;
 }
 return out;
}
function goldenFailPaths(evidence=[]){
 const paths=new Set();
 for(const e of evidence){
  if(e.status==="PASS")continue;
  const s=String(e.name||"")+" "+String(e.detail||"");
  for(const m of s.matchAll(/(?:^|\s)((?:public|lib|tests|database|scripts|src)\/[A-Za-z0-9._\/-]+\.(?:js|mjs|cjs|json|sql|html|css))/g))paths.add(m[1]);
 }
 return [...paths];
}
function goldenCompactEvidence(evidence=[]){return evidence.map(e=>({name:e.name,status:e.status,detail:String(e.detail||"").slice(0,500)})).slice(0,40)}

async function goldenAgent(system,user,model="qwen-coder-local",tokens=3072){
 let last;
 for(let attempt=1;attempt<=2;attempt++){
  const u=attempt===1?user:user+"\\nRESCUE RETRY: previous response was truncated or invalid JSON. Return one COMPLETE SHORT JSON object only. Keep code concise; no commentary; close every quote, array and object.";
  try{const r=await localText(system,u,model,tokens);return parseModelJson(r.text)}
  catch(e){last=e;console.error("[ASTRA GOLDEN RUN] AGENT RETRY",attempt,String(e?.message||e).slice(0,240))}
 }
 throw last;
}

async function runMissionSmoke(mission){
 const started=Date.now(),trace=randomUUID(),evidence=[],filesByPath=new Map();
 const log=(phase,status,detail)=>{const row={phase,status,detail:String(detail||"").slice(0,800)};evidence.push(row);console.log("[ASTRA MISSION SMOKE]",trace,phase,status,row.detail)};
 const call=async(name,prompt,input,model="qwen-standard-local",tokens=1600)=>{
  let last;
  for(let attempt=1;attempt<=3;attempt++){
   try{
    const suffix=attempt===1?"":attempt===2
      ?"\nRECOVERY RETRY: previous output was malformed or truncated. Return ONE complete compact JSON object only. Reduce commentary and duplicated code. Close every string, array and object."
      :"\nFINAL FAIL-CLOSED RETRY: return ONE minimal valid JSON object only. Include only essential deployable files for this role; shorten code aggressively; no markdown; no commentary; close every string, array and object.";
    const budget=attempt===3?Math.max(tokens,2600):tokens;
    const r=await localText(prompt,input+suffix,model,budget),data=parseProbeJson(r.text);
    log(name,attempt===1?"PASS":"PARTIAL",r.model+" · "+r.routeMode+" · "+r.tokenBudget+(attempt>1?" · recovered JSON retry "+attempt:""));return data;
   }catch(e){last=e;if(attempt<3)log(name,"PARTIAL","structured retry "+attempt+": "+String(e?.message||e))}
  }
  log(name,"FAIL",String(last?.message||last));throw last;
 };
 try{
  const spec=await call("ARCHITECT",prompts.architect,mission,"qwen-standard-local",1800);
  const specText=JSON.stringify(spec);
  const jobs=[
   ["FRONTEND",prompts.frontend,2400,"qwen-standard-local"],
   ["BACKEND",prompts.backend,2400,"qwen-standard-local"],
   ["DATABASE",prompts.database,1600,"qwen-standard-local"],
   ["AUTH",prompts.auth,2600,"qwen-coder-local"],
   ["DEVOPS",prompts.ops,1600,"qwen-standard-local"]
  ];
  for(let i=0;i<jobs.length;i+=2){
   const outs=await Promise.all(jobs.slice(i,i+2).map(([name,prompt,tokens,model])=>call(name,prompt,specText,model,tokens)));
   for(const out of outs)for(const file of filesFrom(out))filesByPath.set(file.path,file);
  }
  const files=[...filesByPath.values()];
  log("FILES",files.length>=8?"PASS":"FAIL",files.length+" generated files");
  let validation=validate({spec,files});
  log("SERVER_VALIDATE",validation.verdict,validation.summary);
  for(const e of validation.evidence||[])if(e.status!=="PASS")log("VALIDATION_DETAIL",e.status,e.name+" · "+e.detail);
  let sandbox={status:"UNVERIFIED",reason:"not run"};
  try{sandbox=await sandboxRun({spec,files});log("SANDBOX",sandbox.status,(sandbox.durationMs||0)+"ms · "+String(sandbox.projectDigest||"").slice(0,12));for(const e of sandbox.evidence||[])if(e.status!=="PASS")log("SANDBOX_DETAIL",e.status,e.name+" · "+String(e.detail||"").slice(0,500))}
  catch(e){sandbox={status:"FAIL",reason:String(e?.message||e)};log("SANDBOX","FAIL",sandbox.reason)}
  if(validation.verdict==="FAIL"||sandbox.status==="FAIL"){
   const criticalPaths=["preview/app.js","package.json","server.js","Dockerfile","deploy.json","tests/server.test.js","tests/auth.test.js"];
   for(let repairCycle=1;repairCycle<=4&&(validation.verdict==="FAIL"||sandbox.status==="FAIL");repairCycle++){
    const failingValidation=(validation.evidence||[]).filter(e=>e.status!=="PASS");
    const failingSandbox=(sandbox.evidence||[]).filter(e=>e.status!=="PASS");
    const criticalFiles=criticalPaths.map(p=>filesByPath.get(p)).filter(Boolean).map(x=>({path:x.path,content:String(x.content||"").slice(0,9000)}));
    const repairInput=JSON.stringify({
     mission,spec,repairCycle,
     objective:"Repair ALL failing artifacts in this cycle. Return complete replacement files, not fragments. Final project must have valid root package.json with start/test scripts, server bound to 0.0.0.0 and process.env.PORT with direct GET /health 200, root Dockerfile, deploy.json, automated tests, and syntactically complete frontend JavaScript.",
     failures:{validation:failingValidation,sandbox:{status:sandbox.status,evidence:failingSandbox,reason:sandbox.reason||null}},
     criticalFiles,
     files:files.slice(0,80).map(x=>({path:x.path,content:String(x.content||"").slice(0,1400)}))
    });
    try{
     const repair=await call("REPAIR_"+repairCycle,prompts.repair+"\nREPAIR CONTRACT: fix every reported FAIL/PARTIAL required for a production single-service app. Return JSON {files:[{path,content}]} with COMPLETE file contents for every file you change. Prioritize syntax validity, root package.json, /health, Dockerfile, deploy.json and executable tests.",repairInput,"qwen-coder-local",3072);
     const changed=filesFrom(repair);
     if(!changed.length){log("REPAIR_"+repairCycle,"FAIL","repair returned no files");continue}
     for(const file of changed)filesByPath.set(file.path,file);
     files.splice(0,files.length,...filesByPath.values());
     log("REPAIR_FILES_"+repairCycle,"PASS",changed.length+" file(s) replaced/added");
     validation=validate({spec,files});log("SERVER_REVALIDATE_"+repairCycle,validation.verdict,validation.summary);
     for(const e of validation.evidence||[])if(e.status!=="PASS")log("REVALIDATION_DETAIL_"+repairCycle,e.status,e.name+" · "+e.detail);
     try{
      sandbox=await sandboxRun({spec,files});
      log("SANDBOX_RETEST_"+repairCycle,sandbox.status,(sandbox.durationMs||0)+"ms · "+String(sandbox.projectDigest||"").slice(0,12));
      for(const e of sandbox.evidence||[])if(e.status!=="PASS")log("SANDBOX_RETEST_DETAIL_"+repairCycle,e.status,e.name+" · "+String(e.detail||"").slice(0,500));
     }catch(e){sandbox={status:"FAIL",reason:String(e?.message||e)};log("SANDBOX_RETEST_"+repairCycle,"FAIL",sandbox.reason)}
    }catch(e){log("REPAIR_"+repairCycle,"FAIL",String(e?.message||e))}
   }
  }
  const compact=JSON.stringify({mission,spec,files:files.slice(0,60).map(x=>({path:x.path,excerpt:String(x.content||"").slice(0,350)})),validation,sandbox:{status:sandbox.status,evidence:sandbox.evidence||[],reason:sandbox.reason||null}});
  let adversary={risk:"UNVERIFIED",issues:[]},verify={verdict:"UNVERIFIED"};
  try{adversary=await call("ADVERSARY",prompts.adversary+"\nReturn compact valid JSON only. No code blocks, no long excerpts.",compact,"qwen-standard-local",1600)}catch{}
  try{verify=await call("VERIFY2",prompts.verify+"\nReturn compact valid JSON only with a clear verdict. Do not include chain-of-thought.",JSON.stringify({validation,sandbox,adversary,files:files.map(x=>x.path),spec}),"qwen-standard-local",1600)}catch{}
  const hardFail=validation.verdict==="FAIL"||sandbox.status==="FAIL"||String(verify.verdict||"").toUpperCase()==="FAIL";
  const partial=validation.verdict!=="PASS"||sandbox.status!=="PASS"||String(verify.verdict||"").toUpperCase()!=="PASS";
  const status=hardFail?"FAIL":partial?"PARTIAL":"PASS";
  const result={status,trace,mission,files:files.length,validation:validation.verdict,sandbox:sandbox.status,adversaryRisk:adversary.risk||"UNVERIFIED",verify:String(verify.verdict||"UNVERIFIED").toUpperCase(),durationMs:Date.now()-started,evidence};
  console.log("[ASTRA MISSION SMOKE RESULT]",JSON.stringify(result));
  return result;
 }catch(e){
  const result={status:"FAIL",trace,mission,durationMs:Date.now()-started,reason:String(e?.message||e),evidence};
  console.error("[ASTRA MISSION SMOKE RESULT]",JSON.stringify(result));
  return result;
 }
}

async function runGoldenRun(){
 if(goldenState.status==="RUNNING")return goldenState;
 Object.assign(goldenState,{status:"RUNNING",startedAt:new Date().toISOString(),finishedAt:null,phase:"START",summary:null,error:null,manifest:[],evidence:[],seal:null,repairs:0});
 const mission="Build ASTRA Ledger, a production-style single-service SaaS issue tracker. Requirements: static responsive frontend, Node.js backend API, email/password authentication using Node crypto only, session cookies, SQL schema artifact, issue CRUD scoped to signed-in user, input validation, /health, Node built-in test runner tests, Dockerfile and deploy.json. Use NO external runtime dependencies so the sandbox can prove the whole project deterministically. Root package.json must provide build, test and start scripts. Frontend files live under public/. Backend entry is server.js. Database schema lives at database/schema.sql.";
 let spec,files=[];
 try{
  goldenLog("ARCHITECT","local Qwen");
  spec=await goldenAgent(prompts.architect,mission+"\nFor this Golden Run choose plain JavaScript + Node built-ins + static HTML/CSS/JS; no React and no npm dependencies.","qwen-coder-local",2048);
  goldenLog("BUILD","specialist agents");
  const specText=JSON.stringify(spec);
  const agentCalls=[
   ()=>goldenAgent("You are Ω Golden Frontend. JSON only {summary,files:[{path,content}]}. Create public/index.html, public/styles.css, public/app.js for the specified SaaS. No external CDN or dependencies. Real login/register/logout and issue CRUD UI calling relative /api endpoints. Accessible loading/error/empty states.",specText,"qwen-coder-local",3072),
   ()=>goldenAgent("You are Ω Golden Backend. JSON only {summary,files:[{path,content}]}. Create root server.js, lib/repository.js and tests/server.test.js. Node 22 built-ins only. Implement /health, /api/register, /api/login, /api/logout, /api/me and authenticated issue CRUD. Serve public/ statically. Bind HOST or 0.0.0.0 and process.env.PORT. tests/server.test.js must start the server on an ephemeral port and exercise health, register/login and issue CRUD. Use an in-memory repository for runtime tests while keeping SQL schema as source-of-truth artifact.",specText,"qwen-coder-local",3072),
   ()=>goldenAgent("You are Ω Golden Database. JSON only {summary,files:[{path,content}]}. Create database/schema.sql and database/README.md with users, sessions and issues tables, constraints/indexes, PostgreSQL-compatible SQL. No secrets.",specText,"qwen-coder-local",1536),
   ()=>goldenAgent("You are Ω Golden Auth. JSON only {summary,files:[{path,content}]}. Create lib/auth.js and tests/auth.test.js using Node built-ins only. Password hashing must use crypto.scrypt or pbkdf2 with random salt and timingSafeEqual. Sessions use random bytes, HttpOnly SameSite cookies. No fake auth.",specText,"qwen-coder-local",2048),
   ()=>goldenAgent("You are Ω Golden DevOps. JSON only {summary,files:[{path,content}]}. Create ONLY these concise root files: package.json with scripts build=node scripts/build.js, test=node --test, start=node server.js; scripts/build.js that checks required files; Dockerfile for node:22-alpine; deploy.json with provider railway, rootDirectory ., dockerfilePath Dockerfile, healthPath /health, startCommand null; README.md under 25 lines; .gitignore. NO tests here and NO dependencies.",specText,"qwen-coder-local",2048)
  ];
  const outs=[];for(const call of agentCalls)outs.push(await call());
  files=mergeProjectFiles(...outs.map(filesFrom));
  goldenState.manifest=files.map(f=>f.path).sort();
  goldenLog("SANDBOX-1",files.length+" files");
  let sb=await sandboxRun({spec,files});goldenState.evidence.push({stage:"sandbox-1",status:sb.status,durationMs:sb.durationMs,evidence:sb.evidence});goldenLog("SANDBOX-1-RESULT",sb.status+" · "+sb.durationMs+"ms · "+(sb.evidence||[]).filter(x=>x.status!=="PASS").map(x=>x.name+":"+x.status).join(","));
  goldenLog("ADVERSARY","Gemma critic");
  const auditContext=goldenCompactFiles(files,[],9000);const audit=await goldenAgent(prompts.adversary,"GOLDEN MISSION:\n"+mission+"\nSPEC:\n"+JSON.stringify(spec)+"\nMANIFEST:\n"+JSON.stringify(goldenState.manifest)+"\nCRITICAL FILE EXCERPTS:\n"+JSON.stringify(auditContext)+"\nSANDBOX EVIDENCE:\n"+JSON.stringify(goldenCompactEvidence(sb.evidence)),"gemma-critic-local",1536);
  goldenState.evidence.push({stage:"adversary",status:audit.risk==="HIGH"?"PARTIAL":"PASS",audit});
  if(sb.status!=="PASS"||(audit.issues||[]).length){
   for(let repairRound=1;repairRound<=2;repairRound++){
    const issuePaths=[...new Set([...(audit.issues||[]).map(x=>x.path).filter(Boolean),...goldenFailPaths(sb.evidence)])];
    goldenLog("REPAIR-"+repairRound,"Qwen targeted repair · "+(issuePaths.join(",")||"general"));
    const repairContext=goldenCompactFiles(files,issuePaths,20000);
    const rep=await goldenAgent(prompts.repair,"GOLDEN MISSION:\n"+mission+"\nSPEC:\n"+JSON.stringify(spec)+"\nMANIFEST:\n"+JSON.stringify(goldenState.manifest)+"\nFAILING PATHS (highest priority):\n"+JSON.stringify(issuePaths)+"\nFILES TO REPAIR / CONTEXT:\n"+JSON.stringify(repairContext)+"\nSANDBOX EXACT EVIDENCE:\n"+JSON.stringify(goldenCompactEvidence(sb.evidence))+"\nAUDIT:\n"+JSON.stringify(audit)+"\nReturn COMPLETE replacement content for every failing path you modify. Fix syntax/runtime failures first. Keep unchanged files out.","qwen-coder-local",3072);
    const changed=filesFrom(rep);if(changed.length){files=mergeProjectFiles(files,changed);goldenState.repairs++;goldenState.manifest=files.map(f=>f.path).sort()}
    const stage="sandbox-"+(repairRound+1);goldenLog(stage.toUpperCase(),"post-repair "+repairRound);
    sb=await sandboxRun({spec,files});goldenState.evidence.push({stage,status:sb.status,durationMs:sb.durationMs,evidence:sb.evidence});goldenLog(stage.toUpperCase()+"-RESULT",sb.status+" · "+sb.durationMs+"ms · "+(sb.evidence||[]).filter(x=>x.status!=="PASS").map(x=>x.name+":"+x.status).join(","));
    if(sb.status==="PASS")break;
   }
  }
  goldenLog("VERIFY²","Gemma independent verifier");
  const verify=await goldenAgent(prompts.verify,"GOLDEN MISSION:\n"+mission+"\nSPEC:\n"+JSON.stringify(spec)+"\nMANIFEST:\n"+JSON.stringify(goldenState.manifest)+"\nCRITICAL FILE EXCERPTS:\n"+JSON.stringify(goldenCompactFiles(files,[],7500))+"\nEVIDENCE SUMMARY:\n"+JSON.stringify(goldenState.evidence.map(x=>({stage:x.stage,status:x.status,durationMs:x.durationMs,evidence:goldenCompactEvidence(x.evidence||[])}))),"gemma-critic-local",1536);
  goldenState.evidence.push({stage:"verify2",status:verify.verdict||"PARTIAL",verify});
  const finalSandbox=[...goldenState.evidence].reverse().find(x=>x.stage.startsWith("sandbox-"));
  const final=finalSandbox?.status==="PASS"&&verify.verdict==="PASS"?"PASS":finalSandbox?.status==="FAIL"||verify.verdict==="FAIL"?"FAIL":"PARTIAL";
  const seal=serverSeal({mission,spec,manifest:goldenState.manifest,evidence:goldenState.evidence,repairs:goldenState.repairs,final},"GENESIS");
  Object.assign(goldenState,{status:final,phase:"DONE",finishedAt:new Date().toISOString(),seal,summary:{appName:spec?.appName||"ASTRA Ledger",files:files.length,repairs:goldenState.repairs,finalSandbox:finalSandbox?.status||"UNVERIFIED",verify:verify.verdict||"UNVERIFIED",seal:seal.hash}});
  console.log("[ASTRA GOLDEN RUN] RESULT",JSON.stringify(goldenState.summary));
  return goldenState;
 }catch(e){goldenState.status="FAIL";goldenState.phase="ERROR";goldenState.finishedAt=new Date().toISOString();goldenState.error=String(e?.stack||e);console.error("[ASTRA GOLDEN RUN] FAIL",goldenState.error.slice(0,1200));return goldenState}
}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==="object"){const o={};for(const k of Object.keys(v).sort())o[k]=canonical(v[k]);return o}return v}
function serverSeal(payload,previousHash="GENESIS"){const at=new Date().toISOString(),body={at,previousHash,payload:canonical(payload)},hash=createHash("sha256").update(JSON.stringify(body)).digest("hex");return{at,previousHash,hash,algorithm:"SHA-256",issuer:"ASTRA_CONTROL_PLANE"}}
const ZERO_GPU_TEXT_HOST="https://steliotel-qwen3-8-27b-chat.hf.space";
async function zeroGpuText(system,user,maxTokens=1536){
 const headers={"content-type":"application/json"};if(process.env.HF_TOKEN)headers.authorization="Bearer "+process.env.HF_TOKEN;
 const message=("SYSTEM:\n"+String(system||"")+"\n\nUSER:\n"+String(user||"")).slice(0,120000);
 const submit=await timeoutFetch(ZERO_GPU_TEXT_HOST+"/gradio_api/call/chat",{method:"POST",headers,body:JSON.stringify({data:[message,[],Math.max(32,Math.min(1536,Number(maxTokens)||1536)),0.2,false]})},30000);
 const raw=await submit.text();if(!submit.ok)throw new Error("ZeroGPU text submit "+submit.status+": "+raw.slice(0,220));
 let job;try{job=JSON.parse(raw)}catch{throw new Error("ZeroGPU text submit non-JSON")};if(!job?.event_id)throw new Error("ZeroGPU text event id missing");
 const events=await timeoutFetch(ZERO_GPU_TEXT_HOST+"/gradio_api/call/chat/"+encodeURIComponent(job.event_id),{headers:process.env.HF_TOKEN?{authorization:"Bearer "+process.env.HF_TOKEN}:{}},150000);
 const sse=await events.text();if(!events.ok)throw new Error("ZeroGPU text event "+events.status+": "+sse.slice(0,220));if(/event:\s*error/i.test(sse))throw new Error("ZeroGPU text generation failed: "+sse.slice(-400));
 let out="";for(const line of sse.split(/\r?\n/)){if(!line.startsWith("data:"))continue;const d=line.slice(5).trim();try{const x=JSON.parse(d);if(Array.isArray(x)&&typeof x[0]==="string")out=x[0];else if(typeof x==="string")out=x}catch{}}
 if(!out.trim())throw new Error("ZeroGPU text completion payload missing");return{text:out,provider:"Hugging Face ZeroGPU",model:"Qwen/Qwen3.8-27B",quotaMode:process.env.HF_TOKEN?"authenticated-free":"anonymous-free"};
}
const ZERO_GPU_IMAGE_HOST="https://baka999-qwen-image-2-1.hf.space";
async function zeroGpuImage(prompt){
 if(!String(prompt||"").trim())throw new Error("image prompt missing");
 const headers={"content-type":"application/json"};if(process.env.HF_TOKEN)headers.authorization="Bearer "+process.env.HF_TOKEN;
 const data=[String(prompt).slice(0,4000),"",[],"1:1","1K (Fast Preview)",1024,1024,30,42,true,false,false,false];
 const submit=await timeoutFetch(ZERO_GPU_IMAGE_HOST+"/gradio_api/call/generate",{method:"POST",headers,body:JSON.stringify({data})},30000);
 const submitRaw=await submit.text();if(!submit.ok)throw new Error("ZeroGPU submit "+submit.status+": "+submitRaw.slice(0,220));
 let job;try{job=JSON.parse(submitRaw)}catch{throw new Error("ZeroGPU submit non-JSON")};if(!job?.event_id)throw new Error("ZeroGPU event id missing");
 const events=await timeoutFetch(ZERO_GPU_IMAGE_HOST+"/gradio_api/call/generate/"+encodeURIComponent(job.event_id),{headers:process.env.HF_TOKEN?{authorization:"Bearer "+process.env.HF_TOKEN}:{}},330000);
 const sse=await events.text();if(!events.ok)throw new Error("ZeroGPU event "+events.status+": "+sse.slice(0,220));if(/event:\s*error/i.test(sse))throw new Error("ZeroGPU generation failed: "+sse.slice(-400));
 let output=null;for(const line of sse.split(/\r?\n/)){if(!line.startsWith("data:"))continue;const raw=line.slice(5).trim();try{const x=JSON.parse(raw);if(Array.isArray(x)&&x.length)output=x}catch{}}
 if(!output)throw new Error("ZeroGPU completion payload missing");
 const image=output[0];let imageUrl=typeof image==="string"?image:image?.url||"";
 if(imageUrl&&!/^https?:/i.test(imageUrl))imageUrl=new URL(imageUrl,ZERO_GPU_IMAGE_HOST).href;
 if(!imageUrl&&image?.path)imageUrl=ZERO_GPU_IMAGE_HOST+"/gradio_api/file="+encodeURIComponent(image.path);
 if(!imageUrl)throw new Error("ZeroGPU image URL missing");
 const ir=await timeoutFetch(imageUrl,{headers:process.env.HF_TOKEN?{authorization:"Bearer "+process.env.HF_TOKEN}:{}},45000);if(!ir.ok)throw new Error("ZeroGPU asset "+ir.status);
 const bytes=Buffer.from(await ir.arrayBuffer());return{provider:"Hugging Face ZeroGPU",model:"Qwen/Qwen-Image-2.1",mime:ir.headers.get("content-type")||"image/png",b64:bytes.toString("base64"),bytes:bytes.length,quotaMode:process.env.HF_TOKEN?"authenticated-free":"anonymous-free"};
}

function validate(project={}){
 const files=Array.isArray(project.files)?project.files:[],spec=project.spec||{},e=[];const add=(name,status,detail)=>e.push({name,status,detail});
 add("File count",files.length>=8&&files.length<=200?"PASS":"FAIL",files.length+" files");
 const paths=files.map(f=>f?.path).filter(Boolean);add("Safe paths",paths.length===files.length&&paths.every(safePath)?"PASS":"FAIL","relative paths only");add("Unique paths",new Set(paths).size===paths.length?"PASS":"FAIL","no path collisions");
 const all=files.map(f=>String(f?.content||"")).join("\n");add("Credential scan",/(?:api[_-]?key|token|secret)\s*[:=]\s*["'][A-Za-z0-9_\-]{20,}/i.test(all)?"FAIL":"PASS","generic credential-pattern scan");
 const pkgs=files.filter(f=>/package\.json$/.test(f.path||""));let pkgOk=true;for(const f of pkgs)try{JSON.parse(f.content)}catch{pkgOk=false}add("package.json parse",pkgOk?"PASS":"FAIL",pkgs.length+" manifest(s)");
 add("Root Dockerfile",files.some(f=>f.path==="Dockerfile")?"PASS":"PARTIAL","single-service container contract");
 add("Backend health",files.some(f=>/health/i.test((f.path||"")+" "+(f.content||"")))?"PASS":"FAIL","health endpoint/check");
 add("Tests",files.some(f=>/(test|spec)\.(js|ts|tsx|jsx)$|\/tests?\//i.test(f.path||""))?"PASS":"PARTIAL","automated test files");
 add("Database",files.some(f=>/(schema|migration|database|prisma|sql)/i.test(f.path||""))?"PASS":"PARTIAL","database artifact");
 add("Auth",files.some(f=>/(auth|session|login|security)/i.test((f.path||"")+" "+(f.content||"")))?"PASS":"PARTIAL","auth/security artifact");
 add("Deploy manifest",files.some(f=>f.path==="deploy.json")?"PASS":"PARTIAL","deploy.json");
 add("Acceptance",Array.isArray(spec.acceptance)&&spec.acceptance.length>=3?"PASS":"PARTIAL",(spec.acceptance?.length||0)+" criteria");
 const verdict=e.some(x=>x.status==="FAIL")?"FAIL":e.some(x=>x.status==="PARTIAL"||x.status==="UNVERIFIED")?"PARTIAL":"PASS";
 return{verdict,evidence:e,summary:verdict==="PASS"?"Server validation passed":"Server validation requires attention"};
}
function getDeployConfig(project){
 const f=(project.files||[]).find(x=>x.path==="deploy.json");let d={};
 if(f){try{d=JSON.parse(f.content)}catch{}}
 return{provider:"railway",rootDirectory:typeof d.rootDirectory==="string"?d.rootDirectory:".",dockerfilePath:typeof d.dockerfilePath==="string"?d.dockerfilePath:"Dockerfile",healthPath:typeof d.healthPath==="string"&&d.healthPath.startsWith("/")?d.healthPath:"/health",startCommand:typeof d.startCommand==="string"?d.startCommand:null};
}
function deployPlan(project){
 const v=validate(project),cfg=getDeployConfig(project);
 return{status:v.verdict==="FAIL"?"FAIL":"PARTIAL",validation:v,target:"container",healthPath:cfg.healthPath,config:cfg,requirements:{gitWrite:true,railwayToken:true,secretsTransient:true,databaseBroker:(project.files||[]).some(f=>/(schema|migration|database|sql)/i.test(f.path||""))},providers:[{id:"railway",status:"READY"}],note:"PASS is withheld until the exact Git commit deploys and the public health endpoint returns 2xx."};
}

async function gh(token,path,opts={}){
 const r=await timeoutFetch("https://api.github.com"+path,{...opts,headers:{"accept":"application/vnd.github+json","authorization":"Bearer "+token,"x-github-api-version":"2022-11-28","content-type":"application/json",...(opts.headers||{})}},20000);
 const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data={raw}};
 if(!r.ok)throw new Error("GitHub "+r.status+": "+(data?.message||raw.slice(0,180)));
 return data;
}
async function persistGithubArtifact(token,path,value){
 if(!token)return{status:"PARTIAL",storage:"server-ephemeral",reason:"GitHub session token unavailable"};
 const full=process.env.ASTRA_MEMORY_REPO||"Dr-starck66/site-1082d3b2",api="/repos/"+full+"/contents/"+path;let sha=null;
 try{const cur=await gh(token,api);sha=cur?.sha||null}catch(e){if(!String(e).includes("GitHub 404"))throw e}
 const payload={message:"chore(astra-memory): persist "+path,content:Buffer.from(JSON.stringify(value,null,2)).toString("base64"),branch:"main"};if(sha)payload.sha=sha;
 await gh(token,api,{method:"PUT",body:JSON.stringify(payload)});
 return{status:"PASS",storage:"github-durable",repo:full,path};
}
async function createGithubProject(project,deploy){
 if(!deploy.githubToken)throw new Error("GitHub token missing");
 const me=await gh(deploy.githubToken,"/user");
 const base=slug(deploy.repoName||project.spec?.appName||"astra-app");
 let name=base;
 let repo;
 try{repo=await gh(deploy.githubToken,"/user/repos",{method:"POST",body:JSON.stringify({name,private:deploy.privateRepo!==false,auto_init:true,description:"Generated by ASTRA BUILDER Ω"})})}
 catch(e){if(!String(e).includes("422"))throw e;name=(base+"-"+Date.now().toString(36)).slice(0,70);repo=await gh(deploy.githubToken,"/user/repos",{method:"POST",body:JSON.stringify({name,private:deploy.privateRepo!==false,auto_init:true,description:"Generated by ASTRA BUILDER Ω"})})}
 const full=me.login+"/"+name;
 const ref=await gh(deploy.githubToken,"/repos/"+full+"/git/ref/heads/main");
 const commit=await gh(deploy.githubToken,"/repos/"+full+"/git/commits/"+ref.object.sha);
 const treeItems=(project.files||[]).map(f=>({path:f.path,mode:"100644",type:"blob",content:String(f.content||"")}));
 const tree=await gh(deploy.githubToken,"/repos/"+full+"/git/trees",{method:"POST",body:JSON.stringify({base_tree:commit.tree.sha,tree:treeItems})});
 const next=await gh(deploy.githubToken,"/repos/"+full+"/git/commits",{method:"POST",body:JSON.stringify({message:"feat: generated by ASTRA BUILDER Ω",tree:tree.sha,parents:[ref.object.sha]})});
 await gh(deploy.githubToken,"/repos/"+full+"/git/refs/heads/main",{method:"PATCH",body:JSON.stringify({sha:next.sha,force:false})});
 return{owner:me.login,name,fullName:full,commitSha:next.sha,url:repo.html_url,private:repo.private};
}

async function rail(token,query,variables={}){
 const r=await timeoutFetch("https://backboard.railway.com/graphql/v2",{method:"POST",headers:{"authorization":"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({query,variables})},20000);
 const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{throw new Error("Railway non-JSON response")};
 if(!r.ok||data.errors?.length)throw new Error("Railway: "+(data.errors?.map(x=>x.message).join("; ")||r.status));
 return data.data;
}
async function createRailwayDeployment(project,deploy,git){
 if(!deploy.railwayToken)throw new Error("Railway token missing");
 const projectInput={name:(project.spec?.appName||git.name).slice(0,80),description:"Generated by ASTRA BUILDER Ω",defaultEnvironmentName:"production"};
 if(deploy.railwayWorkspaceId)projectInput.workspaceId=deploy.railwayWorkspaceId;
 const p=await rail(deploy.railwayToken,"mutation($input:ProjectCreateInput!){projectCreate(input:$input){id name}}",{input:projectInput});
 const projectId=p.projectCreate.id;
 const pq=await rail(deploy.railwayToken,"query($id:String!){project(id:$id){environments{edges{node{id name}}}}}",{id:projectId});
 const envs=pq.project.environments.edges.map(x=>x.node);const env=envs.find(x=>x.name==="production")||envs[0];if(!env)throw new Error("Railway environment missing");
 const service=await rail(deploy.railwayToken,"mutation($input:ServiceCreateInput!){serviceCreate(input:$input){id name}}",{input:{projectId,name:git.name,source:{repo:git.fullName},branch:"main"}});
 const serviceId=service.serviceCreate.id,cfg=getDeployConfig(project);
 const instanceInput={rootDirectory:cfg.rootDirectory,healthcheckPath:cfg.healthPath,healthcheckTimeout:180,sleepApplication:true,restartPolicyType:"ON_FAILURE",restartPolicyMaxRetries:3};
 if(cfg.dockerfilePath)instanceInput.dockerfilePath=cfg.dockerfilePath;if(cfg.startCommand)instanceInput.startCommand=cfg.startCommand;
 await rail(deploy.railwayToken,"mutation($serviceId:String!,$environmentId:String!,$input:ServiceInstanceUpdateInput!){serviceInstanceUpdate(serviceId:$serviceId,environmentId:$environmentId,input:$input)}",{serviceId,environmentId:env.id,input:instanceInput});
 const domainData=await rail(deploy.railwayToken,"mutation($input:ServiceDomainCreateInput!){serviceDomainCreate(input:$input){id domain}}",{input:{serviceId,environmentId:env.id}});
 const deployment=await rail(deploy.railwayToken,"mutation($serviceId:String!,$environmentId:String!,$commitSha:String!){serviceInstanceDeployV2(serviceId:$serviceId,environmentId:$environmentId,commitSha:$commitSha)}",{serviceId,environmentId:env.id,commitSha:git.commitSha});
 return{projectId,environmentId:env.id,serviceId,deploymentId:deployment.serviceInstanceDeployV2,domain:domainData.serviceDomainCreate.domain,healthPath:cfg.healthPath};
}
async function deploymentStatus(deploy){
 if(!deploy.railwayToken||!deploy.deploymentId)throw new Error("Deployment credentials missing");
 const d=await rail(deploy.railwayToken,"query($id:String!){deployment(id:$id){id status url staticUrl meta}}",{id:deploy.deploymentId});
 const x=d.deployment;let health={status:"UNVERIFIED"};
 if(["SUCCESS","SLEEPING"].includes(x.status)&&deploy.domain){
  try{const r=await timeoutFetch("https://"+deploy.domain+(deploy.healthPath||"/health"),{redirect:"follow"},15000);health={status:r.ok?"PASS":"FAIL",httpStatus:r.status,url:r.url}}catch(e){health={status:"FAIL",error:String(e).slice(0,180)}}
 }
 const verdict=["FAILED","CRASHED","REMOVED"].includes(x.status)?"FAIL":health.status==="PASS"?"PASS":["SUCCESS","SLEEPING"].includes(x.status)?"PARTIAL":"PARTIAL";
 return{status:verdict,deploymentStatus:x.status,health,deployment:x};
}

async function importGithubProject(input){
 const token=String(input.githubToken||"").trim(),full=String(input.repo||"").trim(),ref=String(input.ref||"main").trim();
 if(!token)throw new Error("GitHub token missing");
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(full))throw new Error("GitHub repo must be owner/name");
 const tree=await gh(token,"/repos/"+full+"/git/trees/"+encodeURIComponent(ref)+"?recursive=1");
 const allowed=/\.(?:js|jsx|ts|tsx|mjs|cjs|json|html|css|scss|md|txt|yml|yaml|toml|sql|prisma|graphql|gql|env|example|sh|ps1|dockerfile)$/i;
 const names=new Set(["Dockerfile","Makefile",".gitignore",".dockerignore","Procfile"]);
 const blobs=(tree.tree||[]).filter(x=>x.type==="blob"&&safePath(x.path)&&!/(^|\/)\.env$/i.test(x.path)&&(allowed.test(x.path)||names.has(x.path.split("/").pop()))&&(x.size||0)<=300000).slice(0,140);
 let total=0,files=[];
 for(const item of blobs){if(total>3000000)break;const b=await gh(token,"/repos/"+full+"/git/blobs/"+item.sha);if(b.encoding!=="base64")continue;const content=Buffer.from(String(b.content||"").replace(/\n/g,""),"base64").toString("utf8");total+=Buffer.byteLength(content);if(total>3000000)break;files.push({path:item.path,content})}
 if(!files.length)throw new Error("No supported text files found");
 return{repo:full,ref,files,stats:{files:files.length,bytes:total,truncated:files.length<blobs.length||blobs.length>=140}};
}

async function api(req,res,url){
 if(req.method==="GET"&&url.pathname==="/health")return send(res,200,{ok:true,service:"astra-builder-omega-v3",version:"10.0.0",nativeDeployBroker:true,rescue:"ARMED"});
 if(req.method==="GET"&&url.pathname==="/api/ui_self_test"){
  let browser;
  try{
   const {chromium}=await import("playwright-core");
   browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||"/usr/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
   const page=await browser.newPage({viewport:{width:1440,height:900}});
   const pageErrors=[];page.on("pageerror",e=>pageErrors.push(String(e.message||e)));
   await page.goto("http://127.0.0.1:"+port+"/",{waitUntil:"domcontentloaded",timeout:20000});
   await page.waitForFunction(()=>window.__ASTRA_STATE__&&window.__ASTRA_ACTIONS__&&window.__ASTRA_LOVABLE_UX_READY__===true,null,{timeout:12000});
   const handler=await page.$eval("#lovableSendBtn",el=>typeof el.onclick==="function");
   await page.evaluate(()=>{window.__ASTRA_ACTIONS__.run=async()=>{window.__ASTRA_UI_CLICK_OK__=(window.__ASTRA_UI_CLICK_OK__||0)+1};window.__ASTRA_STATE__.status="RUNNING";const s=document.querySelector("#globalStatus");if(s)s.textContent="RUNNING"}); 
   await page.waitForTimeout(100);
   await page.fill("#idea","ASTRA send-arrow stale-RUNNING regression test");
   await page.click("#lovableSendBtn");
   await page.waitForFunction(()=>window.__ASTRA_UI_CLICK_OK__===1,null,{timeout:5000});
   const result=await page.evaluate(()=>({ready:window.__ASTRA_LOVABLE_UX_READY__===true,clicks:window.__ASTRA_UI_CLICK_OK__||0,statusText:document.querySelector("#globalStatus")?.textContent||"",buttonDisabled:document.querySelector("#lovableSendBtn")?.disabled||false}));
   await browser.close();browser=null;
   const ok=handler&&result.ready&&result.clicks===1&&!result.buttonDisabled;
   console.log("ASTRA UI SELF TEST "+(ok?"PASS":"FAIL")+" · send arrow · "+JSON.stringify(result));
   return send(res,ok?200:500,{status:ok?"PASS":"FAIL",handler,result,pageErrors:pageErrors.slice(0,5)});
  }catch(e){if(browser)try{await browser.close()}catch{};console.error("ASTRA UI SELF TEST FAIL · "+String(e.message||e));return send(res,500,{status:"FAIL",reason:String(e.message||e)})}
 }
 if(req.method==="GET"&&url.pathname==="/api/self_test"){
  const sample={spec:{acceptance:["UI renders","API health works","Auth and data contracts exist"]},files:[{path:"frontend/index.html",content:"<main>ASTRA test</main>"},{path:"backend/package.json",content:'{"name":"demo","version":"1.0.0"}'},{path:"backend/src/server.js",content:"app.get('/health',handler)"},{path:"backend/tests/server.test.js",content:"test health endpoint"},{path:"database/schema.sql",content:"create table users(id text primary key);"},{path:"auth/session.js",content:"export function sessionGuard(){}"},{path:"Dockerfile",content:"FROM node:22-alpine"},{path:"deploy.json",content:'{"provider":"railway","dockerfilePath":"Dockerfile","healthPath":"/health"}'},{path:"README.md",content:"demo"}]};
  const v=validate(sample),rescueOk=typeof fatal==="function"&&Array.isArray(rescueEvents),sandboxHealth=await sandboxStatus(),sandboxOk=sandboxHealth.status==="PASS",sealTest=serverSeal({selfTest:true},"GENESIS"),sealOk=/^[a-f0-9]{64}$/.test(sealTest.hash),pop=seedPopulation(4,1).map((x,i)=>({...x,fitness:10-i})),ranked=rankPopulation(pop),evoDecision=evolutionDecision(null,ranked[0]),evolutionOk=pop.length===4&&ranked[0]?.fitness===10&&evoDecision.action==="CONTINUE",metaPolicy=normalizePolicy({...defaultMetaPolicy(),trustThreshold:1,population:99,rescueAttempts:99,adversaryPasses:99}),mutants=mutatePolicies(defaultMetaPolicy(),4),metaRewardPass=rewardOutcome({quality:95,trustScore:90,tests:5,status:"PASS",fail:0,partial:0,latencyMs:1000,deployPass:true}),metaRewardFail=rewardOutcome({quality:30,trustScore:20,tests:0,status:"FAIL",fail:2,partial:3,latencyMs:20000,deployPass:false}),metaOk=metaPolicy.trustThreshold>=76&&metaPolicy.population<=5&&metaPolicy.rescueAttempts<=4&&metaPolicy.adversaryPasses<=2&&mutants.length===4&&metaRewardPass>metaRewardFail;const workspace7=workspace7SelfTest(),workspace7Ok=workspace7.ok,workspace8=workspace8SelfTest(),workspace8Ok=workspace8.ok,claw=clawSelfTest(),clawOk=claw.ok;const clawAction=clawActionSelfTest(),clawActionOk=clawAction.ok;return send(res,v.verdict==="PASS"&&rescueOk&&sandboxOk&&sealOk&&evolutionOk&&metaOk&&workspace7Ok&&workspace8Ok&&clawOk&&clawActionOk?200:500,{ok:v.verdict==="PASS"&&rescueOk&&sandboxOk&&sealOk&&evolutionOk&&metaOk&&workspace7Ok&&workspace8Ok&&clawOk&&clawActionOk,verdict:v.verdict,rescue:rescueOk?"ARMED":"FAIL",cloudSandbox:sandboxOk?"PASS":"FAIL",sandboxHealth,sovereignSeal:sealOk?"PASS":"FAIL",evolutionEngine:evolutionOk?"PASS":"FAIL",metaEvolution:metaOk?"PASS":"FAIL",workspace7:workspace7.status,workspace7Detail:workspace7,workspace8:workspace8.status,workspace8Detail:workspace8,claw:claw.status,clawDetail:claw,clawAction:clawAction.status,clawActionDetail:clawAction,metaSafetyRails:{trustThreshold:metaPolicy.trustThreshold,population:metaPolicy.population,rescueAttempts:metaPolicy.rescueAttempts,adversaryPasses:metaPolicy.adversaryPasses},sealHead:sealTest.hash,evidence:v.evidence});
 }
 if(req.method==="GET"&&url.pathname==="/api/capabilities")return send(res,200,{version:"9.0.0",serverValidation:true,deployBroker:true,nativeDeployBroker:true,rescue:true,sovereignCore:true,evidenceSeal:"SHA-256",missionGraph:"AION",duality:"DUALITY-X",agentShield:true,negativeKnowledge:true,experimentGenome:true,benchmark:"BENCHMARK-X10",adaptiveRouter:"JEV-X",localAdaptiveBuilder:{enabled:true,modes:["FAST","STANDARD","DEEP"],builder:"Qwen2.5-Coder-3B-Instruct-Q4_K_M",critic:"Gemma-3-1B-it-Q4_K_M"},cloudSandbox:{enabled:true,service:"astra-cloud-sandbox",level:"PROCESS_ISOLATED",failClosed:true},evolutionEngine:"EVOLUTION-Ω",metaEvolution:"META-EVOLUTION-Ω",workspace7:{secondBrain:"SECOND-BRAIN-Ω-1",team:"TEAM-Ω-1",proofGraph:"PROOF-GRAPH-Ω-1",costLedger:"MODEL_API_CREDITS"},workspace8:{secondBrain:"SECOND-BRAIN-Ω-2",agentStudio:"SKILL-Ω-1",claw:"READ_ONLY_BROWSER"},workspace9:{memoryVault:"MEMORY-VAULT-Ω3",storage:"BROWSER_INDEXEDDB",secretsStored:false},workspace10:{clawAction:"OWNER_MODE_Ω",approval:"ONE_TIME_5_MIN",domains:"USER_ATTESTED_ALLOWLIST"},immutableMetaRails:true,rescuePolicy:{operationAttempts:"meta-policy 2-4",pipelineRestarts:2,serverRestart:"ON_FAILURE"},providers:["github","railway","astra-local-qwen-3b","astra-local-gemma","huggingface-zerogpu","openrouter-free"],zeroCostGate:true,maxPayloadBytes:MAX});
 if(req.method==="GET"&&url.pathname==="/api/rescue_status")return send(res,200,{status:"ARMED",events:rescueEvents.slice(-20),restartPolicy:"Railway ON_FAILURE",circuitBreaker:true});
 if(req.method==="POST"&&url.pathname==="/api/brain/save"){
  const x=await body(req),brain=compactBrain(x),id=brain.workspaceId;const local=await saveRecord("brains",id,brain);let durable={status:"PARTIAL",storage:"server-ephemeral"};
  try{durable=await persistGithubArtifact(String(x.githubToken||""),".astra/brains/"+id+".json",brain)}catch(e){durable={status:"PARTIAL",storage:"server-ephemeral",reason:String(e.message||e)}}
  return send(res,200,{status:durable.status==="PASS"?"PASS":"PARTIAL",storage:durable.storage,brain,durable,local:{digest:local.digest,updatedAt:local.updatedAt}});
 }
 if(req.method==="POST"&&url.pathname==="/api/brain/load"){const x=await body(req),r=await loadRecord("brains",x.id);return send(res,r?200:404,{status:r?"PASS":"UNVERIFIED",record:r})}
 if(req.method==="GET"&&url.pathname==="/api/skills"){const rows=await listRecords("skills",60);return send(res,200,{status:"PASS",skills:rows})}
 if(req.method==="POST"&&url.pathname==="/api/skill/create"){
  const x=await body(req),description=String(x.description||"").trim();if(!description)return send(res,422,{status:"FAIL",reason:"description required"});
  try{
   const r=await routedLocalText("You are ASTRA Agent/Skill Studio. Return JSON only with name,purpose,instructions,tools[],outputSchema,safety. Design a reusable evidence-first agent. readOnlyDefault=true unless the description explicitly requires controlled writes. Never include secrets.",description,"qwen-coder-local",900);
   const skill=normalizeSkill(parseProbeJson(r.text),description),local=await saveRecord("skills",skill.id,skill);let durable={status:"PARTIAL",storage:"server-ephemeral"};
   try{durable=await persistGithubArtifact(String(x.githubToken||""),".astra/skills/"+skill.id+".json",skill)}catch(e){durable={status:"PARTIAL",storage:"server-ephemeral",reason:String(e.message||e)}}
   return send(res,200,{status:r.status==="PASS"?"PASS":"PARTIAL",storage:durable.storage,skill,route:{provider:r.provider,model:r.model,mode:r.routeMode},local:{digest:local.digest}});
  }catch(e){return send(res,502,{status:"FAIL",reason:String(e.message||e)})}
 }
 if(req.method==="POST"&&url.pathname==="/api/skill/run"){
  const x=await body(req),row=await loadRecord("skills",x.id);if(!row)return send(res,404,{status:"FAIL",reason:"skill not found"});const skill=row.value,brain=compactBrain(x);
  const ctx=JSON.stringify({skill,brain:{appName:brain.appName,goal:brain.goal,stack:brain.stack,features:brain.features,evidence:brain.evidence.slice(-30),manifest:brain.manifest.slice(0,80)}});
  if(ctx.length>18000)return send(res,413,{status:"FAIL",reason:"SKILL_CONTEXT_GATE"});
  try{const r=await routedLocalText("Execute this saved ASTRA skill. JSON only. Use only provided evidence and mark unknown facts UNVERIFIED.",ctx,"qwen-coder-local",1000);let output;try{output=parseProbeJson(r.text)}catch{output={raw:String(r.text).slice(0,6000)}};return send(res,r.status==="PASS"?200:206,{status:r.status,output,route:{provider:r.provider,model:r.model,routeMode:r.routeMode,fallback:r.fallback}})}catch(e){return send(res,502,{status:"FAIL",reason:String(e.message||e)})}
 }
 if(req.method==="GET"&&url.pathname==="/api/claw_status"){return send(res,200,{status:"PASS",...clawSelfTest()})}
 if(req.method==="POST"&&url.pathname==="/api/claw/run"){
  const x=await body(req);try{
   const result=await runClaw({url:x.url,goal:x.goal,maxSteps:x.maxSteps,agent:async input=>{const r=await routedLocalText("You are ASTRA Claw Ω navigator. READ ONLY. JSON only: {decision:'FOLLOW'|'STOP',href:'',rationale:'',findings:[]}. If the goal is already satisfied, STOP. Follow only a href exactly present in the supplied same-origin list.",JSON.stringify(input),"qwen-coder-local",420);return parseProbeJson(r.text)}});
   return send(res,200,result);
  }catch(e){return send(res,502,{status:"FAIL",reason:String(e.message||e)})}
 }

 if(req.method==="GET"&&url.pathname==="/api/claw/action_self_test"){const t=clawActionSelfTest();return send(res,t.ok?200:500,t)}
 if(req.method==="POST"&&url.pathname==="/api/claw/action_plan"){
  const x=await body(req);
  try{
   const inspection=await inspectActionSurface({url:x.url,ownerMode:x.ownerMode===true,ownerDomains:x.ownerDomains||[]});
   const safe=(inspection.elements||[]).filter(e=>!e.blocked).slice(0,90);
   const ctx=JSON.stringify({goal:String(x.goal||"").slice(0,1400),ownerMode:inspection.ownerMode,ownerDomains:inspection.ownerDomains,page:{url:inspection.url,title:inspection.title},elements:safe});
   const r=await routedLocalText(
    "You are ASTRA Claw Ω Owner Action Planner. JSON only: {summary:'',actions:[{type:'click|fill|select|check',selector:'EXACT_SELECTOR_FROM_LIST',value:''}]}. Use only supplied selectors. Max 8 actions. On OWNER MODE, forms and submit buttons are allowed when useful. Never target fields/actions marked blocked. Do not invent selectors.",
    ctx,"qwen-coder-local",720
   );
   const normalized=normalizeActionPlan(parseProbeJson(r.text),inspection),planId=randomUUID(),expiresAt=Date.now()+300000;
   pendingClawPlans.set(planId,{planId,url:inspection.url,ownerMode:inspection.ownerMode,ownerDomains:inspection.ownerDomains,actions:normalized.actions,summary:normalized.summary,expiresAt,used:false});
   for(const [k,p] of pendingClawPlans)if(p.used||p.expiresAt<Date.now())pendingClawPlans.delete(k);
   return send(res,200,{status:"PASS",mode:inspection.ownerMode?"OWNER_PLAN":"GUARDED_PLAN",planId,expiresAt:new Date(expiresAt).toISOString(),approvalRequired:true,summary:normalized.summary,actions:normalized.actions,blockedCount:normalized.blockedCount,screenshotB64:inspection.screenshotB64,guards:{privateNetworkBlocked:true,secretsBlocked:true,financialBlocked:true,accountDeletionBlocked:true,oneTime:true,maxActions:8}});
  }catch(e){return send(res,502,{status:"FAIL",reason:String(e.message||e)})}
 }
 if(req.method==="POST"&&url.pathname==="/api/claw/action_execute"){
  const x=await body(req),p=pendingClawPlans.get(String(x.planId||""));
  if(!p)return send(res,404,{status:"FAIL",reason:"plan missing or expired"});
  if(x.approved!==true)return send(res,403,{status:"FAIL",reason:"explicit approval required"});
  if(p.used||p.expiresAt<Date.now()){pendingClawPlans.delete(p.planId);return send(res,410,{status:"FAIL",reason:"plan expired or already used"})}
  p.used=true;
  try{const out=await executeApprovedActions(p);pendingClawPlans.delete(p.planId);return send(res,200,out)}
  catch(e){pendingClawPlans.delete(p.planId);return send(res,502,{status:"FAIL",reason:String(e.message||e)})}
 }
 if(req.method==="GET"&&url.pathname==="/api/workspace7_self_test"){const t=workspace7SelfTest();return send(res,t.ok?200:500,t)}
 if(req.method==="POST"&&url.pathname==="/api/team_run"){
  const x=await body(req),memory=compileSecondBrain(x),team=createTeamPlan(x,memory),proof=buildProofGraph(x.evidence||[]);
  if(x.execute!==true)return send(res,200,{status:"PASS",memory,team,proof,cost:summarizeRouteCost([]),ai:{}});
  const brief={request:String(x.request||"").slice(0,700),memory:{project:memory.project,facts:memory.facts.slice(0,14).map(f=>({kind:f.kind,key:f.key,value:String(f.value||"").slice(0,180)})),digest:memory.digest},team:team.tasks.map(t=>({id:t.id,role:t.role,title:String(t.title||"").slice(0,120),deps:t.deps})),proof:{status:proof.status,blockers:proof.blockers.slice(0,6).map(b=>({name:b.name,status:b.status,detail:String(b.detail||"").slice(0,160)})),contradictions:proof.contradictions.slice(0,4)},files:(x.files||[]).slice(0,12).map(f=>({path:String(f.path||"").slice(0,180),excerpt:String(f.content||"").slice(0,120)}))};
  const unpack=(role,r)=>{let data;try{data=parseProbeJson(r.text)}catch{data={raw:String(r.text||"").slice(0,2400)}}return{role,status:r.status||"UNVERIFIED",provider:r.provider||"",model:r.model||"",routeMode:r.routeMode||"",fallback:!!r.fallback,data}};
  try{
   const ctx=JSON.stringify(brief),contextChars=ctx.length;if(contextChars>12000)throw new Error("TEAM_CONTEXT_GATE: compact context exceeds 12000 chars");
   const [opRaw,skRaw]=await Promise.all([
    routedLocalText("You are ASTRA Team Ω operator. JSON only: {findings:[],gaps:[],actions:[]}. Use only supplied evidence. Do not claim tests you did not run.",ctx,"qwen-coder-local",640),
    routedLocalText("You are ASTRA Team Ω skeptic. JSON only: {falsePassRisks:[],contradictions:[],requiredProof:[]}. Be adversarial and evidence-first.",ctx,"gemma-critic-local",512)
   ]);
   const operator=unpack("Operator",opRaw),skeptic=unpack("Skeptic",skRaw);
   const integrationContext=JSON.stringify({project:memory.project,proofStatus:proof.status,taskRoles:team.roles,operator:operator.data,skeptic:skeptic.data});
   if(integrationContext.length>12000)throw new Error("TEAM_INTEGRATION_GATE: synthesis context exceeds 12000 chars");
   const intRaw=await routedLocalText("You are ASTRA Chief of Staff Ω. JSON only: {priorityActions:[],blockedBy:[],readyNow:[],decision:\"\"}. Synthesize without inventing evidence.",integrationContext,"qwen-coder-local",640);
   const integrator=unpack("Chief of Staff",intRaw),routes=[opRaw,skRaw,intRaw],cost=summarizeRouteCost(routes),status=routes.every(r=>r.status==="PASS")?"PASS":"PARTIAL";
   return send(res,status==="PASS"?200:206,{status,memory,team,proof,cost,contextGate:{status:"PASS",operatorChars:contextChars,integratorChars:integrationContext.length,limitChars:12000},ai:{operator,skeptic,integrator},durationNote:"model execution completed in-request"});
  }catch(e){return send(res,206,{status:"PARTIAL",memory,team,proof,cost:summarizeRouteCost([]),ai:{},reason:String(e?.message||e)})}
 }

 if(req.method==="POST"&&url.pathname==="/api/import_github"){const x=await body(req);try{return send(res,200,await importGithubProject(x))}catch(e){return send(res,502,{status:"FAIL",reason:String(e.message||e)})}}
 if(req.method==="POST"&&url.pathname==="/api/seal"){const x=await body(req);return send(res,200,{status:"PASS",seal:serverSeal(x.payload,x.previousHash||"GENESIS")})}
 if(req.method==="GET"&&url.pathname==="/api/local_model_status"){const [chat,fast,standard,builder,critic]=await Promise.all([localModelHealth("chat"),localModelHealth("fast"),localModelHealth("standard"),localModelHealth("builder"),localModelHealth("critic")]);const pass=[chat,fast,standard,builder,critic].filter(x=>x.status==="PASS").length;return send(res,200,{status:pass===5?"PASS":pass>=3?"PARTIAL":"UNVERIFIED",chat,fast,standard,builder,critic})}
 if(req.method==="POST"&&url.pathname==="/api/router_chat"){
  if(!routerAuthorized(req))return send(res,401,{status:"FAIL",reason:"unauthorized"});
  const x=await body(req),system=String(x.system||""),user=String(x.user||"");
  if(!user.trim()||user.length>24000||system.length>24000)return send(res,400,{status:"FAIL",reason:"invalid chat payload"});
  try{
   const out=await routedChatText(system,user,x.requestedModel,x.maxTokens);
   return send(res,out.status==="PASS"?200:206,out);
  }catch(e){return send(res,503,{status:"FAIL",router:"ASTRA SUPER ROUTER Ω",reason:String(e?.message||e).slice(0,500)})}
 }
 if(req.method==="POST"&&url.pathname==="/api/router_profile"){const x=await body(req);const kind=localKind(x.requestedModel,x.system);return send(res,200,{status:"PASS",kind,profile:kind==="critic"?{mode:"CRITIC",score:0,maxTokens:Math.max(128,Math.min(768,Number(x.maxTokens)||512))}:kind==="fast"?{mode:"FAST",score:0,maxTokens:Math.max(96,Math.min(384,Number(x.maxTokens)||256))}:kind==="standard"?{mode:"STANDARD",score:2,maxTokens:Math.max(512,Math.min(2600,Number(x.maxTokens)||1800))}:builderRouteProfile(x.system,x.user,x.requestedModel,x.maxTokens)})}
 if(req.method==="POST"&&url.pathname==="/api/local_text"){const x=await body(req);try{const out=await routedLocalText(x.system,x.user,x.requestedModel,x.maxTokens);return send(res,200,out)}catch(e){return send(res,503,{status:"FAIL",reason:String(e.message||e)})}}
 if(req.method==="POST"&&url.pathname==="/api/inference_self_test"){try{let fast,standard,critic;try{fast=await localText("Return exactly ASTRA_FAST_OK.","Return exactly ASTRA_FAST_OK.","qwen-fast-local",64)}catch(e){fast={error:String(e?.message||e)}};try{standard=await localText("Return exactly ASTRA_STANDARD_OK.","Return exactly ASTRA_STANDARD_OK.","qwen-standard-local",64)}catch(e){standard={error:String(e?.message||e)}};const builder=await localText("Return exactly ASTRA_QWEN_OK.","Return exactly ASTRA_QWEN_OK.","qwen-coder-local",64);try{critic=await localText("Return exactly ASTRA_CRITIC_OK.","Return exactly ASTRA_CRITIC_OK.","gemma-critic-local",64)}catch(e){critic={error:String(e?.message||e)}};const fOk=/ASTRA_FAST_OK/i.test(fast.text||""),sOk=/ASTRA_STANDARD_OK/i.test(standard.text||""),bOk=/ASTRA_QWEN_OK/i.test(builder.text||""),cOk=/ASTRA_CRITIC_OK/i.test(critic.text||"");return send(res,fOk&&sOk&&bOk&&cOk?200:206,{status:fOk&&sOk&&bOk&&cOk?"PASS":"PARTIAL",fast:{ok:fOk,model:fast.model||"qwen-fast-local",error:fast.error||null},standard:{ok:sOk,model:standard.model||"qwen-standard-local",error:standard.error||null},builder:{ok:bOk,model:builder.model},critic:{ok:cOk,model:critic.model||"gemma-critic-local",error:critic.error||null}})}catch(e){return send(res,503,{status:"FAIL",reason:String(e.message||e)})}}
 if(req.method==="POST"&&url.pathname==="/api/free_text"){const x=await body(req);try{return send(res,200,{status:"PASS",...(await zeroGpuText(x.system,x.user))})}catch(e){return send(res,503,{status:"PARTIAL",reason:String(e.message||e),provider:"Hugging Face ZeroGPU",model:"Qwen/Qwen3.8-27B"})}}
 if(req.method==="POST"&&url.pathname==="/api/free_image"){const x=await body(req);try{return send(res,200,{status:"PASS",...(await zeroGpuImage(x.prompt))})}catch(e){return send(res,503,{status:"PARTIAL",reason:String(e.message||e),provider:"Hugging Face ZeroGPU",model:"Qwen/Qwen-Image-2.1"})}}
 if(req.method==="GET"&&url.pathname==="/api/golden_run_status")return send(res,200,{...goldenState,error:goldenState.error?String(goldenState.error).slice(0,800):null});
 if(req.method==="POST"&&url.pathname==="/api/golden_run"){const result=await runGoldenRun();return send(res,result.status==="PASS"?200:result.status==="FAIL"?500:206,{...result,error:result.error?String(result.error).slice(0,800):null})}
 if(req.method==="GET"&&url.pathname==="/api/sandbox_status")return send(res,200,await sandboxStatus());
 if(req.method==="POST"&&url.pathname==="/api/sandbox_run"){const x=await body(req);try{return send(res,200,await sandboxRun(x))}catch(e){return send(res,502,{status:"FAIL",reason:String(e?.message||e)})}}
 if(req.method==="POST"&&url.pathname==="/api/validate")return send(res,200,validate(await body(req)));
 if(req.method==="POST"&&url.pathname==="/api/deploy-plan")return send(res,200,deployPlan(await body(req)));
 if(req.method==="POST"&&url.pathname==="/api/deploy"){
  const project=await body(req),plan=deployPlan(project);if(plan.validation.verdict==="FAIL")return send(res,422,{status:"FAIL",plan});
  const deploy=project.deploy||{};
  try{const git=await createGithubProject(project,deploy);const rw=await createRailwayDeployment(project,deploy,git);return send(res,202,{status:"PARTIAL",reason:"Deployment started; public health not verified yet",git,railway:rw,plan})}
  catch(e){return send(res,502,{status:"FAIL",reason:String(e.message||e),plan})}
 }
 if(req.method==="POST"&&url.pathname==="/api/deploy_status"){
  const x=await body(req);try{return send(res,200,await deploymentStatus(x))}catch(e){return send(res,502,{status:"FAIL",reason:String(e.message||e)})}
 }
 return false;
}

const srv=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url||"/","http://localhost");if(url.pathname.startsWith("/api/")||url.pathname==="/health"){const done=await api(req,res,url);if(done!==false)return}
 let p=decodeURIComponent(url.pathname);if(p==="/")p="/index.html";const rel=normalize(p).replace(/^[/\\]+/,"");if(!safePath(rel)){res.writeHead(403);return res.end("Forbidden")}const f=join(root,rel);if(!f.startsWith(root)){res.writeHead(403);return res.end("Forbidden")}const st=await stat(f);if(!st.isFile())throw new Error("not file");const data=await readFile(f);res.writeHead(200,{"content-type":mime[extname(f)]||"application/octet-stream","cache-control":"no-store, max-age=0"});res.end(data)
}catch(e){if(e?.status)return send(res,e.status,{error:e.message});res.writeHead(404,{"content-type":"text/plain; charset=utf-8"});res.end("Not found")}});
srv.listen(port,"0.0.0.0",()=>{
 console.log("ASTRA BUILDER Ω V10.0 OWNER MODE WORKSPACE listening",port);
 if(process.env.ASTRA_MODEL_PROBE_ON_BOOT==="1")setTimeout(async()=>{
  try{
   const t=await zeroGpuText("You are an inference connectivity probe.","Return exactly ASTRA_MODEL_OK and nothing else.",64);
   console.log("[ASTRA MODEL PROBE] TEXT PASS",t.model,String(t.text).slice(0,120));
  }catch(e){console.error("[ASTRA MODEL PROBE] TEXT FAIL",String(e?.message||e).slice(0,300))}
  try{
   const r=await timeoutFetch(ZERO_GPU_IMAGE_HOST+"/config",{},20000);
   console.log("[ASTRA MODEL PROBE] IMAGE ROUTE",r.ok?"PASS":"FAIL",r.status,"Qwen/Qwen-Image-2.1");
  }catch(e){console.error("[ASTRA MODEL PROBE] IMAGE ROUTE FAIL",String(e?.message||e).slice(0,300))}
 },750);

 if(process.env.ASTRA_CRM_SMOKE_ON_BOOT==="1")setTimeout(()=>{console.log("[ASTRA CRM SMOKE START] exact-user-mission");runMissionSmoke("Crée un CRM premium pour indépendants avec contacts, pipeline, tâches, recherche, authentification, API, tableau de bord responsive et tests. Production-style, no fake buttons, no fake auth, deployable as one Railway service.").catch(e=>console.error("[ASTRA MISSION SMOKE] UNCAUGHT",e))},1800);
 if(process.env.ASTRA_GOLDEN_RUN_ON_BOOT==="1")setTimeout(()=>{runGoldenRun().catch(e=>console.error("[ASTRA GOLDEN RUN] UNCAUGHT",e))},2500);
 if(process.env.ASTRA_SANDBOX_PROBE_ON_BOOT==="1")setTimeout(async()=>{
  try{
   const r=await sandboxRun({files:[
    {path:"package.json",content:JSON.stringify({name:"astra-sbx-probe",version:"1.0.0",scripts:{build:"node -e \"process.exit(0)\"",test:"node test.js",start:"node server.js"}})},
    {path:"test.js",content:"if(2+2!==4)process.exit(1)"},
    {path:"server.js",content:"const http=require('http');http.createServer((q,s)=>{s.writeHead(q.url==='/health'?200:404);s.end('ok')}).listen(process.env.PORT,'127.0.0.1')"}
   ]});
   console.log("[ASTRA SANDBOX PROBE]",r.status,r.sandboxLevel,r.durationMs+"ms",String(r.projectDigest||"").slice(0,12));
  }catch(e){console.error("[ASTRA SANDBOX PROBE] FAIL",String(e?.message||e).slice(0,300))}
 },900);
 if(process.env.ASTRA_MEMORY_VAULT_PROBE_ON_BOOT==="1")setTimeout(async()=>{
  try{const r=await runMemoryVaultProbe(port);console.log("[ASTRA MEMORY VAULT PROBE]",r.status,r.storage,"reload="+r.reloadVerified,"file="+r.restored?.file)}
  catch(e){console.error("[ASTRA MEMORY VAULT PROBE] FAIL",String(e?.message||e).slice(0,500))}
 },1200);

 if(process.env.ASTRA_OWNER_ACTION_PROBE_ON_BOOT==="1")setTimeout(async()=>{
  try{const r=await runOwnerActionProbe();console.log("[ASTRA OWNER ACTION PROBE]",r.status,r.mode,r.trace?.length,r.final?.text)}
  catch(e){console.error("[ASTRA OWNER ACTION PROBE] FAIL",String(e?.message||e).slice(0,700))}
 },9000);

 if(process.env.ASTRA_CLAW_PROBE_ON_BOOT==="1")setTimeout(async()=>{
  try{const r=await runClaw({url:"https://example.com",goal:"ASTRA Claw smoke test",maxSteps:1});console.log("[ASTRA CLAW PROBE]",r.status,r.mode,r.visited?.[0]?.status,r.final?.title,Buffer.byteLength(r.screenshotB64||"","base64")+" bytes")}
  catch(e){console.error("[ASTRA CLAW PROBE] FAIL",String(e?.message||e).slice(0,500))}
 },1100);

 if(process.env.ASTRA_LOCAL_MODEL_PROBE_ON_BOOT==="1")setTimeout(async()=>{
  try{const q=await localText("You are a JSON connectivity probe.","Return JSON only: {\"ok\":true,\"role\":\"fast\"}","qwen-fast-local",96),j=parseProbeJson(q.text);if(j.ok!==true||j.role!=="fast"||q.routeMode!=="FAST")throw new Error("unexpected FAST lane result");console.log("[ASTRA LOCAL MODEL PROBE] FAST LANE JSON PASS",q.model,q.routeMode,q.tokenBudget,JSON.stringify(j))}catch(e){console.error("[ASTRA LOCAL MODEL PROBE] FAST LANE JSON FAIL",String(e?.message||e).slice(0,300))}
  try{const q=await localText("You are the full-stack architect. Design authentication, PostgreSQL schema, backend API, security and Railway deployment.","Return JSON only: {\"ok\":true,\"route\":\"deep\"}","qwen-coder-local",3072),j=parseProbeJson(q.text);if(j.ok!==true||q.routeMode!=="DEEP")throw new Error("unexpected Qwen DEEP result: "+q.routeMode);console.log("[ASTRA LOCAL MODEL PROBE] QWEN DEEP JSON PASS",q.model,q.routeMode,q.tokenBudget,JSON.stringify(j))}catch(e){console.error("[ASTRA LOCAL MODEL PROBE] QWEN DEEP JSON FAIL",String(e?.message||e).slice(0,300))}
  try{const d=await localText("You are a JSON connectivity probe.","Return JSON only: {\"ok\":true,\"role\":\"critic\"}","gemma-critic-local",128),j=parseProbeJson(d.text);if(j.ok!==true||j.role!=="critic")throw new Error("unexpected critic JSON: "+String(d.text).slice(0,120));console.log("[ASTRA LOCAL MODEL PROBE] CRITIC JSON PASS",d.model,JSON.stringify(j))}catch(e){console.error("[ASTRA LOCAL MODEL PROBE] CRITIC JSON FAIL",String(e?.message||e).slice(0,300))}
 },1500);
});
