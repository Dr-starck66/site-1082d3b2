import http from "node:http";import fs from "node:fs";import {crawlSite} from "./crawler.mjs";import {analyzeTrafficBoost,rankPortfolio} from "./traffic-booster.mjs";
const PORT=Number(process.env.PORT||8080),html=fs.readFileSync(new URL("./index.html",import.meta.url),"utf8");
function send(res,code,data,type="application/json; charset=utf-8"){res.writeHead(code,{"content-type":type,"cache-control":"no-store"});res.end(type.startsWith("application/json")?JSON.stringify(data):data)}
async function body(req){let n=0,a=[];for await(const c of req){n+=c.length;if(n>250000)throw Object.assign(new Error("PAYLOAD_TOO_LARGE"),{status:413});a.push(c)}return a.length?JSON.parse(Buffer.concat(a).toString("utf8")):{}}
function validUrl(x){return /^https?:\/\//i.test(String(x||""))}
http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,"http://localhost");
 if(req.method==="GET"&&u.pathname==="/health")return send(res,200,{status:"PASS",service:"ASTRA_CRAWLER_OMEGA",bricks:["CRAWL","SEMRUSH_TRAFFIC_BOOSTER"]});
 if(req.method==="GET"&&u.pathname==="/")return send(res,200,html,"text/html; charset=utf-8");
 if(req.method==="POST"&&u.pathname==="/api/crawl"){const x=await body(req);if(!validUrl(x.url))return send(res,400,{error:"VALID_URL_REQUIRED"});return send(res,200,await crawlSite(x))}
 if(req.method==="POST"&&u.pathname==="/api/traffic-boost"){const x=await body(req);if(!validUrl(x.url))return send(res,400,{error:"VALID_URL_REQUIRED"});const crawl=await crawlSite({url:x.url,maxPages:x.maxPages||80,maxDepth:x.maxDepth||4});return send(res,200,{crawlSummary:crawl.summary,...analyzeTrafficBoost(crawl)})}
 if(req.method==="POST"&&u.pathname==="/api/portfolio-boost"){const x=await body(req),urls=[...new Set((x.urls||[]).filter(validUrl))].slice(0,20);if(!urls.length)return send(res,400,{error:"URLS_REQUIRED"});const reports=[];for(const url of urls){try{const c=await crawlSite({url,maxPages:x.maxPages||50,maxDepth:x.maxDepth||3});reports.push({url,report:analyzeTrafficBoost(c)})}catch(e){reports.push({url,error:String(e?.message||e)})}}return send(res,200,{schema:"astra-semrush-traffic-booster-portfolio/v1",generatedAt:new Date().toISOString(),ranking:rankPortfolio(reports),reports})}
 return send(res,404,{error:"NOT_FOUND"});
}catch(e){return send(res,Number(e?.status)||500,{error:String(e?.message||e)})}}).listen(PORT,"0.0.0.0",()=>console.log("ASTRA_CRAWLER_READY port="+PORT));
