const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

function activate(){
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".tabview").forEach(x=>x.classList.remove("active"));
  document.querySelector('[data-tab="vault9"]')?.classList.add("active");
  document.querySelector("#view-vault9")?.classList.add("active");
}

async function renderVault(){
  const root=document.querySelector("#vault9View");
  if(!root||!window.__ASTRA_MEMORY_VAULT__)return;
  const rows=await window.__ASTRA_MEMORY_VAULT__.list();
  root.innerHTML=
    '<div class="bench-grid">'+
      '<div class="bench-card"><small>MEMORY</small><b>INDEXEDDB</b></div>'+
      '<div class="bench-card"><small>AUTOSAVE</small><b>15s</b></div>'+
      '<div class="bench-card"><small>SECRETS STORED</small><b>0</b></div>'+
    '</div>'+
    '<div class="card"><small>MEMORY VAULT Ω3</small><p>Workspace persistant sur cet appareil : spec, fichiers, preuves, mission, conversation et assets. Aucun token/API key n’est enregistré dans ce coffre.</p><div class="dialog-actions"><button class="btn" id="vaultSaveNow">Save checkpoint</button><button class="btn ghost" id="vaultRefresh">Refresh</button></div></div>'+
    '<div class="card" id="vaultRows">'+
      (rows.map(r=>
        '<div class="ev"><div><b>'+esc(r.id)+'</b><small>'+esc(r.updatedAt)+' · '+(r.files?.length||0)+' files · '+esc(r.status||"UNVERIFIED")+'</small></div><div><button class="btn tiny" data-restore="'+esc(r.id)+'">Restore</button> <button class="btn tiny ghost" data-delete="'+esc(r.id)+'">Delete</button></div></div>'
      ).join("")||'<p class="muted">No checkpoint yet.</p>')+
    '</div>';

  document.querySelector("#vaultSaveNow").onclick=async()=>{await window.__ASTRA_MEMORY_VAULT__.save();renderVault()};
  document.querySelector("#vaultRefresh").onclick=renderVault;
  root.querySelectorAll("[data-restore]").forEach(b=>b.onclick=async()=>{await window.__ASTRA_MEMORY_VAULT__.restore(b.dataset.restore);renderVault()});
  root.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{await window.__ASTRA_MEMORY_VAULT__.remove(b.dataset.delete);renderVault()});
}

function init(){
  const tabs=document.querySelector(".tabs"),center=document.querySelector(".panel.center");
  if(!tabs||!center||document.querySelector('[data-tab="vault9"]'))return;
  const tab=document.createElement("button");
  tab.className="tab";
  tab.dataset.tab="vault9";
  tab.textContent="Vault Ω";
  tabs.appendChild(tab);
  const view=document.createElement("div");
  view.className="tabview";
  view.id="view-vault9";
  view.innerHTML='<div class="benchmark-view" id="vault9View"></div>';
  center.appendChild(view);
  tab.onclick=()=>{activate();renderVault()};
}

init();