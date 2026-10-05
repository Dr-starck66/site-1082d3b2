import{dirname,join,normalize}from"node:path";

const clean=s=>String(s??"");
const projectPath=p=>normalize(p).replace(/\\/g,"/");
const importRes=/\b(?:import|export)\s+(?:[^"'\n]+?\s+from\s+)?["']([^"']+)["']/g;

function resolveImport(fromPath,specifier,paths){
  const base=projectPath(join(dirname(fromPath),specifier));
  const ext=/\.[A-Za-z0-9]+$/.test(base);
  const candidates=ext?[base]:[base,base+".ts",base+".tsx",base+".js",base+".jsx",base+"/index.ts",base+"/index.tsx",base+"/index.js",base+"/index.jsx"];
  return candidates.find(p=>paths.has(p))||null;
}

export function fullstackContractAudit(files=[]){
  const valid=(files||[]).filter(f=>f&&typeof f.path==="string"&&typeof f.content==="string");
  const paths=new Set(valid.map(f=>projectPath(f.path)));
  const issues=[];

  for(const f of valid){
    if(!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(f.path))continue;
    const text=clean(f.content);
    for(const m of text.matchAll(importRes)){
      const specifier=m[1];
      if(!specifier.startsWith("."))continue;
      if(!resolveImport(f.path,specifier,paths))issues.push({code:"MISSING_RELATIVE_IMPORT",path:f.path,detail:specifier});
    }
  }

  const app=valid.find(f=>projectPath(f.path)==="backend/src/app.ts");
  if(app&&!/\bexport\s+(?:const|let|var)\s+app\b|\bexport\s*\{[^}]*\bapp\b[^}]*\}/s.test(app.content)){
    issues.push({code:"APP_NOT_EXPORTED",path:app.path,detail:"backend/src/app.ts must export app"});
  }
  if(app&&/\bexpress\s*\(\s*\)/.test(app.content)&&!/import\s+express\s+from\s+["']express["']|import\s+\*\s+as\s+express\s+from\s+["']express["']|(?:const|let|var)\s+express\s*=\s*require\(\s*["']express["']\s*\)/.test(app.content)){
    issues.push({code:"EXPRESS_UNBOUND",path:app.path,detail:"express() is used without importing/binding express"});
  }

  const auth=valid.find(f=>projectPath(f.path)==="backend/src/auth.ts");
  if(auth&&/(?:require\(\s*["']express["']\s*\)|\bexpress)\.Middleware\s*\(/.test(auth.content)){
    issues.push({code:"INVALID_EXPRESS_MIDDLEWARE",path:auth.path,detail:"Express has no runtime Middleware constructor; export a normal middleware function"});
  }

  const repo=valid.find(f=>projectPath(f.path)==="backend/src/repository.ts");
  if(repo&&/from\s*["']\.\/(?:server|app)(?:\.ts)?["']|import\s*["']\.\/(?:server|app)(?:\.ts)?["']/i.test(repo.content)){
    issues.push({code:"REPOSITORY_LAYER_VIOLATION",path:repo.path,detail:"repository must not import app/server"});
  }

  for(const f of valid.filter(f=>/^backend\/tests\//.test(projectPath(f.path)))){
    const text=clean(f.content);
    if(/from\s*["']\.\/(?:auth|app|server|repository|entities)(?:\.ts)?["']/i.test(text)){
      issues.push({code:"TEST_RELATIVE_PATH",path:f.path,detail:"backend tests must import source through ../src/..."});
    }
    if(/import\s*\{\s*request\s*\}\s*from\s*["']supertest["']/i.test(text)){
      issues.push({code:"SUPERTEST_IMPORT",path:f.path,detail:'use default import: import request from "supertest"'});
    }
  }

  const frontendTest=valid.find(f=>projectPath(f.path)==="frontend/tests/app.test.tsx");
  if(frontendTest&&/from\s*["']\.\/App(?:\.tsx)?["']/i.test(frontendTest.content)){
    issues.push({code:"FRONTEND_TEST_PATH",path:frontendTest.path,detail:"frontend test should import ../src/App"});
  }

  const status=issues.length?"FAIL":"PASS";
  return{status,issues,summary:issues.length?issues.slice(0,8).map(x=>x.code+" "+x.path+" "+x.detail).join(" · "):"relative imports and generated full-stack contracts are coherent"};
}

export function fullstackContractEvidence(files=[]){
  const r=fullstackContractAudit(files);
  return{name:"FULLSTACK CONTRACT GATE Ω",status:r.status,detail:r.summary};
}

export function fullstackContractSelfTest(){
  const good=[
    {path:"backend/src/app.ts",content:'import express from "express"; export const app=express();'},
    {path:"backend/src/auth.ts",content:'export const authRouter={}; export function requireAuth(){}'},
    {path:"backend/src/repository.ts",content:'export const repository=new Map();'},
    {path:"backend/src/server.ts",content:'import {app} from "./app.ts"; console.log(app);'},
    {path:"backend/tests/server.test.ts",content:'import request from "supertest"; import {app} from "../src/app.ts"; void request; void app;'},
    {path:"frontend/src/App.tsx",content:'export default function App(){return <main/>}'},
    {path:"frontend/tests/app.test.tsx",content:'import App from "../src/App"; void App;'}
  ];
  const bad=[
    {path:"backend/src/app.ts",content:'export const app=express();'},
    {path:"backend/src/auth.ts",content:'export const requireAuth=require("express").Middleware((req,res,next)=>next());'},
    {path:"backend/src/repository.ts",content:'import {app} from "./server.ts"; export {app};'},
    {path:"backend/tests/server.test.ts",content:'import {request} from "supertest"; import {authRouter} from "./auth.ts";'}
  ];
  const a=fullstackContractAudit(good),b=fullstackContractAudit(bad);
  return{ok:a.status==="PASS"&&b.status==="FAIL"&&b.issues.length>=6,good:a.status,bad:b.status,badIssues:b.issues.length};
}
