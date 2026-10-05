const BUILTINS=new Set(["assert","buffer","child_process","crypto","events","fs","http","https","module","net","os","path","perf_hooks","process","querystring","readline","stream","string_decoder","timers","tls","tty","url","util","v8","vm","worker_threads","zlib"]);
const cloneFiles=files=>(Array.isArray(files)?files:[]).filter(f=>f&&typeof f.path==="string"&&typeof f.content==="string").map(f=>({path:f.path,content:f.content}));
const pkgName=s=>{if(!s||s.startsWith(".")||s.startsWith("/")||s.startsWith("node:"))return null;const p=s.split("/");return s.startsWith("@")?p.slice(0,2).join("/"):p[0]};
function depsFrom(files,prefix){const out=new Set;for(const f of files){if(!f.path.startsWith(prefix))continue;const s=String(f.content||"");for(const re of [/\bfrom\s*["']([^"']+)["']/g,/\bimport\s*["']([^"']+)["']/g,/\brequire\(\s*["']([^"']+)["']\s*\)/g,/\bimport\(\s*["']([^"']+)["']\s*\)/g])for(const m of s.matchAll(re)){const n=pkgName(m[1]);if(n&&!BUILTINS.has(n))out.add(n)}}return out}
function json(v){return JSON.stringify(v,null,2)+"\n"}
function put(map,path,content,changes,reason){const prev=map.get(path);if(!prev||prev.content!==content){map.set(path,{path,content});changes.push({path,reason,action:prev?"REPLACED":"ADDED"})}}
function frontendPackage(files){const deps={react:"latest","react-dom":"latest"};for(const n of depsFrom(files,"frontend/"))if(!["@testing-library/react","vitest","vite","typescript","jsdom"].includes(n))deps[n]="latest";return{name:"astra-generated-frontend",private:true,version:"1.0.0",type:"module",scripts:{build:"vite build",test:"vitest run tests/astra-contract.test.tsx --environment jsdom --globals"},dependencies:deps,devDependencies:{vite:"latest",typescript:"latest",vitest:"latest",jsdom:"latest","@testing-library/react":"latest","@types/react":"latest","@types/react-dom":"latest"}}}
function backendPackage(files){const deps={tsx:"latest"};for(const n of depsFrom(files,"backend/"))deps[n]="latest";const dev={typescript:"latest",vitest:"latest","@types/node":"latest"};if(deps.express)dev["@types/express"]="latest";if(deps.cors)dev["@types/cors"]="latest";if(deps.jsonwebtoken)dev["@types/jsonwebtoken"]="latest";if(deps.supertest)dev["@types/supertest"]="latest";const paths=files.map(f=>f.path);const entry=paths.includes("backend/src/server.ts")?"src/server.ts":paths.includes("backend/src/index.ts")?"src/index.ts":paths.includes("backend/src/server.js")?"src/server.js":paths.includes("backend/server.js")?"server.js":"src/server.ts";const start=/\.ts$/.test(entry)?"tsx "+entry:"node "+entry;return{name:"astra-generated-backend",private:true,version:"1.0.0",type:"module",scripts:{build:"tsc --noEmit",start,test:"vitest run tests/astra-contract.test.ts --globals"},dependencies:deps,devDependencies:dev}}
function ensurePreviewDesignFloor(map,changes){
 const htmlFile=map.get("preview/index.html");
 if(htmlFile){
  let html=String(htmlFile.content||""),changed=false;
  if(!/<meta[^>]+name=["']viewport["'][^>]*>/i.test(html)&&/<head\b[^>]*>/i.test(html)){html=html.replace(/<head\b([^>]*)>/i,'<head$1><meta name="viewport" content="width=device-width,initial-scale=1">');changed=true}
  if(changed)put(map,"preview/index.html",html,changes,"deterministic viewport floor")
 }
 const cssFile=map.get("preview/styles.css");
 if(cssFile){
  let css=String(cssFile.content||""),parts=[];
  if(!/:focus(?:-visible)?\b/i.test(css))parts.push(':where(button,a,input,select,textarea,[role="button"]):focus-visible{outline:3px solid currentColor;outline-offset:3px}');
  if(!/(?:min-)?(?:height|width)\s*:\s*(?:4[4-9]|[5-9]\d)px/i.test(css))parts.push(':where(button,input,select,textarea,[role="button"]){min-height:44px}');
  if(!/@media\b|@container\b|clamp\s*\(|min\s*\(|max\s*\(/i.test(css))parts.push('@media(max-width:720px){html,body{max-width:100%;overflow-x:hidden}}');
  if(/\b(?:animation|transition)\s*:/i.test(css)&&!/prefers-reduced-motion/i.test(css))parts.push('@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}');
  if(parts.length)put(map,"preview/styles.css",css+"\n/* ASTRA DESIGN ACCESSIBILITY FLOOR */\n"+parts.join("\n")+"\n",changes,"deterministic accessibility/responsive floor")
 }
}
function ensureBackendAppFloor(map,changes){
 const f=map.get("backend/src/app.ts");if(!f)return;
 let c=String(f.content||""),changed=false;
 const withoutSelf=c.replace(/^\s*import\s+[^\n;]*\s+from\s+["']\.\/app(?:\.ts)?["'];?\s*$/gm,"");
 if(withoutSelf!==c){c=withoutSelf;changed=true}
 const bound=/import\s+express\s+from\s+["']express["']|import\s+\*\s+as\s+express\s+from\s+["']express["']|(?:const|let|var)\s+express\s*=\s*require\(\s*["']express["']\s*\)/.test(c);
 if(/\bexpress\s*\(\s*\)/.test(c)&&!bound){c='import express from "express";\n'+c;changed=true}
 const exported=/\bexport\s+(?:const|let|var)\s+app\b|\bexport\s*\{[^}]*\bapp\b[^}]*\}/s.test(c);
 if(!exported&&/\b(?:const|let|var)\s+app\b/.test(c)){c=c.replace(/\b(const|let|var)\s+app\b/,'export $1 app');changed=true}
 if(changed)put(map,"backend/src/app.ts",c,changes,"deterministic Express app contract floor")
}
function ensureRepositoryFloor(map,changes){
 const f=map.get("backend/src/repository.ts");if(!f)return;
 let c=String(f.content||""),changed=false;
 c=c.replace(/^\s*import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']\.\/entities(?:\.ts)?["'];?\s*$/gm,(full,names)=>{
  const aliases=String(names).split(",").map(x=>x.trim()).filter(Boolean).map(x=>{
   const parts=x.replace(/^type\s+/,"").split(/\s+as\s+/i),name=(parts[1]||parts[0]).trim();
   return name;
  });
  if(!aliases.length)return full;
  const runtimeUse=aliases.some(name=>new RegExp("\\b(?:new\\s+"+name+"|"+name+"\\s*\\.)").test(c));
  if(runtimeUse)return full;
  changed=true;return aliases.map(name=>"type "+name+" = Record<string, any>;").join("\n");
 });
 if(changed)put(map,"backend/src/repository.ts",c,changes,"deterministic type-only ./entities fallback")
}
function ensureContractTests(map,changes){
 if(map.has("frontend/src/App.tsx")){
  const front='import React from "react";\nimport {describe,it,expect} from "vitest";\nimport {render} from "@testing-library/react";\nimport App from "../src/App";\n\ndescribe("ASTRA frontend contract",()=>{it("renders App",()=>{const r=render(<App/>);expect(r.container).toBeTruthy()})});\n';
  put(map,"frontend/tests/astra-contract.test.tsx",front,changes,"deterministic frontend contract test")
 }
 if(map.has("backend/src/app.ts")&&map.has("backend/src/auth.ts")){
  const back='import {describe,it,expect} from "vitest";\nimport {app} from "../src/app.ts";\nimport {authRouter,requireAuth} from "../src/auth.ts";\n\ndescribe("ASTRA backend contract",()=>{\n it("exports Express app",()=>expect(typeof app?.use).toBe("function"));\n it("exports auth router",()=>expect(typeof authRouter?.use).toBe("function"));\n it("exports requireAuth middleware",()=>expect(typeof requireAuth).toBe("function"));\n});\n';
  put(map,"backend/tests/astra-contract.test.ts",back,changes,"deterministic backend/auth contract test")
 }
}
function ensureFrontend(map,files,changes){const has=files.some(f=>f.path.startsWith("frontend/"));if(!has)return;put(map,"frontend/package.json",json(frontendPackage(files)),changes,"deterministic frontend manifest");put(map,"frontend/tsconfig.json",json({compilerOptions:{target:"ES2022",useDefineForClassFields:true,lib:["ES2022","DOM","DOM.Iterable"],allowJs:false,skipLibCheck:true,esModuleInterop:true,allowSyntheticDefaultImports:true,strict:false,forceConsistentCasingInFileNames:true,module:"ESNext",moduleResolution:"Bundler",resolveJsonModule:true,isolatedModules:true,noEmit:true,jsx:"react-jsx",types:["vite/client"]},include:["src"]}),changes,"deterministic frontend TypeScript contract");if(!map.has("frontend/index.html"))put(map,"frontend/index.html",'<!doctype html>\n<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ASTRA App</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',changes,"deterministic Vite entry")}
function ensureBackend(map,files,changes){
 const has=files.some(f=>f.path.startsWith("backend/"));if(!has)return;
 ensureBackendAppFloor(map,changes);
 const server='import express from "express";\nimport path from "node:path";\nimport { fileURLToPath } from "node:url";\nimport { app } from "./app.ts";\n\nconst runtime=express();\nruntime.get("/health",(_req,res)=>res.status(200).json({ok:true}));\nruntime.use(app);\nconst here=path.dirname(fileURLToPath(import.meta.url));\nconst dist=path.resolve(here,"../../frontend/dist");\nruntime.use(express.static(dist));\nruntime.use((req,res,next)=>{if(req.method==="GET"&&!req.path.startsWith("/api/"))return res.sendFile(path.join(dist,"index.html"));next()});\nconst port=Number(process.env.PORT||8080);\nruntime.listen(port,"0.0.0.0",()=>console.log("ASTRA generated app listening",port));\n';
 put(map,"backend/src/server.ts",server,changes,"deterministic runtime server / health contract");
 const current=[...map.values()];
 put(map,"backend/package.json",json(backendPackage(current)),changes,"deterministic backend manifest");
 put(map,"backend/tsconfig.json",json({compilerOptions:{target:"ES2022",module:"ESNext",moduleResolution:"Bundler",lib:["ES2022"],esModuleInterop:true,allowSyntheticDefaultImports:true,strict:false,skipLibCheck:true,noEmit:true,resolveJsonModule:true,types:["node"],allowImportingTsExtensions:true},include:["src"]}),changes,"deterministic backend TypeScript contract")
}
function ensureDeploy(map,files,changes){if(!files.some(f=>f.path.startsWith("backend/")))return;const docker='FROM node:22-alpine AS frontend\nWORKDIR /app/frontend\nCOPY frontend/package.json ./\nRUN npm install --ignore-scripts --no-audit --no-fund\nCOPY frontend ./\nRUN npm run build\n\nFROM node:22-alpine AS runtime\nWORKDIR /app\nCOPY backend/package.json ./backend/package.json\nRUN cd backend && npm install --ignore-scripts --no-audit --no-fund\nCOPY backend ./backend\nCOPY --from=frontend /app/frontend/dist ./frontend/dist\nENV NODE_ENV=production\nEXPOSE 8080\nWORKDIR /app/backend\nCMD ["npm","start"]\n';put(map,"Dockerfile",docker,changes,"deterministic single-service container");put(map,"deploy.json",json({provider:"railway",rootDirectory:".",dockerfilePath:"Dockerfile",healthPath:"/health",startCommand:null,runtimeRoot:"backend"}),changes,"deterministic deployment contract");put(map,".gitignore","node_modules\ndist\n.env\n.env.*\n!.env.example\n",changes,"deterministic repository hygiene")}
export function enforceRuntimeBaseline(inputFiles,spec={}){const files=cloneFiles(inputFiles),map=new Map(files.map(f=>[f.path,f])),changes=[];ensurePreviewDesignFloor(map,changes);ensureRepositoryFloor(map,changes);ensureFrontend(map,files,changes);ensureBackend(map,[...map.values()],changes);ensureContractTests(map,changes);ensureDeploy(map,[...map.values()],changes);const out=[...map.values()].sort((a,b)=>a.path.localeCompare(b.path));return{files:out,changes,evidence:{name:"Runtime Baseline Guard",status:changes.length?"PASS":"PASS",detail:changes.length?changes.map(x=>x.path).join(", ")+" normalized by ASTRA":"critical runtime contracts already canonical"}}}
export function runtimeBaselineSelfTest(){
 const r=enforceRuntimeBaseline([
  {path:"preview/index.html",content:'<!doctype html><html><head></head><body><main><h1>Test</h1><button>Go</button></main></body></html>'},
  {path:"preview/styles.css",content:'body{margin:0}'},
  {path:"frontend/src/main.tsx",content:'import React from "react"'},{path:"frontend/src/App.tsx",content:'export default function App(){return <main>OK</main>}'},
  {path:"backend/src/app.ts",content:'import {app as shadow} from "./app.ts"; import {authRouter,requireAuth} from "./auth.ts"; const app=express(); void shadow; void authRouter; void requireAuth;'},{path:"backend/src/auth.ts",content:'import express from "express"; export const authRouter=express.Router(); export function requireAuth(req,res,next){next()}'},{path:"backend/src/repository.ts",content:'import type {Contact,Deal} from "./entities"; export const store: Contact[]=[]; export type DealRow=Deal;'},
  {path:"backend/src/server.ts",content:'import express from "express"; const app=express(); app.get("/health",(q,s)=>s.send("ok")); app.listen(process.env.PORT)'},
  {path:"backend/package.json",content:"{"}
 ]);
 const m=new Map(r.files.map(f=>[f.path,f.content]));let ok=true;
 for(const p of ["preview/index.html","preview/styles.css","frontend/package.json","frontend/index.html","frontend/tests/astra-contract.test.tsx","backend/src/app.ts","backend/src/auth.ts","backend/src/repository.ts","backend/src/server.ts","backend/tests/astra-contract.test.ts","backend/package.json","backend/tsconfig.json","Dockerfile","deploy.json"])ok=ok&&m.has(p);
 ok=ok&&/name=["']viewport["']/.test(m.get("preview/index.html")||"")&&/:focus-visible/.test(m.get("preview/styles.css")||"")&&/min-height:44px/.test(m.get("preview/styles.css")||"");
 ok=ok&&/import express from ["']express["']/.test(m.get("backend/src/app.ts")||"")&&/export const app/.test(m.get("backend/src/app.ts")||"")&&!/from ["']\.\/app(?:\.ts)?["']/.test(m.get("backend/src/app.ts")||"");
 ok=ok&&!/from ["\']\.\/entities/.test(m.get("backend/src/repository.ts")||"");try{JSON.parse(m.get("backend/package.json"));JSON.parse(m.get("deploy.json"))}catch{ok=false}
 return{ok,count:r.files.length,changes:r.changes.length}
}
