import assert from "node:assert/strict";
import {auditDesign,DESIGN_GENERATION_CONTRACT,DESIGN_INTELLIGENCE_VERSION} from "./design-intelligence.js";

const spec={
  appName:"Design Gate Fixture",
  goal:"Build a clear responsive dashboard for independent professionals.",
  acceptance:["One primary task is obvious","Keyboard navigation remains visible","Mobile layout stays usable"],
  visualDirection:"Editorial utility: warm neutrals, sharp type hierarchy, restrained surfaces."
};

const good=[
  {path:"preview/index.html",content:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><header><nav aria-label="Primary"><a href="#main">Home</a></nav></header><main id="main"><h1>Client overview</h1><img src="chart.png" alt="Monthly revenue chart"><button>Open client</button></main></body></html>`},
  {path:"preview/styles.css",content:`
  body{font-family:"Astra Sans",sans-serif;color:#18211c;background:#f6f3ec}
  button{min-height:44px;padding:10px 16px}
  button:focus-visible,a:focus-visible{outline:3px solid currentColor;outline-offset:3px}
  @media(max-width:720px){main{padding:16px}}
  @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  `}
];
const bad=[
  {path:"preview/index.html",content:`<html><body><h1>One</h1><h1>Two</h1><img src="hero.png"><button>Go</button></body></html>`},
  {path:"preview/styles.css",content:`
  body{font-family:Inter,Arial,system-ui}
  .a{background:linear-gradient(red,blue)}
  .b{background:linear-gradient(red,blue)}
  .c{background:linear-gradient(red,blue)}
  .d{background:linear-gradient(red,blue)}
  .e{background:linear-gradient(red,blue)}
  `}
];

const goodResult=auditDesign(good,spec);
const badResult=auditDesign(bad,spec);

assert.equal(DESIGN_INTELLIGENCE_VERSION,"1.0.0");
assert.match(DESIGN_GENERATION_CONTRACT,/Shape the UX before styling/);
assert.equal(goodResult.status,"PASS",JSON.stringify(goodResult,null,2));
assert.equal(goodResult.counts.fail,0);
assert.equal(badResult.status,"FAIL",JSON.stringify(badResult,null,2));
assert.ok(badResult.findings.some(x=>x.id==="heading-hierarchy"&&x.status==="FAIL"));
assert.ok(badResult.findings.some(x=>x.id==="responsive-viewport"&&x.status==="FAIL"));
assert.ok(badResult.findings.some(x=>x.id==="image-alt"&&x.status==="FAIL"));

console.log("[ASTRA DESIGN INTELLIGENCE SELFTEST]",JSON.stringify({
  ok:true,
  version:DESIGN_INTELLIGENCE_VERSION,
  good:{status:goodResult.status,score:goodResult.score},
  bad:{status:badResult.status,score:badResult.score},
  checks:8
}));
