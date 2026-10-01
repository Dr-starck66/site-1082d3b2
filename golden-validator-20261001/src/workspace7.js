const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const state=()=>window.__ASTRA_STATE__||{};
const key=()=>`astra-workspace7-${state().workspaceId||"draft"}`;
let last=null,busy=false;

function payload(){
  const s=state(),idea=document.querySelector("#idea")?.value||"";
  return {
    request:idea,
    spec:s.spec||null,
    files:(s.files||[]).slice(0,60).map(f=>({path:f.path,content:String(f.content||"").slice(0,2500)})),
    evidence:(s.evidence||[]).slice(-100),
    mission:s.mission||null,
    conversation:(s.conversation||[]).slice(-30)
  };
}
function activate(){
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".tabview").forEach(x=>x.classList.remove("active"));
  document.querySelector('[data-tab="workspace7"]')?.classList.add("active");
  document.querySelector("#view-workspace7")?.classList.add("active");
}
function routeCard(r){
  if(!r)return "";
  return `<div class="ev"><div><b>${esc(r.role||r.model||"agent")}</b><small>${esc((r.provider||"")+" · "+(r.model||"")+" · "+(r.routeMode||""))}</small></div><span class="${String(r.status||"UNVERIFIED").toLowerCase()}">${esc(r.status||"UNVERIFIED")}</span></div>`;
}
function render(data=last){
  const root=document.querySelector("#workspace7View"); if(!root)return;
  if(!data){root.innerHTML='<p class="muted">SecondBrain Ω et Team Ω sont prêts. Lance “Team Ω” pour exécuter les agents privés.</p>';return}
  const m=data.memory||{},t=data.team||{},p=data.proof||{},c=data.cost||{},ai=data.ai||{};
  const facts=(m.facts||[]).slice(0,12).map(x=>`<div class="ev"><div><b>${esc(x.key)}</b><small>${esc(x.value)}</small></div><span class="pass">${esc(x.kind)}</span></div>`).join("");
  const tasks=(t.tasks||[]).map(x=>`<tr><td>${esc(x.id)}</td><td>${esc(x.role)}</td><td>${esc(x.title)}</td><td>${esc((x.deps||[]).join(","))}</td><td>${esc(x.status)}</td></tr>`).join("");
  const blockers=(p.blockers||[]).slice(0,10).map(x=>`<div class="ev"><div><b>${esc(x.name)}</b><small>${esc(x.detail)}</small></div><span class="${String(x.status).toLowerCase()}">${esc(x.status)}</span></div>`).join("");
  const synth=ai.integrator?.data||ai.integrator?.raw||ai.integrator||null;
  root.innerHTML=`
    <div class="bench-grid">
      <div class="bench-card"><small>SECOND BRAIN</small><b>${esc(m.status||"UNVERIFIED")}</b></div>
      <div class="bench-card"><small>TEAM TASKS</small><b>${(t.tasks||[]).length}</b></div>
      <div class="bench-card"><small>PROOF GRAPH</small><b>${esc(p.status||"UNVERIFIED")}</b></div>
      <div class="bench-card"><small>API CREDIT METER</small><b>${c.externalApiCredits===0?"0":esc(c.status||"UNVERIFIED")}</b></div>
    </div>
    <div class="card"><small>SECOND BRAIN Ω · ${esc((m.digest||"").slice(0,16))}</small>${facts||'<p class="muted">No project memory yet.</p>'}</div>
    <div class="card"><small>TEAM Ω TASK BOARD</small><table class="bench-table"><tr><th>ID</th><th>Agent</th><th>Mission</th><th>Deps</th><th>Status</th></tr>${tasks}</table></div>
    <div class="card"><small>PROOF GRAPH · blockers ${(p.blockers||[]).length} · contradictions ${(p.contradictions||[]).length}</small>${blockers||'<p class="muted">No blocking evidence in the current graph.</p>'}</div>
    <div class="card"><small>COST LEDGER</small><p><b>${esc(c.status||"UNVERIFIED")}</b> · ${esc(c.note||"")}</p></div>
    <div class="card"><small>LIVE TEAM ROUTES</small>${routeCard(ai.operator)}${routeCard(ai.skeptic)}${routeCard(ai.integrator)}</div>
    <div class="card"><small>CHIEF OF STAFF SYNTHESIS</small><pre style="white-space:pre-wrap;max-height:420px;overflow:auto">${esc(synth?JSON.stringify(synth,null,2):"Plan compiled; no live agent execution yet.")}</pre></div>
    <div class="dialog-actions"><button class="btn ghost" id="w7Refresh">Refresh plan</button><button class="btn" id="w7Run">Run Team Ω</button></div>`;
  document.querySelector("#w7Refresh")?.addEventListener("click",()=>refresh(false));
  document.querySelector("#w7Run")?.addEventListener("click",()=>refresh(true));
}
async function refresh(execute=false){
  if(busy)return;busy=true;
  const button=document.querySelector("#teamOmegaBtn"); if(button){button.disabled=true;button.textContent=execute?"Team Ω running…":"Team Ω";}
  try{
    const r=await fetch("/api/team_run",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...payload(),execute})});
    const data=await r.json();
    last=data;state().workspace7=data;
    try{localStorage.setItem(key(),JSON.stringify(data))}catch{}
    render(data);window.dispatchEvent(new CustomEvent("astra:workspace7",{detail:data}));
  }catch(e){
    last={status:"FAIL",memory:{status:"UNVERIFIED"},team:{tasks:[]},proof:{status:"UNVERIFIED",blockers:[]},cost:{status:"UNVERIFIED",note:String(e)},ai:{}};
    render(last);
  }finally{busy=false;if(button){button.disabled=false;button.textContent="Team Ω"}}
}
function init(){
  const tabs=document.querySelector(".tabs"),center=document.querySelector(".panel.center"),top=document.querySelector(".top-actions"); if(!tabs||!center||!top)return;
  if(!document.querySelector('[data-tab="workspace7"]')){
    const tab=document.createElement("button");tab.className="tab";tab.dataset.tab="workspace7";tab.textContent="Team Ω";tabs.appendChild(tab);
    const view=document.createElement("div");view.className="tabview";view.id="view-workspace7";view.innerHTML='<div class="benchmark-view" id="workspace7View"></div>';center.appendChild(view);
    tab.addEventListener("click",()=>{activate();render()});
  }
  if(!document.querySelector("#teamOmegaBtn")){
    const b=document.createElement("button");b.className="btn ghost";b.id="teamOmegaBtn";b.textContent="Team Ω";b.addEventListener("click",()=>{activate();refresh(true)});top.insertBefore(b,document.querySelector("#benchmarkBtn"));
  }
  try{last=JSON.parse(localStorage.getItem(key())||"null")}catch{}
  render(last);
  window.__ASTRA_WORKSPACE7__={refresh,activate};
}
init();
