import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const docs=JSON.parse(read('dist/rendered-docs.json')).docs;
const manifest=JSON.parse(read('dist/publication-manifest.json'));
const old=JSON.parse(read('evidence/baseline-http.json')).responses;
const known=new Set([...Object.keys(old).map(x=>new URL(x).pathname),...docs.map(d=>d.path),'/en/','/feed-editorial.xml']);
const count=s=>(String(s).match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu)||[]).length;
const structuredText=d=>[d.lede,d.intro,d.notice,...d.decisions.flatMap(x=>[x.title,x.body]),...d.sections.flatMap(s=>[s.heading,...s.paragraphs,...s.bullets]),...d.faqs.flatMap(f=>[f.q,f.a])].filter(Boolean).join(' ');
test('ten substantive articles with distinct identities; only three are newly written',()=>{
 assert.equal(docs.length,10);assert.equal(new Set(docs.map(d=>d.path)).size,10);assert.equal(new Set(docs.map(d=>d.h1)).size,10);
 assert.equal(manifest.newOriginalArticles.length,3);assert.equal(manifest.reusedExistingArticles.length,7);
 for(const d of docs)assert(count(structuredText(d))>=1500,`${d.path}: ${count(structuredText(d))} words`);
});
test('each built page has its own canonical and H1, an Article schema and an indexable robots directive',()=>{
 for(const d of docs){const h=read('dist/'+d.path.split('/').filter(Boolean).at(-1)+'.html');
  assert(h.includes(`rel="canonical" href="https://freehotels.info${d.path}"`));assert.equal((h.match(/<h1>/g)||[]).length,1);assert(h.includes(d.h1.replaceAll('&','&amp;')));
  assert(h.includes('index,follow,max-image-preview:large'));assert(!/\bnoindex\b/.test(h));assert(h.includes('"@type":"Article"'));assert(!h.includes('"@type":"NewsArticle"'));
 }
});
test('licensed large photos and two distinct in-body diagrams per article',()=>{
 for(const d of docs){const h=read('dist/'+d.path.split('/').filter(Boolean).at(-1)+'.html'),body=h.match(/<article>([\s\S]*?)<\/article>/)?.[1]||'';
  assert(d.hero.width>=1200);assert(d.hero.source.startsWith('https://commons.wikimedia.org/wiki/File:'));assert(d.hero.licenseUrl.startsWith('https://'));assert(d.hero.credit);
  const imgs=[...body.matchAll(/<img[^>]*src="([^"]+)"/g)].map(m=>m[1]);assert.equal(imgs.length,2);assert.equal(new Set(imgs).size,2);assert(!imgs.includes(d.hero.src));
  for(const url of imgs){const svg=read('dist/assets/'+url.split('/').at(-1));assert(svg.includes('width="1600"'));assert(svg.includes('height="900"'));assert(!/<script|onload=|javascript:/i.test(svg));}
 }
 assert.equal(readdirSync(new URL('dist/assets',import.meta.url)).length,20);
});
test('no new guide is orphaned; all internal navigation targets are published or in this release',()=>{
 const incoming=Object.fromEntries(docs.map(d=>[d.path,0]));
 for(const f of [...manifest.htmlFiles,'english-index.html','fr-actualites-index.html']){
  const h=read('dist/'+f);
  for(const m of h.matchAll(/href="([^"#]+)(?:#[^"]*)?"/g)){
   const href=m[1];if(href.startsWith('https://freehotels.info')){const p=new URL(href).pathname;if(p in incoming)incoming[p]++;assert(known.has(p),'unknown internal '+href);}
   else if(href.startsWith('/')){const p=href.split('?')[0];assert(known.has(p),'unknown internal '+href);if(p in incoming)incoming[p]++;}
  }
 }
 assert(Object.values(incoming).every(n=>n>=3),JSON.stringify(incoming));
});
test('editorial sitemap preserves all nine old URLs and adds eleven; no invented metrics or News claim',()=>{
 const before=read('source/sitemap-editorial.xml'),after=read('dist/sitemap-editorial.xml');
 for(const m of before.matchAll(/<loc>(.*?)<\/loc>/g))assert(after.includes(m[0]));assert.equal((after.match(/<loc>/g)||[]).length,20);
 assert.equal(manifest.traffic30Days,null);assert.equal(manifest.keywordMetrics.volume,null);assert.equal(manifest.keywordMetrics.seoDifficulty,null);assert.equal(manifest.newNewsArticles,0);
});
test('new coastal guides preserve the important property distinctions and separate closure notices',()=>{
 const m=docs.find(d=>d.path.includes('/myrtle-')),o=docs.find(d=>d.path.includes('/ocean-city-')),v=docs.find(d=>d.path.includes('/virginia-beach-'));
 assert(structuredText(m).includes('seasonally enclosed lazy river'));assert(structuredText(m).includes('Carolina Winds'));
 assert(structuredText(o).includes('hot tub has a 15–22 November 2026 closure'));assert(structuredText(o).includes('Neither notice should be rewritten'));
 assert(structuredText(v).includes('Fairfield Inn & Suites'));assert(structuredText(v).includes('Coastal Hotel & Suites'));
});
