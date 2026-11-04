import {safeDeploy as enforceReleaseSafety} from './protected-release.mjs';
/**
 * ASTRA RELEASE BRIDGE Ω — cross-project read/write/deploy adapter.
 * Every adapter is injected from an ALREADY AUTHORIZED connector.
 * Never bypass an authorization failure or use credentials from chat.
 * No GitHub Actions, subscription, scheduled task or hidden network dependency.
 */
const forbidden = /(?:403|401|permission|unauthori[sz]ed|forbidden|denied|policy|security|refused|refus|bloqu|s[eé]curit[eé]|contr[oô]les? de s[eé]curit[eé]|payment_required|not.connected|no.eligible.link)/i;
const temporary = /(?:408|409|429|500|502|503|504|timeout|temporar|network|service.unavailable|rate.limit|unavailable|ETIMEDOUT|ECONNRESET)/i;
const sha40 = /^[a-f0-9]{40}$/i;
const messageOf = (error) => String(error?.message ?? error ?? '').slice(0, 400);

export function classifyTransport(error) {
  const text = messageOf(error);
  if (forbidden.test(text)) return 'PERMISSION_OR_POLICY';
  const status = Number(error?.status || error?.response?.status || 0);
  if ([401,403].includes(status)) return 'PERMISSION_OR_POLICY';
  if (status === 404) return 'SOURCE_NOT_FOUND';
  if (temporary.test(text) || [408,409,429,500,502,503,504].includes(status)) return 'TRANSIENT';
  return 'UNKNOWN';
}
function unpackFile(row) {
  const data = row?.result || row;
  if (typeof data?.content !== 'string' || typeof data?.sha !== 'string') {
    throw Error('INVALID_READ_RESPONSE');
  }
  return data;
}
function unpackCommit(row) {
  const data = row?.result || row;
  return data?.commit_sha || data?.commitSha || data?.commit?.sha || null;
}
function supported(adapter) {
  return !!adapter && typeof adapter.readFile === 'function' && typeof adapter.updateFile === 'function';
}
/** Reports what tools actually exist in THIS call rather than relying on prior conversations. */
export function probeTransports(adapters) {
  return (adapters || []).map((adapter, index) => ({
    index, name: String(adapter?.name || 'unnamed'), readWrite: supported(adapter)
  }));
}
/** Safe CAS source write: read SHA -> write on authorized adapter -> read back full contents.
 * Failover is attempted only on a transient error, never after permission/policy denial.
 * Before a transient write retry, read back first to detect an already completed write.
 * status=PASS_SOURCE does not mean production deployed.
 */
export async function writeWithRecovery({repository, path, content, message, expectedSourceSha, adapters}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !path || path.includes('..') ||
      typeof content !== 'string' || !message || !Array.isArray(adapters) || !adapters.length) {
    return {status:'FAIL',reason:'INVALID_ARGUMENTS'};
  }
  const proof = {repository,path,stage:'probe',attempts:probeTransports(adapters)};
  let permitted = false;
  let baselineSha = expectedSourceSha || null;
  let lastError = 'NO_AUTHORIZED_CONNECTOR';
  for (const adapter of adapters) {
    if (!supported(adapter)) continue;
    permitted = true;
    const name = String(adapter.name || 'authorized-source');
    let before;
    try { before = unpackFile(await adapter.readFile({repository,path})); }
    catch (error) {
      const kind = classifyTransport(error);
      lastError = kind;
      if (kind === 'TRANSIENT') continue;
      return {...proof,status:'BLOCKED',stage:'read',transport:name,reason:kind};
    }
    if (before.content !== content && baselineSha && baselineSha !== before.sha) {
      return {...proof,status:'FAIL',stage:'precondition',transport:name,reason:'CONCURRENT_EDIT_OR_STALE_SHA'};
    }
    if (!baselineSha) baselineSha = before.sha;
    if (before.content === content) {
      return {...proof,status:'PASS_SOURCE',stage:'readback',transport:name,sourceSha:before.sha,changed:false,production:'UNVERIFIED'};
    }
    let commit = null;
    try {
      const updated = await adapter.updateFile({repository,path,sha:before.sha,content,message});
      commit = unpackCommit(updated);
    } catch (error) {
      const kind = classifyTransport(error);
      if (kind !== 'TRANSIENT') return {...proof,status:'BLOCKED',stage:'write',transport:name,reason:kind};
      // Ambiguous timeout: server may already have committed. Verify before ANY retry.
      try {
        const afterTimeout = unpackFile(await adapter.readFile({repository,path}));
        if (afterTimeout.content === content) {
          return {...proof,status:'PASS_SOURCE',stage:'readback-after-timeout',transport:name,
            sourceSha:afterTimeout.sha,changed:true,production:'UNVERIFIED'};
        }
        // Re-read source on next adapter; fresh compare-and-swap avoids a blind overwrite.
        if (afterTimeout.sha !== before.sha) {
          return {...proof,status:'FAIL',stage:'write',transport:name,reason:'CONCURRENT_EDIT'};
        }
      } catch { /* no proof of completion: next transport must start with a fresh read */ }
      lastError = kind;
      continue;
    }
    try {
      const after = unpackFile(await adapter.readFile({repository,path}));
      if (after.content !== content) return {...proof,status:'FAIL',stage:'readback',transport:name,
        reason:'CONTENT_MISMATCH',commit};
      return {...proof,status:'PASS_SOURCE',stage:'readback',transport:name,
        sourceSha:after.sha,commit,changed:true,production:'UNVERIFIED'};
    } catch {
      return {...proof,status:'UNVERIFIED',stage:'readback',transport:name,commit,
        reason:'SOURCE_READBACK_UNAVAILABLE',production:'UNVERIFIED'};
    }
  }
  return {...proof,status:permitted?'UNVERIFIED':'BLOCKED',reason:lastError,stage:'transport',production:'UNVERIFIED'};
}

