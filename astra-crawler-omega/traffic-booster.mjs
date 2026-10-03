const STOP=new Set(["avec","dans","pour","plus","une","des","les","aux","sur","par","que","qui","the","and","for","with","from","this","that","your","you","are","como","para","con","una","del","las","los","por","más","mais","est","www","http","https"]);

function words(s=""){return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(x=>x.length>=3&&!STOP.has(x))}
function seeds(row){const bag=[...(words(row.title)),...(row.h1s||[]).flatMap(words),...words(row.metaDescription)];const seen=[];for(const w of bag)if(!seen.includes(w))seen.push(w);return seen.slice(0,8)}
function clamp(n,a=0,b=100){return Math.max(a,Math.min(b,n))}
export function analyzeTrafficBoost(crawl){
 const rows=Array.isArray(crawl?.results)?crawl.results:[];
 const indegree=new Map(),outdegree=new Map();
 for(const r of rows){outdegree.set(r.url,(r.links||[]).filter(x=>rows.some(y=>y.url===x||y.finalUrl===x)).length);for(const l of (r.links||[])){const t=rows.find(y=>y.url===l||y.finalUrl===l);if(t)indegree.set(t.url,(indegree.get(t.url)||0)+1)}}
 const titleCounts=new Map();for(const r of rows){if(r.title)titleCounts.set(r.title,(titleCounts.get(r.title)||0)+1)}
 const opportunities=rows.map(r=>{
   const warnings=new Set(r.warnings||[]),inLinks=indegree.get(r.url)||0,outLinks=outdegree.get(r.url)||0;
   let readiness=0;
   if(r.indexable)readiness+=30; else readiness-=35;
   if(r.status>=200&&r.status<300)readiness+=10;
   if(r.title)readiness+=8;
   if(r.metaDescription)readiness+=7;
   if((r.h1s||[]).length===1)readiness+=8;
   if(r.canonical)readiness+=8;
   if(inLinks>=3)readiness+=12; else if(inLinks===0)readiness-=15;
   if(outLinks>=3)readiness+=5;
   if((r.schemaTypes||[]).length)readiness+=5;
   if((r.images||[]).some(x=>x.width>=1200))readiness+=4;
   if(warnings.has("DUPLICATE_TITLE")||(r.title&&titleCounts.get(r.title)>1))readiness-=15;
   const actions=[];
   if(!r.indexable)actions.push("RESTORE_INDEXABILITY");
   if(!r.title)actions.push("WRITE_SEARCH_TITLE");
   if(!r.metaDescription)actions.push("WRITE_META_DESCRIPTION");
   if((r.h1s||[]).length!==1)actions.push("FIX_H1");
   if(!r.canonical)actions.push("ADD_SELF_CANONICAL");
   if(inLinks===0)actions.push("ADD_INTERNAL_LINKS_3_PLUS");
   else if(inLinks<3)actions.push("ADD_INTERNAL_LINKS");
   if(outLinks<3)actions.push("ADD_CONTEXTUAL_INTERNAL_LINKS");
   if(!(r.schemaTypes||[]).length)actions.push("ADD_RELEVANT_SCHEMA");
   if(!(r.images||[]).some(x=>x.width>=1200))actions.push("ADD_1200PX_IMAGE");
   if(warnings.has("DUPLICATE_TITLE")||(r.title&&titleCounts.get(r.title)>1))actions.push("RESOLVE_DUPLICATE_TITLE");
   const fastWin=r.indexable&&r.status>=200&&r.status<300&&actions.length>0;
   const priority=clamp((fastWin?35:0)+(100-clamp(readiness))*0.45+Math.min(inLinks,8)*2+Math.min(outLinks,8));
   return{url:r.url,status:r.status,indexable:r.indexable,depth:r.depth,inLinks,outLinks,querySeeds:seeds(r),readinessScore:clamp(Math.round(readiness)),priorityScore:Math.round(priority),classification:!r.indexable?"BLOCKED":fastWin?"FAST_WIN":"HEALTHY",actions};
 }).sort((a,b)=>b.priorityScore-a.priorityScore);
 const fastWins=opportunities.filter(x=>x.classification==="FAST_WIN");
 const blocked=opportunities.filter(x=>x.classification==="BLOCKED");
 const healthy=opportunities.filter(x=>x.classification==="HEALTHY");
 const avg=opportunities.length?Math.round(opportunities.reduce((s,x)=>s+x.readinessScore,0)/opportunities.length):0;
 return{
   schema:"astra-semrush-traffic-booster/v1",
   generatedAt:new Date().toISOString(),
   truth:"This is an internal ranking-opportunity model, not a claimed Semrush traffic measurement.",
   semantics:{outLinks:"Count of contextual internal links to other crawled pages; external authority links are not inferred from this metric."},
   summary:{pages:opportunities.length,fastWins:fastWins.length,blocked:blocked.length,healthy:healthy.length,averageReadiness:avg},
   topActions:fastWins.slice(0,25),
   blocked:blocked.slice(0,25),
   opportunities
 };
}

export function rankPortfolio(reports){
 return reports.map(r=>{
   const summary=r.report?.summary||{};
   const pages=summary.pages||0,fastWins=summary.fastWins||0,blocked=summary.blocked||0,healthy=summary.healthy||0,averageReadiness=summary.averageReadiness||0;
   const usablePages=fastWins+healthy;
   const status=r.error?"FAIL":pages===0?"FAIL":blocked>=pages?"FAIL":blocked>0?"PARTIAL":"PASS";
   return{
     url:r.url,status,error:r.error||null,pages,fastWins,blocked,averageReadiness,
     opportunityScore:r.report?Math.max(0,Math.round((fastWins*12)+(100-averageReadiness)-(blocked*5))):0,
     evidence:{usablePages,allPagesBlocked:pages>0&&blocked>=pages}
   };
 }).sort((a,b)=>{const severity={FAIL:0,PARTIAL:1,PASS:2};return (severity[a.status]-severity[b.status])||(b.opportunityScore-a.opportunityScore);});
}
