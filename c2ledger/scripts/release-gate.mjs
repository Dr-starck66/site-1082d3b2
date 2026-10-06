import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const root=path.resolve("c2ledger");
const version=fs.readFileSync(path.join(root,"VERSION"),"utf8").trim();
if(!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("invalid VERSION");
const must=[["README.md",`v${version}`],["AUTHORIZED_RANGE.md",`v${version}`],["deploy/docker-compose.disconnected.yml",version],["deploy/k8s-disconnected.yaml",version]];
for(const [f,w] of must){const t=fs.readFileSync(path.join(root,f),"utf8");if(!t.includes(w))throw new Error(`${f} missing ${w}`)}
const src=fs.readFileSync(path.join(root,"src/index.ts"),"utf8");
if(/version:\s*"0\./.test(src)) throw new Error("hard-coded runtime version remains in source");
if(!src.includes('proof.gate==="PASS"&&proof.defenceLayer?.status==="PASS"')) throw new Error("readiness is not fail-closed on full proof gate");
for(const f of ["Dockerfile","sensor/Dockerfile","range-node/Dockerfile"]){const t=fs.readFileSync(path.join(root,f),"utf8");if(!t.startsWith("FROM oven/bun:1.4.0-alpine"))throw new Error(`${f} Bun base not exact-version pinned`);if(!t.includes("USER bun"))throw new Error(`${f} does not run non-root`)}
const wfDir=fs.existsSync(".github/workflows")?".github/workflows":".";
const wfs=fs.readdirSync(wfDir).filter(x=>/^c2ledger-.*\.yml$/.test(x));
for(const f of wfs){const t=fs.readFileSync(path.join(wfDir,f),"utf8");if(/uses:\s*[^\s]+@v\d/.test(t))throw new Error(`${f} has mutable GitHub Action tag`);if(t.includes("branches: [c2ledger-v1-hardening]")||t.includes("branches: [c2ledger-authorized-range-v1]"))throw new Error(`${f} does not cover main`)}
const files=[];function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()){if(e.name==="node_modules"||e.name==="__pycache__")continue;walk(p)}else files.push(p)}}walk(root);if(fs.existsSync(wfDir))for(const f of wfs)files.push(path.join(wfDir,f));files.sort();
const components=files.map(f=>{const b=fs.readFileSync(f);return {type:"file",name:path.relative(process.cwd(),f),hashes:[{alg:"SHA-256",content:crypto.createHash("sha256").update(b).digest("hex")}],size:b.length}});
const manifest=components.map(x=>`${x.hashes[0].content}  ${x.name}`).join("\n")+"\n";
if(process.argv.includes("--emit")){fs.mkdirSync("artifacts/release",{recursive:true});fs.writeFileSync("artifacts/release/SHA256SUMS",manifest);fs.writeFileSync("artifacts/release/sbom.cdx.json",JSON.stringify({bomFormat:"CycloneDX",specVersion:"1.5",version:1,metadata:{component:{type:"application",name:"C2Ledger",version}},components},null,2));const provenance={schema:"c2ledger-provenance/v1",product:"C2Ledger",version,gitSha:process.env.GITHUB_SHA||null,repository:process.env.GITHUB_REPOSITORY||null,workflow:process.env.GITHUB_WORKFLOW||null,runner:process.env.RUNNER_OS||null,generatedAt:new Date().toISOString(),fileCount:components.length,manifestSha256:crypto.createHash("sha256").update(manifest).digest("hex")};fs.writeFileSync("artifacts/release/provenance.json",JSON.stringify(provenance,null,2));}
console.log(JSON.stringify({status:"PASS",version,files:components.length,actionsPinned:true,nonRoot:true,readinessFailClosed:true},null,2));
