import http from "node:http";
import { createHash, createPublicKey, randomBytes, randomUUID, verify as verifySignature } from "node:crypto";
import { mkdir, readFile, rename, writeFile, chmod } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

export const BRIDGE_HOST = "127.0.0.1";
export const BRIDGE_PORT = Number(process.env.ASTRA_CHATGPT_BRIDGE_PORT || 1455);
export const CALLBACK_PATH = "/auth/callback";
export const RESOURCE = "https://api.openai.com/v1";
export const ISSUER = "https://auth.openai.com";
export const AUTHORIZE_ENDPOINT = `${ISSUER}/api/accounts/authorize`;
export const TOKEN_ENDPOINT = `${ISSUER}/api/accounts/oauth/token`;
export const JWKS_ENDPOINT = `${ISSUER}/.well-known/jwks.json`;
export const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://astra-builder-omega-v4-sovereign-production.up.railway.app",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
];
const ALLOWED_ORIGINS = new Set(
  String(process.env.ASTRA_BRIDGE_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",").map(x => x.trim()).filter(Boolean)
);
const DATA_DIR = process.env.ASTRA_CHATGPT_BRIDGE_HOME || join(homedir(), ".astra-builder");
const AUTH_FILE = join(DATA_DIR, "chatgpt-auth.json");
const MAX_BODY = 512 * 1024;
let pending = null;
let refreshPromise = null;

export function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
export function randomValue(bytes = 32) {
  return base64url(randomBytes(bytes));
}
export function pkceChallenge(verifier) {
  return base64url(createHash("sha256").update(verifier).digest());
}
export function callbackUri(port = BRIDGE_PORT) {
  return `http://${BRIDGE_HOST}:${port}${CALLBACK_PATH}`;
}
function decodeJwtPart(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}
function nowSeconds() { return Math.floor(Date.now() / 1000); }

