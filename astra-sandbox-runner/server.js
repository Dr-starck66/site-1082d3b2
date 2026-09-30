import http from "node:http";
import {mkdtemp,writeFile,mkdir,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,dirname,normalize} from "node:path";
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";

const PORT=Number(process.env.PORT||8080),TOKEN=String(process.env.ASTRA_SANDBOX_TOKEN||""),MAX_BODY=4*1024*1024,MAX_FILES=180,MAX_TOTAL=3*1024*1024,MAX_OUTPUT=24000;
const send=(res,code,obj)=>{res.writeHead(code,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(obj))};
const safePath=p=>typeof p==="string"&&p.length>0&&p.length<240&&!p.startsWith("/")&&!p.includes("..")&&!p.includes("\\")&&!p.includes("\0");
async function body(req){let n=0,ch=[];for await(const c of req){n+=c.length;if(n>MAX_BODY)throw Object.assign(new Error("payload too large"),{status:413});ch.push(c)}return ch.length?JSON.parse(Buffer.concat(ch).toString("utf8")):{}}
const auth=req=>TOKEN&&req.headers.authorization==="Bearer "+TOKEN;
const digest=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
function cleanEnv(extra={}){return{PATH:process.env.PATH||"/usr/local/bin:/usr/bin:/bin",HOME:"/workspace",LANG:"C.UTF-8",CI:"1",NODE_ENV:"test",npm_config_audit:"false",npm_config_fund:"false",npm_config_update_notifier:"false",npm_config_ignore_scripts:"true",...extra}}
function guardedEnv(extra={}){return cleanEnv({...extra,NODE_OPTIONS:"--max-old-space-size=384 --require=/opt/astra/network-guard.cjs",ASTRA_SANDBOX:"1"})}
function killTree(p){if(!p?.pid)return;try{process.kill(-p.pid,"SIGKILL")}catch{try{p.kill("SIGKILL")}catch{}}}
async function run(cmd,args,{cwd,timeout=60000,env=guardedEnv(),label=cmd}={}){
 const start=Date.now();return await new Promise(resolve=>{let out="",err="",done=false;
  const p=spawn(cmd,args,{cwd,env,detached:true,stdio:["ignore","pipe","pipe"]});
  const take=(s,b)=>{s+=b.toString();return s.length>MAX_OUTPUT?s.slice(-MAX_OUTPUT):s};
  p.stdout.on("data",b=>out=take(out,b));p.stderr.on("data",b=>err=take(err,b));
  const timer=setTimeout(()=>{if(done)return;done=true;killTree(p);resolve({label,status:"FAIL",exitCode:null,timeout:true,durationMs:Date.now()-start,stdout:out,stderr:err+"\nASTRA_TIMEOUT"})},timeout);
  p.on("error",e=>{if(done)return;done=true;clearTimeout(timer);resolve({label,status:"FAIL",exitCode:null,timeout:false,durationMs:Date.now()-start,stdout:out,stderr:err+"\n"+e.message})});
  p.on("close",code=>{if(done)return;done=true;clearTimeout(timer);resolve({label,status:code===0?"PASS":"FAIL",exitCode:code,timeout:false,durationMs:Date.now()-start,stdout:out,stderr:err})});
 })}
