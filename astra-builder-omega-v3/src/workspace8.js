const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const state=()=>window.__ASTRA_STATE__||{};
async function post(path,body){const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),raw=await r.text();let d;try{d=JSON.parse(raw)}catch{d={raw}};if(!r.ok&&r.status!==206)throw new Error(d.reason||raw.slice(0,300));return d}
function activate(id){document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".tabview").forEach(x=>x.classList.remove("active"));document.querySelector('[data-tab="'+id+'"]')?.classList.add("active");document.querySelector("#view-"+id)?.classList.add("active")}
function projectPayload(){const s=state();return{workspaceId:s.workspaceId||s.spec?.appName||"draft",request:document.querySelector("#idea")?.value||"",spec:s.spec||{},files:(s.files||[]).slice(0,120),evidence:(s.evidence||[]).slice(-120),mission:s.mission||null,conversation:(s.conversation||[]).slice(-60),githubToken:s.cfg?.githubToken||""}}
function init(){
 const tabs=document.querySelector(".tabs"),center=document.querySelector(".panel.center"),top=document.querySelector(".top-actions");if(!tabs||!center||!top)return;
 if(!document.querySelector('[data-tab="studio8"]')){const t=document.createElement("button");t.className="tab";t.dataset.tab="studio8";t.textContent="Agent Studio";tabs.appendChild(t);const v=document.createElement("div");v.className="tabview";v.id="view-studio8";v.innerHTML='<div class="benchmark-view" id="studio8View"></div>';center.appendChild(v);t.onclick=()=>{activate("studio8");renderStudio()}}
 if(!document.querySelector('[data-tab="claw8"]')){const t=document.createElement("button");t.className="tab";t.dataset.tab="claw8";t.textContent="Claw Ω";tabs.appendChild(t);const v=document.createElement("div");v.className="tabview";v.id="view-claw8";v.innerHTML='<div class="benchmark-view" id="claw8View"></div>';center.appendChild(v);t.onclick=()=>{activate("claw8");renderClaw()}}
 if(!document.querySelector("#brainSaveBtn")){const b=document.createElement("button");b.className="btn ghost";b.id="brainSaveBtn";b.textContent="Save SecondBrain";b.onclick=saveBrain;top.insertBefore(b,document.querySelector("#benchmarkBtn"))}
 renderStudio();renderClaw();
}
async function saveBrain(){
 const b=document.querySelector("#brainSaveBtn");if(b){b.disabled=true;b.textContent="Saving Brain…"}try{const d=await post("/api/brain/save",projectPayload());state().serverBrain=d;alert("SecondBrain Ω: "+d.status+" · "+d.storage)}catch(e){alert("SecondBrain Ω FAIL: "+e.message)}finally{if(b){b.disabled=false;b.textContent="Save SecondBrain"}}}
