import{superRoute,routerTelemetry}from"./super-router.js";

export function normalizeBase(url){return (url||"").trim().replace(/\/+$/,"")}
export function effectiveModel(cfg,target){
  const base=normalizeBase(cfg.baseUrl);
  if(base.startsWith("astra://local/"))return /gemma|deepseek|adversary|verify|critic/i.test(String(target||""))?"gemma-critic-local":"qwen-coder-local";
  if(cfg.zeroCost&&base.includes("openrouter.ai"))return String(target||"").endsWith(":free")?target:"openrouter/free";
  return target;
}
export function costStatus(cfg,kind="text"){
  const base=normalizeBase(kind==="image"?cfg.imageBaseUrl:cfg.baseUrl);
  if(!cfg.zeroCost)return"UNVERIFIED";
  if(kind==="text"&&(base.startsWith("astra://local/")||(!cfg.apiKey&&base.includes("openrouter.ai"))))return"PASS";
  if(kind==="text"&&base.includes("openrouter.ai"))return"PASS";
  if(kind==="image"&&base.startsWith("astra://zerogpu/"))return"PASS";
  if(cfg.attestedFree&&base)return"PARTIAL";
  return"FAIL";
}
function useInternalFabric(cfg,base){
  if(base.startsWith("astra://local/"))return true;
  if(cfg.zeroCost&&!cfg.apiKey&&base.includes("openrouter.ai"))return true;
  if(cfg.zeroCost&&!cfg.apiKey&&!base)return true;
  return false;
}
export async function chat(cfg,model,system,user){
  const base=normalizeBase(cfg.baseUrl);
  if(useInternalFabric(cfg,base)){
    const out=await superRoute({system,user,requestedModel:model});
    if(!out?.text)throw new Error("ASTRA SUPER ROUTER Ω returned no text");
    return String(out.text);
  }
  if(!base)throw new Error("Endpoint texte manquant");
  if(cfg.zeroCost&&!base.includes("openrouter.ai")&&!cfg.attestedFree)throw new Error("ZERO-COST GATE: endpoint cloud personnalisé non attesté gratuit");
  if(cfg.zeroCost&&base.includes("openrouter.ai")&&!cfg.apiKey){
    throw new Error("ASTRA SUPER ROUTER Ω policy violation: anonymous text cloud fallback disabled; local fabric required");
  }
  const headers={"Content-Type":"application/json"};if(cfg.apiKey)headers.Authorization="Bearer "+cfg.apiKey;
  const res=await fetch(base+"/chat/completions",{method:"POST",headers,body:JSON.stringify({model:effectiveModel(cfg,model),temperature:.15,messages:[{role:"system",content:system},{role:"user",content:user}]})});
  const raw=await res.text();if(!res.ok)throw new Error("Inference "+res.status+": "+raw.slice(0,240));
  const data=JSON.parse(raw);const text=String(data?.choices?.[0]?.message?.content||"");if(!text)throw new Error("Inference response empty");return text;
}
export function routeTelemetry(){return routerTelemetry()}
export async function generateImage(cfg,prompt){
  const base=normalizeBase(cfg.imageBaseUrl);if(!base)throw new Error("Endpoint image gratuit non configuré");
  if(base.startsWith("astra://zerogpu/")){
    const res=await fetch("/api/free_image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt,model:cfg.imageModel})});
    const raw=await res.text();if(!res.ok)throw new Error("ZeroGPU image "+res.status+": "+raw.slice(0,240));
    const data=JSON.parse(raw);if(!data?.b64)throw new Error("ZeroGPU image response invalid");
    return{bytes:Uint8Array.from(atob(data.b64),x=>x.charCodeAt(0)),mime:data.mime||"image/png"};
  }
  if(cfg.zeroCost&&!cfg.attestedFree)throw new Error("ZERO-COST GATE: coût de l'endpoint image non attesté gratuit");
  const headers={"Content-Type":"application/json"};if(cfg.imageKey)headers.Authorization="Bearer "+cfg.imageKey;
  const res=await fetch(base+"/images/generations",{method:"POST",headers,body:JSON.stringify({model:cfg.imageModel,prompt,size:"1024x1024",response_format:"b64_json"})});
  const raw=await res.text();if(!res.ok)throw new Error("Image inference "+res.status+": "+raw.slice(0,240));
  const data=JSON.parse(raw),x=data?.data?.[0];
  if(x?.b64_json)return{bytes:Uint8Array.from(atob(x.b64_json),c=>c.charCodeAt(0)),mime:"image/png"};
  if(x?.url){const r=await fetch(x.url);if(!r.ok)throw new Error("Asset image inaccessible");return{bytes:new Uint8Array(await r.arrayBuffer()),mime:r.headers.get("content-type")||"image/png"}}
  throw new Error("Réponse image invalide");
}