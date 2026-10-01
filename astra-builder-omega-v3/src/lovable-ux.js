import{chat,effectiveModel}from"./router.js";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let state=null,actions=null;
const ux={mode:"build",queue:[],attachments:[],selected:null,busy:false,activeDraft:localStorage.getItem("astra-active-draft")||""};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
function msg(role,content,meta=""){state.conversation=Array.isArray(state.conversation)?state.conversation:[];state.conversation.push({at:new Date().toISOString(),role,content,meta});renderChat()}
function renderChat(){
 const root=$("#chatTimeline");if(!root)return;const items=(state.conversation||[]).slice(-60);
 if(!items.length){root.innerHTML='<div class="welcome-card"><div class="welcome-orb">Ω</div><h2>What do you want to build?</h2><p>Start from an idea, then refine it by chatting. ASTRA handles UI, backend, data, auth, tests and deployment gates.</p></div>';return}
 root.innerHTML=items.map(x=>`<div class="chat-message ${x.role==="user"?"user":"assistant"}"><div class="bubble">${esc(x.content)}<div class="meta">${esc(x.meta||"")}</div></div></div>`).join("");root.scrollTop=root.scrollHeight
}
function renderQueue(){const root=$("#promptQueue");if(!root)return;root.classList.toggle("hidden",!ux.queue.length);root.innerHTML=ux.queue.map((q,i)=>`<div class="queue-item">#${i+1} · ${esc(q.text.slice(0,90))}</div>`).join("")}
function setMode(mode){ux.mode=mode;$("#modePlan")?.classList.toggle("active",mode==="plan");$("#modeBuild")?.classList.toggle("active",mode==="build");$("#idea").placeholder=mode==="plan"?"Discuss the plan before changing code…":"Ask ASTRA to build or change something…"}
async function attachmentContext(){const chunks=[];for(const a of ux.attachments){if(a.text)chunks.push("\n\nATTACHED FILE: "+a.name+"\n"+a.text.slice(0,120000))}return chunks.join("")}
async function doPlan(text){
 ux.busy=true;$("#lovableSendBtn").disabled=true;msg("user",text,"Plan mode");
 try{const model=effectiveModel(state.cfg,state.cfg.architect);const context=state.spec?("\nCURRENT SPEC:\n"+JSON.stringify(state.spec).slice(0,30000)):"";const out=await chat(state.cfg,model,"You are ASTRA Plan Mode. Do not change code. Clarify the product goal, propose a concise implementation plan, identify risks and ask at most one truly necessary question. If enough context exists, give an actionable plan immediately.",text+context+await attachmentContext());msg("assistant",out,"Plan · "+model)}
 catch(e){msg("assistant","Plan mode failed: "+String(e?.message||e),"UNVERIFIED")}
 finally{ux.busy=false;$("#lovableSendBtn").disabled=false}
}
async function saveActiveVersion(label="Autosave"){
 try{if(ux.activeDraft){await draftPut({...snapshot(),id:ux.activeDraft,name:(await draftGet(ux.activeDraft))?.name||"Draft",kind:"draft",updatedAt:new Date().toISOString(),label})}else{await draftPut({...snapshot(),id:"__main__",name:"Main project",kind:"main",updatedAt:new Date().toISOString(),label})}renderDrafts()}catch{}
}
async function doBuild(text){
 ux.busy=true;$("#lovableSendBtn").disabled=true;
 $("#idea").value=text;
 try{
  if(state.files?.length){$("#improveInput").value=text;await actions.improveCurrent()}
  else await actions.run();
  if(!(state.conversation||[]).some((x,i,a)=>i>a.length-3&&x.role==="assistant"))msg("assistant",(state.status==="FAIL"?"I hit a blocking issue. Open Evidence for the exact failure.":"Build cycle complete. Preview, code and evidence are updated."),"Build · "+state.status);
  await saveActiveVersion(state.files?.length?"Build update":"Build");
 }catch(e){msg("assistant","Build failed: "+String(e?.message||e),"FAIL")}
 finally{ux.busy=false;$("#lovableSendBtn").disabled=false;renderAllPanels();await drainQueue()}
}
async function sendPrompt(){
 const ta=$("#idea"),text=ta.value.trim();if(!text)return;
 const withAttachments=text+await attachmentContext();
 if(ux.busy||state.status==="RUNNING"){ux.queue.push({text:withAttachments,mode:ux.mode});ta.value="";renderQueue();return}
 ta.value="";
 if(ux.mode==="plan")await doPlan(withAttachments);else await doBuild(withAttachments)
}
async function drainQueue(){if(ux.busy||!ux.queue.length)return;const next=ux.queue.shift();renderQueue();if(next.mode==="plan")await doPlan(next.text);else await doBuild(next.text)}
function renderProjectPanels(){
 const files=state.files||[],data=files.filter(f=>/(schema|migration|prisma|\.sql$|database)/i.test(f.path)),tests=files.filter(f=>/(test|spec)\.(js|jsx|ts|tsx)$|\/tests?\//i.test(f.path));
 const dv=$("#dataView"),tv=$("#testsView");if(dv)dv.innerHTML=data.length?data.map(f=>`<article class="file-card"><b>${esc(f.path)}</b><small>${Math.round((f.content||"").length/1024*10)/10} KB</small><pre>${esc((f.content||"").slice(0,5000))}</pre></article>`).join(""):'<div class="empty-state">No database schema generated yet.</div>';
 if(tv)tv.innerHTML=tests.length?tests.map(f=>`<article class="file-card"><b>${esc(f.path)}</b><small>Generated test</small><pre>${esc((f.content||"").slice(0,5000))}</pre></article>`).join(""):'<div class="empty-state">No generated tests yet.</div>';
 $("#projectTitle").textContent=state.spec?.appName||"Untitled app"
}
function integrationCard(name,status,detail,prompt=""){return`<div class="integration-card"><div class="row"><div><b>${esc(name)}</b><small>${esc(detail)}</small></div><span class="integration-status">${esc(status)}</span></div>${prompt?`<button class="btn tiny wide" data-integration-prompt="${esc(prompt)}" style="margin-top:8px">Add with ASTRA</button>`:""}</div>`}
function renderIntegrations(){
 const all=(state.files||[]).map(f=>(f.path+"\n"+f.content)).join("\n").toLowerCase();const ready=state.capabilities?.deployBroker?"Ready":"Setup";
 const html=[
  integrationCard("GitHub",ready,state.cfg?.githubToken?"Session credential loaded":"Code ownership + sync via deploy broker"),
  integrationCard("Railway",ready,state.deployedUrl?"Published: "+state.deployedUrl:"Deployment + public health gate"),
  integrationCard("Database",/(schema|migration|prisma|create table)/.test(all)?"Generated":"Not added","Postgres / SQLite schema and migrations","Add a production-ready database with schema, migrations, seed data and repository layer."),
  integrationCard("Authentication",/(auth|session|login|signup)/.test(all)?"Generated":"Not added","Login, sessions and guards","Add secure authentication with signup, login, logout, session handling, protected routes and tests."),
  integrationCard("Stripe",/stripe/.test(all)?"Generated":"Available","Payments and subscriptions","Add Stripe checkout, subscriptions, webhook handling and entitlement checks. Keep secrets server-side."),
  integrationCard("Resend / Email",/(resend|smtp|email)/.test(all)?"Generated":"Available","Transactional email","Add transactional email for signup, password reset and important product notifications."),
  integrationCard("Automation / n8n",/n8n|webhook/.test(all)?"Generated":"Available","Webhooks and workflows","Add a secure webhook integration layer designed for n8n-compatible automations."),
  integrationCard("MCP / AI tools",/mcp|model context protocol/.test(all)?"Generated":"Available","Expose safe app actions to AI clients","Add an MCP server exposing the app's safe user actions with authentication and least privilege.")
 ].join("");$("#integrationsView").innerHTML=html;$$("[data-integration-prompt]").forEach(b=>b.onclick=()=>{setMode("build");$("#idea").value=b.dataset.integrationPrompt;$("#idea").focus()})
}
function switchTab(name){const t=document.querySelector(`.tab[data-tab="${name}"]`);if(t)t.click();$$("[data-go-tab]").forEach(b=>b.classList.toggle("active",b.dataset.goTab===name))}
function setupDevices(){$$(".device-btn").forEach(b=>b.onclick=()=>{$$(".device-btn").forEach(x=>x.classList.remove("active"));b.classList.add("active");const f=$("#preview"),d=b.dataset.device;f.style.width=d==="desktop"?"100%":d==="tablet"?"820px":"390px"})}
function setupInspector(){$$(".inspector-tab").forEach(b=>b.onclick=()=>{$$(".inspector-tab").forEach(x=>x.classList.remove("active"));$$(".inspector-view").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("#inspector-"+b.dataset.inspector).classList.add("active");document.querySelector(".lovable-shell").classList.toggle("show-advanced",b.dataset.inspector==="omega");document.querySelector(".lovable-shell").classList.add("inspector-open")})}
function rgbToHex(v){const m=String(v||"").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);return m?"#"+[m[1],m[2],m[3]].map(x=>(+x).toString(16).padStart(2,"0")).join(""):"#000000"}
function setupVisual(){
 const btn=$("#visualEditBtn"),frame=$("#preview");btn.onclick=()=>{const on=!btn.classList.contains("active");btn.classList.toggle("active",on);frame.contentWindow?.postMessage({type:"ASTRA_VISUAL_EDIT_MODE",enabled:on},"*");if(on){document.querySelector('.inspector-tab[data-inspector="edit"]')?.click()}};
 window.addEventListener("message",e=>{const d=e.data||{};if(d.type!=="ASTRA_VISUAL_SELECTED")return;ux.selected=d;$("#visualInspectorEmpty").classList.add("hidden");$("#visualInspector").classList.remove("hidden");$("#selectedElementMeta").textContent=(d.tag||"element")+" · "+(d.selector||"");$("#visualText").value=d.text||"";$("#visualColor").value=rgbToHex(d.style?.color);$("#visualBg").value=rgbToHex(d.style?.backgroundColor);$("#visualFontSize").value=d.style?.fontSize||"";$("#visualRadius").value=d.style?.borderRadius||"";$("#visualPadding").value=d.style?.padding||""});
 $("#applyVisualEditBtn").onclick=async()=>{if(!ux.selected)return;const patch={selector:ux.selected.selector,text:$("#visualText").value,style:{color:$("#visualColor").value,backgroundColor:$("#visualBg").value,fontSize:$("#visualFontSize").value,borderRadius:$("#visualRadius").value,padding:$("#visualPadding").value}};frame.contentWindow?.postMessage({type:"ASTRA_VISUAL_PATCH",...patch},"*");persistVisualPatch(patch);actions.renderFiles();actions.renderPreview();renderProjectPanels();await actions.persistWorkspace?.("Visual edit: "+patch.selector);await saveActiveVersion("Visual edit")}
}
function persistVisualPatch(patch){
 let vf=(state.files||[]).find(f=>f.path==="preview/astra-visual-edits.json"),edits=[];try{edits=JSON.parse(vf?.content||"[]")}catch{}const i=edits.findIndex(x=>x.selector===patch.selector);if(i>=0)edits[i]=patch;else edits.push(patch);
 const json=JSON.stringify(edits,null,2);if(vf)vf.content=json;else state.files.push({path:"preview/astra-visual-edits.json",content:json});
 let app=(state.files||[]).find(f=>f.path==="preview/app.js");if(!app){app={path:"preview/app.js",content:""};state.files.push(app)}
 app.content=app.content.replace(/\/\* ASTRA_VISUAL_EDITS_START \*\/[\s\S]*?\/\* ASTRA_VISUAL_EDITS_END \*\//g,"").trim();
 const lines=edits.map(x=>`try{const e=document.querySelector(${JSON.stringify(x.selector)});if(e){${typeof x.text==="string"?"e.textContent="+JSON.stringify(x.text)+";":""}Object.assign(e.style,${JSON.stringify(x.style||{})})}}catch{}`).join("");
 app.content+="\n/* ASTRA_VISUAL_EDITS_START */\nwindow.addEventListener('DOMContentLoaded',()=>{"+lines+"});\n/* ASTRA_VISUAL_EDITS_END */\n"
}
function setupShare(){$("#shareBtn").onclick=async()=>{const url=state.deployedUrl||location.href;try{await navigator.clipboard.writeText(url);$("#shareBtn").textContent="Copied";setTimeout(()=>$("#shareBtn").textContent="Share",1200)}catch{prompt("Share this URL",url)}}}
function setupAttachments(){$("#attachBtn").onclick=()=>$("#attachmentInput").click();$("#attachmentInput").onchange=async e=>{ux.attachments=[];for(const f of [...e.target.files].slice(0,6)){const a={name:f.name,size:f.size,text:""};if(f.size<=200000&&(/^(text\/|application\/(json|javascript|xml))/.test(f.type)||/\.(md|txt|json|js|ts|tsx|jsx|css|html|csv|sql)$/i.test(f.name))){a.text=await f.text()}ux.attachments.push(a)}$("#attachmentList").innerHTML=ux.attachments.map(a=>`<span class="attachment-pill">${esc(a.name)}${a.text?"":" · reference only"}</span>`).join("")}}
const DB_NAME="astra-lovable-drafts-v1",STORE="drafts";function draftDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:"id"});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function tx(mode,fn){const db=await draftDb();return new Promise((resolve,reject)=>{const t=db.transaction(STORE,mode),s=t.objectStore(STORE),r=fn(s);t.oncomplete=()=>resolve(r?.result);t.onerror=()=>reject(t.error)})}
const draftPut=v=>tx("readwrite",s=>s.put(v)),draftGet=id=>tx("readonly",s=>s.get(id)),draftDelete=id=>tx("readwrite",s=>s.delete(id)),draftAll=()=>new Promise(async(resolve,reject)=>{const db=await draftDb(),t=db.transaction(STORE,"readonly"),r=t.objectStore(STORE).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)});
function snapshot(){return{idea:$("#idea")?.value||"",spec:structuredClone(state.spec),files:(state.files||[]).map(x=>({...x})),evidence:(state.evidence||[]).map(x=>({...x})),bench:structuredClone(state.bench),deployPlan:structuredClone(state.deployPlan),deployedUrl:state.deployedUrl||"",conversation:structuredClone(state.conversation||[]),savedAt:new Date().toISOString()}}
function applySnapshot(s){state.spec=s.spec||null;state.files=s.files||[];state.evidence=s.evidence||[];state.bench=s.bench||null;state.deployPlan=s.deployPlan||null;state.deployedUrl=s.deployedUrl||"";state.conversation=s.conversation||[];state.selected=state.files[0]?.path||null;$("#idea").value=s.idea||"";actions.renderFiles();actions.renderSpec();actions.renderPreview();actions.renderEvidence();renderAllPanels();renderChat()}
async function renderDrafts(){const all=await draftAll(),root=$("#draftsView");const main=all.find(x=>x.id==="__main__"),drafts=all.filter(x=>x.kind==="draft").sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));root.innerHTML=`<div class="draft-card"><div class="row"><div><b>Main project</b><small>${esc(main?.updatedAt||"Current workspace")}</small></div><button class="btn tiny" data-draft-open="__main__">Open</button></div></div>`+drafts.map(d=>`<div class="draft-card"><div class="row"><div><b>${esc(d.name)}</b><small>${esc(d.updatedAt||d.createdAt)}</small></div><span class="integration-status">${ux.activeDraft===d.id?"ACTIVE":"DRAFT"}</span></div><div class="row" style="margin-top:8px"><button class="btn tiny" data-draft-open="${d.id}">Open</button><button class="btn tiny" data-draft-accept="${d.id}">Accept</button><button class="btn tiny" data-draft-delete="${d.id}">Delete</button></div></div>`).join("");root.querySelectorAll("[data-draft-open]").forEach(b=>b.onclick=()=>openDraft(b.dataset.draftOpen));root.querySelectorAll("[data-draft-accept]").forEach(b=>b.onclick=()=>acceptDraft(b.dataset.draftAccept));root.querySelectorAll("[data-draft-delete]").forEach(b=>b.onclick=async()=>{await draftDelete(b.dataset.draftDelete);if(ux.activeDraft===b.dataset.draftDelete){ux.activeDraft="";localStorage.removeItem("astra-active-draft")}renderDrafts()})}
async function newDraft(){if(!(await draftGet("__main__")))await draftPut({...snapshot(),id:"__main__",name:"Main project",kind:"main",updatedAt:new Date().toISOString()});const id=crypto.randomUUID(),name="Draft "+new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});await draftPut({...snapshot(),id,name,kind:"draft",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});ux.activeDraft=id;localStorage.setItem("astra-active-draft",id);renderDrafts()}
async function openDraft(id){await saveActiveVersion("Switch version");const d=await draftGet(id);if(!d)return;ux.activeDraft=id==="__main__"?"":id;if(ux.activeDraft)localStorage.setItem("astra-active-draft",ux.activeDraft);else localStorage.removeItem("astra-active-draft");applySnapshot(d);renderDrafts()}
async function acceptDraft(id){const d=await draftGet(id);if(!d)return;await draftPut({...d,id:"__main__",name:"Main project",kind:"main",updatedAt:new Date().toISOString(),label:"Accepted "+d.name});await draftDelete(id);ux.activeDraft="";localStorage.removeItem("astra-active-draft");applySnapshot(d);await actions.persistWorkspace?.("Accepted draft: "+d.name);renderDrafts()}
function renderAllPanels(){renderProjectPanels();renderIntegrations()}
function installPreviewBridge(){
 const frame=$("#preview");if(!frame)return;
 const bridge='<script data-astra-visual-bridge>(()=>{let edit=false,selected=null;const esc=s=>{try{return CSS.escape(s)}catch{return String(s).replace(/[^a-zA-Z0-9_-]/g,"_")}};function selector(el){if(!el||el===document.body)return"body";if(el.id)return"#"+esc(el.id);const parts=[];for(let n=el;n&&n!==document.body;n=n.parentElement){let p=n.tagName.toLowerCase();if(n.classList&&n.classList.length)p+="."+[...n.classList].slice(0,2).map(esc).join(".");const sib=n.parentElement?[...n.parentElement.children].filter(x=>x.tagName===n.tagName):[];if(sib.length>1)p+=":nth-of-type("+(sib.indexOf(n)+1)+")";parts.unshift(p)}return parts.join(" > ")}window.addEventListener("message",e=>{const d=e.data||{};if(d.type==="ASTRA_VISUAL_EDIT_MODE"){edit=!!d.enabled;document.documentElement.style.cursor=edit?"crosshair":""}if(d.type==="ASTRA_VISUAL_PATCH"&&d.selector){const el=document.querySelector(d.selector);if(el){if(typeof d.text==="string")el.textContent=d.text;Object.assign(el.style,d.style||{})}}});document.addEventListener("click",e=>{if(!edit)return;e.preventDefault();e.stopPropagation();if(selected)selected.style.outline="";selected=e.target;selected.style.outline="2px solid #7c3aed";selected.style.outlineOffset="2px";const cs=getComputedStyle(selected);parent.postMessage({type:"ASTRA_VISUAL_SELECTED",selector:selector(selected),tag:selected.tagName.toLowerCase(),text:(selected.textContent||"").trim().slice(0,1000),style:{color:cs.color,backgroundColor:cs.backgroundColor,fontSize:cs.fontSize,borderRadius:cs.borderRadius,padding:cs.padding}},"*")},true)})()<\\/script>';
 const augment=()=>{const h=frame.getAttribute("srcdoc")||"";if(!h||h.includes("data-astra-visual-bridge"))return;frame.setAttribute("srcdoc",/<\/body>/i.test(h)?h.replace(/<\/body>/i,bridge+"</body>"):h+bridge)};
 new MutationObserver(augment).observe(frame,{attributes:true,attributeFilter:["srcdoc"]});frame.addEventListener("load",()=>{if($("#visualEditBtn")?.classList.contains("active"))frame.contentWindow?.postMessage({type:"ASTRA_VISUAL_EDIT_MODE",enabled:true},"*")});augment()
}
function setup(){
 if(!state||!actions)return;renderChat();renderAllPanels();renderDrafts().catch(()=>{});
 $("#modePlan").onclick=()=>setMode("plan");$("#modeBuild").onclick=()=>setMode("build");$("#lovableSendBtn").onclick=sendPrompt;$("#idea").addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)){e.preventDefault();sendPrompt()}});
 $("#quickPromptBtn").onclick=()=>$("#quickPrompts").classList.toggle("hidden");$$("[data-preset]").forEach(b=>b.addEventListener("click",()=>{$("#quickPrompts").classList.add("hidden");$("#idea").focus()}));$$("[data-go-tab]").forEach(b=>b.onclick=()=>switchTab(b.dataset.goTab));$("#refreshPreviewBtn").onclick=()=>actions.renderPreview();$("#newDraftBtn").onclick=newDraft;
 setupDevices();setupInspector();installPreviewBridge();setupVisual();setupShare();setupAttachments();
 const observer=new MutationObserver(()=>{renderChat();renderAllPanels();const running=state.status==="RUNNING";$("#lovableSendBtn").disabled=ux.busy||running;if(!running&&!ux.busy)drainQueue()});observer.observe($("#globalStatus"),{subtree:true,childList:true,characterData:true,attributes:true});
 setInterval(()=>{renderProjectPanels();renderIntegrations()},3500)
}
function boot(){
 state=window.__ASTRA_STATE__||null;
 actions=window.__ASTRA_ACTIONS__||null;
 if(!state||!actions){setTimeout(boot,80);return}
 if(window.__ASTRA_LOVABLE_UX_READY__)return;
 window.__ASTRA_LOVABLE_UX_READY__=true;
 setup();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
