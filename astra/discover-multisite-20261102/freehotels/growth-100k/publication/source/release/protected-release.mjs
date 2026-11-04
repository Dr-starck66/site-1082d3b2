/** ASTRA release-safety orchestration; the promotion adapter MUST already be authorized. */
import {auditReleaseSite,auditProductionSite} from './release-safety.mjs';
export async function safeDeploy({manifest,readObservedBinding,fetchImpl=globalThis.fetch,
  executeGreenDeployment,candidateSha,now=Date.now()}) {
  if (typeof readObservedBinding !== 'function' || typeof executeGreenDeployment !== 'function' ||
      !/^[a-f0-9]{40}$/i.test(candidateSha || ''))
    return {status:'BLOCKED',stage:'adapters',reason:'MISSING_VERIFIED_DEPLOY_ADAPTER'};
  let binding;
  try {binding=await readObservedBinding({provider:manifest?.provider,projectId:manifest?.projectId});}
  catch {return {status:'UNVERIFIED',stage:'binding',reason:'PROVIDER_BINDING_READ_FAILED'};}
  const preflight=await auditReleaseSite({manifest,observedBinding:binding,fetchImpl,now});
  if (preflight.status !== 'PASS_PREFLIGHT') return {status:'BLOCKED',stage:'preflight',preflight,production:'UNVERIFIED'};
  let promotion;
  try {promotion=await executeGreenDeployment();}
  catch {return {status:'UNVERIFIED',stage:'promotion',reason:'DEPLOY_CONNECTOR_ERROR',preflight};}
  if (promotion?.status !== 'PASS_PRODUCTION' || promotion?.candidateSha !== candidateSha ||
      promotion?.publicSha !== candidateSha)
    return {status:'PARTIAL',stage:'promotion',reason:'CANONICAL_PUBLIC_SHA_NOT_VERIFIED',
      promotedStatus:promotion?.status||'UNVERIFIED',preflight};
  let afterBinding;
  try {afterBinding=await readObservedBinding({provider:manifest.provider,projectId:manifest.projectId});}
  catch {return {status:'UNVERIFIED',stage:'post-deployment-binding',reason:'PROVIDER_BINDING_READ_FAILED'};}
  const publicAudit=await auditProductionSite({manifest,observedBinding:afterBinding,fetchImpl,now});
  if (publicAudit.status !== 'PASS_PUBLIC_ROUTES')
    return {status:'FAIL',stage:'post-deployment-smoke',reason:'PUBLIC_ROUTE_REGRESSION',
      publicAudit,production:'FAIL'};
  return {status:'PASS_PRODUCTION',siteId:manifest.siteId,candidateSha,
    proof:['COMPLETED_GREEN_CANDIDATE','PUBLIC_SHA_MATCH','HTTP_CANONICAL_ROUTES_VERIFIED'],
    preflight:{status:preflight.status,routeCount:preflight.routeCount},
    publicAudit:{status:publicAudit.status,routeCount:publicAudit.routeCount}};
}