/** Bound and verify canonical release deployment. Candidate must be a completed GREEN SHA.
 * An adapter promote function is supplied by an authorized hosting/release connector.
 * The actual public revision is the only proof of publication.
 */
export async function guardedDeploy({sourceRepo,candidateSha,checkCandidate,promote,readPublicRevision}) {
  if (!sha40.test(candidateSha || '') || typeof checkCandidate !== 'function' ||
      typeof promote !== 'function' || typeof readPublicRevision !== 'function') {
    return {status:'FAIL',reason:'INVALID_DEPLOY_CONTRACT'};
  }
  let validated;
  try { validated = await checkCandidate({repository:sourceRepo,sha:candidateSha}); }
  catch(error) {return {status:'UNVERIFIED',stage:'validation',reason:classifyTransport(error)};}
  if (!validated || validated.sha !== candidateSha || validated.conclusion !== 'success' ||
      validated.status !== 'completed') {
    return {status:'BLOCKED',stage:'validation',reason:'GREEN_PROOF_MISSING',candidateSha};
  }
  try { await promote({repository:sourceRepo,sha:candidateSha,workflowRunId:validated.workflowRunId}); }
  catch(error) {return {status:'BLOCKED',stage:'promotion',reason:classifyTransport(error)};}
  try {
    const revision = await readPublicRevision();
    if (revision?.sourceSha === candidateSha) {
      return {status:'PASS_PRODUCTION',sourceRepo,candidateSha,publicSha:revision.sourceSha,
        verified:'PUBLIC_SHA_MATCH'};
    }
    return {status:'PARTIAL',stage:'live-check',candidateSha,publicSha:revision?.sourceSha || null,
      reason:'PUBLIC_SHA_NOT_CURRENT'};
  } catch (error) {
    return {status:'UNVERIFIED',stage:'live-check',candidateSha,reason:classifyTransport(error)};
  }
}

/**
 * Recover from a PROVEN terminal deployment failure or two confirmed critical
 * public failures. Never undo a pending rollout, a healthy site, an uncertain
 * probe, or a concurrent release. A previously validated GREEN SHA is mandatory.
 * A cooldown timestamp must be provided by the caller from persistent storage.
 */
export async function rollbackWithProof({
  failingSha, knownGoodSha, failureProof, verifyKnownGood, rollback,
  inspectPublic, lastRecoveryAt=null, now=new Date().toISOString(), cooldownHours=24
}) {
  if (!sha40.test(failingSha||'') || !sha40.test(knownGoodSha||'') ||
      failingSha===knownGoodSha || typeof verifyKnownGood!=='function' ||
      typeof rollback!=='function' || typeof inspectPublic!=='function') {
    return {status:'FAIL',reason:'INVALID_RECOVERY_CONTRACT'};
  }
  if (!(failureProof?.type==='TERMINAL_DEPLOY_FAILURE' && failureProof?.terminal===true) &&
      !(failureProof?.type==='PUBLIC_CRITICAL' && failureProof?.independentChecks>=2)) {
    return {status:'BLOCKED',reason:'NO_CONFIRMED_FAILURE'};
  }
  if (!Number.isFinite(Date.parse(now))) return {status:'FAIL',reason:'INVALID_CLOCK'};
  if (lastRecoveryAt && Number.isFinite(Date.parse(lastRecoveryAt)) &&
      Date.parse(now)-Date.parse(lastRecoveryAt)<cooldownHours*3600000) {
    return {status:'BLOCKED',reason:'ROLLBACK_COOLDOWN'};
  }
  let known;
  try {known=await verifyKnownGood({sha:knownGoodSha});}
  catch(e){return {status:'UNVERIFIED',stage:'known-good',reason:classifyTransport(e)};}
  if (!known || known.sha!==knownGoodSha || known.status!=='completed' ||
      known.conclusion!=='success') {
    return {status:'BLOCKED',reason:'KNOWN_GOOD_GREEN_PROOF_MISSING'};
  }
  let before;
  try { before=await inspectPublic(); }
  catch(e){return {status:'UNVERIFIED',stage:'concurrency-check',reason:classifyTransport(e)};}
  if (before?.sourceSha && before.sourceSha!==failingSha) {
    return {status:'BLOCKED',reason:'CONCURRENT_RELEASE_DETECTED'};
  }
  try { await rollback({toSha:knownGoodSha,fromSha:failingSha}); }
  catch(e){return {status:'BLOCKED',stage:'rollback',reason:classifyTransport(e)};}
  try {
    const after=await inspectPublic();
    if(after?.sourceSha===knownGoodSha && after?.httpStatus===200)
      return {status:'PASS_RECOVERY',restoredSha:knownGoodSha,proof:'PUBLIC_SHA_HTTP200'};
    return {status:'PARTIAL',stage:'readback',requestedSha:knownGoodSha,
      publicSha:after?.sourceSha||null};
  } catch(e){return {status:'UNVERIFIED',stage:'readback',reason:classifyTransport(e)};}
}

/**
 * Mandatory fail-closed release entry point for ASTRA production websites.
 * The caller must supply the current authorized hosting binding, historical
 * URL inventory, preview deployment, candidate quality proof and public probe.
 * Never promote directly based on a green provider card.
 */
export async function protectedDeploy(options={}) {
  const {sourceRepo,candidateSha,checkCandidate,promote,readPublicRevision,...safety}=options;
  return enforceReleaseSafety({...safety,candidateSha,
    executeGreenDeployment:()=>guardedDeploy({sourceRepo,candidateSha,checkCandidate,promote,readPublicRevision})});
}