async function writeProject(root,files){let total=0;for(const f of files){if(!safePath(f.path))throw new Error("unsafe path: "+f.path);const content=String(f.content??"");total+=Buffer.byteLength(content);if(total>MAX_TOTAL)throw new Error("project exceeds byte limit");const p=join(root,normalize(f.path));if(!p.startsWith(root))throw new Error("path escape");await mkdir(dirname(p),{recursive:true});await writeFile(p,content)}return total}
function roots(files){const out=[];for(const f of files)if(/(^|\/)package\.json$/.test(f.path)){const d=dirname(f.path);out.push(d==="."?"":d)}return [...new Set(out)].slice(0,4)}
async function pkgAt(root,rel){try{return JSON.parse(await readFile(join(root,rel,"package.json"),"utf8"))}catch{return null}}
function hasLock(files,rel){const p=(rel?rel+"/":"")+"package-lock.json";return files.some(f=>f.path===p)}
function evidenceFromRun(name,r,required=true){return{name,status:r.status==="PASS"?"PASS":required?"FAIL":"PARTIAL",detail:r.status==="PASS"?name+" completed in "+r.durationMs+"ms":(r.stderr||r.stdout||name+" failed").slice(-800)}}
async function healthProbe(port,path="/health",ms=12000){const start=Date.now();let last="";while(Date.now()-start<ms){try{const r=await fetch("http://127.0.0.1:"+port+path,{signal:AbortSignal.timeout(1200)});last=String(r.status);if(r.ok)return{status:"PASS",httpStatus:r.status,durationMs:Date.now()-start}}catch(e){last=String(e.message||e)}await new Promise(r=>setTimeout(r,350))}return{status:"FAIL",detail:last,durationMs:Date.now()-start}}
async function runSandbox(project={}){
 const files=Array.isArray(project.files)?project.files:[];if(!files.length||files.length>MAX_FILES)throw new Error("invalid file count");
 const root=await mkdtemp(join(tmpdir(),"astra-run-")),evidence=[],runs=[],started=Date.now();
 try{
  const bytes=await writeProject(root,files);evidence.push({name:"Sandbox materialization",status:"PASS",detail:files.length+" files · "+bytes+" bytes"});
  const packageRoots=roots(files);evidence.push({name:"Stack detection",status:packageRoots.length?"PASS":"PARTIAL",detail:packageRoots.length?packageRoots.join(", ")||".":"no package.json; syntax-only"});
  for(const rel of packageRoots){
   const cwd=join(root,rel),pkg=await pkgAt(root,rel);if(!pkg)continue;const scripts=pkg.scripts||{};
   const install=hasLock(files,rel)?await run("npm",["ci","--ignore-scripts","--no-audit","--no-fund"],{cwd,timeout:90000,env:cleanEnv(),label:"npm ci "+(rel||".")}):await run("npm",["install","--ignore-scripts","--no-audit","--no-fund","--package-lock=false"],{cwd,timeout:90000,env:cleanEnv(),label:"npm install "+(rel||".")});
   runs.push(install);evidence.push(evidenceFromRun("Dependencies "+(rel||"."),install,true));if(install.status!=="PASS")continue;
   if(scripts.build){const b=await run("npm",["run","build"],{cwd,timeout:90000,label:"build "+(rel||".")});runs.push(b);evidence.push(evidenceFromRun("Build "+(rel||"."),b,true))}
   else evidence.push({name:"Build "+(rel||"."),status:"PARTIAL",detail:"no build script"});
   if(scripts.test&&!/no test specified/i.test(String(scripts.test))){const t=await run("npm",["test"],{cwd,timeout:90000,label:"test "+(rel||".")});runs.push(t);evidence.push(evidenceFromRun("Tests "+(rel||"."),t,true))}
   else evidence.push({name:"Tests "+(rel||"."),status:"PARTIAL",detail:"no executable test script"});
  }
  const js=files.filter(f=>/\.(?:js|mjs|cjs)$/.test(f.path)).slice(0,50);for(const f of js){const r=await run("node",["--check",join(root,f.path)],{cwd:root,timeout:8000,label:"syntax "+f.path});runs.push(r);if(r.status!=="PASS"){evidence.push(evidenceFromRun("JS syntax "+f.path,r,true));break}}if(js.length&&!evidence.some(e=>e.name.startsWith("JS syntax")&&e.status==="FAIL"))evidence.push({name:"JS syntax",status:"PASS",detail:js.length+" file(s) checked"});
  let primary=packageRoots[0]??"";try{const d=JSON.parse((files.find(f=>f.path==="deploy.json")||{}).content||"{}");if(typeof d.rootDirectory==="string"&&packageRoots.includes(d.rootDirectory.replace(/^\.\/?/,"").replace(/\/$/,"")))primary=d.rootDirectory.replace(/^\.\/?/,"").replace(/\/$/,"")}catch{}
  const pkg=packageRoots.length?await pkgAt(root,primary):null,healthPath=(()=>{try{const d=JSON.parse((files.find(f=>f.path==="deploy.json")||{}).content||"{}");return typeof d.healthPath==="string"&&d.healthPath.startsWith("/")?d.healthPath:"/health"}catch{return"/health"}})();
  if(pkg?.scripts?.start){
   const port=4387,p=spawn("npm",["start"],{cwd:join(root,primary),env:guardedEnv({PORT:String(port),HOST:"127.0.0.1"}),detached:true,stdio:["ignore","pipe","pipe"]});let so="",se="";p.stdout.on("data",b=>so=(so+b).slice(-MAX_OUTPUT));p.stderr.on("data",b=>se=(se+b).slice(-MAX_OUTPUT));
   const hp=await healthProbe(port,healthPath,15000);killTree(p);runs.push({label:"runtime",status:hp.status,durationMs:hp.durationMs,stdout:so,stderr:se});evidence.push({name:"Runtime health",status:hp.status,detail:hp.status==="PASS"?"HTTP "+hp.httpStatus+" "+healthPath:(se||so||hp.detail||"health failed").slice(-800)});
  }else evidence.push({name:"Runtime health",status:"PARTIAL",detail:"no start script in primary package"});
  evidence.push({name:"Secret isolation",status:"PASS",detail:"child processes receive sanitized environment; runner service holds no deploy credentials"});
  evidence.push({name:"Network guard",status:"PARTIAL",detail:"Node outbound network is blocked by preload guard during build/test/runtime; this is process isolation, not kernel/VM isolation"});
  const verdict=evidence.some(x=>x.status==="FAIL")?"FAIL":evidence.some(x=>x.status==="PARTIAL")?"PARTIAL":"PASS";
  return{status:verdict,sandboxLevel:"PROCESS_ISOLATED",hardIsolation:"PARTIAL",durationMs:Date.now()-started,projectDigest:digest(files.map(f=>[f.path,f.content])),evidence,runs:runs.map(r=>({...r,stdout:String(r.stdout||"").slice(-4000),stderr:String(r.stderr||"").slice(-4000)}))};
 }finally{await rm(root,{recursive:true,force:true}).catch(()=>{})}
}
const srv=http.createServer(async(req,res)=>{try{const u=new URL(req.url||"/","http://localhost");if(req.method==="GET"&&u.pathname==="/health")return send(res,200,{ok:true,service:"astra-cloud-sandbox-runner",version:"1.0.0",sandboxLevel:"PROCESS_ISOLATED"});if(req.method==="GET"&&u.pathname==="/self_test"){const result=await runSandbox({files:[{path:"package.json",content:JSON.stringify({name:"probe",version:"1.0.0",scripts:{test:"node test.js",start:"node server.js"}})},{path:"test.js",content:"process.exit(0)"},{path:"server.js",content:"const http=require('http');http.createServer((q,s)=>{s.writeHead(q.url==='/health'?200:404);s.end('ok')}).listen(process.env.PORT,'127.0.0.1')"}]});return send(res,result.status==="FAIL"?500:200,{ok:result.status!=="FAIL",result})}if(req.method==="POST"&&u.pathname==="/run"){if(!auth(req))return send(res,401,{status:"FAIL",reason:"unauthorized"});const p=await body(req);return send(res,200,await runSandbox(p))}return send(res,404,{error:"not found"})}catch(e){return send(res,e?.status||500,{status:"FAIL",reason:String(e?.message||e)})}});
srv.listen(PORT,"0.0.0.0",()=>console.log("ASTRA CLOUD SANDBOX RUNNER listening",PORT));
