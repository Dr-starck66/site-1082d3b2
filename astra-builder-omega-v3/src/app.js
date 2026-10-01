import{chat,generateImage,effectiveModel,costStatus,normalizeBase}from"./router.js";
import{staticChecks,benchmark}from"./quality.js";
import{makeZip}from"./zip.js";
import{prompts}from"./prompts.js";
import{RescueSupervisor,classifyError,sleep}from"./rescue.js";
import{saveWorkspace,getWorkspace,listWorkspaces,deleteWorkspace,snapshotOf}from"./workspace.js";
import{compileMission,missionProgress,updateMission,guardFiles,NegativeKnowledge,createGenome,scoreVariant,dualityVerdict,sha256,trustGate}from"./sovereign.js";
import{metricSnapshot,compare as compareBench,matrix as benchmarkMatrix}from"./benchmark-x10.js";
import{seal,verifyChain,proofPack}from"./evidenlock.js";
import{routeAttempt}from"./jev-router.js";
import{DEFAULT_EVOLUTION,seedPopulation,rankPopulation,breedDirectives,evolutionDecision,makeEvolutionRecord,compareWinner}from"./evolution-engine.js";
import{loadMetaState,saveMetaState,beginMetaRun,finishMetaRun,forceMetaEvolution,metaSummary}from"./meta-evolution.js";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const phases=["SPEC","IMPORT","IMPROVE","FRONTEND","BACKEND","DATABASE","AUTH","OPS","IMAGES","STATIC TEST","SERVER VALIDATE","CLOUD SANDBOX","ADVERSARY","REPAIR","VERIFY²","DEPLOY PLAN"];
const defaults={baseUrl:"astra://local/auto",apiKey:"",architect:"qwen-coder-local",frontend:"qwen-coder-local",backend:"qwen-coder-local",ops:"qwen-coder-local",adversary:"gemma-critic-local",verifier:"gemma-critic-local",imageBaseUrl:"astra://zerogpu/qwen-image-2.1",imageKey:"",imageModel:"Qwen/Qwen-Image-2.1",zeroCost:true,attestedFree:false,githubToken:"",railwayToken:"",railwayWorkspaceId:"",repoName:"",privateRepo:true};
const state={cfg:{...defaults},files:[],assets:[],spec:null,evidence:[],agents:{},status:"UNVERIFIED",selected:null,bench:null,deployPlan:null,capabilities:null,deployedUrl:"",workspaceId:null,history:[],conversation:[],mission:null,negativeKnowledge:new NegativeKnowledge(),evidenceChain:[],genomes:[],benchmarkRuns:[],runStartedAt:0,trust:null,sandbox:null,evolution:{running:false,generation:0,decision:"IDLE",candidates:[],history:[]},meta:loadMetaState(),metaRun:null};
window.__ASTRA_STATE__=state;
const RESCUE_KEY="astra-rescue-checkpoint-v1";
function saveCheckpoint(label){
 const cp={label,savedAt:new Date().toISOString(),idea:$("#idea")?.value||"",spec:state.spec,files:state.files,evidence:state.evidence,status:state.status,phase:state.phase,bench:state.bench,deployPlan:state.deployPlan,deployedUrl:state.deployedUrl,sandbox:state.sandbox,mission:state.mission,evidenceChain:state.evidenceChain,genomes:state.genomes,benchmarkRuns:state.benchmarkRuns,trust:state.trust,evolution:state.evolution};
 const raw=JSON.stringify(cp);if(raw.length>3500000)throw new Error("checkpoint too large");
 localStorage.setItem(RESCUE_KEY,raw);
}
function restoreCheckpoint(){
 const raw=localStorage.getItem(RESCUE_KEY);if(!raw)return null;const cp=JSON.parse(raw);
 if(cp.idea&&$("#idea"))$("#idea").value=cp.idea;state.spec=cp.spec||state.spec;state.files=Array.isArray(cp.files)?cp.files:state.files;state.evidence=Array.isArray(cp.evidence)?cp.evidence:state.evidence;state.status=cp.status||state.status;state.phase=cp.phase||state.phase;state.bench=cp.bench||state.bench;state.deployPlan=cp.deployPlan||state.deployPlan;state.deployedUrl=cp.deployedUrl||state.deployedUrl;state.mission=cp.mission||state.mission;state.evidenceChain=cp.evidenceChain||state.evidenceChain;state.genomes=cp.genomes||state.genomes;state.benchmarkRuns=cp.benchmarkRuns||state.benchmarkRuns;state.trust=cp.trust||state.trust;state.sandbox=cp.sandbox||state.sandbox;if(cp.evolution)state.evolution={...cp.evolution,running:false,decision:cp.evolution.running?"RESUMABLE":cp.evolution.decision};
 renderFiles();renderSpec();renderPreview();renderEvidence();renderBenchmark();renderSovereign();renderEvolution();setStatus(state.status||"UNVERIFIED");renderPhases();
 return cp;
}
function rescueEvent(e){
 const b=$("#rescueStatus");if(b){b.textContent=e.status==="PASS"?"RESCUE Ω RECOVERED":e.status==="FAIL"?"RESCUE Ω ALERT":"RESCUE Ω WORKING";b.className="badge "+(e.status==="PASS"?"pass":e.status==="FAIL"?"fail":"partial")}
 addEv("ASTRA RESCUE Ω",e.status,e.type+" · "+e.detail);
}
const rescue=new RescueSupervisor({onEvent:rescueEvent,checkpoint:saveCheckpoint,restore:restoreCheckpoint,maxAttempts:3,maxRestarts:2});
function currentPolicy(){return state.metaRun?.policy||state.meta?.activePolicy||{buildMode:"parallel",population:4,generations:2,elite:2,earlyStopDelta:1.5,trustThreshold:78,rescueAttempts:3,adversaryPasses:1,routerBias:"balanced"}}
async function rescueChat(cfg,model,system,user){const p=currentPolicy();return rescue.run("AI "+model,async attempt=>{const route=routeAttempt(cfg,model,system,attempt,p.routerBias);if(route.fallback)addEv("JEV-X Router","PARTIAL",route.role+" · "+route.bias+" fallback → "+route.model+" (attempt "+attempt+")");const out=await chat(cfg,route.model,system,user);if(route.fallback)addEv("JEV-X Router","PASS",route.role+" recovered via "+route.model);return out},{attempts:p.rescueAttempts})}
async function rescueImage(cfg,prompt){return rescue.run("IMAGE",()=>generateImage(cfg,prompt),{attempts:currentPolicy().rescueAttempts})}
function beginMetaOperation(label){const b=beginMetaRun(state.meta);state.meta=saveMetaState(b.meta);state.metaRun={runId:b.runId,policy:b.policy,mode:b.mode,label,startedAt:Date.now()};addEv("META‑EVOLUTION Ω","PARTIAL",b.mode+" · "+b.policy.name+" · G"+b.policy.generation);renderMeta();return state.metaRun}
function finishMetaOperation(status=state.status,deployPass=false){if(!state.metaRun)return null;const m=metricSnapshot({files:state.files,evidence:state.evidence,startedAt:state.metaRun.startedAt,status}),outcome={label:state.metaRun.label,quality:m.quality,fail:m.fail,partial:m.partial,latencyMs:m.latencyMs,tests:m.tests,trustScore:state.trust?.score||0,status,deployPass};const r=finishMetaRun(state.meta,state.metaRun,outcome);state.meta=r.meta;addEv("META‑EVOLUTION Ω",r.decision.action==="PROMOTE"?"PASS":r.decision.action==="REJECT"?"PARTIAL":"PASS",r.decision.action+" · "+r.decision.reason+" · reward "+r.entry.reward);state.metaRun=null;renderMeta();return r}
async function executeBuildPolicy(specText,nk){
 const p=currentPolicy(),front=()=>rescueChat(state.cfg,state.cfg.frontend,prompts.frontend,"SPEC:\n"+specText+"\nKNOWN FAILURES:\n"+nk),back=()=>rescueChat(state.cfg,state.cfg.backend,prompts.backend,"SPEC:\n"+specText+"\nKNOWN FAILURES:\n"+nk),db=()=>rescueChat(state.cfg,state.cfg.backend,prompts.database,"SPEC:\n"+specText+"\nKNOWN FAILURES:\n"+nk),auth=()=>rescueChat(state.cfg,state.cfg.backend,prompts.auth,"SPEC:\n"+specText+"\nKNOWN FAILURES:\n"+nk),ops=()=>rescueChat(state.cfg,state.cfg.ops,prompts.ops,"SPEC:\n"+specText+"\nKNOWN FAILURES:\n"+nk);
 addEv("META build policy","PASS",p.buildMode+" · policy "+p.name);
 if(p.buildMode==="staged"){const [frontRaw,backRaw]=await Promise.all([front(),back()]);const [dbRaw,authRaw,opsRaw]=await Promise.all([db(),auth(),ops()]);return[frontRaw,backRaw,dbRaw,authRaw,opsRaw]}
 return Promise.all([front(),back(),db(),auth(),ops()]);
}
function parse(t){const c=(t||"").trim().replace(/^\`\`\`(?:json)?/i,"").replace(/\`\`\`$/i,"").trim();try{return JSON.parse(c)}catch{}const a=c.indexOf("{"),b=c.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(c.slice(a,b+1));throw new Error("Réponse IA non JSON")}
function safeFiles(v){return(v?.files||[]).filter(x=>x&&typeof x.path==="string"&&typeof x.content==="string"&&x.path&&!x.path.includes("..")&&!x.path.startsWith("/"))}
function mergeFiles(...groups){const m=new Map;for(const g of groups)for(const f of g)m.set(f.path,f);return[...m.values()].sort((a,b)=>a.path.localeCompare(b.path))}
function setStatus(s){state.status=s;const e=$("#globalStatus");e.textContent=s;e.className="badge "+s.toLowerCase()}
function setPhase(name){if(state.phase&&state.phase!==name)rescue.checkpoint("phase:"+state.phase);state.phase=name;renderPhases()}
function renderPhases(){const root=$("#phases");root.innerHTML=phases.map((p,i)=>`<div class="phase ${state.phase===p?"active":""}"><b>${i+1}</b><span>${p}</span><em>${state.phase===p?"RUNNING":state.phase==="DONE"?"DONE":"WAIT"}</em></div>`).join("")}
function agent(name,model,status="UNVERIFIED"){state.agents[name]={model,status};renderAgents()}
function renderAgents(){const r=$("#agents");r.innerHTML=Object.entries(state.agents).map(([n,a])=>`<div class="agent"><span>${n}</span><small>${a.model}</small><small class="${a.status.toLowerCase()}">${a.status}</small></div>`).join("")}
function addEv(name,status,detail){const i=state.evidence.findIndex(x=>x.name===name);const x={name,status,detail};if(i>=0)state.evidence[i]=x;else state.evidence.push(x);renderEvidence()}
function renderEvidence(){const r=$("#ledger");r.innerHTML=state.evidence.length?state.evidence.map(x=>`<div class="ev"><div><b>${escapeHtml(x.name)}</b><small>${escapeHtml(x.detail)}</small></div><span class="${x.status.toLowerCase()}">${x.status}</span></div>`).join(""):'<p class="muted">Aucun contrôle exécuté.</p>';const p=state.evidence.filter(x=>x.status==="PASS").length;$("#score").textContent=p+"/"+state.evidence.length;$("#fileCount").textContent=state.files.length;$("#assetCount").textContent=state.assets.length;$("#testCount").textContent=state.files.filter(f=>/(test|spec)/i.test(f.path)).length;$("#deployReadiness").textContent=state.evidence.some(x=>x.status==="FAIL")?"FAIL":state.files.some(f=>f.path==="deploy.json")?"PARTIAL":"UNVERIFIED"}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
function routeSummary(){const c=state.cfg,p=currentPolicy();$("#routeSummary").innerHTML=`ZERO-COST GATE: <b>${c.zeroCost?"ON":"OFF"}</b><br>Text: ${escapeHtml(normalizeBase(c.baseUrl)||"—")}<br>Builder effectif: ${escapeHtml(effectiveModel(c,c.frontend))}<br>Text cost gate: <b>${costStatus(c,"text")}</b> · Image cost gate: <b>${costStatus(c,"image")}</b><br>META policy: <b>${escapeHtml(p.name)}</b> · ${escapeHtml(p.buildMode)} · trust ≥ ${p.trustThreshold}`}
function renderFiles(){const tree=$("#fileTree");tree.innerHTML=state.files.map(f=>`<button data-path="${escapeHtml(f.path)}" class="${state.selected===f.path?"active":""}" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</button>`).join("");$$("#fileTree button").forEach(b=>b.onclick=()=>selectFile(b.dataset.path));$("#exportBtn").disabled=!state.files.length;$("#deployBtn").disabled=!(state.files.length&&state.capabilities?.deployBroker&&state.trust?.status==="PASS");$("#improveBtn").disabled=!state.files.length;$("#evolveBtn").disabled=!state.files.length||state.evolution.running;$("#proofPackBtn").disabled=!state.evidenceChain.length;renderEvidence();renderSovereign()}
function selectFile(path){state.selected=path;const f=state.files.find(x=>x.path===path);$("#filePath").textContent=path||"—";$("#codeViewer").textContent=f?.content||"";$("#downloadFileBtn").disabled=!f;renderFiles()}
function previewDoc(){const m=Object.fromEntries(state.files.map(f=>[f.path,f.content]));let h=m["preview/index.html"]||"<html><body><h1>Preview absente</h1></body></html>";h=h.replace(/<link[^>]*href=["'](?:\.\/)?styles\.css["'][^>]*>/i,"<style>"+(m["preview/styles.css"]||"").replace(/<\/style/gi,"<\\/style")+"</style>");h=h.replace(/<script[^>]*src=["'](?:\.\/)?app\.js["'][^>]*><\/script>/i,"<script>"+(m["preview/app.js"]||"").replace(/<\/script/gi,"<\\/script")+"<\\/script>");for(const a of state.assets){h=h.replace(new RegExp(`(<img[^>]*data-astra-image=["']${a.id}["'][^>]*)(>)`,"gi"),`$1 src="${a.dataUrl}"$2`)}return h}
function renderPreview(){const f=$("#preview"),empty=$("#previewEmpty");if(state.files.some(x=>x.path==="preview/index.html")){f.style.display="block";empty.classList.add("hidden");f.srcdoc=previewDoc()}else{f.style.display="none";empty.classList.remove("hidden")}}
function renderSpec(){$("#specViewer").textContent=JSON.stringify(state.spec||{status:"waiting"},null,2)}
function renderBenchmark(){
 const b=state.bench,m=benchmarkMatrix(state.benchmarkRuns||[]);if(!b&&!Object.keys(m).length){$("#benchmarkView").innerHTML="<p>Aucun benchmark exécuté.</p>";return}
 const rows=Object.entries(m).map(([k,v])=>`<tr><td>${escapeHtml(k)}</td><td>${v.runs}</td><td>${v.quality}</td><td>${v.latencyMs}</td><td>${v.fail}</td></tr>`).join("");
 $("#benchmarkView").innerHTML=`<div class="bench-grid"><div class="bench-card"><small>Evidence quality</small><b>${b?.quality??0}%</b></div><div class="bench-card"><small>Completeness</small><b>${b?.completeness??0}%</b></div><div class="bench-card"><small>Architecture</small><b>${b?.architecture??0}%</b></div></div><table class="bench-table"><tr><th>BENCHMARK-X10 run</th><th>Runs</th><th>Quality</th><th>Latency ms</th><th>Fails</th></tr>${rows||'<tr><td colspan="5">No X10 runs yet</td></tr>'}</table><table class="bench-table"><tr><th>Comparatif externe</th><th>ASTRA</th><th>Lovable</th><th>Bolt</th></tr><tr><td>Files</td><td>${b?.files??0}</td><td>UNVERIFIED</td><td>UNVERIFIED</td></tr><tr><td>Tests</td><td>${b?.tests??0}</td><td>UNVERIFIED</td><td>UNVERIFIED</td></tr></table><p class="muted">${escapeHtml(b?.note||"Aucun classement externe sans benchmark identique sur les concurrents.")}</p>`;
}
function renderEvolution(){
 const root=$("#evolutionView");if(!root)return;const ev=state.evolution||{generation:0,decision:"IDLE",candidates:[],history:[]};
 $("#evolutionGeneration").textContent=String(ev.generation||0);
 const ranked=rankPopulation(ev.candidates||[]),best=ranked[0];
 $("#evolutionFitness").textContent=best?String(best.fitness):"—";$("#evolutionDecision").textContent=ev.decision||"IDLE";
 const rows=ranked.map(x=>`<tr><td>#${x.rank}</td><td>${escapeHtml(x.label||x.id)}</td><td>${x.fitness??"—"}</td><td>${escapeHtml(x.status||"UNVERIFIED")}</td><td>${x.metrics?.quality??"—"}</td><td>${x.latencyMs??0}</td></tr>`).join("");
 const hist=(ev.history||[]).slice().reverse().map(h=>`<div class="ev"><div><b>${escapeHtml("G"+h.generation+" · "+(h.decision?.action||""))}</b><small>${escapeHtml((h.decision?.reason||"")+" · best "+(h.best?.fitness??"—"))}</small></div><span class="${h.decision?.action==="ROLLBACK"?"fail":"pass"}">${escapeHtml(h.decision?.action||"")}</span></div>`).join("");
 root.innerHTML=`<div class="card"><small>EVOLUTION POPULATION</small><table class="bench-table"><tr><th>Rank</th><th>Lineage</th><th>Fitness</th><th>Status</th><th>Quality</th><th>Latency</th></tr>${rows||'<tr><td colspan="6">No candidates yet</td></tr>'}</table></div><div class="card"><small>GENERATION HISTORY</small>${hist||'<p class="muted">No generations yet.</p>'}</div>`;
}
function renderMeta(){
 const root=$("#metaView");if(!root)return;const m=metaSummary(state.meta),active=m.active,trial=m.trial;$("#metaGeneration").textContent=String(m.generation||1);$("#metaPolicy").textContent=active?.name||"—";$("#metaDecision").textContent=m.lastDecision||"—";
 const stats=Object.entries(m.stats||{}).sort((a,b)=>(b[1].avgReward||0)-(a[1].avgReward||0)).map(([id,s])=>`<tr><td>${escapeHtml(id)}</td><td>${s.samples}</td><td>${s.avgReward}</td><td>${s.bestReward}</td></tr>`).join("");
 const p=x=>x?`<div class="ev"><div><b>${escapeHtml(x.name)}</b><small>${escapeHtml("G"+x.generation+" · "+x.buildMode+" · pop "+x.population+"×"+x.generations+" · trust "+x.trustThreshold+" · rescue "+x.rescueAttempts+" · "+x.routerBias)}</small></div><span class="pass">${escapeHtml(x.id)}</span></div>`:'<p class="muted">None</p>';
 const rails=Object.entries(m.rails||{}).map(([k,v])=>`<span class="badge pass">${escapeHtml(k)}=${escapeHtml(v)}</span>`).join(" ");
 root.innerHTML=`<div class="card"><small>ACTIVE META POLICY</small>${p(active)}</div><div class="card"><small>SHADOW / TRIAL POLICY</small>${p(trial)}</div><div class="card"><small>POLICY EVIDENCE</small><table class="bench-table"><tr><th>Policy</th><th>Samples</th><th>Avg reward</th><th>Best</th></tr>${stats||'<tr><td colspan="4">Collecting real run evidence</td></tr>'}</table></div><div class="card"><small>IMMUTABLE SAFETY RAILS</small><p>${rails}</p></div>`;
}
function runMetaEvolution(){
 state.meta=forceMetaEvolution(state.meta);const m=metaSummary(state.meta);addEv("META‑EVOLUTION decision",m.lastDecision==="PROMOTE"?"PASS":"PARTIAL",m.lastDecision+(m.trial?" · trial "+m.trial.name:" · active "+m.active.name));renderMeta();document.querySelector('[data-tab="meta"]').click();return m;
}
function renderSovereign(){
 const root=$("#sovereignView");if(!root)return;const mp=missionProgress(state.mission);$("#missionScore").textContent=mp.pct+"%";$("#chainScore").textContent=String(state.evidenceChain.length);$("#genomeScore").textContent=String(state.genomes.length);
 const mission=(state.mission?.nodes||[]).map(n=>`<div class="ev"><div><b>${escapeHtml(n.id+" · "+n.title)}</b><small>${escapeHtml(n.type+" · deps "+(n.deps||[]).join(","))}</small></div><span class="${String(n.status||"UNVERIFIED").toLowerCase()}">${n.status||"WAIT"}</span></div>`).join("");
 const nk=state.negativeKnowledge.hints(6).map(x=>`<div class="ev"><div><b>${escapeHtml(x.signature)}</b><small>${escapeHtml(x.message)}</small></div><span class="partial">×${x.count}</span></div>`).join("");
 const head=state.evidenceChain.at(-1)?.hash||"GENESIS";
 const genomes=state.genomes.slice(-5).reverse().map(g=>`<div class="ev"><div><b>${escapeHtml(g.label)}</b><small>${escapeHtml(g.createdAt+" · "+g.traits.files+" files · Q"+g.traits.evidenceQuality)}</small></div><span class="${String(g.traits.status||"UNVERIFIED").toLowerCase()}">${g.traits.status}</span></div>`).join("");
 root.innerHTML=`<div class="card"><small>Q-NAV X ADAPTIVE TRUST</small><p><b>${state.trust?.status||"UNVERIFIED"} · ${state.trust?.score??0}/100</b></p></div><div class="card"><small>AION MISSION GRAPH</small>${mission||'<p class="muted">No mission yet.</p>'}</div><div class="card"><small>NEGATIVE KNOWLEDGE GRAPH</small>${nk||'<p class="muted">No known failure pattern.</p>'}</div><div class="card"><small>EXPERIMENT GENOME / LOOPFORGE</small>${genomes||'<p class="muted">No genome yet.</p>'}</div><div class="card"><small>EVIDENLOCK HEAD</small><p class="muted" style="word-break:break-all">${escapeHtml(head)}</p></div>`;
}
async function sealSovereign(kind){
 const filesDigest=await sha256(state.files.map(f=>({path:f.path,content:f.content}))),prev=state.evidenceChain.at(-1)?.hash||"GENESIS",payload={status:state.status,spec:state.spec,evidence:state.evidence,filesDigest,mission:state.mission,genomes:state.genomes.slice(-3)};
 const record=await seal(prev,payload,kind);let serverHash="";
 try{const sr=await control("/api/seal",{previousHash:prev,payload});serverHash=sr.data?.seal?.hash||"";addEv("Sealed Sovereign Core",serverHash?"PASS":"PARTIAL",serverHash?"server seal "+serverHash.slice(0,12):"server seal missing")}catch(e){addEv("Sealed Sovereign Core","PARTIAL",String(e?.message||e))}
 state.evidenceChain.push({...record,serverHash});const v=await verifyChain(state.evidenceChain);addEv("EVIDENLOCK",v.status,state.evidenceChain.length+" sealed record(s) · "+record.hash.slice(0,12));renderSovereign();return record;
}
function shield(files,context){
 const g=guardFiles(files),status=g.verdict==="ALLOW"?"PASS":g.verdict==="ESCALATE"?"PARTIAL":"FAIL",details=[g.reason,g.escalated?.length?"escalate: "+g.escalated.join(", "):"",g.isolated?.length?"isolated: "+g.isolated.join(", "):""].filter(Boolean).join(" · ");addEv("AgentShield",status,details);
 if(g.verdict==="ISOLATE")throw new Error("AgentShield isolated "+context+": "+g.isolated.join(", "));
 if(g.verdict==="ESCALATE")addEv("Capability Firewall","PARTIAL","enhanced verification required for "+context);
 return g.allowed;
}
function rememberFailure(error,context,rootCause=""){const sig=state.negativeKnowledge.record(error,{context,phase:state.phase},rootCause);addEv("Negative Knowledge","PARTIAL","recorded "+sig);renderSovereign();return sig}
function captureGenome(label,parent=null){
 const g=createGenome({spec:state.spec,files:state.files,evidence:state.evidence,cfg:state.cfg,status:state.status,label,parent});state.genomes.push(g);state.genomes=state.genomes.slice(-30);renderSovereign();return g;
}
function captureBenchmark(label,startedAt=state.runStartedAt){
 const metrics=metricSnapshot({files:state.files,evidence:state.evidence,startedAt,status:state.status});const sample={label,at:new Date().toISOString(),metrics};state.benchmarkRuns.push(sample);state.benchmarkRuns=state.benchmarkRuns.slice(-50);return sample;
}
function evolveMission(type,status){state.mission=updateMission(state.mission,type,status);renderSovereign()}
function exportProof(){
 const pack=proofPack(state),blob=new Blob([JSON.stringify(pack,null,2)],{type:"application/json"}),u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download="astra-sovereign-proof-pack.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
}
async function persistWorkspace(message){
 try{const record=await saveWorkspace(snapshotOf({...state,idea:$("#idea")?.value||"",history:state.history,conversation:state.conversation},message));
 state.workspaceId=record.id;state.history=record.history||[];state.conversation=record.conversation||[];
 addEv("Workspace","PASS","saved "+record.id.slice(0,8)+" · "+message);await renderWorkspaceList();return record}
 catch(e){addEv("Workspace","PARTIAL","local persistence unavailable: "+String(e?.message||e));return null}
}
async function renderWorkspaceList(){
 const root=$("#workspaceList");if(!root)return;const items=await listWorkspaces();
 root.innerHTML=items.length?items.map(x=>`<div class="workspace-item"><div><b>${escapeHtml(x.name||"Untitled")}</b><small>${escapeHtml(x.updatedAt||"")} · ${(x.files||[]).length} files</small></div><div><button class="btn tiny" data-open="${x.id}">Open</button><button class="btn tiny ghost" data-delete="${x.id}">Delete</button></div></div>`).join(""):'<p class="muted">Aucun projet sauvegardé.</p>';
 root.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>loadWorkspaceById(b.dataset.open));root.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{await deleteWorkspace(b.dataset.delete);await renderWorkspaceList()});
}
async function loadWorkspaceById(id){
 const p=await getWorkspace(id);if(!p)return;state.workspaceId=p.id;state.spec=p.spec||null;state.files=p.files||[];state.evidence=p.evidence||[];state.bench=p.bench||null;state.deployPlan=p.deployPlan||null;state.deployedUrl=p.deployedUrl||"";state.trust=p.trust||null;state.sandbox=p.sandbox||null;state.history=p.history||[];state.conversation=p.conversation||[];state.mission=p.mission||null;state.evidenceChain=p.evidenceChain||[];state.genomes=p.genomes||[];state.benchmarkRuns=p.benchmarkRuns||[];if(p.evolution)state.evolution={...p.evolution,running:false,decision:p.evolution.running?"RESUMABLE":p.evolution.decision};$("#idea").value=p.idea||"";state.selected=state.files[0]?.path||null;renderFiles();renderSpec();renderPreview();renderEvidence();renderBenchmark();renderSovereign();setStatus(state.evidence.some(x=>x.status==="FAIL")?"FAIL":"PARTIAL");$("#workspaceDialog").close();rescue.checkpoint("workspace-open:"+id);
}
async function auditRepairVerify(context){
 const cycleStarted=Date.now(),policy=currentPolicy();evolveMission("VERIFY","RUNNING");
 setPhase("STATIC TEST");for(const e of staticChecks(state.files,state.spec))addEv(e.name,e.status,e.detail);await serverValidate();await sandboxValidate();
 setPhase("ADVERSARY");let audit=parse(await rescueChat(state.cfg,state.cfg.adversary,prompts.adversary,"CONTEXT:\n"+context+"\nNEGATIVE KNOWLEDGE:\n"+JSON.stringify(state.negativeKnowledge.hints(8))+"\nSPEC:\n"+JSON.stringify(state.spec)+"\nFILES:\n"+JSON.stringify(state.files)+"\nCHECKS:\n"+JSON.stringify(state.evidence)));addEv("Adversarial audit #1",audit.risk==="HIGH"?"PARTIAL":"PASS",(audit.issues?.length||0)+" issue(s), risk "+audit.risk);evolveMission("ADVERSARY",audit.risk==="HIGH"?"PARTIAL":"PASS");
 if((audit.issues?.length||0)>0||state.evidence.some(x=>x.status==="FAIL")){
  setPhase("REPAIR");const rep=parse(await rescueChat(state.cfg,state.cfg.frontend,prompts.repair,"CONTEXT:\n"+context+"\nNEGATIVE KNOWLEDGE:\n"+JSON.stringify(state.negativeKnowledge.hints(8))+"\nSPEC:\n"+JSON.stringify(state.spec)+"\nFILES:\n"+JSON.stringify(state.files)+"\nAUDIT:\n"+JSON.stringify(audit)+"\nCHECKS:\n"+JSON.stringify(state.evidence)));
  const repaired=shield(safeFiles(rep),"repair");state.files=mergeFiles(state.files,repaired);renderFiles();renderPreview();for(const e of staticChecks(state.files,state.spec))addEv(e.name,e.status,e.detail);await serverValidate();await sandboxValidate()
 }
 if(policy.adversaryPasses>1){
  setPhase("ADVERSARY");const audit2=parse(await rescueChat(state.cfg,state.cfg.adversary,prompts.adversary,"SECOND PASS AFTER REPAIR/VALIDATION. Be stricter and focus on false PASS.\nCONTEXT:\n"+context+"\nSPEC:\n"+JSON.stringify(state.spec)+"\nFILES:\n"+JSON.stringify(state.files)+"\nCHECKS:\n"+JSON.stringify(state.evidence)+"\nFIRST AUDIT:\n"+JSON.stringify(audit)));addEv("Adversarial audit #2",audit2.risk==="HIGH"?"PARTIAL":"PASS",(audit2.issues?.length||0)+" issue(s), risk "+audit2.risk);audit=audit2;
 }
 setPhase("VERIFY²");const ver=parse(await rescueChat(state.cfg,state.cfg.verifier,prompts.verify,"CONTEXT:\n"+context+"\nMETA POLICY:\n"+JSON.stringify(policy)+"\nSPEC:\n"+JSON.stringify(state.spec)+"\nFILES:\n"+JSON.stringify(state.files)+"\nCHECKS:\n"+JSON.stringify(state.evidence)+"\nAUDIT:\n"+JSON.stringify(audit)));addEv("Verify² independent",ver.verdict||"PARTIAL",ver.summary||"verification terminée");
 const dx=dualityVerdict(audit,ver);addEv("DUALITY-X",dx.status,dx.reason);evolveMission("VERIFY",dx.status);
 await buildDeployPlan();const final=state.evidence.some(x=>x.status==="FAIL")?"FAIL":state.sandbox?.status!=="PASS"||state.evidence.some(x=>x.status==="PARTIAL"||x.status==="UNVERIFIED")||ver.verdict!=="PASS"||dx.status!=="PASS"?"PARTIAL":"PASS";setStatus(final);state.phase="DONE";renderPhases();
 captureBenchmark("cycle",cycleStarted);captureGenome(context.slice(0,80));await sealSovereign("verified-cycle");return ver;
}
async function improveCurrent(){
 const request=$("#improveInput").value.trim();if(!request||!state.files.length)return;$("#improveDialog").close();beginMetaOperation("Improve Ω");setStatus("RUNNING");setPhase("IMPROVE");rescue.checkpoint("before-improve");state.conversation.push({at:new Date().toISOString(),role:"user",content:request});
 const started=Date.now(),baseFiles=state.files.map(x=>({...x})),baseSpec=structuredClone(state.spec),baseEvidence=state.evidence.map(x=>({...x})),baseMetric=metricSnapshot({files:baseFiles,evidence:baseEvidence,status:state.status});
 try{
  state.spec=parse(await rescueChat(state.cfg,state.cfg.architect,prompts.evolveSpec,"REQUEST:\n"+request+"\nCURRENT SPEC:\n"+JSON.stringify(state.spec)));state.mission=compileMission(state.spec,request);renderSpec();renderSovereign();
  const common="REQUEST:\n"+request+"\nSPEC:\n"+JSON.stringify(state.spec)+"\nFILES:\n"+JSON.stringify(baseFiles)+"\nEVIDENCE:\n"+JSON.stringify(baseEvidence)+"\nKNOWN FAILURES TO AVOID:\n"+JSON.stringify(state.negativeKnowledge.hints(8));
  const [rawA,rawB]=await Promise.all([
   rescueChat(state.cfg,state.cfg.frontend,prompts.improve,common+"\nVARIANT:A conservative minimal-diff"),
   rescueChat(state.cfg,state.cfg.frontend,prompts.improve,common+"\nVARIANT:B alternative architecture-aware improvement")
  ]);
  const outA=parse(rawA),outB=parse(rawB),patchA=shield(safeFiles(outA),"LoopForge A"),patchB=shield(safeFiles(outB),"LoopForge B");
  if(!patchA.length&&!patchB.length)throw new Error("LoopForge returned no file changes");
  const candA=mergeFiles(baseFiles,patchA),candB=mergeFiles(baseFiles,patchB),evA=staticChecks(candA,state.spec),evB=staticChecks(candB,state.spec),scoreA=scoreVariant(candA,evA),scoreB=scoreVariant(candB,evB),useB=scoreB>scoreA;
  state.files=useB?candB:candA;const chosen=useB?outB:outA,chosenScore=useB?scoreB:scoreA;
  addEv("LoopForge","PASS","variant "+(useB?"B":"A")+" selected · "+scoreA+" vs "+scoreB+" · score "+chosenScore);state.conversation.push({at:new Date().toISOString(),role:"assistant",content:chosen.summary||"Evolutionary patch selected"});
  renderFiles();renderPreview();const ver=await auditRepairVerify("Improve request: "+request);
  const afterMetric=metricSnapshot({files:state.files,evidence:state.evidence,startedAt:started,status:state.status}),cmp=compareBench(baseMetric,afterMetric);state.benchmarkRuns.push({label:"Improve Ω",at:new Date().toISOString(),metrics:afterMetric,comparison:cmp});
  addEv("BENCHMARK-X10",cmp.verdict==="REGRESSION"?"PARTIAL":"PASS",cmp.verdict+" · Δ "+cmp.delta+" · base "+cmp.baseScore+" → "+cmp.nextScore);
  if(cmp.verdict==="REGRESSION"&&ver?.verdict!=="PASS"){state.files=baseFiles;state.spec=baseSpec;state.mission=compileMission(baseSpec,"rollback");addEv("LoopForge rollback","PASS","regression rejected; previous genome restored");renderFiles();renderSpec();renderPreview();renderSovereign();await sealSovereign("rollback")}
  else{captureGenome("Improve Ω: "+request.slice(0,70),state.genomes.at(-1)?.label||null);await sealSovereign("improvement-accepted")}
  finishMetaOperation(state.status);await persistWorkspace("Improve Ω: "+request.slice(0,100));rescue.checkpoint("improve-complete")
 }catch(e){rememberFailure(e,"improveCurrent");const d=classifyError(e);addEv("Improve with Ω","FAIL",d.kind+" · "+String(e?.message||e));setStatus("FAIL");finishMetaOperation("FAIL");state.files=baseFiles;state.spec=baseSpec;renderFiles();renderSpec();renderPreview()}
}
async function evaluateEvolutionCandidate(candidate,baseFiles,generation){
 const started=Date.now();
 const prompt="EVOLUTION ENGINE Ω\nGENERATION:"+generation+"\nLINEAGE:"+candidate.label+"\nDIRECTIVE:"+candidate.directive+"\nSPEC:\n"+JSON.stringify(state.spec)+"\nFILES:\n"+JSON.stringify(baseFiles)+"\nKNOWN FAILURES:\n"+JSON.stringify(state.negativeKnowledge.hints(10))+"\nReturn only changed files.";
 const raw=await rescueChat(state.cfg,state.cfg.frontend,prompts.improve,prompt),out=parse(raw),patch=safeFiles(out);
 if(!patch.length)throw new Error("evolution candidate returned no patch");
 const g=guardFiles(patch);if(g.verdict==="ISOLATE")throw new Error("AgentShield isolated candidate "+candidate.label+": "+g.isolated.join(", "));
 const files=mergeFiles(baseFiles,g.allowed),localEvidence=staticChecks(files,state.spec);
 const srv=await control("/api/validate",{spec:state.spec,files});
 const evidence=[...localEvidence,...(srv.data?.evidence||[]).map(e=>({...e,name:"Server · "+e.name}))];
 const trust=trustGate(evidence,currentPolicy().trustThreshold),status=evidence.some(x=>x.status==="FAIL")?"FAIL":trust.status;
 const record=makeEvolutionRecord({candidate:{...candidate,spec:state.spec},files,evidence,cfg:state.cfg,status,latencyMs:Date.now()-started,trust});
 if(g.verdict==="ESCALATE"){record.evidence=[...record.evidence,{name:"AgentShield escalation",status:"PARTIAL",detail:(g.escalated||[]).join(", ")}];record.status=record.status==="FAIL"?"FAIL":"PARTIAL";record.fitness-=6}
 return record;
}
async function runEvolution(){
 if(!state.files.length||state.evolution.running)return;
 beginMetaOperation("Evolution Ω");
 const originalFiles=state.files.map(x=>({...x})),originalSpec=structuredClone(state.spec),originalEvidence=state.evidence.map(x=>({...x})),originalStatus=state.status;
 state.evolution={running:true,generation:0,decision:"STARTING",candidates:[],history:[]};renderEvolution();renderFiles();setStatus("RUNNING");rescue.checkpoint("before-evolution");
 let baseFiles=originalFiles,previousBest=null,winner=null;
 try{
  const evoPolicy=currentPolicy();
  for(let generation=1;generation<=evoPolicy.generations;generation++){
   state.evolution.generation=generation;state.evolution.decision="EVOLVING";renderEvolution();
   const population=generation===1?seedPopulation(evoPolicy.population,generation):breedDirectives(rankPopulation(state.evolution.candidates).slice(0,evoPolicy.elite),generation,evoPolicy.population);
   const settled=await Promise.allSettled(population.map(x=>evaluateEvolutionCandidate(x,baseFiles,generation)));
   const candidates=[];
   settled.forEach((r,i)=>{if(r.status==="fulfilled")candidates.push(r.value);else{rememberFailure(r.reason,"evolution:g"+generation+":"+population[i].label);candidates.push({...population[i],fitness:-999,status:"FAIL",latencyMs:0,metrics:{quality:0},files:baseFiles,evidence:[{name:"Candidate failure",status:"FAIL",detail:String(r.reason?.message||r.reason)}]})}});
   const ranked=rankPopulation(candidates);state.evolution.candidates=ranked;winner=ranked[0]||null;
   const decision=evolutionDecision(previousBest,winner,evoPolicy.earlyStopDelta);state.evolution.decision=decision.action;state.evolution.history.push({generation,best:winner?{id:winner.id,label:winner.label,fitness:winner.fitness,status:winner.status}:null,decision,candidates:ranked.map(x=>({id:x.id,label:x.label,fitness:x.fitness,status:x.status}))});renderEvolution();
   if(!winner||winner.status==="FAIL"){state.evolution.decision="ROLLBACK";throw new Error("no viable evolutionary candidate in generation "+generation)}
   if(decision.action==="ROLLBACK")break;
   baseFiles=winner.files;previousBest=winner;
   if(decision.action==="EARLY_STOP")break;
  }
  if(!winner||winner.fitness<0)throw new Error("Evolution Engine produced no acceptable winner");
  state.files=winner.files;state.selected=state.files[0]?.path||null;addEv("Evolution Engine Ω","PASS","winner "+winner.label+" · fitness "+winner.fitness);renderFiles();renderPreview();
  const ver=await auditRepairVerify("Evolution Engine winner: "+winner.label);
  const finalWinner={files:state.files,evidence:state.evidence,status:state.status},cmp=compareWinner({files:originalFiles,evidence:originalEvidence,status:originalStatus},finalWinner);
  addEv("Evolution fitness delta",cmp.verdict==="REGRESSION"?"FAIL":"PASS",cmp.verdict+" · Δ "+cmp.delta+" · "+cmp.baseScore+" → "+cmp.nextScore);
  if(cmp.verdict==="REGRESSION"||ver?.verdict==="FAIL"){
   state.files=originalFiles;state.spec=originalSpec;state.evidence=originalEvidence;state.status=originalStatus;state.mission=compileMission(originalSpec,"evolution rollback");state.evolution.decision="ROLLBACK";addEv("Evolution rollback","PASS","previous verified genome restored");renderFiles();renderSpec();renderPreview();renderEvidence();renderSovereign();await sealSovereign("evolution-rollback");
  }else{
   state.evolution.decision="ACCEPTED";state.genomes.push(winner.genome);state.genomes=state.genomes.slice(-30);captureBenchmark("Evolution Ω",state.runStartedAt);await sealSovereign("evolution-winner");finishMetaOperation(state.status);await persistWorkspace("Evolution Ω winner: "+winner.label);
  }
 }catch(e){rememberFailure(e,"runEvolution");state.files=originalFiles;state.spec=originalSpec;state.evidence=originalEvidence;state.status=originalStatus;state.evolution.decision="FAIL/ROLLBACK";addEv("Evolution Engine Ω","FAIL",String(e?.message||e));finishMetaOperation("FAIL");renderFiles();renderSpec();renderPreview();renderEvidence();renderSovereign()}
 finally{state.evolution.running=false;renderEvolution();renderFiles();rescue.checkpoint("after-evolution")}
}
async function importGithub(){
 const repo=$("#importRepo").value.trim(),ref=$("#importRef").value.trim()||"main";if(!repo)return;if(!state.cfg.githubToken){$("#workspaceDialog").close();$("#settingsDialog").showModal();addEv("GitHub import","UNVERIFIED","GitHub token required in Cloud models");return}
 setStatus("RUNNING");setPhase("IMPORT");state.evidence=[];state.files=[];state.assets=[];state.workspaceId=null;state.history=[];state.conversation=[{at:new Date().toISOString(),role:"user",content:"Import "+repo+" @ "+ref}];state.evidenceChain=[];state.genomes=[];state.benchmarkRuns=[];renderEvidence();
 try{
  const r=await control("/api/import_github",{githubToken:state.cfg.githubToken,repo,ref});if(!r.data?.files?.length)throw new Error(r.data?.reason||"No files imported");state.files=shield(r.data.files,"GitHub import");
  const reversePayload=state.files.slice(0,70).map(f=>({path:f.path,excerpt:f.content.slice(0,2200)}));state.spec=parse(await rescueChat(state.cfg,state.cfg.architect,prompts.reverseArchitect,"REPOSITORY: "+repo+" @ "+ref+"\nFILES:\n"+JSON.stringify(reversePayload)));state.mission=compileMission(state.spec,"Import "+repo+" @ "+ref);evolveMission("INTENT","PASS");$("#idea").value="Imported from GitHub: "+repo;state.selected=state.files[0]?.path||null;
  addEv("GitHub import","PASS",r.data.stats.files+" files · "+r.data.stats.bytes+" bytes"+(r.data.stats.truncated?" · truncated":""));renderFiles();renderSpec();renderPreview();renderSovereign();await auditRepairVerify("Imported existing application "+repo+" @ "+ref);captureGenome("Imported "+repo);await sealSovereign("github-import");await persistWorkspace("Imported "+repo+" @ "+ref);$("#workspaceDialog").close();rescue.checkpoint("import-complete")
 }catch(e){rememberFailure(e,"importGithub");addEv("GitHub import","FAIL",String(e?.message||e));setStatus("FAIL")}
}
function ui(){renderPhases();routeSummary();renderAgents();renderFiles();renderSpec();renderBenchmark();renderSovereign();renderEvolution();renderMeta()}
function seedAgents(){state.agents={};agent("Architect",state.cfg.architect);agent("Frontend+UX",state.cfg.frontend);agent("Backend",state.cfg.backend);agent("Database",state.cfg.backend);agent("Auth+Security",state.cfg.backend);agent("DevOps-X",state.cfg.ops);agent("Adversary",state.cfg.adversary);agent("Verify²",state.cfg.verifier);agent("Image",state.cfg.imageModel)}
async function generateAssets(){const briefs=state.spec?.imageBriefs||[];if(!briefs.length){addEv("Image briefs","PASS","aucune image requise");return}if(!state.cfg.imageBaseUrl){addEv("Image engine","PARTIAL",briefs.length+" image(s) demandée(s), endpoint gratuit non configuré");return}for(const b of briefs){const a=await rescueImage(state.cfg,b.prompt);const blob=new Blob([a.bytes],{type:a.mime}),dataUrl=await new Promise((resolve,reject)=>{const fr=new FileReader;fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(blob)});state.assets.push({id:b.id,name:"assets/"+b.id+".png",bytes:a.bytes,dataUrl})}addEv("Image engine","PASS",state.assets.length+" asset(s) généré(s) via endpoint attesté gratuit")}
async function control(path,payload){return rescue.run("CONTROL "+path,async()=>{const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data={raw}};if(!r.ok&&r.status!==501)throw new Error("Control plane "+r.status+": "+raw.slice(0,220));return{ok:r.ok,status:r.status,data}},{attempts:3})}
async function serverValidate(){setPhase("SERVER VALIDATE");const r=await control("/api/validate",{spec:state.spec,files:state.files});for(const e of r.data.evidence||[])addEv("Server · "+e.name,e.status,e.detail);addEv("Server validation",r.data.verdict||"UNVERIFIED",r.data.summary||"control plane response");return r.data}
async function sandboxValidate(){
 setPhase("CLOUD SANDBOX");const r=await control("/api/sandbox_run",{spec:state.spec,files:state.files});state.sandbox=r.data||null;
 for(const e of state.sandbox?.evidence||[])addEv("Sandbox · "+e.name,e.status,e.detail);
 addEv("Cloud Sandbox",state.sandbox?.status||"UNVERIFIED",(state.sandbox?.sandboxLevel||"unknown")+" · "+(state.sandbox?.durationMs||0)+"ms · digest "+String(state.sandbox?.projectDigest||"").slice(0,12));
 if(state.sandbox?.hardIsolation&&state.sandbox.hardIsolation!=="PASS")addEv("Sandbox hard isolation","PARTIAL","process-isolated runner; kernel/VM isolation not yet proven");
 return state.sandbox;
}
async function buildDeployPlan(){setPhase("DEPLOY PLAN");const r=await control("/api/deploy-plan",{spec:state.spec,files:state.files});state.deployPlan=r.data;state.trust=trustGate(state.evidence,currentPolicy().trustThreshold);addEv("Q-NAV X Trust Gate",state.trust.status,"score "+state.trust.score+"/"+state.trust.threshold+" · "+state.trust.reason);const sandboxReady=state.sandbox?.status==="PASS";if(!sandboxReady)addEv("Sandbox deploy gate","FAIL","deployment blocked until Cloud Sandbox is PASS");const st=!sandboxReady||state.trust.status==="FAIL"?"FAIL":r.data?.status||"UNVERIFIED";addEv("Deploy plan",st,r.data?.note||"plan generated");$("#deployReadiness").textContent=st;evolveMission("DEPLOY",st==="FAIL"?"FAIL":"PARTIAL");renderFiles();renderSovereign();return r.data}
async function deployGenerated(){
 if(!state.files.length)return;
 state.trust=trustGate(state.evidence,currentPolicy().trustThreshold);if(state.sandbox?.status!=="PASS"){addEv("Generated app deployment","FAIL","Cloud Sandbox must PASS before deployment");renderFiles();return}if(state.trust.status!=="PASS"){addEv("Generated app deployment","FAIL","Q-NAV X blocked deploy at trust "+state.trust.score+"/"+state.trust.threshold);renderFiles();return}
 if(!state.cfg.githubToken||!state.cfg.railwayToken){addEv("Generated app deployment","UNVERIFIED","GitHub/Railway credentials missing");$("#settingsDialog").showModal();return}
 $("#deployBtn").disabled=true;addEv("Generated app deployment","PARTIAL","GitHub push + Railway deployment starting");
 try{
  const r=await control("/api/deploy",{spec:state.spec,files:state.files,deploy:{githubToken:state.cfg.githubToken,railwayToken:state.cfg.railwayToken,railwayWorkspaceId:state.cfg.railwayWorkspaceId,repoName:state.cfg.repoName,privateRepo:state.cfg.privateRepo}});
  const rw=r.data?.railway,git=r.data?.git;if(!rw?.deploymentId)throw new Error(r.data?.reason||"Deployment ID missing");
  addEv("GitHub commit","PASS",(git?.fullName||"repo")+" @ "+String(git?.commitSha||"").slice(0,8));
  addEv("Railway deployment","PARTIAL","deployment "+rw.deploymentId);
  $("#deployReadiness").textContent="PARTIAL";
  for(let i=0;i<30;i++){
   await new Promise(resolve=>setTimeout(resolve,4000));
   const s=await control("/api/deploy_status",{railwayToken:state.cfg.railwayToken,deploymentId:rw.deploymentId,domain:rw.domain,healthPath:rw.healthPath});
   addEv("Railway deployment",s.data?.status||"PARTIAL",(s.data?.deploymentStatus||"UNKNOWN")+" · health "+(s.data?.health?.status||"UNVERIFIED"));
   if(s.data?.status==="PASS"){state.deployedUrl="https://"+rw.domain;addEv("Public health gate","PASS",state.deployedUrl+(rw.healthPath||"/health"));$("#deployReadiness").textContent="PASS";evolveMission("DEPLOY","PASS");setStatus("PASS");captureGenome("Verified deployment");await sealSovereign("verified-deployment");alert("Déploiement vérifié : "+state.deployedUrl);break}
   if(s.data?.status==="FAIL"){addEv("Public health gate","FAIL",s.data?.health?.error||"deployment failed");$("#deployReadiness").textContent="FAIL";setStatus("FAIL");break}
  }
  if(!state.deployedUrl&&$("#deployReadiness").textContent!=="FAIL")addEv("Public health gate","UNVERIFIED","timeout before verified 2xx health response");
 }catch(e){addEv("Generated app deployment","FAIL",e instanceof Error?e.message:String(e));$("#deployReadiness").textContent="FAIL";setStatus("FAIL")}
 finally{$("#deployBtn").disabled=!(state.files.length&&state.capabilities?.deployBroker)}
}
async function loadCapabilities(){try{const r=await fetch("/api/capabilities");state.capabilities=await r.json();addEv("Control plane","PASS","server v"+state.capabilities.version+", validation active");addEv("Deploy broker",state.capabilities.deployBroker?"PASS":"UNVERIFIED",state.capabilities.nativeDeployBroker?"GitHub + Railway native broker ready":"broker unavailable");renderFiles()}catch{addEv("Control plane","FAIL","/api/capabilities inaccessible")}}
async function run(rescueCycle=0){
 const idea=$("#idea").value.trim();if(!idea)return;
 if(rescueCycle===0){state.workspaceId=null;state.history=[];state.conversation=[{at:new Date().toISOString(),role:"user",content:idea}];state.evidenceChain=[];state.genomes=[];state.benchmarkRuns=[];state.mission=null}
 state.runStartedAt=Date.now();setStatus("RUNNING");$("#runBtn").disabled=true;$("#errorBox").classList.add("hidden");state.files=[];state.assets=[];state.evidence=[];state.spec=null;state.bench=null;if(rescueCycle===0)beginMetaOperation("Initial generation");seedAgents();renderFiles();renderSovereign();
 try{
  addEv("Zero-cost text gate",costStatus(state.cfg,"text"),costStatus(state.cfg,"text")==="PASS"?"OpenRouter free router forcé":"endpoint personnalisé: coût non prouvé par ASTRA");
  setPhase("SPEC");agent("Architect",effectiveModel(state.cfg,state.cfg.architect),"RUNNING");state.spec=parse(await rescueChat(state.cfg,state.cfg.architect,prompts.architect,idea+"\nKNOWN FAILURES TO AVOID:\n"+JSON.stringify(state.negativeKnowledge.hints(8))));agent("Architect",effectiveModel(state.cfg,state.cfg.architect),"PASS");
  state.mission=compileMission(state.spec,idea);evolveMission("INTENT","PASS");evolveMission("ARCH","PASS");renderSpec();addEv("AION Mission Graph","PASS",(state.mission.nodes||[]).length+" mission nodes");addEv("Specification","PASS",(state.spec.features?.length||0)+" fonctions, "+(state.spec.acceptance?.length||0)+" critères");
  setPhase("FRONTEND");agent("Frontend+UX",effectiveModel(state.cfg,state.cfg.frontend),"RUNNING");agent("Backend",effectiveModel(state.cfg,state.cfg.backend),"RUNNING");agent("Database",effectiveModel(state.cfg,state.cfg.backend),"RUNNING");agent("Auth+Security",effectiveModel(state.cfg,state.cfg.backend),"RUNNING");agent("DevOps-X",effectiveModel(state.cfg,state.cfg.ops),"RUNNING");const specText=JSON.stringify(state.spec),nk=JSON.stringify(state.negativeKnowledge.hints(8));
  const [frontRaw,backRaw,dbRaw,authRaw,opsRaw]=await executeBuildPolicy(specText,nk);
  const front=shield(safeFiles(parse(frontRaw)),"frontend"),back=shield(safeFiles(parse(backRaw)),"backend"),db=shield(safeFiles(parse(dbRaw)),"database"),auth=shield(safeFiles(parse(authRaw)),"auth"),ops=shield(safeFiles(parse(opsRaw)),"devops");
  agent("Frontend+UX",effectiveModel(state.cfg,state.cfg.frontend),front.length?"PASS":"FAIL");agent("Backend",effectiveModel(state.cfg,state.cfg.backend),back.length?"PASS":"FAIL");agent("Database",effectiveModel(state.cfg,state.cfg.backend),db.length?"PASS":"FAIL");agent("Auth+Security",effectiveModel(state.cfg,state.cfg.backend),auth.length?"PASS":"FAIL");agent("DevOps-X",effectiveModel(state.cfg,state.cfg.ops),ops.length?"PASS":"FAIL");
  state.files=mergeFiles(front,back,db,auth,ops);state.selected=state.files[0]?.path||null;for(const n of state.mission.nodes.filter(x=>x.type==="FEATURE"))n.status="PASS";renderFiles();selectFile(state.selected);renderPreview();renderSovereign();
  setPhase("IMAGES");await generateAssets();renderPreview();renderEvidence();
  await auditRepairVerify("Initial generation");
  state.bench=benchmark(state.files,state.evidence,state.spec);renderBenchmark();captureBenchmark("initial",state.runStartedAt);captureGenome("Initial generation");await sealSovereign("initial-generation");finishMetaOperation(state.status);await persistWorkspace("Initial generation");rescue.checkpoint("pipeline-complete");rescue.clearRestartCounter();
 }catch(e){
  const m=e instanceof Error?e.message:String(e),d=classifyError(e);rememberFailure(e,"run:"+state.phase);rescue.checkpoint("pipeline-error:"+d.kind);
  if(d.retryable&&rescueCycle<2){rescue.emit("PIPELINE_RESTART","PARTIAL",d.kind+" · restart "+(rescueCycle+1)+"/2");await sleep(900*Math.pow(2,rescueCycle));return await run(rescueCycle+1)}
  rescue.emit("CIRCUIT_BREAKER","FAIL",d.kind+" · "+m);addEv("Pipeline","FAIL",m);setStatus("FAIL");finishMetaOperation("FAIL");$("#errorBox").textContent="ASTRA RESCUE Ω a arrêté les retries pour éviter une boucle : "+m;$("#errorBox").classList.remove("hidden")
 }finally{$("#runBtn").disabled=false}
}
function exportZip(){const entries=state.files.map(f=>({name:f.path,bytes:f.content}));for(const a of state.assets)entries.push({name:a.name,bytes:a.bytes});entries.push({name:"astra-evidence.json",bytes:JSON.stringify({generatedAt:new Date().toISOString(),status:state.status,spec:state.spec,evidence:state.evidence,benchmark:state.bench},null,2)});entries.push({name:"astra-sovereign-proof-pack.json",bytes:JSON.stringify(proofPack(state),null,2)});const blob=makeZip(entries),u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=(state.spec?.appName||"astra-project").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+".zip";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function saveCfg(){const ids=["baseUrl","apiKey","architect","frontend","backend","ops","adversary","verifier","imageBaseUrl","imageKey","imageModel","githubToken","railwayToken","railwayWorkspaceId","repoName"];for(const id of ids)state.cfg[id]=$("#"+id).value.trim();state.cfg.zeroCost=$("#zeroCost").checked;state.cfg.attestedFree=$("#attestedFree").checked;state.cfg.privateRepo=$("#privateRepo").checked;sessionStorage.setItem("astra-v3-cfg",JSON.stringify({...state.cfg,apiKey:"",imageKey:"",githubToken:"",railwayToken:""}));routeSummary();renderFiles()}
function loadCfg(){try{state.cfg={...state.cfg,...JSON.parse(sessionStorage.getItem("astra-v3-cfg")||"{}")}}catch{}for(const id of ["baseUrl","architect","frontend","backend","ops","adversary","verifier","imageBaseUrl","imageModel","railwayWorkspaceId","repoName"])$("#"+id).value=state.cfg[id]||"";$("#apiKey").value="";$("#imageKey").value="";$("#githubToken").value="";$("#railwayToken").value="";$("#zeroCost").checked=state.cfg.zeroCost;$("#attestedFree").checked=state.cfg.attestedFree;$("#privateRepo").checked=state.cfg.privateRepo!==false}
$$('[data-preset]').forEach(b=>b.onclick=()=>$("#idea").value=b.dataset.preset);$("#runBtn").onclick=run;$("#exportBtn").onclick=exportZip;$("#proofPackBtn").onclick=exportProof;$("#evolveBtn").onclick=runEvolution;$("#metaEvolveBtn").onclick=runMetaEvolution;$("#deployPlanBtn").onclick=buildDeployPlan;$("#deployBtn").onclick=deployGenerated;$("#projectsBtn").onclick=async()=>{await renderWorkspaceList();$("#workspaceDialog").showModal()};$("#improveBtn").onclick=()=>$("#improveDialog").showModal();$("#applyImproveBtn").onclick=improveCurrent;$("#cancelImproveBtn").onclick=()=>$("#improveDialog").close();$("#closeImproveBtn").onclick=()=>$("#improveDialog").close();$("#closeWorkspaceBtn").onclick=()=>$("#workspaceDialog").close();$("#importRepoBtn").onclick=importGithub;$("#settingsBtn").onclick=()=>$("#settingsDialog").showModal();$("#settingsForm").addEventListener("submit",e=>{if(e.submitter?.value!=="cancel")saveCfg()});$("#benchmarkBtn").onclick=()=>{state.bench=benchmark(state.files,state.evidence,state.spec);renderBenchmark();document.querySelector('[data-tab="benchmark"]').click()};$("#downloadFileBtn").onclick=()=>{const f=state.files.find(x=>x.path===state.selected);if(!f)return;const u=URL.createObjectURL(new Blob([f.content],{type:"text/plain"})),a=document.createElement("a");a.href=u;a.download=f.path.split("/").pop();a.click();URL.revokeObjectURL(u)};$$('.tab').forEach(t=>t.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active'));$$('.tabview').forEach(x=>x.classList.remove('active'));t.classList.add('active');$('#view-'+t.dataset.tab).classList.add('active')});
window.__ASTRA_ACTIONS__={run,improveCurrent,renderPreview,renderFiles,renderSpec,renderEvidence,buildDeployPlan,deployGenerated,persistWorkspace,loadWorkspaceById,exportZip,runEvolution,runMetaEvolution};\nloadCfg();seedAgents();ui();const recovered=rescue.restore();if(recovered)rescue.emit("RESTORE","PASS","checkpoint "+(recovered.label||"unknown")+" restored");rescue.installGlobal({restart:()=>location.reload()});renderWorkspaceList().catch(e=>addEv("Workspace","PARTIAL",String(e?.message||e)));loadCapabilities();