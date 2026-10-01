import{chat}from"./router.js";import{prompts}from"./prompts.js";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],state=()=>window.__ASTRA_STATE__||{};
let mode="build",attachments=[],visualOn=false,lastVisual=null,lastConversationKey="";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
function toast(msg){let t=$("#uxToast");if(!t){t=document.createElement("div");t.id="uxToast";t.className="ux-toast";document.body.appendChild(t)}t.textContent=msg;t.classList.add("show");clearTimeout(t._x);t._x=setTimeout(()=>t.classList.remove("show"),2600)}
function statusClass(x){x=String(x||"UNVERIFIED").toLowerCase();return["pass","partial","fail"].includes(x)?x:""}
function activateCoreTab(name){const t=document.querySelector('[data-tab="'+name+'"]');if(t)t.click()}
function currentName(){return state().spec?.appName||"Untitled app"}
function updateHeader(){const n=$("#uxProjectTitle");if(n)n.textContent=currentName();const st=$("#globalStatus")?.textContent||state().status||"UNVERIFIED";const c=$("#uxChatState");if(c)c.textContent=st}
function renderMessages(force=false){
 const conv=state().conversation||[],key=conv.map(x=>x.at+"|"+x.role+"|"+x.content).join("~")+"|"+(state().status||"");
 if(!force&&key===lastConversationKey)return;lastConversationKey=key;
 const root=$("#uxMessages");if(!root)return;
 const rows=[];
 if(!conv.length)rows.push('<div class="ux-message assistant"><b>ASTRA</b>Décris ce que tu veux construire. Tu peux ensuite continuer à demander des modifications comme dans une conversation.</div>');
 for(const m of conv.slice(-40)){const role=m.role==="user"?"user":"assistant";rows.push('<div class="ux-message '+role+'">'+(role==="assistant"?'<b>ASTRA</b>':"")+esc(m.content||"")+"</div>")}
 const running=(state().status==="RUNNING"||$("#globalStatus")?.textContent==="RUNNING");if(running)rows.push('<div class="ux-message system">ASTRA travaille sur le projet…</div>');
 root.innerHTML=rows.join("");root.scrollTop=root.scrollHeight;updateHeader();
}
function setMode(next){mode=next;$$("[data-ux-mode]").forEach(b=>b.classList.toggle("active",b.dataset.uxMode===mode));$("#uxSend").textContent=mode==="plan"?"Plan":"Build"}
async function planOnly(prompt){
 const s=state();if(!s.cfg)throw new Error("Configuration modèle indisponible");
 $("#uxSend").disabled=true;state().conversation=state().conversation||[];state().conversation.push({at:new Date().toISOString(),role:"user",content:prompt});renderMessages(true);
 try{
  const raw=await chat(s.cfg,s.cfg.architect,prompts.architect,prompt);let clean=String(raw).trim().replace(/^\`\`\`(?:json)?/i,"").replace(/\`\`\`$/,"").trim(),spec;
  try{spec=JSON.parse(clean)}catch{const a=clean.indexOf("{"),b=clean.lastIndexOf("}");if(a<0||b<a)throw new Error("Le plan n'est pas un JSON exploitable");spec=JSON.parse(clean.slice(a,b+1))}
  s.spec=spec;$("#specViewer").textContent=JSON.stringify(spec,null,2);s.conversation.push({at:new Date().toISOString(),role:"assistant",content:"Plan prêt pour "+(spec.appName||"l’application")+" · "+(spec.features?.length||0)+" fonctionnalités · "+(spec.acceptance?.length||0)+" critères d’acceptation."});renderMessages(true);updateHeader();toast("Plan prêt — aucun code modifié");
 }finally{$("#uxSend").disabled=false}
}
function attachmentContext(){
 if(!attachments.length)return"";return"\n\nATTACHMENTS:\n"+attachments.map(a=>a.kind==="text"?"FILE "+a.name+"\n"+a.text.slice(0,12000):"IMAGE "+a.name+" (visual input attached; image understanding is UNVERIFIED in this build)").join("\n\n");
}
async function send(){
 const input=$("#uxPrompt"),q=input.value.trim();if(!q)return;const full=q+attachmentContext();input.value="";
 if(mode==="plan"){try{await planOnly(full)}catch(e){toast("Plan FAIL: "+(e.message||e));state().conversation.push({at:new Date().toISOString(),role:"assistant",content:"Plan impossible : "+(e.message||e)});renderMessages(true)}return}
 if(state().files?.length){
   const imp=$("#improveInput");if(imp)imp.value=full;const b=$("#applyImproveBtn");if(b){state().conversation=state().conversation||[];b.click();toast("Modification envoyée à ASTRA Ω")}else toast("Improve Ω indisponible");
 }else{
   const idea=$("#idea"),run=$("#runBtn");if(idea)idea.value=full;if(run){run.click();toast("Construction lancée")}
 }
 attachments=[];renderAttachments();
}
function renderAttachments(){const r=$("#uxAttachments");if(!r)return;r.innerHTML=attachments.map((a,i)=>'<span class="ux-attachment" title="'+esc(a.name)+'">'+esc(a.name)+' <button data-rm="'+i+'" style="border:0;background:transparent;cursor:pointer">×</button></span>').join("");r.querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{attachments.splice(Number(b.dataset.rm),1);renderAttachments()})}
async function addFiles(list){for(const file of [...list].slice(0,6)){if(file.size>1500000){toast(file.name+" trop volumineux");continue}if(file.type.startsWith("image/")){const dataUrl=await new Promise((res,rej)=>{const fr=new FileReader;fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(file)});attachments.push({kind:"image",name:file.name,dataUrl})}else{attachments.push({kind:"text",name:file.name,text:await file.text()})}}renderAttachments()}
function setViewport(v){const f=$("#preview");if(!f)return;f.classList.toggle("ux-mobile",v==="mobile");f.classList.toggle("ux-tablet",v==="tablet");$$("[data-viewport]").forEach(b=>b.classList.toggle("active",b.dataset.viewport===v))}
function openDrawer(kind){document.body.classList.add("ux-drawer-open");const title=$("#uxDrawerTitle"),body=$("#uxDrawerBody");if(!title||!body)return;const s=state(),files=s.files||[],e=s.evidence||[];
 const fileRows=(arr)=>arr.length?arr.map(f=>'<div class="ux-row"><div><b>'+esc(f.path)+'</b><small>'+String((f.content||"").length)+' chars</small></div></div>').join(""):'<p>Aucun fichier correspondant.</p>';
 if(kind==="code"){title.textContent="Code";body.innerHTML='<p>Code réel du projet, exportable et synchronisable GitHub.</p><div class="ux-file-list">'+fileRows(files)+'</div>'}
 else if(kind==="data"){const arr=files.filter(f=>/(database|schema|migration|prisma|\.sql$)/i.test(f.path));title.textContent="Database";body.innerHTML='<span class="ux-chip '+(arr.length?"pass":"partial")+'">'+(arr.length?"CONNECTED IN PROJECT":"NOT GENERATED")+'</span><h3>Schema & migrations</h3><div>'+fileRows(arr)+'</div>'}
 else if(kind==="auth"){const arr=files.filter(f=>/(auth|session|login|oauth|security)/i.test(f.path+" "+f.content));title.textContent="Authentication";body.innerHTML='<span class="ux-chip '+(arr.length?"pass":"partial")+'">'+(arr.length?"AUTH ARTIFACTS":"NOT GENERATED")+'</span><h3>Auth files</h3><div>'+fileRows(arr)+'</div>'}
 else if(kind==="integrations"){title.textContent="Integrations";const cfg=s.cfg||{};body.innerHTML='<div class="ux-status-list">'+
 row("GitHub",cfg.githubToken?"PASS":"UNVERIFIED","Two-way project workflow available through the connected repo tools")+
 row("Railway",cfg.railwayToken?"PASS":"UNVERIFIED","Publish broker")+
 row("Payments",files.some(f=>/stripe|paddle/i.test(f.path+" "+f.content))?"PASS":"UNVERIFIED","Generated when requested")+
 row("MCP / external tools",files.some(f=>/mcp|integration|webhook/i.test(f.path+" "+f.content))?"PARTIAL":"UNVERIFIED","Connector contracts when present")+
 row("Image-to-build input","UNVERIFIED","Image attachments can be staged; vision reasoning is not yet proven")+'</div><button class="ux-btn" id="uxOpenSettings">Manage connections</button>';$("#uxOpenSettings").onclick=()=>$("#settingsBtn")?.click()}
 else if(kind==="versions"){title.textContent="Versions";const h=s.history||[];body.innerHTML='<p>Snapshots et checkpoints du projet.</p><div class="ux-version-list">'+(h.length?h.slice().reverse().map(v=>'<div class="ux-row"><div><b>'+esc(v.message||"Snapshot")+'</b><small>'+esc(v.at||"")+' · '+esc(v.status||"UNVERIFIED")+' · '+(v.files||0)+' files</small></div></div>').join(""):'<p>Aucun snapshot.</p>')+'</div><button class="ux-btn" id="uxOpenVault">Open Memory Vault</button>';$("#uxOpenVault").onclick=()=>activateCoreTab("vault9")}
 else if(kind==="tests"){title.textContent="Tests";const a=e.filter(x=>/(test|sandbox|health|validate|security|runtime|build)/i.test(x.name||""));body.innerHTML='<div class="ux-status-list">'+(a.length?a.slice(-80).map(x=>row(x.name,x.status,x.detail)).join(""):"<p>Aucun test exécuté.</p>")+'</div>'}
 else{title.textContent="Ω Evidence";body.innerHTML='<div class="ux-status-list">'+(e.length?e.slice(-100).map(x=>row(x.name,x.status,x.detail)).join(""):"<p>Aucune preuve.</p>")+'</div>'}
}
function row(name,status,detail){return'<div class="ux-row"><div><b>'+esc(name)+'</b><small>'+esc(detail||"")+'</small></div><span class="ux-chip '+statusClass(status)+'">'+esc(status||"UNVERIFIED")+'</span></div>'}
function toggleAdvanced(){
 const advanced=document.body.classList.contains("ux-advanced");document.body.classList.toggle("ux-advanced",!advanced);document.body.classList.toggle("ux-simple",advanced);document.body.classList.remove("ux-drawer-open");$("#uxAdvanced").textContent=advanced?"Ω Advanced":"Simple mode";toast(advanced?"Simple mode":"Ω Advanced mode")
}
function visualBridgeDoc(src){
 const bridge='<script>(function(){function path(el){var a=[];while(el&&el!==document.body){var p=el.parentElement;if(!p)break;var same=[...p.children].filter(x=>x.tagName===el.tagName),n=same.indexOf(el)+1;a.unshift(el.tagName.toLowerCase()+":nth-of-type("+n+")");el=p}return"body>"+a.join(">")}document.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();var el=e.target,id="e"+Date.now();el.setAttribute("data-astra-edit",id);parent.postMessage({type:"astra-visual-select",id:id,selector:path(el),tag:el.tagName,text:(el.innerText||"").slice(0,2000),color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor},"*")},true);addEventListener("message",function(e){var d=e.data||{};if(d.type!=="astra-visual-apply")return;var el=document.querySelector("[data-astra-edit=\""+d.id+"\"]");if(!el)return;if(typeof d.text==="string")el.innerText=d.text;if(d.color)el.style.color=d.color;if(d.background)el.style.backgroundColor=d.background})})();<\/script>';
 return String(src||"").replace(/<\/body>/i,bridge+"</body>");
}
function toggleVisual(){
 const f=$("#preview");if(!f||!f.srcdoc){toast("Génère d’abord une preview");return}visualOn=!visualOn;$("#uxVisual").classList.toggle("active",visualOn);if(visualOn){f.dataset.cleanSrcdoc=f.srcdoc;f.srcdoc=visualBridgeDoc(f.srcdoc);toast("Visual edit ON — clique un élément dans la preview")}else{f.srcdoc=f.dataset.cleanSrcdoc||f.srcdoc;$("#uxVisualInspector")?.classList.remove("open");toast("Visual edit OFF")}
}
function applyVisual(){
 if(!lastVisual)return;const s=state(),newText=$("#uxVisualText").value,color=$("#uxVisualColor").value.trim(),bg=$("#uxVisualBg").value.trim(),html=s.files?.find(f=>f.path==="preview/index.html"),css=s.files?.find(f=>f.path==="preview/styles.css");
 if(html&&lastVisual.text&&newText!==lastVisual.text)html.content=html.content.replace(lastVisual.text,newText);
 if(css&&(color||bg)){css.content+="\n/* Visual edit */\n"+lastVisual.selector+"{"+(color?"color:"+color+";":"")+(bg?"background-color:"+bg+";":"")+"}\n"}
 $("#preview")?.contentWindow?.postMessage({type:"astra-visual-apply",id:lastVisual.id,text:newText,color,background:bg},"*");$("#uxVisualInspector").classList.remove("open");toast("Visual edit appliqué au projet")
}
function init(){
 document.body.classList.add("ux-simple");
 const top=$(".topbar");if(top&&!$("#uxTopActions")){const a=document.createElement("div");a.id="uxTopActions";a.className="ux-top-actions";a.innerHTML='<span class="ux-project-title" id="uxProjectTitle">Untitled app</span><button class="ux-btn ux-hide-mobile" id="uxProjects">Projects</button><button class="ux-btn ux-hide-mobile" id="uxGithub">GitHub</button><button class="ux-btn" id="uxAdvanced">Ω Advanced</button><button class="ux-btn accent" id="uxPublish">Publish</button>';top.appendChild(a)}
 const intent=$(".intent");if(intent&&!$("#uxChat")){const x=document.createElement("div");x.id="uxChat";x.className="ux-chat";x.innerHTML='<div class="ux-chat-head"><div class="ux-mode"><button class="active" data-ux-mode="build">Build</button><button data-ux-mode="plan">Plan</button></div><span class="ux-chat-state" id="uxChatState">UNVERIFIED</span></div><div class="ux-messages" id="uxMessages"></div><div class="ux-composer-wrap"><div class="ux-attachments" id="uxAttachments"></div><div class="ux-composer"><textarea id="uxPrompt" placeholder="Ask ASTRA to build or change anything…"></textarea><div class="ux-compose-actions"><div class="left"><button class="ux-icon-btn" id="uxAttach" title="Attach file">＋</button><input id="uxFileInput" type="file" multiple accept="image/*,.txt,.md,.json,.csv" hidden></div><button class="ux-send" id="uxSend">Build</button></div></div></div>';intent.prepend(x)}
 const center=$(".center");if(center&&!$("#uxPreviewbar")){const b=document.createElement("div");b.id="uxPreviewbar";b.className="ux-previewbar";b.innerHTML='<div class="left"><div class="ux-segment"><button class="active" data-viewport="desktop">Desktop</button><button data-viewport="tablet">Tablet</button><button data-viewport="mobile">Mobile</button></div><div class="ux-url" id="uxUrl">Preview</div></div><div class="right"><button class="ux-btn" id="uxVisual">Visual edit</button><button class="ux-btn" id="uxTools">Tools</button><button class="ux-btn" id="uxCode">Code</button></div>';center.prepend(b)}
 const ws=$(".workspace");if(ws&&!$("#uxDrawer")){const d=document.createElement("aside");d.id="uxDrawer";d.className="ux-drawer";d.innerHTML='<div class="ux-drawer-head"><b id="uxDrawerTitle">Tools</b><button class="ux-btn" id="uxDrawerClose">×</button></div><div class="ux-drawer-body" id="uxDrawerBody"><div class="ux-tool-list"><button class="ux-tool" data-tool="code"><b>Code</b><small>Files & source</small></button><button class="ux-tool" data-tool="data"><b>Database</b><small>Schema & migrations</small></button><button class="ux-tool" data-tool="auth"><b>Auth</b><small>Users & sessions</small></button><button class="ux-tool" data-tool="integrations"><b>Integrations</b><small>GitHub, deploy, APIs</small></button><button class="ux-tool" data-tool="versions"><b>Versions</b><small>History & restore</small></button><button class="ux-tool" data-tool="tests"><b>Tests</b><small>Browser, sandbox, health</small></button><button class="ux-tool" data-tool="evidence"><b>Ω Evidence</b><small>Advanced proof ledger</small></button></div></div>';ws.appendChild(d)}
 if(!$("#uxVisualInspector")){const v=document.createElement("div");v.id="uxVisualInspector";v.className="ux-visual-inspector";v.innerHTML='<b>Visual edit</b><label>Text<textarea id="uxVisualText"></textarea></label><label>Text color<input id="uxVisualColor" placeholder="e.g. #111827"></label><label>Background<input id="uxVisualBg" placeholder="e.g. #ffffff"></label><div class="actions"><button class="ux-btn" id="uxVisualCancel">Cancel</button><button class="ux-btn accent" id="uxVisualApply">Apply</button></div>';document.body.appendChild(v)}
 $$("[data-ux-mode]").forEach(b=>b.onclick=()=>setMode(b.dataset.uxMode));$("#uxSend").onclick=send;$("#uxPrompt").addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)){e.preventDefault();send()}});$("#uxAttach").onclick=()=>$("#uxFileInput").click();$("#uxFileInput").onchange=e=>addFiles(e.target.files);
 $$("[data-viewport]").forEach(b=>b.onclick=()=>setViewport(b.dataset.viewport));$("#uxVisual").onclick=toggleVisual;$("#uxTools").onclick=()=>openDrawer("integrations");$("#uxCode").onclick=()=>openDrawer("code");$("#uxDrawerClose").onclick=()=>document.body.classList.remove("ux-drawer-open");$("#uxAdvanced").onclick=toggleAdvanced;
 $("#uxProjects").onclick=()=>$("#projectsBtn")?.click();$("#uxGithub").onclick=()=>$("#settingsBtn")?.click();$("#uxPublish").onclick=()=>{const b=$("#deployBtn");if(!state().files?.length)return toast("Construis d’abord une application");if(b&&!b.disabled)b.click();else{$("#settingsBtn")?.click();toast("Connecte GitHub/Railway ou termine les gates avant publication")}};
 $("#uxVisualApply").onclick=applyVisual;$("#uxVisualCancel").onclick=()=>$("#uxVisualInspector").classList.remove("open");
 $("#uxDrawerBody").addEventListener("click",e=>{const b=e.target.closest("[data-tool]");if(b)openDrawer(b.dataset.tool)});
 addEventListener("message",e=>{const d=e.data||{};if(d.type!=="astra-visual-select")return;lastVisual=d;$("#uxVisualText").value=d.text||"";$("#uxVisualColor").value="";$("#uxVisualBg").value="";$("#uxVisualInspector").classList.add("open")});
 const observer=new MutationObserver(()=>{renderMessages();updateHeader();const url=$("#uxUrl");if(url)url.textContent=state().deployedUrl||"Preview · "+currentName()});const gs=$("#globalStatus");if(gs)observer.observe(gs,{subtree:true,childList:true,attributes:true});
 setInterval(()=>{renderMessages();updateHeader()},1200);renderMessages(true);updateHeader();setViewport("desktop")
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>setTimeout(init,0));else setTimeout(init,0);
