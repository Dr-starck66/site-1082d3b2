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
 assert.ok(r.opportunities[0].querySeeds.includes("avocat"));
});

test("portfolio ranks actionable domains first",()=>{
 const a={url:"a",report:{summary:{pages:10,fastWins:5,blocked:0,averageReadiness:60}}};
 const b={url:"b",report:{summary:{pages:10,fastWins:0,blocked:5,averageReadiness:80}}};
 assert.equal(rankPortfolio([b,a])[0].url,"a");
});
