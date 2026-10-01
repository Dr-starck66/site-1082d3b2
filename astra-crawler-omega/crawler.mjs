const UA="Mozilla/5.0 (compatible; AstraCrawlerOmega/1.0; +https://example.invalid/bot)";

function cleanText(s=""){return String(s).replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();}
function attr(tag,name){const m=String(tag).match(new RegExp("\\b"+name+"\\s*=\\s*([\"'])(.*?)\\1","i"));return m?m[2]:null;}
export function parseHtml(html,baseUrl){
 const title=cleanText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"")||null;
 const h1s=[...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>cleanText(m[1])).filter(Boolean);
 const descriptions=[...html.matchAll(/<meta\b[^>]*>/gi)].filter(m=>/\bname\s*=\s*["']description["']/i.test(m[0])).map(m=>attr(m[0],"content")).filter(Boolean);
 const robots=[...html.matchAll(/<meta\b[^>]*>/gi)].filter(m=>/\bname\s*=\s*["']robots["']/i.test(m[0])).map(m=>attr(m[0],"content")).filter(Boolean);
 const canonicalTag=[...html.matchAll(/<link\b[^>]*>/gi)].find(m=>/\brel\s*=\s*["'][^"']*canonical/i.test(m[0]));
 let canonical=null;try{if(canonicalTag){const h=attr(canonicalTag[0],"href");if(h)canonical=new URL(h,baseUrl).href}}catch{}
 const links=[];for(const m of html.matchAll(/<a\b[^>]*>/gi)){const h=attr(m[0],"href");if(!h||/^(?:#|javascript:|mailto:|tel:)/i.test(h))continue;try{links.push(new URL(h,baseUrl).href)}catch{}}
 const images=[];for(const m of html.matchAll(/<img\b[^>]*>/gi)){const src=attr(m[0],"src");if(!src)continue;let abs=src;try{abs=new URL(src,baseUrl).href}catch{};const w=Number(attr(m[0],"width"))||null,h=Number(attr(m[0],"height"))||null;images.push({src:abs,alt:attr(m[0],"alt"),width:w,height:h})}
 const schemaTypes=[...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(m=>{try{const x=JSON.parse(m[1]);const rows=Array.isArray(x)?x:[x];return rows.flatMap(o=>Array.isArray(o?.["@graph"])?o["@graph"]:o).map(o=>o?.["@type"]).flat().filter(Boolean)}catch{return[]}});
 return{title,h1s,metaDescription:descriptions[0]||null,robotsMeta:robots[0]||null,canonical,links:[...new Set(links)],images,schemaTypes:[...new Set(schemaTypes)]};
}
function robotDisallows(txt,pathname){
 const lines=String(txt||"").split(/\r?\n/).map(x=>x.replace(/#.*/,"").trim()).filter(Boolean);
 let applies=false;for(const line of lines){const [k,...r]=line.split(":");const v=r.join(":").trim();if(/^user-agent$/i.test(k))applies=v==="*"||/astracrawler/i.test(v);else if(applies&&/^disallow$/i.test(k)&&v&&pathname.startsWith(v))return true}return false;
}
async function fetchText(url,timeout=12000){
 const r=await fetch(url,{headers:{"user-agent":UA,"accept":"text/html,application/xhtml+xml,*/*;q=0.8"},redirect:"follow",signal:AbortSignal.timeout(timeout)});
 const text=await r.text();return{status:r.status,url:r.url,contentType:r.headers.get("content-type")||"",text};
}
function normalize(u){const x=new URL(u);x.hash="";if(x.pathname!=="/")x.pathname=x.pathname.replace(/\/+$/,"");return x.href;}
export async function crawlSite(input){
 const start=normalize(input.url),origin=new URL(start).origin,maxPages=Math.max(1,Math.min(250,Number(input.maxPages)||50)),maxDepth=Math.max(0,Math.min(8,Number(input.maxDepth)||3));
 let robotsText="";try{robotsText=(await fetchText(origin+"/robots.txt",5000)).text}catch{}
 const sitemapUrls=new Set();try{const sm=(await fetchText(origin+"/sitemap.xml",7000)).text;for(const m of sm.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)){try{const u=normalize(m[1].trim());if(new URL(u).origin===origin)sitemapUrls.add(u)}catch{}}}catch{}
 const q=[{url:start,depth:0}],seen=new Set(),results=[];
 while(q.length&&results.length<maxPages){
   const item=q.shift();if(seen.has(item.url))continue;seen.add(item.url);
   let row={url:item.url,depth:item.depth,status:0,finalUrl:null,title:null,metaDescription:null,h1s:[],canonical:null,robotsMeta:null,indexable:false,links:[],images:[],schemaTypes:[],warnings:[]};
   try{
     if(robotDisallows(robotsText,new URL(item.url).pathname)){row.warnings.push("BLOCKED_BY_ROBOTS_TXT");results.push(row);continue}
     const f=await fetchText(item.url);row.status=f.status;row.finalUrl=f.url;
     if(f.status>=200&&f.status<400&&/html/i.test(f.contentType||"text/html")){
       const p=parseHtml(f.text,f.url);Object.assign(row,p);
       const noindex=/noindex/i.test(p.robotsMeta||"");
       row.indexable=f.status>=200&&f.status<300&&!noindex;
       if(!p.title)row.warnings.push("MISSING_TITLE");
       if(!p.metaDescription)row.warnings.push("MISSING_META_DESCRIPTION");
       if(p.h1s.length===0)row.warnings.push("MISSING_H1");
       if(p.h1s.length>1)row.warnings.push("MULTIPLE_H1");
       if(!p.canonical)row.warnings.push("MISSING_CANONICAL");
       else if(normalize(p.canonical)!==normalize(f.url))row.warnings.push("CANONICAL_DIFFERS");
       if(noindex)row.warnings.push("NOINDEX");
       const noAlt=p.images.filter(x=>!x.alt).length;if(noAlt)row.warnings.push("IMAGES_WITHOUT_ALT:"+noAlt);
       const discoverSmall=p.images.filter(x=>x.width&&x.width<1200).length;if(discoverSmall)row.warnings.push("IMAGES_LT_1200:"+discoverSmall);
       if(item.depth<maxDepth)for(const l of p.links){try{const u=normalize(l);if(new URL(u).origin===origin&&!seen.has(u))q.push({url:u,depth:item.depth+1})}catch{}}
     }else{row.warnings.push("HTTP_"+f.status)}
   }catch(e){row.warnings.push("FETCH_ERROR:"+String(e?.name||"Error"))}
   results.push(row);
 }
 const titleMap=new Map();for(const r of results){if(r.title)titleMap.set(r.title,[...(titleMap.get(r.title)||[]),r.url])}
 for(const r of results){if(r.title&&(titleMap.get(r.title)||[]).length>1)r.warnings.push("DUPLICATE_TITLE")}
 const crawled=new Set(results.map(r=>normalize(r.url)));
 const orphanCandidates=[...sitemapUrls].filter(u=>!crawled.has(u));
 const summary={
   startUrl:start,pages:results.length,indexable:results.filter(r=>r.indexable).length,blocked:results.filter(r=>!r.indexable).length,
   warnings:results.reduce((n,r)=>n+r.warnings.length,0),sitemapUrls:sitemapUrls.size,uncrawledSitemapUrls:orphanCandidates.length,
   duplicateTitles:[...titleMap.values()].filter(v=>v.length>1).length
 };
 return{schema:"astra-crawler-omega/v1",generatedAt:new Date().toISOString(),summary,robots:{url:origin+"/robots.txt",present:Boolean(robotsText)},sitemap:{url:origin+"/sitemap.xml",count:sitemapUrls.size,uncrawled:orphanCandidates.slice(0,200)},results};
}
