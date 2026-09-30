const enc=new TextEncoder();
export function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==="object"){const o={};for(const k of Object.keys(value).sort())o[k]=stable(value[k]);return o}return value}
export async function sha256(value){const bytes=enc.encode(typeof value==="string"?value:JSON.stringify(stable(value)));const hash=await crypto.subtle.digest("SHA-256",bytes);return[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("")}
export function compileMission(spec,request=""){
 const nodes=[],add=(id,type,title,deps=[],acceptance=[])=>nodes.push({id,type,title,deps,acceptance,status:"WAIT"});
 add("M0","INTENT","Understand mission",[],[spec?.goal||request||"goal defined"]);
 add("M1","ARCH","Freeze architecture",["M0"],Object.entries(spec?.stack||{}).map(([k,v])=>k+": "+v));
 for(const [i,f] of (spec?.features||[]).entries())add("F"+i,"FEATURE",String(f),["M1"],[]);
 add("T0","VERIFY","Run automated verification",nodes.filter(n=>n.type==="FEATURE").map(n=>n.id),spec?.acceptance||[]);
 add("T1","ADVERSARY","False-PASS hunt",["T0"],["No unresolved high-risk contradiction"]);
 add("T2","DEPLOY","Verified deployment",["T1"],["Exact commit deployed","Public health 2xx"]);
 return{version:"AION-1",request,nodes,criticalPath:nodes.map(n=>n.id),createdAt:new Date().toISOString()};
}
export function missionProgress(m){const n=m?.nodes||[],done=n.filter(x=>x.status==="PASS").length;return{done,total:n.length,pct:n.length?Math.round(done/n.length*100):0}}
export function updateMission(m,type,status){if(!m)return m;return{...m,nodes:m.nodes.map(n=>n.type===type?{...n,status}:n)}}
export function guardFiles(files,{allowWorkflows=true}={}){
 const isolated=[],escalated=[],allowed=[];for(const f of files||[]){const p=String(f.path||"");
  const sensitive=!p||p.startsWith("/")||p.includes("..")||/^\.git\//i.test(p)||/(^|\/)\.env$/i.test(p)||/private.?key|id_rsa|credentials\.json/i.test(p)||(!allowWorkflows&&/^\.github\/workflows\//i.test(p));
  const highImpact=/^\.github\/workflows\//i.test(p)||/(^|\/)Dockerfile$/i.test(p)||/(^|\/)deploy\.json$/i.test(p)||/(^|\/)railway\.json$/i.test(p);
  if(sensitive)isolated.push(f);else{allowed.push(f);if(highImpact)escalated.push(f)}
 }
 const verdict=isolated.length?"ISOLATE":escalated.length?"ESCALATE":"ALLOW";
 return{verdict,allowed,isolated:isolated.map(x=>x.path),escalated:escalated.map(x=>x.path),reason:verdict==="ISOLATE"?"sensitive paths isolated":verdict==="ESCALATE"?"high-impact files require enhanced verification":"capability policy satisfied"};
}
export function signature(err){const s=String(err?.message||err||"unknown").toLowerCase().replace(/[0-9a-f]{8,}/g,"#").replace(/\d+/g,"#").replace(/\s+/g," ").slice(0,240);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return"NK-"+(h>>>0).toString(16)}
export class NegativeKnowledge{
 constructor(key="astra-negative-knowledge-v1"){this.key=key;try{this.items=JSON.parse(localStorage.getItem(key)||"[]")}catch{this.items=[]}}
 record(error,context={},rootCause=""){const sig=signature(error),now=new Date().toISOString(),old=this.items.find(x=>x.signature===sig);if(old){old.count++;old.lastSeen=now;old.context=context;old.rootCause=rootCause||old.rootCause}else this.items.push({signature:sig,count:1,firstSeen:now,lastSeen:now,message:String(error?.message||error).slice(0,300),context,rootCause});this.items=this.items.slice(-120);localStorage.setItem(this.key,JSON.stringify(this.items));return sig}
 hints(limit=8){return this.items.slice().sort((a,b)=>b.count-a.count).slice(0,limit).map(x=>({signature:x.signature,count:x.count,message:x.message,rootCause:x.rootCause}))}
}
export function createGenome({spec,files,evidence,cfg,status,label="run",parent=null}){
 const pass=(evidence||[]).filter(x=>x.status==="PASS").length,total=(evidence||[]).length||1;
 return{label,parent,createdAt:new Date().toISOString(),models:{architect:cfg.architect,builder:cfg.frontend,backend:cfg.backend,adversary:cfg.adversary,verifier:cfg.verifier,image:cfg.imageModel},traits:{files:(files||[]).length,evidenceQuality:Math.round(pass/total*100),acceptance:spec?.acceptance?.length||0,status},mutation:"none"};
}
export function scoreVariant(files,evidence=[]){let score=0;score+=Math.min(35,(files?.length||0)*1.2);score+=evidence.filter(x=>x.status==="PASS").length*4;score-=evidence.filter(x=>x.status==="FAIL").length*12;score-=evidence.filter(x=>x.status==="PARTIAL").length*2;if((files||[]).some(x=>x.path==="Dockerfile"))score+=8;if((files||[]).some(x=>/test|spec/i.test(x.path)))score+=8;return Math.round(score*10)/10}
export function dualityVerdict(audit,verify){const high=(audit?.issues||[]).filter(x=>x.severity==="high").length;if(verify?.verdict==="FAIL"||high)return{status:"FAIL",reason:"arbiter rejected due to blocking contradiction"};if(verify?.verdict!=="PASS"||audit?.risk==="HIGH"||audit?.risk==="MEDIUM")return{status:"PARTIAL",reason:"proposer/skeptic disagreement remains"};return{status:"PASS",reason:"skeptic and independent arbiter converge"}}
