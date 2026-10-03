import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {spawn} from "node:child_process";

function listen(server,port=0){return new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,"127.0.0.1",()=>resolve(server.address().port))})}
function close(server){return new Promise(r=>server.close(()=>r()))}
async function waitHealth(url){for(let i=0;i<30;i++){try{const r=await fetch(url);if(r.ok)return await r.json()}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error("server_not_ready")}

test("traffic booster HTTP endpoint works end-to-end",async()=>{
 const mock=http.createServer((req,res)=>{
   if(req.url==="/robots.txt"){res.writeHead(200,{"content-type":"text/plain"});return res.end("User-agent: *\nAllow: /")}
   if(req.url==="/sitemap.xml"){res.writeHead(200,{"content-type":"application/xml"});return res.end('<?xml version="1.0"?><urlset><url><loc>http://127.0.0.1:'+mock.address().port+'/</loc></url></urlset>')}
   res.writeHead(200,{"content-type":"text/html"});
   res.end('<!doctype html><html><head><title>Avocat Belgique Divorce</title><link rel="canonical" href="/"></head><body><h1>Avocat Belgique Divorce</h1><a href="/guide">Guide</a></body></html>');
 });
 const mockPort=await listen(mock);
 const appPort=19191;
 const app=spawn(process.execPath,["server.mjs"],{cwd:new URL("..",import.meta.url),env:{...process.env,PORT:String(appPort)},stdio:"ignore"});
 try{
   const health=await waitHealth("http://127.0.0.1:"+appPort+"/health");
   assert.equal(health.status,"PASS");
   assert.ok(health.bricks.includes("SEMRUSH_TRAFFIC_BOOSTER"));
   const r=await fetch("http://127.0.0.1:"+appPort+"/api/traffic-boost",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url:"http://127.0.0.1:"+mockPort+"/",maxPages:3,maxDepth:1})});
   assert.equal(r.status,200);
   const j=await r.json();
   assert.equal(j.schema,"astra-semrush-traffic-booster/v1");
   assert.equal(j.summary.pages>=1,true);
   assert.equal(Array.isArray(j.topActions),true);
 } finally {
   app.kill("SIGTERM");
   await close(mock);
 }
},{timeout:10000});
