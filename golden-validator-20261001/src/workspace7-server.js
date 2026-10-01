import { createHash } from "node:crypto";

const clean = v => String(v ?? "").trim();
const statusOf = v => ["PASS","PARTIAL","FAIL","UNVERIFIED","WAIT"].includes(String(v)) ? String(v) : "UNVERIFIED";
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const clip = (s,n=420) => clean(s).slice(0,n);

export function compileSecondBrain(input={}) {
  const spec=input.spec||{}, evidence=Array.isArray(input.evidence)?input.evidence:[], conversation=Array.isArray(input.conversation)?input.conversation:[], files=Array.isArray(input.files)?input.files:[];
  const stack=spec.stack&&typeof spec.stack==="object"?spec.stack:{};
  const facts=[
    {kind:"identity",key:"appName",value:clean(spec.appName||"ASTRA project")},
    {kind:"goal",key:"goal",value:clip(spec.goal||input.request||"",900)},
    ...Object.entries(stack).map(([k,v])=>({kind:"stack",key:k,value:clip(v,180)})),
    ...(Array.isArray(spec.features)?spec.features.slice(0,30).map((v,i)=>({kind:"feature",key:"feature-"+(i+1),value:clip(v,240)})):[]),
    ...(Array.isArray(spec.acceptance)?spec.acceptance.slice(0,30).map((v,i)=>({kind:"acceptance",key:"acceptance-"+(i+1),value:clip(v,260)})):[])
  ].filter(x=>x.value);
  const decisions=conversation.slice(-20).map(x=>({at:x.at||null,role:x.role||"unknown",content:clip(x.content,500)}));
  const evidenceSnapshot=evidence.slice(-80).map(x=>({name:clip(x.name,180),status:statusOf(x.status),detail:clip(x.detail,360)}));
  const manifest=files.slice(0,180).map(f=>({path:clip(f.path,260),bytes:Buffer.byteLength(String(f.content||""))}));
  const payload={facts,decisions,evidenceSnapshot,manifest,mission:input.mission||null};
  return {
    status:"PASS",
    version:"SECOND-BRAIN-Ω-1",
    digest:hash(payload),
    project:facts.find(x=>x.key==="appName")?.value||"ASTRA project",
    facts,
    decisions,
    evidenceSnapshot,
    manifest,
    sourceCounts:{facts:facts.length,decisions:decisions.length,evidence:evidenceSnapshot.length,files:manifest.length},
    createdAt:new Date().toISOString()
  };
}

export function createTeamPlan(input={},memory=null) {
  const spec=input.spec||{}, text=JSON.stringify(spec).toLowerCase(), files=Array.isArray(input.files)?input.files:[];
  const tasks=[];
  const add=(id,role,title,deps=[],gate="PASS")=>tasks.push({id,role,title,deps,gate,status:"WAIT"});
  add("T0","Chief of Staff","Freeze mission, constraints and proof criteria",[]);
  add("T1","Architect","Choose architecture and interfaces",["T0"]);
  add("T2","Frontend+UX","Build responsive product UX and states",["T1"]);
  add("T3","Backend","Implement API and runtime contracts",["T1"]);
  if(/database|postgres|sql|schema|crm|marketplace|user|account/.test(text)||files.some(f=>/schema|sql|prisma|database/i.test(f.path||""))) add("T4","Database","Model durable data and migrations",["T1","T3"]);
  if(/auth|login|account|oauth|session|security|user/.test(text)||files.some(f=>/auth|session|login/i.test(f.path||""))) add("T5","Security","Prove auth, permissions and secret hygiene",["T3"]);
  if(/image|photo|visual|media|design/.test(text)) add("T6","Visual","Generate and validate visual assets",["T2"]);
  add("T7","DevOps-X","Build, test, containerize and prepare health gate",tasks.filter(t=>["T2","T3","T4","T5","T6"].includes(t.id)).map(t=>t.id));
  add("T8","Adversary","Hunt false PASS, unsafe assumptions and regressions",["T7"]);
  add("T9","Verify²","Independently reproduce critical evidence",["T8"]);
  add("T10","Release","Deploy exact artifact only after proof gates",["T9"]);
  return {
    status:"PASS",
    version:"TEAM-Ω-1",
    memoryDigest:memory?.digest||null,
    tasks,
    roles:[...new Set(tasks.map(t=>t.role))],
    criticalPath:tasks.map(t=>t.id),
    createdAt:new Date().toISOString()
  };
}

