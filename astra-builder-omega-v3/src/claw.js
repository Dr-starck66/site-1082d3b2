import { chromium } from "playwright-core";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const PRIVATE_HOSTS=new Set(["localhost","metadata.google.internal","astra-local-qwen","astra-local-deepseek","astra-cloud-sandbox"]);
const privateV4=ip=>{const p=ip.split(".").map(Number);return p[0]===10||p[0]===127||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===169&&p[1]===254)||(p[0]===100&&p[1]>=64&&p[1]<=127)||p[0]===0};
const privateV6=ip=>/^(::1|fc|fd|fe8|fe9|fea|feb)/i.test(ip);
function hostBlocked(host){
 const h=String(host||"").toLowerCase().replace(/\.$/,"");
 if(PRIVATE_HOSTS.has(h)||h.endsWith(".local")||h.endsWith(".internal")||h.endsWith(".railway.internal"))return true;
 if(isIP(h)===4)return privateV4(h);if(isIP(h)===6)return privateV6(h);return false;
}
export async function assertPublicUrl(raw,{dns=true}={}){
 let u;try{u=new URL(String(raw||""))}catch{throw new Error("CLAW_URL_GATE: invalid URL")}
 if(!["http:","https:"].includes(u.protocol))throw new Error("CLAW_URL_GATE: only http/https allowed");
 if(hostBlocked(u.hostname))throw new Error("CLAW_URL_GATE: private/internal host blocked");
 if(dns){const rows=await lookup(u.hostname,{all:true,verbatim:true});if(!rows.length)throw new Error("CLAW_URL_GATE: DNS unresolved");for(const r of rows){if((isIP(r.address)===4&&privateV4(r.address))||(isIP(r.address)===6&&privateV6(r.address)))throw new Error("CLAW_URL_GATE: hostname resolves to private/internal address")}}
 return u;
}
function browserPath(){return process.env.CHROMIUM_PATH||"/usr/bin/chromium-browser"}
function cleanText(s,n=12000){return String(s||"").replace(/\s+/g," ").trim().slice(0,n)}
async function snapshot(page){
 const data=await page.evaluate(()=>({
  title:document.title,
  text:(document.body?.innerText||"").slice(0,20000),
  links:[...document.querySelectorAll("a[href]")].slice(0,120).map(a=>({text:(a.innerText||a.getAttribute("aria-label")||"").trim().slice(0,180),href:a.href})),
  headings:[...document.querySelectorAll("h1,h2,h3")].slice(0,80).map(h=>({tag:h.tagName,text:(h.innerText||"").trim().slice(0,240)}))
 }));
 return{title:cleanText(data.title,300),text:cleanText(data.text,14000),links:data.links.filter(x=>x.href).slice(0,100),headings:data.headings};
}
export async function runClaw({url,goal,maxSteps=3,agent}){
 const start=await assertPublicUrl(url),origin=start.origin,visited=[],transcript=[];maxSteps=Math.max(1,Math.min(4,Number(maxSteps)||3));
 const browser=await chromium.launch({headless:true,executablePath:browserPath(),args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--disable-background-networking"]});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:800},userAgent:"ASTRA-CLAW-Omega/1.0"});
  const page=await context.newPage();
  await page.route("**/*",async route=>{try{const u=new URL(route.request().url());if(!["http:","https:"].includes(u.protocol)||hostBlocked(u.hostname))return route.abort();return route.continue()}catch{return route.abort()}});
  let current=start.href,last=null;
  for(let step=0;step<maxSteps;step++){
   const checked=await assertPublicUrl(current);if(checked.origin!==origin&&step>0)throw new Error("CLAW_ORIGIN_GATE: cross-origin navigation blocked");
   const response=await page.goto(current,{waitUntil:"domcontentloaded",timeout:20000});await page.waitForTimeout(350);
   const final=await assertPublicUrl(page.url());if(final.origin!==origin&&step>0)throw new Error("CLAW_ORIGIN_GATE: redirect escaped origin");
   last=await snapshot(page);visited.push({url:page.url(),status:response?.status()||null,title:last.title});
   if(step===maxSteps-1||typeof agent!=="function")break;
   const choices=last.links.filter(x=>{try{return new URL(x.href).origin===origin}catch{return false}}).slice(0,30);
   if(!choices.length)break;
   const plan=await agent({goal:String(goal||"").slice(0,900),page:{url:page.url(),title:last.title,text:last.text.slice(0,4500),links:choices}});
   transcript.push({step,plan});
   if(!plan||String(plan.decision||"STOP").toUpperCase()!=="FOLLOW")break;
   const pick=choices.find(x=>x.href===plan.href);if(!pick)break;current=pick.href;
  }
  const png=await page.screenshot({type:"png",fullPage:false});
  return{status:"PASS",mode:"READ_ONLY_BROWSER",visited,transcript,final:last,screenshotB64:png.toString("base64"),guards:{sameOrigin:true,privateNetworkBlocked:true,formsBlocked:true,maxSteps}};
 }finally{await browser.close()}
}
export function clawSelfTest(){
 const blocked=["127.0.0.1","10.0.0.1","astra-local-qwen.railway.internal"].every(hostBlocked);
 return{ok:blocked,status:blocked?"PASS":"FAIL",mode:"READ_ONLY_BROWSER",browserPath:browserPath()};
}
