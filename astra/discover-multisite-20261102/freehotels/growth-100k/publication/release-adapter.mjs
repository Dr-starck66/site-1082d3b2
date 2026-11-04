import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {protectedDeploy} from './source/release/bridge.mjs';
const root=new URL('./',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const write=(p,v)=>writeFileSync(new URL(p,root),JSON.stringify(v,null,2)+'\n');
const config=read('evidence/candidate.json');
let phase='before';
const fetchImpl=async url=>{
 // These are complete responses returned by the authenticated host connector,
 // not generated fixtures. Missing or stale receipts block the release.
 const transport=read('evidence/'+(phase==='before'?'preflight-responses':'postflight-responses')+'.json');
 if(transport.source!=='authorized-vercel-web-fetch'||Date.now()-Date.parse(transport.collectedAt)>3600000)throw Error('NO_FRESH_HTTP_RECEIPTS');
 const record=transport.responses[String(url)];if(!record||record.status!==200||typeof record.text!=='string')throw Error('HTTP_RECEIPT_MISSING_OR_FAILED '+url);
 return new Response(record.text,{status:record.status,headers:record.headers});
};
const result=await protectedDeploy({
 sourceRepo:'Dr-starck66/site-1082d3b2',candidateSha:config.sha,manifest:config.manifest,fetchImpl,
 readObservedBinding:async()=>read('evidence/provider-binding.json'),
 checkCandidate:async({sha})=>{
  const test=read('evidence/local-tests.json'),pages=read('evidence/candidate-pages.json'),remote=read('evidence/remote-build-manifest.json');
  if(test.exitCode!==0||test.passed!==6||test.failed!==0||pages.passed!==10||pages.inlineAssetsPassed!==20||pages.renderedMediaPassed!==30)throw Error('CANDIDATE_NOT_GREEN');
  for(const [p,hash]of Object.entries(remote.sourceHashes)){if(createHash('sha256').update(readFileSync(new URL(p,root))).digest('hex')!==hash)throw Error('SOURCE_BUILD_HASH_MISMATCH');}
  if(sha!==config.sha||remote.articles.length!==10)throw Error('CANDIDATE_IDENTITY_MISMATCH');
  return {sha,status:'completed',conclusion:'success',workflowRunId:null};
 },
 promote:async({sha})=>{
  write('evidence/PROMOTION_REQUEST.json',{candidateSha:sha,versionId:config.versionId,requestedAt:new Date().toISOString(),reason:'Actual protectedDeploy preflight and candidate checks passed'});
  console.log('PROMOTION_REQUEST_READY');
  const deadline=Date.now()+12*60000;
  while(!existsSync(new URL('evidence/PROMOTED.json',root))){if(Date.now()>deadline)throw Error('PROMOTION_ADAPTER_TIMEOUT');await new Promise(r=>setTimeout(r,250));}
  const response=read('evidence/PROMOTED.json');if(response.versionId!==config.versionId||response.success!==true)throw Error('PROMOTION_NOT_CONFIRMED');
  phase='after';
 },
 readPublicRevision:async()=>{
  const post=read('evidence/postflight-responses.json');const page=post.responses['https://freehotels.info/en/hotels-with-indoor-pools/'];
  return {sourceSha:page?.headers?.['x-jsd-version']||null,httpStatus:page?.status};
 }
});
write('evidence/release-guard-result.json',result);console.log(JSON.stringify(result));if(result.status!=='PASS_PRODUCTION')process.exitCode=1;