export function buildProofGraph(evidence=[]) {
  const list=Array.isArray(evidence)?evidence:[];
  const critical=/Cloud Sandbox|Sandbox ·|Verify²|DUALITY-X|AgentShield|Public health gate|Server validation|EVIDENLOCK|Q-NAV X Trust Gate/i;
  const nodes=list.map((e,i)=>({id:"E"+i,name:clip(e.name,180),status:statusOf(e.status),detail:clip(e.detail,360),critical:critical.test(String(e.name||""))}));
  const edges=nodes.slice(1).map((n,i)=>({from:nodes[i].id,to:n.id,type:"observed-before"}));
  const blockers=nodes.filter(n=>n.status==="FAIL"||(n.critical&&["PARTIAL","UNVERIFIED"].includes(n.status)));
  const contradictions=[];
  const groups=new Map();
  for(const n of nodes){const k=n.name.toLowerCase().replace(/\s+/g," ").trim();if(!groups.has(k))groups.set(k,[]);groups.get(k).push(n)}
  for(const [name,group] of groups){const s=new Set(group.map(x=>x.status));if(s.has("PASS")&&(s.has("FAIL")||s.has("UNVERIFIED")))contradictions.push({name,statuses:[...s]})}
  const status=nodes.some(n=>n.status==="FAIL")?"FAIL":blockers.length||nodes.some(n=>["PARTIAL","UNVERIFIED"].includes(n.status))?"PARTIAL":nodes.length?"PASS":"UNVERIFIED";
  return {status,version:"PROOF-GRAPH-Ω-1",nodes,edges,blockers,contradictions,summary:{pass:nodes.filter(n=>n.status==="PASS").length,partial:nodes.filter(n=>n.status==="PARTIAL").length,fail:nodes.filter(n=>n.status==="FAIL").length,unverified:nodes.filter(n=>n.status==="UNVERIFIED").length}};
}

export function summarizeRouteCost(routes=[]) {
  const rs=Array.isArray(routes)?routes:[];
  const privateOnly=rs.length>0&&rs.every(r=>/ASTRA private/i.test(String(r.provider||""))&&!r.fallback);
  const fallbackCount=rs.filter(r=>r.fallback).length;
  return {
    status:privateOnly?"PASS":rs.length?"PARTIAL":"UNVERIFIED",
    meter:"MODEL_API_CREDITS",
    externalApiCredits:privateOnly?0:null,
    routeCount:rs.length,
    fallbackCount,
    note:privateOnly?"All model calls stayed on ASTRA private local-model services. Railway compute/storage cost is outside this meter.":"At least one route was external/fallback or not provably private; paid API-credit cost is not asserted."
  };
}

export function workspace7SelfTest() {
  const sample={request:"Build a secure CRM",spec:{appName:"Proof CRM",goal:"secure CRM",stack:{frontend:"HTML",backend:"Node"},features:["login","contacts"],acceptance:["health 200","auth works","tests pass"]},files:[{path:"server.js",content:"health auth"},{path:"schema.sql",content:"create table users"}],evidence:[{name:"Cloud Sandbox",status:"PASS",detail:"tests pass"},{name:"Verify² independent",status:"PASS",detail:"reproduced"}],conversation:[{role:"user",content:"keep it zero paid API credits"}]};
  const memory=compileSecondBrain(sample),team=createTeamPlan(sample,memory),proof=buildProofGraph(sample.evidence),cost=summarizeRouteCost([{provider:"ASTRA private llama.cpp",fallback:false}]);
  const ok=/^[a-f0-9]{64}$/.test(memory.digest)&&team.tasks.length>=8&&proof.status==="PASS"&&cost.externalApiCredits===0;
  return {ok,status:ok?"PASS":"FAIL",memory:ok?"PASS":"FAIL",team:team.tasks.length>=8?"PASS":"FAIL",proof:proof.status,cost:cost.status,taskCount:team.tasks.length,digest:memory.digest};
}
