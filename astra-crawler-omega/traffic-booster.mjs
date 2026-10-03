const STOP=new Set(["avec","dans","pour","plus","une","des","les","aux","sur","par","que","qui","the","and","for","with","from","this","that","your","you","are","como","para","con","una","del","las","los","por","más","mais","est","www","http","https"]);

function words(s=""){return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(x=>x.length>=3&&!STOP.has(x))}
function seeds(row){const bag=[...(words(row.title)),...(row.h1s||[]).flatMap(words),...words(row.metaDescription)];const seen=[];for(const w of bag)if(!seen.includes(w))seen.push(w);return seen.slice(0,8)}
function clamp(n,a=0,b=100){return Math.max(a,Math.min(b,n))}
function identity(row){return row?.canonical||row?.finalUrl||row?.url||""}
function norm(u){try{const x=new URL(String(u));x.hash="";if(x.pathname.length>1)x.pathname=x.pathname.replace(/\/+$/,"");return x.toString().replace(/\/$/,"")}catch{return String(u||"")}}

export function analyzeTrafficBoost(crawl){
 const raw=Array.isArray(crawl?.results)?crawl.results:[];
 const aliases=new Map();
 for(const r of raw){
   const id=norm(identity(r));
   for(const u of [r.url,r.finalUrl,r.canonical].filter(Boolean))aliases.set(norm(u),id);
 }
 const chosen=new Map();
 for(const r of raw){
   const id=norm(identity(r));
   const prev=chosen.get(id);
   const canonicalMatch=norm(r.url)===id||norm(r.finalUrl)===id;
   const prevMatch=prev&&(norm(prev.url)===id||norm(prev.finalUrl)===id);
   if(!prev||(!prevMatch&&canonicalMatch))chosen.set(id,r);
 }
 const rows=[...chosen.values()];
 const inbound=new Map(),outbound=new Map();
 for(const r of raw){
   const source=norm(identity(r));if(!source)continue;
   if(!outbound.has(source))outbound.set(source,new Set());
   for(const l of (r.links||[])){
     const target=aliases.get(norm(l));
     if(!target||target===source)continue;
     outbound.get(source).add(target);
     if(!inbound.has(target))inbound.set(target,new Set());
     inbound.get(target).add(source);
   }
 }
 const titleIds=new Map();
 for(const r of rows){
   if(!r.title)continue;
   if(!titleIds.has(r.title))titleIds.set(r.title,new Set());
   titleIds.get(r.title).add(norm(identity(r)));
 }
 const opportunities=rows.map(r=>{
   const id=norm(identity(r));
   const warnings=new Set(r.warnings||[]);
   const inLinks=(inbound.get(id)||new Set()).size;
   const outLinks=(outbound.get(id)||new Set()).size;
   const duplicateTitle=!!r.title&&((titleIds.get(r.title)||new Set()).size>1);
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
   if(warnings.has("DUPLICATE_TITLE")||duplicateTitle)readiness-=15;
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
   if(warnings.has("DUPLICATE_TITLE")||duplicateTitle)actions.push("RESOLVE_DUPLICATE_TITLE");
   const fastWin=r.indexable&&r.status>=200&&r.status<300&&actions.length>0;
   const priority=clamp((fastWin?35:0)+(100-clamp(readiness))*0.45+Math.min(inLinks,8)*2+Math.min(outLinks,8));
   return{url:r.url,canonicalIdentity:id,status:r.status,indexable:r.indexable,depth:r.depth,inLinks,outLinks,querySeeds:seeds(r),readinessScore:clamp(Math.round(readiness)),priorityScore:Math.round(priority),classification:!r.indexable?"BLOCKED":fastWin?"FAST_WIN":"HEALTHY",actions};
 }).sort((a,b)=>b.priorityScore-a.priorityScore);
 const fastWins=opportunities.filter(x=>x.classification==="FAST_WIN");
 const blocked=opportunities.filter(x=>x.classification==="BLOCKED");
 const healthy=opportunities.filter(x=>x.classification==="HEALTHY");
 const avg=opportunities.length?Math.round(opportunities.reduce((s,x)=>s+x.readinessScore,0)/opportunities.length):0;
 return{
   schema:"astra-semrush-traffic-booster/v1",
   generatedAt:new Date().toISOString(),
   truth:"This is an internal ranking-opportunity model, not a claimed Semrush traffic measurement.",
   semantics:{pages:"Canonical-deduplicated pages.",inLinks:"Unique internal source canonicals linking to this canonical.",outLinks:"Unique contextual internal target canonicals linked from this canonical; external authority links are not inferred from this metric."},
   summary:{pages:opportunities.length,rawPages:raw.length,canonicalAliases:Math.max(0,raw.length-opportunities.length),fastWins:fastWins.length,blocked:blocked.length,healthy:healthy.length,averageReadiness:avg},
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
     evidence:{usablePages,allPagesBlocked:pages>0&&blocked>=pages,rawPages:summary.rawPages||pages,canonicalAliases:summary.canonicalAliases||0}
   };
 }).sort((a,b)=>{const severity={FAIL:0,PARTIAL:1,PASS:2};return (severity[a.status]-severity[b.status])||(b.opportunityScore-a.opportunityScore);});
}
