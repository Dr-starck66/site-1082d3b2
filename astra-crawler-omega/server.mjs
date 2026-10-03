import http from "node:http";
import fs from "node:fs";
import net from "node:net";
import {crawlSite} from "./crawler.mjs";
import {analyzeTrafficBoost,rankPortfolio} from "./traffic-booster.mjs";

const PORT=Number(process.env.PORT||8080);
const html=fs.readFileSync(new URL("./index.html",import.meta.url),"utf8");
const portfolio=JSON.parse(fs.readFileSync(new URL("./portfolio-sites.json",import.meta.url),"utf8"));
let latestPortfolioReport={status:"PENDING",startedAt:null,completedAt:null,ranking:[],errors:[]};

function send(res,code,data,type="application/json; charset=utf-8"){
  res.writeHead(code,{"content-type":type,"cache-control":"no-store"});
  res.end(type.startsWith("application/json")?JSON.stringify(data):data);
}
async function body(req){
  let n=0,a=[];
  for await(const c of req){
    n+=c.length;
    if(n>250000)throw Object.assign(new Error("PAYLOAD_TOO_LARGE"),{status:413});
    a.push(c);
  }
  return a.length?JSON.parse(Buffer.concat(a).toString("utf8")):{};
}
function isPrivateHost(host){
  const h=String(host||"").toLowerCase();
  if(process.env.ASTRA_ALLOW_PRIVATE_TEST==="1")return false;
  if(h==="localhost"||h.endsWith(".localhost")||h.endsWith(".local"))return true;
  if(net.isIP(h)){
    if(h==="::1"||h.startsWith("fe80:")||h.startsWith("fc")||h.startsWith("fd"))return true;
    const p=h.split(".").map(Number);
    if(p.length===4&&(p[0]===10||p[0]===127||(p[0]===192&&p[1]===168)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===169&&p[1]===254)))return true;
  }
  return false;
}
function validUrl(x){
  try{
    const u=new URL(String(x||""));
    return ["http:","https:"].includes(u.protocol)&&!u.username&&!u.password&&!isPrivateHost(u.hostname);
  }catch{return false}
}
async function portfolioRun(input={}){
  const requested=Array.isArray(input.urls)&&input.urls.length?input.urls:portfolio.sites.map(x=>x.url);
  const urls=[...new Set(requested.filter(validUrl))].slice(0,30);
  if(!urls.length)throw Object.assign(new Error("URLS_REQUIRED"),{status:400});
  const maxPages=Math.max(1,Math.min(100,Number(input.maxPages)||30));
  const maxDepth=Math.max(0,Math.min(5,Number(input.maxDepth)||3));
  const reports=[];
  for(const url of urls){
    try{
      const c=await crawlSite({url,maxPages,maxDepth});
      reports.push({url,report:analyzeTrafficBoost(c)});
    }catch(e){
      reports.push({url,error:String(e?.message||e)});
    }
  }
  return{
    schema:"astra-semrush-traffic-booster-portfolio/v1",
    generatedAt:new Date().toISOString(),
    source:"ASTRA_CRAWLER_OMEGA",
    truth:"Ranking-opportunity model only; no fabricated Semrush traffic values.",
    ranking:rankPortfolio(reports),
    reports
  };
}

http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,"http://localhost");
    if(req.method==="GET"&&u.pathname==="/health")return send(res,200,{
      status:"PASS",
      service:"ASTRA_CRAWLER_OMEGA",
      bricks:["CRAWL","SEMRUSH_TRAFFIC_BOOSTER","PORTFOLIO"],
      portfolioSites:portfolio.sites.length
    });
    if(req.method==="GET"&&u.pathname==="/")return send(res,200,html,"text/html; charset=utf-8");
    if(req.method==="GET"&&u.pathname==="/api/portfolio")return send(res,200,portfolio);
    if(req.method==="GET"&&u.pathname==="/api/portfolio/latest")return send(res,200,latestPortfolioReport);

    if(req.method==="POST"&&u.pathname==="/api/crawl"){
      const x=await body(req);
      if(!validUrl(x.url))return send(res,400,{error:"PUBLIC_URL_REQUIRED"});
      return send(res,200,await crawlSite(x));
    }
    if(req.method==="POST"&&u.pathname==="/api/traffic-boost"){
      const x=await body(req);
      if(!validUrl(x.url))return send(res,400,{error:"PUBLIC_URL_REQUIRED"});
      const crawl=await crawlSite({url:x.url,maxPages:x.maxPages||80,maxDepth:x.maxDepth||4});
      return send(res,200,{crawlSummary:crawl.summary,...analyzeTrafficBoost(crawl)});
    }
    if(req.method==="POST"&&u.pathname==="/api/portfolio-boost"){
      return send(res,200,await portfolioRun(await body(req)));
    }
    return send(res,404,{error:"NOT_FOUND"});
  }catch(e){
    return send(res,Number(e?.status)||500,{error:String(e?.message||e)});
  }
}).listen(PORT,"0.0.0.0",()=>{
  console.log("ASTRA_CRAWLER_READY port="+PORT);
  if(process.env.NODE_ENV==="production"&&process.env.ASTRA_BOOT_PORTFOLIO_AUDIT!=="0"){
    setTimeout(async()=>{
      latestPortfolioReport={status:"RUNNING",startedAt:new Date().toISOString(),completedAt:null,ranking:[],errors:[]};
      console.log("ASTRA_PORTFOLIO_AUDIT_START sites="+portfolio.sites.length);
      try{
        const report=await portfolioRun({maxPages:Number(process.env.ASTRA_PORTFOLIO_MAX_PAGES||8),maxDepth:Number(process.env.ASTRA_PORTFOLIO_MAX_DEPTH||2)});
        latestPortfolioReport={status:"PASS",startedAt:latestPortfolioReport.startedAt,completedAt:new Date().toISOString(),ranking:report.ranking,errors:report.ranking.filter(x=>x.status!=="PASS")};
        console.log("ASTRA_PORTFOLIO_AUDIT_RESULT "+JSON.stringify(latestPortfolioReport));
      }catch(e){
        latestPortfolioReport={status:"FAIL",startedAt:latestPortfolioReport.startedAt,completedAt:new Date().toISOString(),ranking:[],errors:[String(e?.message||e)]};
        console.error("ASTRA_PORTFOLIO_AUDIT_FAIL "+JSON.stringify(latestPortfolioReport));
      }
    },750);
  }
});