async function loadStore() {
  try {
    const raw = await readFile(AUTH_FILE, "utf8");
    const data = JSON.parse(raw);
    if (!data.host_id) throw new Error("missing host_id");
    return data;
  } catch {
    const store = { host_id: `urn:uuid:${randomUUID()}`, profile: null };
    await saveStore(store);
    return store;
  }
}
async function saveStore(store) {
  await mkdir(dirname(AUTH_FILE), { recursive: true, mode: 0o700 });
  const tmp = `${AUTH_FILE}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
  try { await chmod(tmp, 0o600); } catch {}
  await rename(tmp, AUTH_FILE);
  try { await chmod(AUTH_FILE, 0o600); } catch {}
}
export function publicStatus(store) {
  const p = store?.profile;
  if (!p) return { status: "READY", connected: false, sharing: false, hostId: store?.host_id || null };
  const expiresAt = p.saved_at && p.expires_in ? new Date(new Date(p.saved_at).getTime() + Number(p.expires_in) * 1000).toISOString() : null;
  return {
    status: p.scopes?.includes("chatgpt.tokens.use.direct") ? "PASS" : "PARTIAL",
    connected: true,
    sharing: !!p.scopes?.includes("chatgpt.tokens.use.direct"),
    email: p.email || null,
    name: p.name || null,
    clientIdSuffix: p.client_id ? p.client_id.slice(-8) : null,
    scopes: p.scopes || [],
    expiresAt,
    hostId: store?.host_id || null,
  };
}
export function buildAuthorizeUrl({ store, state, nonce, verifier, port = BRIDGE_PORT }) {
  const profile = store.profile;
  const first = !profile?.client_id;
  const params = new URLSearchParams({
    client_id: first ? "dynamic_agent_client" : profile.client_id,
    response_type: "code",
    redirect_uri: callbackUri(port),
    scope: SCOPES,
    resource: RESOURCE,
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: pkceChallenge(verifier),
    ext_agent_host_id: store.host_id,
  });
  if (first) params.set("agent_name_hint", "ASTRA Builder");
  else {
    if (profile.id_token) params.set("id_token_hint", profile.id_token);
    if (profile.email) params.set("login_hint", profile.email);
  }
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}
async function openBrowser(url) {
  const p = platform();
  let command, args;
  if (p === "win32") { command = "cmd"; args = ["/c", "start", "", url]; }
  else if (p === "darwin") { command = "open"; args = [url]; }
  else { command = "xdg-open"; args = [url]; }
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
async function fetchJson(url, options = {}, timeoutMs = 30000) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status}: ${raw.slice(0, 400)}`);
    e.status = res.status; e.data = data; throw e;
  }
  return { res, data };
}
async function verifyIdToken(idToken, clientId, nonce) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("ID token is not a JWT");
  const header = decodeJwtPart(parts[0]), payload = decodeJwtPart(parts[1]);
  if (header.alg !== "RS256") throw new Error(`Unsupported ID token alg: ${header.alg || "missing"}`);
  const { data: jwks } = await fetchJson(JWKS_ENDPOINT, {}, 15000);
  const jwk = (jwks.keys || []).find(k => k.kid === header.kid && k.kty === "RSA");
  if (!jwk) throw new Error("OpenAI signing key not found");
  const key = createPublicKey({ key: jwk, format: "jwk" });
  const signature = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - parts[2].length % 4) % 4), "base64");
  const ok = verifySignature("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, signature);
  if (!ok) throw new Error("ID token signature verification failed");
  const now = nowSeconds();
  if (payload.iss !== ISSUER) throw new Error("ID token issuer mismatch");
  const audOk = Array.isArray(payload.aud) ? payload.aud.includes(clientId) : payload.aud === clientId;
  if (!audOk) throw new Error("ID token audience mismatch");
  if (payload.exp && Number(payload.exp) <= now - 30) throw new Error("ID token expired");
  if (payload.nbf && Number(payload.nbf) > now + 60) throw new Error("ID token not active yet");
  if (payload.nonce !== nonce) throw new Error("ID token nonce mismatch");
  if (!payload.sub) throw new Error("ID token subject missing");
  return payload;
}
function splitScopes(scope) {
  return String(scope || "").split(/\s+/).filter(Boolean);
}
async function exchangeCode({ code, clientId, verifier, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    resource: RESOURCE,
  });
  const { data } = await fetchJson(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!data.access_token || !data.id_token) throw new Error("OAuth token response incomplete");
  return data;
}
async function refreshTokens(store) {
  if (!store.profile?.refresh_token || !store.profile?.client_id) throw new Error("No refreshable ChatGPT session");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: store.profile.client_id,
    refresh_token: store.profile.refresh_token,
    resource: RESOURCE,
  });
  const { data } = await fetchJson(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  store.profile = {
    ...store.profile,
    access_token: data.access_token,
    refresh_token: data.refresh_token || store.profile.refresh_token,
    id_token: data.id_token || store.profile.id_token,
    token_type: data.token_type || store.profile.token_type || "Bearer",
    expires_in: Number(data.expires_in || 3600),
    earliest_refresh_at: data.earliest_refresh_at ?? store.profile.earliest_refresh_at ?? null,
    scopes: splitScopes(data.scope || (store.profile.scopes || []).join(" ")),
    saved_at: new Date().toISOString(),
  };
  await saveStore(store);
  return store;
}
async function ensureFreshStore() {
  let store = await loadStore();
  const p = store.profile;
  if (!p?.access_token) return store;
  const saved = Date.parse(p.saved_at || 0);
  const expiresMs = Number(p.expires_in || 3600) * 1000;
  if (Date.now() < saved + expiresMs - 120000) return store;
  if (!refreshPromise) refreshPromise = refreshTokens(store).finally(() => { refreshPromise = null; });
  return await refreshPromise;
}
async function listModels() {
  const store = await ensureFreshStore();
  if (!store.profile?.access_token) throw new Error("ChatGPT is not connected");
  if (!store.profile.scopes?.includes("chatgpt.tokens.use.direct")) throw new Error("ChatGPT plan usage permission is not enabled");
  const { data } = await fetchJson(`${RESOURCE}/models`, {
    headers: { authorization: `Bearer ${store.profile.access_token}`, accept: "application/json" },
  });
  const rows = Array.isArray(data.models) ? data.models : Array.isArray(data.data) ? data.data.map(x => ({ slug: x.id, display_name: x.id, visibility: "list" })) : [];
  return rows.filter(x => !x.visibility || x.visibility === "list").map(x => ({ slug: x.slug || x.id, display_name: x.display_name || x.slug || x.id })).filter(x => x.slug);
}
async function streamResponse({ model, input, instructions }) {
  const store = await ensureFreshStore();
  if (!store.profile?.access_token) throw new Error("ChatGPT is not connected");
  if (!store.profile.scopes?.includes("chatgpt.tokens.use.direct")) throw new Error("ChatGPT plan usage permission is not enabled");
  const payload = {
    model,
    input: [{ role: "user", content: String(input || "") }],
    store: false,
    stream: true,
  };
  if (instructions) payload.instructions = String(instructions);
  const res = await fetch(`${RESOURCE}/responses`, {
    method: "POST",
    headers: { authorization: `Bearer ${store.profile.access_token}`, "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw new Error(`Responses API ${res.status}: ${(await res.text()).slice(0, 500)}`);
  if (!res.body) throw new Error("Responses API stream missing");
  const decoder = new TextDecoder();
  let buf = "", text = "", completed = false;
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
      const dataLines = block.split(/\r?\n/).filter(x => x.startsWith("data:")).map(x => x.slice(5).trim());
      if (!dataLines.length) continue;
      const raw = dataLines.join("\n");
      if (raw === "[DONE]") continue;
      let event; try { event = JSON.parse(raw); } catch { continue; }
      if (event.type === "response.output_text.delta") text += event.delta || "";
      else if (event.type === "response.completed") completed = true;
      else if (event.type === "response.failed") {
        const err = event.response?.error;
        throw new Error(`Response failed: ${err?.code || err?.message || "unknown_error"}`);
      } else if (event.type === "response.incomplete") {
        throw new Error("Response incomplete");
      }
    }
  }
  if (!completed) throw new Error("Stream ended without response.completed");
  return text.trim();
}
async function revokeAndClear() {
  const store = await loadStore();
  const p = store.profile;
  if (p?.refresh_token && p?.client_id) {
    try {
      const { data: discovery } = await fetchJson(`${ISSUER}/.well-known/openid-configuration`, {}, 15000);
      if (discovery.revocation_endpoint) {
        await fetch(discovery.revocation_endpoint, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: p.refresh_token, token_type_hint: "refresh_token", client_id: p.client_id }),
          signal: AbortSignal.timeout(15000),
        });
      }
    } catch {}
  }
  store.profile = p ? { client_id: p.client_id, email: p.email || null, name: p.name || null, subject: p.subject || null, issuer: p.issuer || ISSUER } : null;
  await saveStore(store);
  return store;
}
function corsHeaders(req) {
  const origin = String(req.headers.origin || "");
  const allowed = origin && ALLOWED_ORIGINS.has(origin);
  const headers = {
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    "cache-control": "no-store",
  };
  if (allowed) headers["access-control-allow-origin"] = origin;
  if (String(req.headers["access-control-request-private-network"] || "").toLowerCase() === "true") headers["access-control-allow-private-network"] = "true";
  return { headers, origin, allowed: !origin || allowed };
}
function sendJson(req, res, status, data) {
  const c = corsHeaders(req);
  res.writeHead(status, { ...c.headers, "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
function sendHtml(req, res, status, html) {
  const c = corsHeaders(req);
  res.writeHead(status, { ...c.headers, "content-type": "text/html; charset=utf-8" });
  res.end(html);
}
async function readJson(req) {
  let size = 0, chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error("request body too large"), { status: 413 });
    chunks.push(c);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function homePage(status) {
  const current = status.connected ? `Connected${status.email ? ` as ${status.email}` : ""}` : "Not connected";
  return `<!doctype html><html><head><meta charset="utf-8"><title>ASTRA ChatGPT Bridge</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;margin:40px;max-width:720px}button,a{display:inline-block;margin:6px 6px 6px 0;padding:10px 14px;border-radius:10px;border:1px solid #888;background:#111;color:white;text-decoration:none}code{background:#eee;padding:2px 5px;border-radius:5px}</style></head><body><h1>ASTRA ChatGPT Local Bridge Ω</h1><p><b>${current}</b></p><p>Tokens stay on this device in <code>${AUTH_FILE.replace(/</g, "&lt;")}</code>. They are never sent to Railway.</p><a href="/start">Continue with ChatGPT</a><a href="/status">Status</a></body></html>`;
}
async function handleCallback(req, res, url) {
  if (!pending) return sendHtml(req, res, 400, "<h1>OAuth attempt expired</h1><p>Return to ASTRA and start a fresh connection.</p>");
  const state = url.searchParams.get("state");
  if (!state || state !== pending.state) { pending = null; return sendHtml(req, res, 400, "<h1>State verification failed</h1>"); }
  const err = url.searchParams.get("error");
  if (err) { pending = null; return sendHtml(req, res, 400, `<h1>OpenAI authorization stopped</h1><p>${String(err).replace(/[<>&]/g, "")}</p>`); }
  const code = url.searchParams.get("code");
  if (!code) { pending = null; return sendHtml(req, res, 400, "<h1>Authorization code missing</h1>"); }
  const callbackClient = url.searchParams.get("client_id");
  let clientId = pending.clientId;
  if (pending.first) {
    if (!callbackClient || callbackClient === "dynamic_agent_client") { pending = null; return sendHtml(req, res, 400, "<h1>Issued client ID missing</h1>"); }
    clientId = callbackClient;
  } else if (callbackClient && callbackClient !== clientId) {
    pending = null; return sendHtml(req, res, 400, "<h1>Client ID mismatch</h1>");
  }
  const attempt = pending; pending = null;
  try {
    const tokens = await exchangeCode({ code, clientId, verifier: attempt.verifier, redirectUri: attempt.redirectUri });
    const identity = await verifyIdToken(tokens.id_token, clientId, attempt.nonce);
    if (!attempt.first && attempt.expectedSubject && identity.sub !== attempt.expectedSubject) throw new Error("Returned account does not match selected account");
    const store = await loadStore();
    store.profile = {
      email: identity.email || null,
      name: identity.name || identity.preferred_username || null,
      issuer: identity.iss,
      subject: identity.sub,
      client_id: clientId,
      ext_agent_host_id: store.host_id,
      id_token: tokens.id_token,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_type: tokens.token_type || "Bearer",
      expires_in: Number(tokens.expires_in || 3600),
      earliest_refresh_at: tokens.earliest_refresh_at ?? null,
      scopes: splitScopes(tokens.scope),
      saved_at: new Date().toISOString(),
    };
    await saveStore(store);
    const sharing = store.profile.scopes.includes("chatgpt.tokens.use.direct");
    return sendHtml(req, res, 200, `<h1>ASTRA ChatGPT connection ${sharing ? "ready" : "connected"}</h1><p>${sharing ? "ChatGPT plan usage permission granted." : "Identity connected, but ChatGPT plan usage permission was not granted."}</p><p>You can close this tab and return to ASTRA Builder.</p>`);
  } catch (e) {
    return sendHtml(req, res, 500, `<h1>Connection failed</h1><pre>${String(e?.message || e).replace(/[<>&]/g, "")}</pre>`);
  }
}
export async function handler(req, res) {
  const url = new URL(req.url || "/", `http://${BRIDGE_HOST}:${BRIDGE_PORT}`);
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    res.writeHead(cors.allowed ? 204 : 403, cors.headers); return res.end();
  }
  if (!cors.allowed) return sendJson(req, res, 403, { status: "FAIL", reason: "Origin not allowed" });
  if (req.method === "GET" && url.pathname === "/") return sendHtml(req, res, 200, homePage(publicStatus(await loadStore())));
  if (req.method === "GET" && url.pathname === "/health") return sendJson(req, res, 200, { ok: true, service: "astra-chatgpt-local-bridge", version: "1.0.0" });
  if (req.method === "GET" && url.pathname === "/status") return sendJson(req, res, 200, publicStatus(await loadStore()));
  if (req.method === "GET" && url.pathname === "/start") {
    const store = await loadStore();
    const state = randomValue(), nonce = randomValue(), verifier = randomValue(64);
    const first = !store.profile?.client_id;
    pending = {
      state, nonce, verifier, first,
      clientId: first ? "dynamic_agent_client" : store.profile.client_id,
      expectedSubject: store.profile?.subject || null,
      redirectUri: callbackUri(),
      startedAt: Date.now(),
    };
    const authUrl = buildAuthorizeUrl({ store, state, nonce, verifier });
    setTimeout(() => { if (pending?.state === state) pending = null; }, 10 * 60 * 1000).unref();
    const opened = await openBrowser(authUrl);
    return sendHtml(req, res, 200, `<h1>Continue with ChatGPT</h1><p>${opened ? "Your browser should open the OpenAI authorization screen." : "Open the authorization link below."}</p><p><a href="${authUrl.replace(/&/g, "&amp;")}">Open OpenAI authorization</a></p><p>This local callback expires in 10 minutes.</p>`);
  }
  if (req.method === "GET" && url.pathname === CALLBACK_PATH) return handleCallback(req, res, url);
  if (req.method === "GET" && url.pathname === "/models") {
    try { return sendJson(req, res, 200, { status: "PASS", models: await listModels() }); }
    catch (e) { return sendJson(req, res, 502, { status: "FAIL", reason: String(e?.message || e) }); }
  }
  if (req.method === "POST" && url.pathname === "/verify") {
    try {
      const [model] = await listModels();
      if (!model) throw new Error("No ChatGPT models available");
      const text = await streamResponse({ model: model.slug, input: "Reply with exactly: Token sharing works." });
      const pass = text.trim() === "Token sharing works.";
      return sendJson(req, res, pass ? 200 : 206, { status: pass ? "PASS" : "PARTIAL", model: model.slug, text });
    } catch (e) { return sendJson(req, res, 502, { status: "FAIL", reason: String(e?.message || e) }); }
  }
  if (req.method === "POST" && url.pathname === "/infer") {
    try {
      const body = await readJson(req);
      const input = String(body.input || "");
      if (!input || input.length > 120000) return sendJson(req, res, 400, { status: "FAIL", reason: "input must contain 1..120000 characters" });
      let model = String(body.model || "");
      if (!model) {
        const [first] = await listModels();
        if (!first) throw new Error("No ChatGPT models available");
        model = first.slug;
      }
      const text = await streamResponse({ model, input, instructions: body.instructions ? String(body.instructions).slice(0, 30000) : "" });
      return sendJson(req, res, 200, { status: "PASS", model, text });
    } catch (e) { return sendJson(req, res, e.status || 502, { status: "FAIL", reason: String(e?.message || e) }); }
  }
  if (req.method === "POST" && url.pathname === "/logout") {
    try { return sendJson(req, res, 200, publicStatus(await revokeAndClear())); }
    catch (e) { return sendJson(req, res, 500, { status: "FAIL", reason: String(e?.message || e) }); }
  }
  return sendJson(req, res, 404, { status: "FAIL", reason: "Not found" });
}
export async function startBridge() {
  const store = await loadStore();
  const server = http.createServer((req, res) => Promise.resolve(handler(req, res)).catch(e => sendJson(req, res, e.status || 500, { status: "FAIL", reason: String(e?.message || e) })));
  await new Promise((resolveStart, reject) => {
    server.once("error", reject);
    server.listen(BRIDGE_PORT, BRIDGE_HOST, resolveStart);
  });
  console.log(`[ASTRA CHATGPT BRIDGE] http://${BRIDGE_HOST}:${BRIDGE_PORT}`);
  console.log(`[ASTRA CHATGPT BRIDGE] ${publicStatus(store).connected ? "saved ChatGPT profile detected" : "ready for first sign-in"}`);
  return server;
}
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) startBridge().catch(e => { console.error("[ASTRA CHATGPT BRIDGE] FAIL", e); process.exit(1); });
