import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createHash } from "node:crypto";
import { seedPopulation, rankPopulation, evolutionDecision } from "./src/evolution-engine.js";
import { defaultMetaPolicy, normalizePolicy, mutatePolicies, rewardOutcome } from "./src/meta-evolution.js";

const root=process.cwd(),port=Number(process.env.PORT||3000),MAX=4*1024*1024;
const rescueEvents=[];const rescueLog=(type,detail)=>{rescueEvents.push({at:new Date().toISOString(),type,detail:String(detail).slice(0,500)});if(rescueEvents.length>50)rescueEvents.shift();console.error("[ASTRA RESCUE Ω]",type,detail)};
let shuttingDown=false;const fatal=(type,err)=>{if(shuttingDown)return;shuttingDown=true;rescueLog(type,err?.stack||err);setTimeout(()=>process.exit(1),75).unref()};
process.on("uncaughtException",e=>fatal("uncaughtException",e));process.on("unhandledRejection",e=>fatal("unhandledRejection",e));
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml"};
const send=(res,code,obj)=>{res.writeHead(code,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(obj))};
async function body(req){let n=0,ch=[];for await(const c of req){n+=c.length;if(n>MAX)throw Object.assign(new Error("payload too large"),{status:413});ch.push(c)}return ch.length?JSON.parse(Buffer.concat(ch).toString("utf8")):{}}
const safePath=p=>typeof p==="string"&&p.length>0&&!p.startsWith("/")&&!p.includes("..")&&!p.includes("\\");
const slug=s=>String(s||"astra-app").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,54)||"astra-app";
const timeoutFetch=(url,opts={},ms=15000)=>fetch(url,{...opts,signal:AbortSignal.timeout(ms)});
const localModelBase=kind=>String(kind==="critic"?process.env.ASTRA_LOCAL_CRITIC_BASE||process.env.ASTRA_LOCAL_DEEPSEEK_BASE:process.env.ASTRA_LOCAL_QWEN_BASE||"").replace(/\/+$/,"");
async function localModelHealth(kind){
 const base=localModelBase(kind);if(!base)return{status:"UNVERIFIED",kind,reason:"private model base not configured"};
 const root=base.replace(/\/v1$/,"");
 try{const r=await timeoutFetch(root+"/health",{},30000),raw=await r.text();return{status:r.ok?"PASS":"PARTIAL",kind,httpStatus:r.status,body:raw.slice(0,180),baseConfigured:true}}catch(e){return{status:"PARTIAL",kind,reason:String(e?.message||e),baseConfigured:true}}
}
function localKind(requestedModel="",system=""){
 const s=(String(requestedModel)+" "+String(system)).toLowerCase();
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
async function localText(system,user,requestedModel,maxTokens=1536){
 const kind=localKind(requestedModel,system),base=localModelBase(kind);if(!base)throw new Error("local "+kind+" model endpoint not configured");
 const model=kind==="critic"?"gemma-critic-local":"qwen-coder-local";
 const profile=kind==="critic"?{mode:"CRITIC",score:0,maxTokens:Math.max(256,Math.min(1536,Number(maxTokens)||1536)),timeoutMs:180000,temperature:.2}:builderRouteProfile(system,user,requestedModel,maxTokens);
 const r=await timeoutFetch(base+"/chat/completions",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer astra-private"},body:JSON.stringify({model,temperature:profile.temperature,max_tokens:profile.maxTokens,response_format:{type:"json_object"},messages:[{role:"system",content:String(system||"")},{role:"user",content:String(user||"")} ]})},profile.timeoutMs);
 const raw=await r.text();if(!r.ok)throw new Error("local "+kind+" inference "+r.status+": "+raw.slice(0,280));
 let data;try{data=JSON.parse(raw)}catch{throw new Error("local "+kind+" inference non-JSON")}
 let text=String(data?.choices?.[0]?.message?.content||"");
 if(kind==="critic")text=text.replace(/<think>[\s\S]*?<\/think>/gi,"").trim();
 if(!text)throw new Error("local "+kind+" inference empty");
 return{text,provider:"ASTRA private llama.cpp",model,kind,route:"railway-private",routeMode:profile.mode,routeScore:profile.score,tokenBudget:profile.maxTokens};
}
function parseProbeJson(text){
 const s=String(text||"").trim().replace(/^```(?:json)?/i,"").replace(/```$/,"").trim();
 try{return JSON.parse(s)}catch{}
 const a=s.indexOf("{"),b=s.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(s.slice(a,b+1));
 throw new Error("structured JSON missing");
}
async function routedLocalText(system,user,requestedModel,maxTokens=1536){
 try{return{status:"PASS",...(await localText(system,user,requestedModel,maxTokens)),fallback:false}}
 catch(localError){
  const fb=await zeroGpuText(system,user,maxTokens);
  return{status:"PARTIAL",...fb,fallback:true,localError:String(localError?.message||localError).slice(0,260)};
 }
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
 if(req.method==="GET"&&url.pathname==="/health")return send(res,200,{ok:true,service:"astra-builder-omega-v3",version:"6.0.0",nativeDeployBroker:true,rescue:"ARMED"});
 if(req.method==="GET"&&url.pathname==="/api/self_test"){
  const sample={spec:{acceptance:["UI renders","API health works","Auth and data contracts exist"]},files:[{path:"frontend/index.html",content:"<main>ASTRA test</main>"},{path:"backend/package.json",content:'{"name":"demo","version":"1.0.0"}'},{path:"backend/src/server.js",content:"app.get('/health',handler)"},{path:"backend/tests/server.test.js",content:"test health endpoint"},{path:"database/schema.sql",content:"create table users(id text primary key);"},{path:"auth/session.js",content:"export function sessionGuard(){}"},{path:"Dockerfile",content:"FROM node:22-alpine"},{path:"deploy.json",content:'{"provider":"railway","dockerfilePath":"Dockerfile","healthPath":"/health"}'},{path:"README.md",content:"demo"}]};
  const v=validate(sample),rescueOk=typeof fatal==="function"&&Array.isArray(rescueEvents),sealTest=serverSeal({selfTest:true},"GENESIS"),sealOk=/^[a-f0-9]{64}$/.test(sealTest.hash),pop=seedPopulation(4,1).map((x,i)=>({...x,fitness:10-i})),ranked=rankPopulation(pop),evoDecision=evolutionDecision(null,ranked[0]),evolutionOk=pop.length===4&&ranked[0]?.fitness===10&&evoDecision.action==="CONTINUE",metaPolicy=normalizePolicy({...defaultMetaPolicy(),trustThreshold:1,population:99,rescueAttempts:99,adversaryPasses:99}),mutants=mutatePolicies(defaultMetaPolicy(),4),metaRewardPass=rewardOutcome({quality:95,trustScore:90,tests:5,status:"PASS",fail:0,partial:0,latencyMs:1000,deployPass:true}),metaRewardFail=rewardOutcome({quality:30,trustScore:20,tests:0,status:"FAIL",fail:2,partial:3,latencyMs:20000,deployPass:false}),metaOk=metaPolicy.trustThreshold>=76&&metaPolicy.population<=5&&metaPolicy.rescueAttempts<=4&&metaPolicy.adversaryPasses<=2&&mutants.length===4&&metaRewardPass>metaRewardFail;return send(res,v.verdict==="PASS"&&rescueOk&&sealOk&&evolutionOk&&metaOk?200:500,{ok:v.verdict==="PASS"&&rescueOk&&sealOk&&evolutionOk&&metaOk,verdict:v.verdict,rescue:rescueOk?"ARMED":"FAIL",sovereignSeal:sealOk?"PASS":"FAIL",evolutionEngine:evolutionOk?"PASS":"FAIL",metaEvolution:metaOk?"PASS":"FAIL",metaSafetyRails:{trustThreshold:metaPolicy.trustThreshold,population:metaPolicy.population,rescueAttempts:metaPolicy.rescueAttempts,adversaryPasses:metaPolicy.adversaryPasses},sealHead:sealTest.hash,evidence:v.evidence});
 }
 if(req.method==="GET"&&url.pathname==="/api/capabilities")return send(res,200,{version:"6.0.0",serverValidation:true,deployBroker:true,nativeDeployBroker:true,rescue:true,sovereignCore:true,evidenceSeal:"SHA-256",missionGraph:"AION",duality:"DUALITY-X",agentShield:true,negativeKnowledge:true,experimentGenome:true,benchmark:"BENCHMARK-X10",adaptiveRouter:"JEV-X",evolutionEngine:"EVOLUTION-Ω",metaEvolution:"META-EVOLUTION-Ω",immutableMetaRails:true,rescuePolicy:{operationAttempts:"meta-policy 2-4",pipelineRestarts:2,serverRestart:"ON_FAILURE"},providers:["github","railway","astra-local-qwen-3b","astra-local-gemma","huggingface-zerogpu","openrouter-free"],zeroCostGate:true,maxPayloadBytes:MAX});
 if(req.method==="GET"&&url.pathname==="/api/rescue_status")return send(res,200,{status:"ARMED",events:rescueEvents.slice(-20),restartPolicy:"Railway ON_FAILURE",circuitBreaker:true});
 if(req.method==="POST"&&url.pathname==="/api/import_github"){const x=await body(req);try{return send(res,200,await importGithubProject(x))}catch(e){return send(res,502,{status:"FAIL",reason:String(e.message||e)})}}
 if(req.method==="POST"&&url.pathname==="/api/seal"){const x=await body(req);return send(res,200,{status:"PASS",seal:serverSeal(x.payload,x.previousHash||"GENESIS")})}
 if(req.method==="GET"&&url.pathname==="/api/local_model_status"){const [builder,critic]=await Promise.all([localModelHealth("builder"),localModelHealth("critic")]);return send(res,200,{status:builder.status==="PASS"&&critic.status==="PASS"?"PASS":builder.status==="PASS"?"PARTIAL":"UNVERIFIED",builder,critic})}
 if(req.method==="POST"&&url.pathname==="/api/local_text"){const x=await body(req);try{const out=await routedLocalText(x.system,x.user,x.requestedModel,x.maxTokens);return send(res,200,out)}catch(e){return send(res,503,{status:"FAIL",reason:String(e.message||e)})}}
 if(req.method==="POST"&&url.pathname==="/api/inference_self_test"){try{const builder=await localText("Return exactly ASTRA_QWEN_OK.","Return exactly ASTRA_QWEN_OK.",64);let critic;try{critic=await localText("Return exactly ASTRA_CRITIC_OK.","Return exactly ASTRA_CRITIC_OK.","gemma-critic-local",64)}catch(e){critic={error:String(e?.message||e)}};const bOk=/ASTRA_QWEN_OK/i.test(builder.text||""),cOk=/ASTRA_CRITIC_OK/i.test(critic.text||"");return send(res,bOk&&cOk?200:206,{status:bOk&&cOk?"PASS":"PARTIAL",builder:{ok:bOk,model:builder.model,text:String(builder.text||"").slice(0,120)},critic:{ok:cOk,model:critic.model||"gemma-critic-local",text:String(critic.text||"").slice(0,120),error:critic.error||null}})}catch(e){return send(res,503,{status:"FAIL",reason:String(e.message||e)})}}
 if(req.method==="POST"&&url.pathname==="/api/free_text"){const x=await body(req);try{return send(res,200,{status:"PASS",...(await zeroGpuText(x.system,x.user))})}catch(e){return send(res,503,{status:"PARTIAL",reason:String(e.message||e),provider:"Hugging Face ZeroGPU",model:"Qwen/Qwen3.8-27B"})}}
 if(req.method==="POST"&&url.pathname==="/api/free_image"){const x=await body(req);try{return send(res,200,{status:"PASS",...(await zeroGpuImage(x.prompt))})}catch(e){return send(res,503,{status:"PARTIAL",reason:String(e.message||e),provider:"Hugging Face ZeroGPU",model:"Qwen/Qwen-Image-2.1"})}}
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
 let p=decodeURIComponent(url.pathname);if(p==="/")p="/index.html";const rel=normalize(p).replace(/^[/\\]+/,"");if(!safePath(rel)){res.writeHead(403);return res.end("Forbidden")}const f=join(root,rel);if(!f.startsWith(root)){res.writeHead(403);return res.end("Forbidden")}const st=await stat(f);if(!st.isFile())throw new Error("not file");const data=await readFile(f);res.writeHead(200,{"content-type":mime[extname(f)]||"application/octet-stream","cache-control":"public,max-age=300"});res.end(data)
}catch(e){if(e?.status)return send(res,e.status,{error:e.message});res.writeHead(404,{"content-type":"text/plain; charset=utf-8"});res.end("Not found")}});
srv.listen(port,"0.0.0.0",()=>{
 console.log("ASTRA BUILDER Ω V6 META-EVOLUTION ENGINE listening",port);
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

 if(process.env.ASTRA_LOCAL_MODEL_PROBE_ON_BOOT==="1")setTimeout(async()=>{
  try{const q=await localText("You are a JSON connectivity probe.","Return JSON only: {\"ok\":true,\"role\":\"builder\"}","qwen-coder-local",96),j=parseProbeJson(q.text);if(j.ok!==true||j.role!=="builder")throw new Error("unexpected Qwen JSON");console.log("[ASTRA LOCAL MODEL PROBE] QWEN JSON PASS",q.model,JSON.stringify(j))}catch(e){console.error("[ASTRA LOCAL MODEL PROBE] QWEN JSON FAIL",String(e?.message||e).slice(0,300))}
  try{const d=await localText("You are a JSON connectivity probe.","Return JSON only: {\"ok\":true,\"role\":\"critic\"}","gemma-critic-local",128),j=parseProbeJson(d.text);if(j.ok!==true||j.role!=="critic")throw new Error("unexpected critic JSON: "+String(d.text).slice(0,120));console.log("[ASTRA LOCAL MODEL PROBE] CRITIC JSON PASS",d.model,JSON.stringify(j))}catch(e){console.error("[ASTRA LOCAL MODEL PROBE] CRITIC JSON FAIL",String(e?.message||e).slice(0,300))}
 },1500);
});
