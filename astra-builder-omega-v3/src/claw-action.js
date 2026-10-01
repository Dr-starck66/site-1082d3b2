import { chromium } from "playwright-core";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { existsSync } from "node:fs";
import { assertPublicUrl } from "./claw.js";

const dnsCache=new Map();
const FINANCIAL=/\b(pay|payment|checkout|credit card|cvv|cvc|iban|bank transfer|wire transfer|send money|purchase|place order|confirm order)\b/i;
const ACCOUNT_DELETE=/\b(delete account|remove account|close account|terminate account)\b/i;
const SECRET=/pass(word)?|secret|token|api[-_ ]?key|seed phrase|private key/i;
const SAFE_INPUTS=new Set(["","text","email","tel","url","search","number","date","datetime-local","month","week","time"]);
const MAX_ACTIONS=8;

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
  if(!dnsCache.has(h)){
    const rows=await lookup(h,{all:true,verbatim:true});
    const ok=rows.length>0&&rows.every(r=>!(isIP(r.address)===4?privateV4(r.address):isIP(r.address)===6?privateV6(r.address):true));
    dnsCache.set(h,ok);
  }
  if(!dnsCache.get(h))throw new Error("CLAW_ACTION_DNS_GATE");
  return u;
}
function normalizeOwners(list=[]){
  return [...new Set((Array.isArray(list)?list:String(list||"").split(/[\s,;]+/)).map(x=>{
    try{return new URL(/^https?:\/\//i.test(x)?x:"https://"+x).hostname.toLowerCase()}catch{return""}
  }).filter(Boolean))].slice(0,40);
}
function ownedHost(host,owners=[]){
  const h=String(host||"").toLowerCase();
  return normalizeOwners(owners).some(o=>h===o||h.endsWith("."+o));
}
function classify(e,{ownerMode=false,owners=[]}={}){
  const words=[e.text,e.name,e.aria,e.placeholder,e.type,e.formAction].join(" ");
  if(e.type==="file"||e.type==="hidden")return "file-or-hidden";
  if(SECRET.test(words)||e.type==="password")return "secret";
  if(FINANCIAL.test(words))return "financial";
  if(ACCOUNT_DELETE.test(words))return "account-delete";
  if(e.tag==="textarea"&&!SAFE_INPUTS.has(e.type||""))return "input-type";
  if(e.tag==="input"&&!SAFE_INPUTS.has(e.type||"")&&!["checkbox","radio"].includes(e.type))return "input-type";
  if(e.href){
    try{
      const h=new URL(e.href).hostname;
      if(!e.sameOrigin&&!(ownerMode&&ownedHost(h,owners)))return "cross-domain";
    }catch{return "bad-link"}
  }
  if(!ownerMode&&(e.form||e.type==="submit"))return "form-submit";
  return null;
}
async function openGuarded(raw,owners=[]){
  const start=await assertPublicUrl(raw),origin=start.origin;
  const browser=await chromium.launch({headless:true,executablePath:browserPath(),args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--disable-background-networking"]});
  const context=await browser.newContext({viewport:{width:1280,height:800},userAgent:"ASTRA-CLAW-Omega-Owner/1.0"});
  const page=await context.newPage();
  await page.route("**/*",async route=>{
    try{
      const u=await publicRequestUrl(route.request().url());
      if(u.origin!==origin&&!ownedHost(u.hostname,owners))return route.abort();
      return route.continue();
    }catch{return route.abort()}
  });
  return {start,origin,browser,page};
}
async function surface(page,origin,opts){
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
    return [...document.querySelectorAll("a[href],button,input,textarea,select")].filter(visible).slice(0,160).map((el,i)=>{
      const href=el.href||"",form=el.closest("form"),type=(el.type||"").toLowerCase(),formAction=form?.action||"";
      return {
        id:"A"+i,selector:path(el),tag:el.tagName.toLowerCase(),type,
        text:(el.innerText||el.value||"").trim().slice(0,180),
        name:(el.name||"").slice(0,120),aria:(el.getAttribute("aria-label")||"").slice(0,180),
        placeholder:(el.getAttribute("placeholder")||"").slice(0,180),href,formAction,
        sameOrigin:href?new URL(href,location.href).origin===origin:true,
        form:!!form,options:el.tagName==="SELECT"?[...el.options].slice(0,40).map(o=>({value:o.value,label:(o.textContent||"").trim().slice(0,120)})):[]
      };
    });
  },origin);
  return rows.map(e=>({...e,blocked:classify(e,opts)}));
}
export async function inspectActionSurface({url,ownerMode=false,ownerDomains=[]}){
  const owners=normalizeOwners(ownerDomains);
  const start=await assertPublicUrl(url);
  const effectiveOwner=ownerMode&&ownedHost(start.hostname,owners);
  const g=await openGuarded(url,owners);
  try{
    const response=await g.page.goto(g.start.href,{waitUntil:"domcontentloaded",timeout:20000});
    await g.page.waitForTimeout(250);
    const final=await assertPublicUrl(g.page.url());
    const finalOwned=final.origin===g.origin||ownedHost(final.hostname,owners);
    if(!finalOwned)throw new Error("CLAW_ACTION_DOMAIN_GATE");
    const elements=await surface(g.page,g.origin,{ownerMode:effectiveOwner,owners});
    const png=await g.page.screenshot({type:"png",fullPage:false});
    return {status:"PASS",url:g.page.url(),origin:g.origin,httpStatus:response?.status()||null,title:await g.page.title(),elements,screenshotB64:png.toString("base64"),ownerMode:effectiveOwner,ownerDomains:owners};
  }finally{await g.browser.close()}
}
export function normalizeActionPlan(raw={},inspection={}){
  const allowed=new Map((inspection.elements||[]).map(e=>[e.selector,e])),actions=[];
  for(const a of (Array.isArray(raw.actions)?raw.actions:[]).slice(0,MAX_ACTIONS)){
    const e=allowed.get(String(a.selector||""));
    if(!e||e.blocked)continue;
    const type=String(a.type||"").toLowerCase();
    if(type==="fill"&&(e.tag==="input"||e.tag==="textarea")&&SAFE_INPUTS.has(e.type||"")){
      actions.push({type,selector:e.selector,value:String(a.value??"").slice(0,1000),label:e.aria||e.placeholder||e.name||e.text,risk:"NORMAL"});
    }else if(type==="select"&&e.tag==="select"){
      const value=String(a.value??"");if(e.options.some(o=>o.value===value))actions.push({type,selector:e.selector,value,label:e.name||e.aria,risk:"NORMAL"});
    }else if(type==="check"&&e.tag==="input"&&["checkbox","radio"].includes(e.type)){
      actions.push({type,selector:e.selector,value:Boolean(a.value),label:e.name||e.aria,risk:"NORMAL"});
    }else if(type==="click"&&(e.tag==="a"||e.tag==="button"||e.type==="submit")){
      actions.push({type,selector:e.selector,label:e.text||e.aria||e.name,risk:e.form||e.type==="submit"?"CONFIRM":"NORMAL"});
    }
  }
  return {summary:String(raw.summary||"Owner action plan").slice(0,500),actions,blockedCount:(raw.actions?.length||0)-actions.length};
}
async function currentMeta(page,selector,origin){
  return page.locator(selector).first().evaluate((el,origin)=>{
    const href=el.href||"",form=el.closest("form"),type=(el.type||"").toLowerCase();
    return {tag:el.tagName.toLowerCase(),type,text:(el.innerText||el.value||"").trim().slice(0,180),name:(el.name||"").slice(0,120),aria:(el.getAttribute("aria-label")||"").slice(0,180),placeholder:(el.getAttribute("placeholder")||"").slice(0,180),href,formAction:form?.action||"",sameOrigin:href?new URL(href,location.href).origin===origin:true,form:!!form};
  },origin);
}
export async function executeApprovedActions(plan){
  const owners=normalizeOwners(plan.ownerDomains||[]);
  const g=await openGuarded(plan.url,owners),trace=[];
  try{
    await g.page.goto(g.start.href,{waitUntil:"domcontentloaded",timeout:20000});
    for(const a of plan.actions||[]){
      const loc=g.page.locator(a.selector).first();
      if(await loc.count()!==1)throw new Error("CLAW_ACTION_SELECTOR_GATE");
      const meta=await currentMeta(g.page,a.selector,g.origin);
      const reason=classify(meta,{ownerMode:!!plan.ownerMode,owners});
      if(reason)throw new Error("CLAW_ACTION_POLICY_GATE:"+reason);
      if(a.type==="fill")await loc.fill(String(a.value||"").slice(0,1000));
      else if(a.type==="select")await loc.selectOption(String(a.value));
      else if(a.type==="check"){if(a.value)await loc.check();else await loc.uncheck()}
      else if(a.type==="click"){await loc.click({timeout:10000});await g.page.waitForTimeout(400)}
      else throw new Error("CLAW_ACTION_TYPE_GATE");
      const now=await assertPublicUrl(g.page.url());
      if(now.origin!==g.origin&&!ownedHost(now.hostname,owners))throw new Error("CLAW_ACTION_DOMAIN_GATE");
      trace.push({type:a.type,selector:a.selector,label:a.label||"",risk:a.risk||"NORMAL",url:g.page.url()});
    }
    const final={title:await g.page.title(),url:g.page.url(),text:(await g.page.locator("body").innerText()).replace(/\s+/g," ").trim().slice(0,3000)};
    const png=await g.page.screenshot({type:"png",fullPage:false});
    return {status:"PASS",mode:plan.ownerMode?"OWNER_MODE":"GUARDED_MODE",trace,final,screenshotB64:png.toString("base64"),guards:{oneTimePlan:true,ownerDomains:owners,privateNetworkBlocked:true,secretsBlocked:true,financialBlocked:true,accountDeletionBlocked:true,maxActions:MAX_ACTIONS}};
  }finally{await g.browser.close()}
}
export function clawActionSelfTest(){
  const inspection={ownerMode:true,ownerDomains:["example.com"],elements:[
    {selector:"#safe",tag:"button",type:"button",text:"Preview",name:"",aria:"",placeholder:"",href:"",formAction:"",sameOrigin:true,form:false,blocked:null},
    {selector:"#submit",tag:"button",type:"submit",text:"Publish draft",name:"",aria:"",placeholder:"",href:"",formAction:"https://example.com/save",sameOrigin:true,form:true,blocked:null},
    {selector:"#pw",tag:"input",type:"password",text:"",name:"password",aria:"",placeholder:"Password",href:"",formAction:"",sameOrigin:true,form:true,blocked:"secret"},
    {selector:"#pay",tag:"button",type:"button",text:"Pay now",name:"",aria:"",placeholder:"",href:"",formAction:"",sameOrigin:true,form:false,blocked:"financial"}
  ]};
  const n=normalizeActionPlan({actions:[{type:"click",selector:"#safe"},{type:"click",selector:"#submit"},{type:"fill",selector:"#pw",value:"x"},{type:"click",selector:"#pay"}]},inspection);
  const ok=n.actions.length===2&&n.blockedCount===2&&n.actions.some(x=>x.risk==="CONFIRM");
  return {ok,status:ok?"PASS":"FAIL",allowed:n.actions.length,blocked:n.blockedCount,ownerSubmit:n.actions.some(x=>x.selector==="#submit")};
}
