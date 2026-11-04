/**
 * ASTRA RELEASE BRIDGE Ω — deployment-safety extension (zero dependencies).
 * An adapter supplies verified provider bindings and a reachable candidate URL.
 * This module does NOT select hosts, change DNS, run builds, spend money, or claim
 * a future deployment is guaranteed. It fails closed before promotion.
 */
const HTTPS = /^https:\/\//i;
const REDIRECTS = new Set([301, 302, 307, 308]);
const PROJECT = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const PATH = /^\/(?!\/)[^?#]*$/;
const clean = value => String(value ?? '').replace(/[\r\n]/g, ' ').slice(0, 160);
function originOf(value) {
  try {const url = new URL(value); return HTTPS.test(value) && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' ? url.origin : null;}
  catch { return null; }
}
function sameHost(a, b) { try {return new URL(a).hostname === new URL(b).hostname;} catch {return false;} }
function extractCanonical(html) {
  const tags = String(html).match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/\brel\s*=\s*(["'])canonical\1/i.test(tag) && !/\brel\s*=\s*canonical\b/i.test(tag)) continue;
    const value = tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i) || tag.match(/\bhref\s*=\s*([^\s>]+)/i);
    if (value) return value[2] || value[1];
  }
  return null;
}
function extractRobots(html) {
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  return tags.filter(t => /\bname\s*=\s*(["'])robots\1/i.test(t) || /\bname\s*=\s*robots\b/i.test(t)).join(' ');
}
function validateRoute(route) {
  if (!route || !PATH.test(route.path || '') || route.path.includes('\\') ||
      !Number.isInteger(route.expectedStatus) ||
      ![200, 301, 302, 307, 308, 410].includes(route.expectedStatus)) return 'INVALID_ROUTE';
  if (route.expectedStatus === 200 && (typeof route.contains !== 'string' || route.contains.trim().length < 4))
    return 'MISSING_DISTINCT_CONTENT_PROOF';
  if (REDIRECTS.has(route.expectedStatus) && (!route.location || !HTTPS.test(route.location)))
    return 'MISSING_REDIRECT_TARGET';
  return null;
}
/** A complete, externally measured domain/project binding is mandatory. */
export function checkReleaseContract(manifest, observedBinding, now = Date.now()) {
  const reasons = [];
  if (!manifest || typeof manifest !== 'object') return {status:'BLOCKED',reasons:['MISSING_MANIFEST']};
  const canonical = originOf(manifest.canonicalUrl);
  const candidate = originOf(manifest.previewUrl);
  if (!canonical || !candidate || sameHost(canonical, candidate)) reasons.push('INVALID_CANONICAL_OR_PREVIEW_URL');
  if (!PROJECT.test(manifest.projectId || '') || !PROJECT.test(manifest.provider || '')) reasons.push('MISSING_PROVIDER_PROJECT');
  if (manifest.addedCostEur !== 0 || manifest.newScheduledTasks !== 0 || manifest.dnsChangeRequested === true) reasons.push('ZERO_COST_AND_NO_DNS_CHANGES');
  if (!manifest.routeInventory || manifest.routeInventory.complete !== true ||
      typeof manifest.routeInventory.evidence !== 'string' || manifest.routeInventory.evidence.length < 8)
    reasons.push('INCOMPLETE_HISTORICAL_URL_INVENTORY');
  if (!Array.isArray(manifest.routes) || !manifest.routes.length) reasons.push('NO_CRITICAL_ROUTES');
  else {
    const seen = new Set();
    for (const route of manifest.routes) {
      const err = validateRoute(route);
      if (err) reasons.push(err + ':' + clean(route?.path));
      if (seen.has(route.path)) reasons.push('DUPLICATE_ROUTE:' + clean(route.path));
      seen.add(route.path);
    }
    if (!manifest.routes.some(r => r.path === '/')) reasons.push('MISSING_HOME_ROUTE');
  }
  if (!observedBinding || observedBinding.verified !== true ||
      observedBinding.source !== 'authorized-host-connector' ||
      observedBinding.provider !== manifest.provider || observedBinding.projectId !== manifest.projectId ||
      !canonical || observedBinding.canonicalHost !== new URL(canonical).hostname)
    reasons.push('CANONICAL_DOMAIN_NOT_BOUND_TO_TARGET_PROJECT');
  const age = now - Date.parse(observedBinding?.checkedAt || '');
  if (!Number.isFinite(age) || age < -300000 || age > 3600000)
    reasons.push('PROVIDER_BINDING_NOT_FRESH');
  return {status:reasons.length?'BLOCKED':'PASS_CONTRACT',reasons:[...new Set(reasons)],canonicalUrl:canonical,previewUrl:candidate};
}
async function snapshotRoute(baseUrl, route, fetchImpl, stage, timeoutMs) {
  const u = new URL(route.path, baseUrl);
  let resp;
  try {
    resp = await fetchImpl(u.toString(), {redirect:'manual',signal:AbortSignal.timeout(timeoutMs),headers:{accept:'text/html'}});
  } catch (e) {return {path:route.path,status:'UNVERIFIED',reason:'HTTP_PROBE_FAILED',errorCode:clean(e?.code || e?.name || 'unknown')};}
  const status = Number(resp?.status || 0);
  const get = name => String(resp?.headers?.get?.(name) || '');
  const problems = [];
  if (status !== route.expectedStatus) problems.push('HTTP_STATUS_MISMATCH');
  if (REDIRECTS.has(route.expectedStatus)) {
    const target = get('location');
    let absolute = null;
    try {absolute = new URL(target, u).toString();} catch {}
    if (absolute !== route.location) problems.push('REDIRECT_TARGET_MISMATCH');
  } else if (route.expectedStatus === 200) {
    const ct = get('content-type').toLowerCase();
    if (!ct.includes('text/html')) problems.push('NOT_HTML');
    let body = '';
    try {body = (await resp.text()).slice(0, 1024 * 1024);} catch {problems.push('BODY_READ_FAILED');}
    if (body.length < 120) problems.push('EMPTY_OR_SHELL_HTML');
    if (!body.includes(route.contains)) problems.push('ROUTE_SPECIFIC_CONTENT_MISSING');
    const expected = new URL(route.path, stage === 'public' ? baseUrl : route.canonicalBaseUrl).toString();
    const found = extractCanonical(body);
    if (route.requireCanonical !== false && found !== expected) problems.push('CANONICAL_MISMATCH');
    const robots = [extractRobots(body),get('x-robots-tag')].join(' ').toLowerCase();
    if (stage === 'public' && route.indexable !== false && /\bnoindex\b/.test(robots)) problems.push('ACCIDENTAL_NOINDEX');
  }
  return {path:route.path,httpStatus:status,status:problems.length?'FAIL':'PASS_ROUTE',problems};
}
/** Read-only real HTTP probe of canonical baseline and preview; no promotion. */
export async function auditReleaseSite({manifest, observedBinding, fetchImpl=globalThis.fetch, now=Date.now(), timeoutMs=9000}) {
  const contract = checkReleaseContract(manifest,observedBinding,now);
  if (contract.status !== 'PASS_CONTRACT') return {status:'BLOCKED',stage:'contract',reasons:contract.reasons};
  if (typeof fetchImpl !== 'function') return {status:'BLOCKED',stage:'http',reasons:['NO_HTTP_ADAPTER']};
  const routes = manifest.routes.map(r=>({...r,canonicalBaseUrl:contract.canonicalUrl}));
  const publicBefore=[], preview=[];
  for (const route of routes) {
    publicBefore.push(await snapshotRoute(contract.canonicalUrl,route,fetchImpl,'public',timeoutMs));
    preview.push(await snapshotRoute(contract.previewUrl,route,fetchImpl,'preview',timeoutMs));
  }
  const baselineFailures = publicBefore.filter(x=>x.status!=='PASS_ROUTE');
  const candidateFailures = preview.filter(x=>x.status!=='PASS_ROUTE');
  return {schema:'astra-release-safety/1',siteId:clean(manifest.siteId),
    status:baselineFailures.length||candidateFailures.length?'BLOCKED':'PASS_PREFLIGHT',
    stage:'preflight',routeCount:routes.length,baselineFailures,candidateFailures,
    publicBefore,preview,production:'UNVERIFIED'};
}
/** After a release, check the actual canonical host independently of provider READY. */
export async function auditProductionSite({manifest,observedBinding,fetchImpl=globalThis.fetch,now=Date.now(),timeoutMs=9000}) {
  const contract = checkReleaseContract(manifest,observedBinding,now);
  if (contract.status !== 'PASS_CONTRACT') return {status:'BLOCKED',stage:'contract',reasons:contract.reasons};
  const routes = [];
  for (const route of manifest.routes) routes.push(await snapshotRoute(contract.canonicalUrl,
    {...route,canonicalBaseUrl:contract.canonicalUrl},fetchImpl,'public',timeoutMs));
  return {status:routes.every(r=>r.status==='PASS_ROUTE')?'PASS_PUBLIC_ROUTES':'FAIL',
    stage:'public-smoke',routeCount:routes.length,failures:routes.filter(r=>r.status!=='PASS_ROUTE'),routes};
}
/** Explicit registration audit: a portfolio entry alone never equals a wired deployment. */
export function auditPortfolioReleaseCoverage(portfolio, wiredSiteIds = []) {
  const known = new Set(wiredSiteIds);
  const sites = Array.isArray(portfolio?.sites) ? portfolio.sites : [];
  const results = sites.map(s=>({site:s.name,hostname:(()=>{try{return new URL(s.baseUrl).hostname;}catch{return null;}})(),
    status:known.has(s.baseUrl)?'WIRED_DECLARED':'UNVERIFIED_NOT_WIRED'}));
  return {status:results.every(x=>x.status==='WIRED_DECLARED')?'PASS_REGISTRATION':'PARTIAL',total:results.length,
    declaredWired:results.filter(x=>x.status==='WIRED_DECLARED').length,results};
}
