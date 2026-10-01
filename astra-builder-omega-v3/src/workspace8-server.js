import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

const ROOT=process.env.ASTRA_STATE_DIR||"/tmp/astra-state-v8";
const safeId=v=>String(v||"draft").toLowerCase().replace(/[^a-z0-9_.-]+/g,"-").replace(/^-|-$/g,"").slice(0,80)||"draft";
const stable=v=>{if(Array.isArray(v))return v.map(stable);if(v&&typeof v==="object"){const o={};for(const k of Object.keys(v).sort())o[k]=stable(v[k]);return o}return v};
const digest=v=>createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");
async function dir(kind){const p=join(ROOT,kind);await mkdir(p,{recursive:true});return p}
export async function saveRecord(kind,id,value){
 const d=await dir(kind),record={id:safeId(id),kind,updatedAt:new Date().toISOString(),digest:digest(value),value};
 await writeFile(join(d,safeId(id)+".json"),JSON.stringify(record,null,2),"utf8");return record;
}
export async function loadRecord(kind,id){
 try{return JSON.parse(await readFile(join(await dir(kind),safeId(id)+".json"),"utf8"))}catch{return null}
}
export async function listRecords(kind,limit=50){
 const d=await dir(kind);let names=[];try{names=(await readdir(d)).filter(x=>x.endsWith(".json")).slice(0,Math.max(1,Math.min(100,limit)))}catch{return[]}
 const out=[];for(const n of names){try{out.push(JSON.parse(await readFile(join(d,n),"utf8")))}catch{}}
 return out.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
export function normalizeSkill(x={},description=""){
 const tools=Array.isArray(x.tools)?x.tools.map(v=>String(v).slice(0,80)).slice(0,20):[];
 return{
  id:safeId(x.id||x.name||"agent-"+Date.now()),
  name:String(x.name||"ASTRA Agent").slice(0,80),
  purpose:String(x.purpose||description||"").slice(0,700),
  instructions:String(x.instructions||"Use evidence-first execution and never invent results.").slice(0,6000),
  tools,
  outputSchema:x.outputSchema&&typeof x.outputSchema==="object"?x.outputSchema:{summary:"string",findings:"array",nextActions:"array"},
  safety:{readOnlyDefault:true,requireEvidence:true,failClosed:true,...(x.safety&&typeof x.safety==="object"?x.safety:{})},
  version:"SKILL-Ω-1",
  createdAt:new Date().toISOString()
 };
}
export function compactBrain(x={}){
 const spec=x.spec||{},ev=Array.isArray(x.evidence)?x.evidence:[],files=Array.isArray(x.files)?x.files:[],conv=Array.isArray(x.conversation)?x.conversation:[];
 const memory={
  workspaceId:safeId(x.workspaceId||spec.appName||"draft"),
  appName:String(spec.appName||"Untitled ASTRA project").slice(0,160),
  goal:String(spec.goal||x.request||"").slice(0,1600),
  stack:spec.stack||{},
  features:(spec.features||[]).slice(0,40),
  acceptance:(spec.acceptance||[]).slice(0,40),
  decisions:conv.slice(-30).map(v=>({at:v.at||null,role:v.role||"unknown",content:String(v.content||"").slice(0,700)})),
  evidence:ev.slice(-100).map(v=>({name:String(v.name||"").slice(0,180),status:String(v.status||"UNVERIFIED"),detail:String(v.detail||"").slice(0,420)})),
  manifest:files.slice(0,200).map(f=>({path:String(f.path||"").slice(0,260),bytes:Buffer.byteLength(String(f.content||""))})),
  mission:x.mission||null
 };
 return{...memory,digest:digest(memory),version:"SECOND-BRAIN-Ω-2",updatedAt:new Date().toISOString()};
}
export function workspace8SelfTest(){
 const s=normalizeSkill({name:"Verifier",tools:["browser.read"],instructions:"Verify evidence."},"verify"),b=compactBrain({workspaceId:"x",spec:{appName:"Demo",features:["one"]},evidence:[{name:"test",status:"PASS"}]});
 const ok=s.safety.readOnlyDefault===true&&s.version==="SKILL-Ω-1"&&/^[a-f0-9]{64}$/.test(b.digest)&&b.version==="SECOND-BRAIN-Ω-2";
 return{ok,status:ok?"PASS":"FAIL",skill:s.version,brain:b.version,digest:b.digest};
}
