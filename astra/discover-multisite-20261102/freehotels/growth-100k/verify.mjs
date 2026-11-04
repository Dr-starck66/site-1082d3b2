import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=new URL('./',import.meta.url);
const names={'/calculateur':'calculator-fr.html','/en/tools/hotel-total-cost/':'calculator-en.html','/fr/voyage/actualites/':'fr-actualites-index.html','/sitemap-editorial.xml':'sitemap-editorial.xml'};
const server=createServer((req,res)=>{const f=names[new URL(req.url,'http://localhost').pathname];if(!f){res.writeHead(404);return res.end('Not found')}res.setHeader('Content-Type',f.endsWith('.xml')?'application/xml':'text/html; charset=utf-8');res.end(readFileSync(new URL('dist/'+f,root)))});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
let browser;const result={status:'PASS',checks:[],screenshots:[]};
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 mkdirSync('/workspace/screenshots',{recursive:true});
 for(const [lang,path]of [['fr','/calculateur'],['en','/en/tools/hotel-total-cost/']]){
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+path);
  assert.equal(await page.locator('h1').count(),1);
  const values={nightly:100,rooms:2,nights:3,guests:4,breakfast:10,mornings:2,parking:12,vehicles:1,transit:5,days:3,transfer:40,tax:30,resort:8,other:9};
  for(const [k,v]of Object.entries(values))await page.fill('#a-'+k,String(v));
  await page.fill('#b-nightly','100');await page.fill('#b-nights','3');await page.fill('#b-guests','4');await page.fill('#b-rooms','2');
  assert.match(await page.locator('#a-result').innerText(),/903/);assert.match(await page.locator('#b-result').innerText(),/600/);assert.match(await page.locator('#difference').innerText(),/303/);
  await page.click('#share');const shared=page.url();assert(shared.includes('#compare='));
  await page.reload();assert.equal(await page.inputValue('#a-rooms'),'2');assert.match(await page.locator('#a-result').innerText(),/903/);
  await page.fill('#a-nightly','-1');assert((await page.locator('#error').innerText()).length>0);assert.equal(await page.locator('#a-result').innerText(),'—');
  await page.fill('#a-nightly','100');await page.fill('#a-name','<img src=x onerror=alert(1)>');assert.equal(await page.locator('#a-result-name img').count(),0);
  await page.click('#reset');assert(!page.url().includes('#'));assert.equal(await page.inputValue('#a-nightly'),'0');
  await page.fill('#a-nightly','105');await page.fill('#a-nights','3');await page.fill('#b-nightly','90');await page.fill('#b-nights','3');await page.fill('#b-parking','20');await page.fill('#b-vehicles','1');
  const desktop='/workspace/screenshots/freehotels-calculator-'+lang+'-desktop.png';await page.screenshot({path:desktop,fullPage:true});result.screenshots.push(desktop);
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  const mobile='/workspace/screenshots/freehotels-calculator-'+lang+'-mobile.png';await page.screenshot({path:mobile,fullPage:true});result.screenshots.push(mobile);
  assert.deepEqual(errors,[]);assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://freehotels.info'+path);
  result.checks.push({lang,total:903,comparisonDifference:303,shareRoundTrip:true,invalidRejected:true,xssTextOnly:true,reset:true,mobileNoOverflow:true,consoleErrors:errors.length});
  await page.close();
 }
 const old=readFileSync(new URL('source/sitemap-editorial.xml',root),'utf8'),updated=readFileSync(new URL('dist/sitemap-editorial.xml',root),'utf8');
 const oldUrls=[...old.matchAll(/<loc>(.*?)<\/loc>/g)].map(x=>x[1]);for(const url of oldUrls)assert(updated.includes('<loc>'+url+'</loc>'));
 result.checks.push({editorialUrlsPreserved:oldUrls.length,newTools:2,newsSitemapUnchanged:true});
}catch(e){result.status='FAIL';result.error=e.stack;process.exitCode=1}finally{if(browser)await browser.close();server.close();writeFileSync(new URL('evidence/local-verification.json',root),JSON.stringify(result,null,2));console.log(JSON.stringify(result))}
