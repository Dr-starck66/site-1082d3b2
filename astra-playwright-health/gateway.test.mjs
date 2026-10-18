import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyLog} from './gateway.mjs';
const view=()=>({httpStatus:200,screenshotBytes:2500,metrics:{h1:{risible:true},horizontalOverflow:false,overflow:[],hasResultsTitle:true,hasGenericError:false,brokenImageCount:0,missingAltCount:0,scoreTextSamples:['1-0']}});
const done=(x={})=>({ok:false,phase:'done',data:{raw:'### Result\n'+JSON.stringify({desktop:view(),mobile:view(),consoleErrors:[],firstPartyFail:[],firstPartyBad:[],...x})}});
const make=(...items)=>items.map(e=>'ASTRA_DIRECT_VISUAL_GATE '+JSON.stringify(e)).join('\n');
const shared={phase:'error',error:'TOOL:browser_close: The browser context is shared between clients and cannot be closed.'};
test('pass verified render without treating known shared close as site failure',()=>{
 const r=classifyLog(make(done(),shared),1000,1001);
 assert.equal(r.ok,true);assert.equal(r.visualStatus,'PASS');assert.equal(r.legacyHarnessStatus,'FAIL');assert.deepEqual(r.warnings,['SHARED_CONTEXT_CLEANUP_UNSUPPORTED']);assert.equal(r.scoreAccuracyVerified,false);
});
test('never pass render with failed first-party response',()=>{
 const r=classifyLog(make(done({firstPartyBad:[{status:500}]}),shared),1,2);
 assert.equal(r.ok,false);assert.ok(r.reasons.includes('FIRST_PARTY_HTTP'));
});
test('unknown browser error remains fatal',()=>{
 const r=classifyLog(make(done(),{phase:'error',error:'OOM'}),1,2);
 assert.equal(r.ok,false);assert.ok(r.reasons.includes('UNEXPECTED_BROWSER_ERROR'));
});
test('missing and stale visual proofs fail',()=>{
 assert.equal(classifyLog('',1,2).ok,false);
 const r=classifyLog(make(done()),1,8*3600*1000+2);assert.equal(r.ok,false);assert.ok(r.reasons.includes('STALE_VISUAL_EVIDENCE'));
});
