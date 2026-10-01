import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { runMission, XI } from "./core.mjs";

const PORT = Number(process.env.PORT || 8080);
const FAST_BASE = String(process.env.BARCAX_FAST_BASE || "http://astra-local-qwen-fast-runtime.railway.internal:8080/v1").replace(/\/+$/,"");
const STANDARD_BASE = String(process.env.BARCAX_STANDARD_BASE || "http://astra-local-qwen-standard-runtime.railway.internal:8080/v1").replace(/\/+$/,"");
const CRITIC_BASE = String(process.env.BARCAX_CRITIC_BASE || STANDARD_BASE).replace(/\/+$/,"");
const AUTH = String(process.env.BARCAX_MODEL_AUTH || "Bearer astra-private");
const runs = new Map();
const MAX_RUNS = 100;

function send(res, code, body, type="application/json; charset=utf-8") {
  res.writeHead(code, {"content-type":type,"cache-control":"no-store","access-control-allow-origin":"*"});
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let size = 0, chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw Object.assign(new Error("PAYLOAD_TOO_LARGE"), {status:413});
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function profileConfig(profile) {
  if (profile === "STANDARD") return {base:STANDARD_BASE, model:"qwen-standard-local", max_tokens:1500};
  if (profile === "CRITIC") return {base:CRITIC_BASE, model:"qwen-standard-local", max_tokens:900};
  return {base:FAST_BASE, model:"qwen-fast-local", max_tokens:700};
}

async function chatOnce({base, model, max_tokens}, system, user) {
  const response = await fetch(base + "/chat/completions", {
    method:"POST",
    headers:{"content-type":"application/json","authorization":AUTH},
    signal:AbortSignal.timeout(120000),
    body:JSON.stringify({
      model,
      temperature:0.12,
      max_tokens,
      messages:[{role:"system",content:system},{role:"user",content:user}]
    })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error("MODEL_HTTP_" + response.status + ":" + raw.slice(0,220));
  const data = JSON.parse(raw);
  const text = String(data?.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/gi,"").trim();
  if (!text) throw new Error("EMPTY_MODEL_OUTPUT");
  return text;
}

async function invokeAgent({agent,role,instruction,input,profile}) {
  const primary = profileConfig(profile);
  try {
    return await chatOnce(primary, instruction, input);
  } catch (error) {
    if (profile === "STANDARD") throw error;
    return await chatOnce(profileConfig("STANDARD"),
      instruction + " FALLBACK: la route primaire est indisponible; conserve exactement ton rôle.",
      input);
  }
}

async function modelHealth(base) {
  const root = base.replace(/\/v1$/,"");
  try {
    const r = await fetch(root + "/health", {signal:AbortSignal.timeout(15000)});
    return {status:r.ok?"PASS":"FAIL", httpStatus:r.status};
  } catch (e) {
    return {status:"FAIL", error:String(e?.message || e)};
  }
}

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "OPTIONS") return send(res,204,"","text/plain");
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res,200,{status:"PASS",service:"BARCA-X-SOVEREIGN",xi:XI.length});
    }
    if (req.method === "GET" && url.pathname === "/model-health") {
      const [fast,standard] = await Promise.all([modelHealth(FAST_BASE),modelHealth(STANDARD_BASE)]);
      return send(res, fast.status==="PASS"&&standard.status==="PASS"?200:503,{fast,standard});
    }
    if (req.method === "POST" && url.pathname === "/api/run") {
      const body = await readJson(req);
      const started = Date.now();
      const result = await runMission({mission:body.mission,invoke:invokeAgent});
      result.latencyMs = Date.now() - started;
      runs.set(result.id,result);
      while(runs.size > MAX_RUNS) runs.delete(runs.keys().next().value);
      return send(res,200,result);
    }
    if (req.method === "GET" && url.pathname === "/api/replay") {
      const id = url.searchParams.get("id");
      if (!id || !runs.has(id)) return send(res,404,{error:"RUN_NOT_FOUND"});
      return send(res,200,runs.get(id));
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return send(res,200,html,"text/html; charset=utf-8");
    }
    return send(res,404,{error:"NOT_FOUND"});
  } catch (error) {
    const code = Number(error?.status) || (/INVALID_MISSION/.test(String(error?.message))?400:503);
    return send(res,code,{error:String(error?.message || error)});
  }
});

server.listen(PORT,"0.0.0.0",()=>console.log("BARCAX_SOVEREIGN_READY port="+PORT));
