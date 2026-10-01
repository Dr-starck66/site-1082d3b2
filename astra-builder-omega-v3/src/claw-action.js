import { chromium } from "playwright-core";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { existsSync } from "node:fs";
import { assertPublicUrl } from "./claw.js";

const cache=new Map();
const DANGEROUS=/\b(buy|purchase|checkout|pay|payment|transfer|wire|delete|remove|close account|publish|post publicly|place order|submit order|confirm order|book now|reserve now|donate|subscribe paid)\b/i;
const SENSITIVE=/pass(word)?|secret|token|api[-_ ]?key|credit|card|cvv|cvc|iban|bank|routing|ssn|social security|seed|private key/i;
const SAFE_INPUTS=new Set(["","text","email","tel","url","search","number","date","datetime-local","month","week","time"]);

function browserPath(){
  if(process.env.CHROMIUM_PATH)return process.env.CHROMIUM_PATH;
  if(existsSync("/usr/bin/chromium-browser"))return "/usr/bin/chromium-browser";
  if(existsSync("/usr/bin/chromium"))return "/usr/bin/chromium";
  return "/usr/bin/chromium-browser";
}
function privateV4(ip){
  const p=ip.split(".").map(Number);
  return p[0]===10||p[0]===127||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===169&&p[1]===254)||(p[0]===100&&p[1]>=64&&p[1]<=127)||p[0]===0;
}
function privateV6(ip){return /^(::1|fc|fd|fe8|fe9|fea|feb)/i.test(ip)}
async function publicRequestUrl(raw){
  const u=new URL(raw);
  if(!["http:","https:"].includes(u.protocol))throw new Error("CLAW_ACTION_SCHEME_GATE");
  const h=u.hostname.toLowerCase();
  if(h==="localhost"||h.endsWith(".local")||h.endsWith(".internal")||h.endsWith(".railway.internal"))throw new Error("CLAW_ACTION_PRIVATE_GATE");
  if(isIP(h)===4&&privateV4(h))throw new Error("CLAW_ACTION_PRIVATE_GATE");
  if(isIP(h)===6&&privateV6(h))throw new Error("CLAW_ACTION_PRIVATE_GATE");
  if(!cache.has(h)){
    const rows=await lookup(h,{all:true,verbatim:true});
    const ok=rows.length>0&&rows.every(r=>!(isIP(r.address)===4?privateV4(r.address):isIP(r.address)===6?privateV6(r.address):true));
    cache.set(h,ok);
  }
  if(!cache.get(h))throw new Error("CLAW_ACTION_DNS_GATE");
  return u;
}
function selectorPath(el){
  if(el.id)return "#"+CSS.escape(el.id);
  const parts=[];let cur=el;
  while(cur&&cur.nodeType===1&&parts.length<7){
    let p=cur.tagName.toLowerCase();
    if(cur.getAttribute("name"))p+='[name="'+CSS.escape(cur.getAttribute("name"))+'"]';
    else{let i=1,s=cur;while((s=s.previousElementSibling))if(s.tagName===cur.tagName)i++;p+=":nth-of-type("+i+")"}
    parts.unshift(p);
    if(cur.parentElement===document.body){parts.unshift("body");break}
    cur=cur.parentElement;
  }
  return parts.join(" > ");
}
function policyReason(e){
  const words=[e.text,e.name,e.aria,e.placeholder,e.type,e.formAction].join(" ");
  if(SENSITIVE.test(words)||e.type==="password"||e.type==="file"||e.type==="hidden")return "sensitive";
  if(DANGEROUS.test(words))return "high-impact";
  if(e.form||e.type==="submit")return "form-submit";
  if(e.tag==="a"&&(!e.href||!e.sameOrigin))return "cross-origin";
  if((e.tag==="input"||e.tag==="textarea")&&!SAFE_INPUTS.has(e.type||""))return "input-type";
  return null;
}
async function openGuarded(raw){
  const start=await assertPublicUrl(raw),origin=start.origin;
  const browser=await chromium.launch({headless:true,executablePath:browserPath(),args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--disable-background-networking"]});
  const context=await browser.newContext({viewport:{width:1280,height:800},userAgent:"ASTRA-CLAW-Omega-Action/1.0"});
  const page=await context.newPage();
  await page.route("**/*",async route=>{
    try{await publicRequestUrl(route.request().url());return route.continue()}
    catch{return route.abort()}
  });
  return {start,origin,browser,page};
}
async function surface(page,origin){
  const rows=await page.evaluate((origin)=>{
    const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=="hidden"&&s.display!=="none"};
    const path=el=>{
      if(el.id)return "#"+CSS.escape(el.id);
      const parts=[];let cur=el;
      while(cur&&cur.nodeType===1&&parts.length<7){
        let p=cur.tagName.toLowerCase();
        if(cur.getAttribute("name"))p+='[name="'+CSS.escape(cur.getAttribute("name"))+'"]';
        else{let i=1,s=cur;while((s=s.previousElementSibling))if(s.tagName===cur.tagName)i++;p+=":nth-of-type("+i+")"}
        parts.unshift(p);
        if(cur.parentElement===document.body){parts.unshift("body");break}
        cur=cur.parentElement;
      }
      return parts.join(" > ");
    };
    return [...document.querySelectorAll("a[href],button,input,textarea,select")].filter(visible).slice(0,120).map((el,i)=>{
      const href=el.href||"",form=!!el.closest("form"),type=(el.type||"").toLowerCase();
      return {
        id:"A"+i,selector:path(el),tag:el.tagName.toLowerCase(),type,
        text:(el.innerText||el.value||"").trim().slice(0,180),
        name:(el.name||"").slice(0,120),aria:(el.getAttribute("aria-label")||"").slice(0,180),
        placeholder:(el.getAttribute("placeholder")||"").slice(0,180),href,
        sameOrigin:href?new URL(href,location.href).origin===origin:true,form,
        options:el.tagName==="SELECT"?[...el.options].slice(0,30).map(o=>({value:o.value,label:(o.textContent||"").trim().slice(0,120)})):[]
      };
    });
  },origin);
  return rows.map(e=>({...e,blocked:policyReason(e)}));
}
export async function inspectActionSurface({url}){
  const g=await openGuarded(url);
  try{
    const response=await g.page.goto(g.start.href,{waitUntil:"domcontentloaded",timeout:20000});
    await g.page.waitForTimeout(250);
    const final=await assertPublicUrl(g.page.url());
    if(final.origin!==g.origin)throw new Error("CLAW_ACTION_ORIGIN_GATE");
    const elements=await surface(g.page,g.origin);
    const png=await g.page.screenshot({type:"png",fullPage:false});
    return {status:"PASS",url:g.page.url(),origin:g.origin,httpStatus:response?.status()||null,title:await g.page.title(),elements,screenshotB64:png.toString("base64")};
  }finally{await g.browser.close()}
}
export function normalizeActionPlan(raw={},inspection={}){
  const allowed=new Map((inspection.elements||[]).map(e=>[e.selector,e])),actions=[];
  for(const a of (Array.isArray(raw.actions)?raw.actions:[]).slice(0,4)){
    const e=allowed.get(String(a.selector||""));
    if(!e||e.blocked)continue;
    const type=String(a.type||"").toLowerCase();
    if(type==="fill"&&(e.tag==="input"||e.tag==="textarea")&&SAFE_INPUTS.has(e.type||"")&&!SENSITIVE.test([e.name,e.aria,e.placeholder].join(" "))){
      actions.push({type,selector:e.selector,value:String(a.value??"").slice(0,500),label:e.aria||e.placeholder||e.name||e.text});
    }else if(type==="select"&&e.tag==="select"){
      const value=String(a.value??"");if(e.options.some(o=>o.value===value))actions.push({type,selector:e.selector,value,label:e.name||e.aria});
    }else if(type==="check"&&e.tag==="input"&&["checkbox","radio"].includes(e.type)){
      actions.push({type,selector:e.selector,value:Boolean(a.value),label:e.name||e.aria});
    }else if(type==="click"&&((e.tag==="a"&&e.sameOrigin)||(e.tag==="button"&&!e.form&&e.type!=="submit"))){
      actions.push({type,selector:e.selector,label:e.text||e.aria||e.name});
    }
  }
  return {summary:String(raw.summary||"Guarded action plan").slice(0,500),actions,blockedCount:(raw.actions?.length||0)-actions.length};
}
async function currentMeta(page,selector,origin){
  return page.locator(selector).first().evaluate((el,origin)=>{
    const href=el.href||"",form=!!el.closest("form"),type=(el.type||"").toLowerCase();
    return {tag:el.tagName.toLowerCase(),type,text:(el.innerText||el.value||"").trim().slice(0,180),name:(el.name||"").slice(0,120),aria:(el.getAttribute("aria-label")||"").slice(0,180),placeholder:(el.getAttribute("placeholder")||"").slice(0,180),href,sameOrigin:href?new URL(href,location.href).origin===origin:true,form,formAction:""};
  },origin);
}
export async function executeApprovedActions(plan){
  const g=await openGuarded(plan.url),trace=[];
  try{
    await g.page.goto(g.start.href,{waitUntil:"domcontentloaded",timeout:20000});
    for(const a of plan.actions||[]){
      const loc=g.page.locator(a.selector).first();
      if(await loc.count()!==1)throw new Error("CLAW_ACTION_SELECTOR_GATE");
      const meta=await currentMeta(g.page,a.selector,g.origin),reason=policyReason(meta);
      if(reason)throw new Error("CLAW_ACTION_POLICY_GATE:"+reason);
      if(a.type==="fill")await loc.fill(String(a.value||"").slice(0,500));
      else if(a.type==="select")await loc.selectOption(String(a.value));
      else if(a.type==="check"){if(a.value)await loc.check();else await loc.uncheck()}
      else if(a.type==="click"){await loc.click({timeout:10000});await g.page.waitForTimeout(350)}
      else throw new Error("CLAW_ACTION_TYPE_GATE");
      const now=await assertPublicUrl(g.page.url());
      if(now.origin!==g.origin)throw new Error("CLAW_ACTION_ORIGIN_GATE");
      trace.push({type:a.type,selector:a.selector,label:a.label||"",url:g.page.url()});
    }
    const final={title:await g.page.title(),url:g.page.url(),text:(await g.page.locator("body").innerText()).replace(/\s+/g," ").trim().slice(0,2500)};
    const png=await g.page.screenshot({type:"png",fullPage:false});
    return {status:"PASS",mode:"APPROVED_LOW_RISK_ACTION",trace,final,screenshotB64:png.toString("base64"),guards:{oneTimePlan:true,sameOrigin:true,sensitiveBlocked:true,formsBlocked:true,highImpactBlocked:true,maxActions:4}};
  }finally{await g.browser.close()}
}
export function clawActionSelfTest(){
  const inspection={elements:[
    {selector:"#safe",tag:"button",type:"button",text:"Preview",name:"",aria:"",placeholder:"",href:"",sameOrigin:true,form:false,blocked:null},
    {selector:"#pw",tag:"input",type:"password",text:"",name:"password",aria:"",placeholder:"Password",href:"",sameOrigin:true,form:true,blocked:"sensitive"},
    {selector:"#buy",tag:"button",type:"button",text:"Buy now",name:"",aria:"",placeholder:"",href:"",sameOrigin:true,form:false,blocked:"high-impact"}
  ]};
  const n=normalizeActionPlan({actions:[{type:"click",selector:"#safe"},{type:"fill",selector:"#pw",value:"x"},{type:"click",selector:"#buy"}]},inspection);
  const ok=n.actions.length===1&&n.actions[0].selector==="#safe"&&n.blockedCount===2;
  return {ok,status:ok?"PASS":"FAIL",allowed:n.actions.length,blocked:n.blockedCount};
}