function renderStudio(){
 const r=document.querySelector("#studio8View");if(!r)return;r.innerHTML=
 '<div class="bench-grid"><div class="bench-card"><small>SECOND BRAIN</small><b>Ω2</b></div><div class="bench-card"><small>AGENT STUDIO</small><b>LIVE</b></div><div class="bench-card"><small>DEFAULT SAFETY</small><b>READ ONLY</b></div></div>'+
 '<div class="card"><small>CREATE AGENT / SKILL</small><textarea id="skillPrompt" style="width:100%;min-height:110px" placeholder="Ex. crée un agent SEO technique qui inspecte un projet et renvoie uniquement des problèmes prouvés"></textarea><div class="dialog-actions"><button class="btn" id="createSkillBtn">Create Skill Ω</button><button class="btn ghost" id="listSkillBtn">Refresh library</button></div></div>'+
 '<div id="skillResult" class="card"><p class="muted">Décris un agent. Il sera compilé par le modèle privé, normalisé et enregistré.</p></div><div id="skillLibrary" class="card"><p class="muted">Library not loaded.</p></div>';
 document.querySelector("#createSkillBtn").onclick=createSkill;document.querySelector("#listSkillBtn").onclick=listSkills;listSkills();
}
async function createSkill(){
 const q=document.querySelector("#skillPrompt").value.trim();if(!q)return;const r=document.querySelector("#skillResult");r.innerHTML="<p>Compiling with private model…</p>";
 try{const d=await post("/api/skill/create",{description:q,githubToken:state().cfg?.githubToken||""});r.innerHTML='<small>'+esc(d.status)+' · '+esc(d.storage)+'</small><h3>'+esc(d.skill?.name)+'</h3><p>'+esc(d.skill?.purpose)+'</p><pre style="white-space:pre-wrap">'+esc(d.skill?.instructions)+'</pre><button class="btn" id="runCreatedSkill">Run on current project</button>';document.querySelector("#runCreatedSkill").onclick=()=>runSkill(d.skill?.id);await listSkills()}catch(e){r.innerHTML='<p class="error">'+esc(e.message)+'</p>'}
}
async function listSkills(){
 const root=document.querySelector("#skillLibrary");if(!root)return;try{const d=await fetch("/api/skills").then(r=>r.json());root.innerHTML='<small>SKILL LIBRARY</small>'+((d.skills||[]).map(s=>'<div class="ev"><div><b>'+esc(s.value?.name||s.id)+'</b><small>'+esc(s.value?.purpose||"")+'</small></div><button class="btn tiny" data-skill="'+esc(s.id)+'">Run</button></div>').join("")||'<p class="muted">No saved skills.</p>');root.querySelectorAll("[data-skill]").forEach(b=>b.onclick=()=>runSkill(b.dataset.skill))}catch(e){root.innerHTML='<p class="error">'+esc(e.message)+'</p>'}
}
async function runSkill(id){
 const root=document.querySelector("#skillResult");root.innerHTML="<p>Running agent on current project…</p>";try{const d=await post("/api/skill/run",{id,...projectPayload()});root.innerHTML='<small>'+esc(d.status)+' · '+esc(d.route?.provider||"")+'</small><pre style="white-space:pre-wrap;max-height:480px;overflow:auto">'+esc(JSON.stringify(d.output,null,2))+'</pre>'}catch(e){root.innerHTML='<p class="error">'+esc(e.message)+'</p>'}
}
function renderClaw(){
 const r=document.querySelector("#claw8View");if(!r)return;r.innerHTML=
 '<div class="bench-grid"><div class="bench-card"><small>MODE</small><b>READ ONLY</b></div><div class="bench-card"><small>PRIVATE NET</small><b>BLOCKED</b></div><div class="bench-card"><small>MAX STEPS</small><b>4</b></div></div>'+
 '<div class="card"><small>ASTRA CLAW Ω · REAL HEADLESS BROWSER</small><label>URL<input id="clawUrl" value="https://example.com" style="width:100%"></label><label>Goal<textarea id="clawGoal" style="width:100%;min-height:90px">Inspecte cette page, résume ce qui est réellement visible et suis au maximum les liens utiles du même domaine.</textarea></label><div class="dialog-actions"><button class="btn" id="clawRunBtn">Run Claw Ω</button></div></div><div id="clawResult" class="card"><p class="muted">No browser run yet.</p></div>';
 document.querySelector("#clawRunBtn").onclick=runClaw;
}
async function runClaw(){
 const root=document.querySelector("#clawResult"),btn=document.querySelector("#clawRunBtn");btn.disabled=true;root.innerHTML="<p>Chromium + local agents running…</p>";
 try{const d=await post("/api/claw/run",{url:document.querySelector("#clawUrl").value.trim(),goal:document.querySelector("#clawGoal").value.trim(),maxSteps:3});root.innerHTML='<small>'+esc(d.status)+' · '+esc(d.mode)+'</small><p><b>Visited:</b> '+(d.visited||[]).map(v=>esc(v.url)).join(" → ")+'</p>'+(d.screenshotB64?'<img alt="ASTRA Claw browser screenshot" style="width:100%;max-height:520px;object-fit:contain;border-radius:12px" src="data:image/png;base64,'+d.screenshotB64+'">':"")+'<pre style="white-space:pre-wrap;max-height:520px;overflow:auto">'+esc(JSON.stringify({title:d.final?.title,headings:d.final?.headings,transcript:d.transcript,guards:d.guards},null,2))+'</pre>'}catch(e){root.innerHTML='<p class="error">'+esc(e.message)+'</p>'}finally{btn.disabled=false}
}
init();
