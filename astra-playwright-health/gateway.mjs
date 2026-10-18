// ASTRA visual health gateway: verify Chromium evidence; do not change the legacy boot script.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
const PREFIX='ASTRA_DIRECT_VISUAL_GATE ';
const CLOSE_ERROR='The browser context is shared between clients and cannot be closed.';
export function classifyLog(log, seenAt=Date.now(), now=Date.now()) {
  const events=[];
  for (const line of String(log||'').split(/\r?\n/)){
    const at=line.indexOf(PREFIX);
    if(at<0)continue;
    try{const item=JSON.parse(line.slice(at+PREFIX.length));if(item.phase)events.push(item)}catch{}
  }
  const doneIndex=events.findLastIndex(item=>item.phase==='done');
  if(doneIndex<0)return {ok:false,phase:'boot',reason:'NO_VERIFIED_BROWSER_RESULT'};
  const done=events[doneIndex],errors=events.slice(doneIndex+1).filter(e=>e.phase==='error');
  const fatal=errors.some(e=>!String(e.error||'').includes(CLOSE_ERROR));
  let data;
  try{data=JSON.parse(String(done.data.raw).split(/\r?\n/).find(s=>s.startsWith('{')))}catch{}
  const reasons=[],viewports={};
  for(const name of ['desktop','mobile']){
    const row=data?.[name],m=row?.metrics;
    if(row?.httpStatus!==200)reasons.push(name+'_HTTP');
    if(!(m?.h1?.visible===true||m?.h1?.risible===true))reasons.push(name+'_H1_NOT_VISIBLE');
    if(m?.horizontalOverflow!==false||(m?.overflow||[]).length)reasons.push(name+'_OVERFLOW');
    if(!m||m.hasGenericError||m.hasResultsTitle!==true)reasons.push(name+'_INVALID_CONTENT');
    if(!Number.isInteger(m?.brokenImageCount)||m.brokenImageCount>0)reasons.push(name+'_BROKEN_IMAGES');
    if(!Number.isInteger(m?.missingAltCount)||m.missingAltCount>0)reasons.push(name+'_MISSING_ALT');
    if(!m?.scoreTextSamples?.length)reasons.push(name+'_NO_SCORES');
    if(!Number.isFinite(row?.screenshotBytes)||row.screenshotBytes<1000)reasons.push(name+'_SCREENSHOT');
    viewports[name]={http:row?.httpStatus??null,renderedScores:m?.scoreTextSamples?.length??0,
      screenshotBytes:row?.screenshotBytes??0,brokenImages:m?.brokenImageCount??null};
  }
  if(data?.consoleErrors?.length)reasons.push('CONSOLE');
  if(data?.firstPartyFail?.length)reasons.push('FIRST_PARTY_NETWORK');
  if(data?.firstPartyBad?.length)reasons.push('FIRST_PARTY_HTTP');
  if(fatal)reasons.push('UNEXPECTED_BROWSER_ERROR');
  if(now-seenAt>8*3600*1000)reasons.push('STALE_VISUAL_EVIDENCE');
  const ok=reasons.length===0;
  return {ok,phase:'done',visualStatus:ok?'PASS':'FAIL',legacyHarnessStatus:done.ok===true?'PASS':'FAIL',
    warnings:errors.some(e=>String(e.error||'').includes(CLOSE_ERROR))?['SHARED_CONTEXT_CLEANUP_UNSUPPORTED']:[],
    reasons,viewports,scope:'RENDERED_VISUAL_ONLY',scoreAccuracyVerified:false};
}
export function startGateway({path=process.env.ASTRA_VISUAL_LOG||'/tmp/astra-visual.log',port=Number(process.env.PORT||8080)}={}){
 let signature='',observed=Date.now();
 const srv=createServer((req,res)=>{
   res.setHeader('content-type','application/json');
   res.setHeader('cache-control','no-store');
   if(req.method!=='GET'||!['/health','/last'].includes(req.url)){res.writeHead(404).end('{}');return}
   let raw='';try{raw=readFileSync(path,'utf8')}catch{}
   const last=raw.split(/\r?\n/).filter(x=>x.includes(PREFIX)&&x.includes('"phase":"done"')).at(-1)||'';
   if(last&&last!==signature){signature=last;observed=Date.now()}
   const v=classifyLog(raw,observed);res.writeHead(v.ok?200:503).end(JSON.stringify(v));
 });
 srv.listen(port,'0.0.0.0',()=>console.log('ASTRA_VISUAL_GATE_LISTEN',port));return srv;
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1])) startGateway();
