export function normalizeBase(url){return (url||"").trim().replace(/\/+$/,"")}
export function effectiveModel(cfg,target){const base=normalizeBase(cfg.baseUrl);if(cfg.zeroCost&&base.includes("openrouter.ai"))return"openrouter/free";return target}
export function costStatus(cfg,kind="text"){
  const base=normalizeBase(kind==="image"?cfg.imageBaseUrl:cfg.baseUrl);
  if(!cfg.zeroCost)return"UNVERIFIED";
  if(kind==="text"&&base.includes("openrouter.ai"))return"PASS";
  if(cfg.attestedFree&&base)return"PARTIAL";
  return"FAIL";
}
export async function chat(cfg,model,system,user){
  const base=normalizeBase(cfg.baseUrl);if(!base)throw new Error("Endpoint texte manquant");
  if(cfg.zeroCost&&!base.includes("openrouter.ai")&&!cfg.attestedFree)throw new Error("ZERO-COST GATE: endpoint cloud personnalisé non attesté gratuit");
  const headers={"Content-Type":"application/json"};if(cfg.apiKey)headers.Authorization="Bearer "+cfg.apiKey;
  const res=await fetch(base+"/chat/completions",{method:"POST",headers,body:JSON.stringify({model:effectiveModel(cfg,model),temperature:.15,messages:[{role:"system",content:system},{role:"user",content:user}]})});
  const raw=await res.text();if(!res.ok)throw new Error("Inference "+res.status+": "+raw.slice(0,240));
  const data=JSON.parse(raw);return String(data?.choices?.[0]?.message?.content||"");
}
export async function generateImage(cfg,prompt){
  const base=normalizeBase(cfg.imageBaseUrl);if(!base)throw new Error("Endpoint image gratuit non configuré");
  if(cfg.zeroCost&&!cfg.attestedFree)throw new Error("ZERO-COST GATE: coût de l'endpoint image non attesté gratuit");
  const headers={"Content-Type":"application/json"};if(cfg.imageKey)headers.Authorization="Bearer "+cfg.imageKey;
  const res=await fetch(base+"/images/generations",{method:"POST",headers,body:JSON.stringify({model:cfg.imageModel,prompt,size:"1024x1024",response_format:"b64_json"})});
  const raw=await res.text();if(!res.ok)throw new Error("Image inference "+res.status+": "+raw.slice(0,240));
  const data=JSON.parse(raw),x=data?.data?.[0];
  if(x?.b64_json)return{bytes:Uint8Array.from(atob(x.b64_json),c=>c.charCodeAt(0)),mime:"image/png"};
  if(x?.url){const r=await fetch(x.url);if(!r.ok)throw new Error("Asset image inaccessible");return{bytes:new Uint8Array(await r.arrayBuffer()),mime:r.headers.get("content-type")||"image/png"}}
  throw new Error("Réponse image invalide");
}