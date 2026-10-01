const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
let currentPlan=null;

async function post(path,body){
  const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const t=await r.text();let d;try{d=JSON.parse(t)}catch{d={raw:t}};
  if(!r.ok&&r.status!==206)throw new Error(d.reason||t.slice(0,400));
  return d;
}
function savedDomains(){
  try{return localStorage.getItem("astra-owner-domains")||location.hostname}catch{return location.hostname}
}
function persistDomains(v){
  try{localStorage.setItem("astra-owner-domains",v)}catch{}
}
function render(){
  const root=document.querySelector("#claw8View");
  if(!root||document.querySelector("#ownerModeCard"))return;
  const card=document.createElement("div");
  card.className="card";card.id="ownerModeCard";
  card.innerHTML=
    '<small>OWNER MODE Ω · PERSONAL TOOL</small>'+
    '<p>Pour les domaines que tu déclares comme contrôlés, Claw peut remplir, sélectionner, cocher, cliquer et soumettre des formulaires après validation du plan exact.</p>'+
    '<label class="check"><input id="ownerModeEnabled" type="checkbox" checked> Owner Mode activé</label>'+
    '<label>Domaines contrôlés (séparés par virgule)<input id="ownerDomains" style="width:100%" value="'+esc(savedDomains())+'"></label>'+
    '<div class="dialog-actions"><button class="btn" id="ownerPlanBtn">Plan actions Ω</button><button class="btn ghost" id="ownerCurrentDomainBtn">+ domaine courant</button></div>'+
    '<div id="ownerPlanResult"><p class="muted">Aucun plan d’action.</p></div>';
  root.appendChild(card);
  document.querySelector("#ownerDomains").addEventListener("change",e=>persistDomains(e.target.value));
  document.querySelector("#ownerCurrentDomainBtn").onclick=()=>{
    const el=document.querySelector("#ownerDomains"),parts=el.value.split(/[\s,;]+/).filter(Boolean);
    if(!parts.includes(location.hostname))parts.push(location.hostname);
    el.value=parts.join(", ");persistDomains(el.value);
  };
  document.querySelector("#ownerPlanBtn").onclick=plan;
}
async function plan(){
  const result=document.querySelector("#ownerPlanResult"),btn=document.querySelector("#ownerPlanBtn");
  btn.disabled=true;result.innerHTML="<p>Inspection DOM + plan agent privé…</p>";
  try{
    const ownerDomains=document.querySelector("#ownerDomains").value.split(/[\s,;]+/).filter(Boolean);
    persistDomains(document.querySelector("#ownerDomains").value);
    const d=await post("/api/claw/action_plan",{
      url:document.querySelector("#clawUrl").value.trim(),
      goal:document.querySelector("#clawGoal").value.trim(),
      ownerMode:document.querySelector("#ownerModeEnabled").checked,
      ownerDomains
    });
    currentPlan=d;
    result.innerHTML=
      '<small>'+esc(d.status)+' · '+esc(d.mode)+' · expires '+esc(d.expiresAt||"")+'</small>'+
      '<p><b>'+esc(d.summary||"Plan")+'</b></p>'+
      (d.screenshotB64?'<img alt="Owner Mode planning screenshot" style="width:100%;max-height:440px;object-fit:contain;border-radius:12px" src="data:image/png;base64,'+d.screenshotB64+'">':"")+
      '<pre style="white-space:pre-wrap;max-height:380px;overflow:auto">'+esc(JSON.stringify(d.actions||[],null,2))+'</pre>'+
      (d.actions?.length?'<button class="btn" id="ownerApproveBtn">Approve & execute once</button>':'<p class="muted">Aucune action exécutable proposée.</p>');
    const approve=document.querySelector("#ownerApproveBtn");if(approve)approve.onclick=execute;
  }catch(e){result.innerHTML='<p class="error">'+esc(e.message)+'</p>'}
  finally{btn.disabled=false}
}
async function execute(){
  const result=document.querySelector("#ownerPlanResult");
  if(!currentPlan?.planId)return;
  result.innerHTML="<p>Exécution du plan approuvé…</p>";
  try{
    const d=await post("/api/claw/action_execute",{planId:currentPlan.planId,approved:true});
    result.innerHTML=
      '<small>'+esc(d.status)+' · '+esc(d.mode)+'</small>'+
      '<p><b>'+esc(d.final?.title||"")+'</b></p>'+
      (d.screenshotB64?'<img alt="Owner Mode execution screenshot" style="width:100%;max-height:440px;object-fit:contain;border-radius:12px" src="data:image/png;base64,'+d.screenshotB64+'">':"")+
      '<pre style="white-space:pre-wrap;max-height:420px;overflow:auto">'+esc(JSON.stringify({trace:d.trace,final:d.final,guards:d.guards},null,2))+'</pre>';
    currentPlan=null;
  }catch(e){result.innerHTML='<p class="error">'+esc(e.message)+'</p>'}
}
render();
