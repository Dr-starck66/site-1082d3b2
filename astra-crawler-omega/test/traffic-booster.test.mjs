import test from "node:test";import assert from "node:assert/strict";import {analyzeTrafficBoost,rankPortfolio} from "../traffic-booster.mjs";

test("identifies indexable fast wins and blocked pages",()=>{
 const crawl={results:[
  {url:"https://x.test/a",status:200,indexable:true,depth:0,title:"Avocat Belgique Divorce",metaDescription:null,h1s:["Avocat Belgique Divorce"],canonical:"https://x.test/a",links:["https://x.test/b"],images:[],schemaTypes:[],warnings:[]},
  {url:"https://x.test/b",status:200,indexable:false,depth:1,title:"B",metaDescription:"D",h1s:["B"],canonical:"https://x.test/b",links:[],images:[],schemaTypes:[],warnings:["NOINDEX"]}
 ]};
 const r=analyzeTrafficBoost(crawl);
 assert.equal(r.summary.pages,2);
 assert.equal(r.summary.fastWins,1);
 assert.equal(r.summary.blocked,1);
 assert.equal(r.opportunities[0].classification,"FAST_WIN");
 assert.ok(r.opportunities[0].actions.includes("ADD_INTERNAL_LINKS_3_PLUS"));
 assert.ok(r.opportunities[0].actions.includes("ADD_CONTEXTUAL_INTERNAL_LINKS"));
 assert.equal(r.opportunities[0].actions.includes("ADD_CONTEXTUAL_OUTLINKS"),false);
 assert.match(r.semantics.outLinks,/internal links/i);
 assert.ok(r.opportunities[0].querySeeds.includes("avocat"));
});

test("portfolio prioritizes broken domains before optimization wins",()=>{
 const a={url:"a",report:{summary:{pages:10,fastWins:5,blocked:0,healthy:5,averageReadiness:60}}};
 const b={url:"b",report:{summary:{pages:10,fastWins:0,blocked:5,healthy:5,averageReadiness:80}}};
 const ranked=rankPortfolio([a,b]);
 assert.equal(ranked[0].url,"b");
 assert.equal(ranked.find(x=>x.url==="a").status,"PASS");
 assert.equal(ranked.find(x=>x.url==="b").status,"PARTIAL");
});

test("portfolio fails closed when every crawled page is blocked",()=>{
 const x={url:"blocked",report:{summary:{pages:1,fastWins:0,blocked:1,healthy:0,averageReadiness:0}}};
 const r=rankPortfolio([x])[0];
 assert.equal(r.status,"FAIL");
 assert.equal(r.evidence.allPagesBlocked,true);
 assert.equal(r.evidence.usablePages,0);
 const ok={url:"ok",report:{summary:{pages:2,fastWins:2,blocked:0,healthy:0,averageReadiness:70}}};
 assert.equal(rankPortfolio([ok,x])[0].url,"blocked");
});
