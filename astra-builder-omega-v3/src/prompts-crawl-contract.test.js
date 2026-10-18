import test from 'node:test';
import assert from 'node:assert/strict';
import {prompts, ASTRA_CRAWL_GENERATION_CONTRACT} from './prompts.js';
const applicable=['reverseArchitect','architect','frontend','backend','ops','adversary','evolveSpec','improve','repair','verify'];
test('every agent role that can design, generate or repair web code inherits crawler contract',()=>{
  assert.equal(applicable.length,10);
  for(const role of applicable){
    assert.ok(prompts[role].includes(ASTRA_CRAWL_GENERATION_CONTRACT),'missing '+role);
  }
});
test('fallback scope explicitly excludes specialized APIs and prohibited targets',()=>{
  for(const term of ['astra-crawler-omega-prod-production.up.railway.app','Firecrawl','robots','RDAP','Search Console','PARTIAL','401/403/404/429']){
    assert.ok(ASTRA_CRAWL_GENERATION_CONTRACT.includes(term),'missing '+term);
  }
});
test('preview, database and auth are not forced to use an HTML crawler',()=>{
  for(const role of ['preview','database','auth']){
    assert.ok(!prompts[role].includes(ASTRA_CRAWL_GENERATION_CONTRACT),'unexpected crawler role '+role);
  }
});
test('backend retains its existing deterministic runtime and JSON constraints',()=>{
 assert.ok(prompts.backend.includes('NE GÉNÈRE JAMAIS backend/src/server.ts'));
 assert.ok(prompts.backend.includes('JSON strict'));
 assert.ok(prompts.backend.includes('ASTRA CRAWL Ω'));
});
