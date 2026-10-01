const DB_NAME="astra-memory-vault-v3";
const STORE="workspaces";
let dbPromise=null;
let autosaveTimer=null;

function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:"id"});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return dbPromise;
}

async function put(row){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put(row);
    tx.oncomplete=()=>resolve(row);
    tx.onerror=()=>reject(tx.error);
  });
}

async function list(){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readonly");
    const req=tx.objectStore(STORE).getAll();
    req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,50));
    req.onerror=()=>reject(req.error);
  });
}

async function get(id){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readonly");
    const req=tx.objectStore(STORE).get(id);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error);
  });
}

async function remove(id){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error);
  });
}

function safeId(v){
  return String(v||"draft").toLowerCase().replace(/[^a-z0-9_.-]+/g,"-").replace(/^-|-$/g,"").slice(0,80)||"draft";
}

function snapshot(){
  const s=window.__ASTRA_STATE__||{};
  const id=safeId(s.workspaceId||s.spec?.appName||"draft");
  return {
    id,
    version:"MEMORY-VAULT-OMEGA-3",
    updatedAt:new Date().toISOString(),
    idea:document.querySelector("#idea")?.value||"",
    workspaceId:s.workspaceId||id,
    status:s.status||"UNVERIFIED",
    spec:s.spec||null,
    files:(s.files||[]).slice(0,220),
    evidence:(s.evidence||[]).slice(-220),
    mission:s.mission||null,
    conversation:(s.conversation||[]).slice(-140),
    assets:(s.assets||[]).slice(0,60).map(a=>({id:a.id,name:a.name,dataUrl:a.dataUrl||null}))
  };
}

async function save(){
  const row=snapshot();
  await put(row);
  window.dispatchEvent(new CustomEvent("astra:memory-saved",{detail:{id:row.id,updatedAt:row.updatedAt,files:row.files.length}}));
  return row;
}

async function restore(id){
  const row=await get(id);
  if(!row)return null;
  const s=window.__ASTRA_STATE__;
  if(s){
    s.spec=row.spec||null;
    s.files=Array.isArray(row.files)?row.files:[];
    s.evidence=Array.isArray(row.evidence)?row.evidence:[];
    s.mission=row.mission||null;
    s.conversation=Array.isArray(row.conversation)?row.conversation:[];
    s.workspaceId=row.workspaceId||row.id;
    s.status=row.status||"UNVERIFIED";
    if(Array.isArray(row.assets))s.assets=row.assets;
  }
  const idea=document.querySelector("#idea");
  if(idea)idea.value=row.idea||row.spec?.goal||"";
  window.dispatchEvent(new CustomEvent("astra:memory-restored",{detail:row}));
  return row;
}

function armAutosave(){
  clearInterval(autosaveTimer);
  autosaveTimer=setInterval(()=>{
    const s=window.__ASTRA_STATE__;
    if(s?.spec||s?.files?.length)save().catch(()=>{});
  },15000);
}

window.__ASTRA_MEMORY_VAULT__={save,restore,list,remove,snapshot,version:"MEMORY-VAULT-OMEGA-3",storesSecrets:false};
armAutosave();
window.addEventListener("astra:workspace7",()=>save().catch(()=>{}));