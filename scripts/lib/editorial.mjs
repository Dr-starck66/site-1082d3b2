import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT=process.cwd();
export const ARTICLES_DIR=path.join(ROOT,'content','articles');
export const DATA_DIR=path.join(ROOT,'data');
export const slots=[
{id:'pillar-am',kind:'pillar',targetWords:[1500,2600],categories:['insurance-claims','refunds','credit-debt']},
{id:'reactive-morning',kind:'reactive',targetWords:[700,1200],categories:['refunds','consumer-rights','banking-fees']},
{id:'reactive-midday',kind:'reactive',targetWords:[700,1200],categories:['credit-debt','banking-fees','tax-money']},
{id:'pillar-pm',kind:'pillar',targetWords:[1500,2600],categories:['travel-refunds','tax-money','warranties']},
{id:'reactive-evening',kind:'reactive',targetWords:[700,1200],categories:['insurance-claims','travel-refunds','consumer-rights','refunds']}
];
export const reactiveFeeds=[
{name:'CFPB Newsroom',url:'https://www.consumerfinance.gov/about-us/newsroom/feed/',domain:'consumerfinance.gov',categories:['banking-fees','credit-debt','refunds']},
{name:'FTC Consumer Protection',url:'https://www.ftc.gov/feeds/press-release-consumer-protection.xml',domain:'ftc.gov',categories:['consumer-rights','refunds','warranties']},
{name:'FTC Consumer Blog',url:'https://consumer.ftc.gov/consumer-alerts/feed',domain:'ftc.gov',categories:['consumer-rights','refunds','credit-debt']}
];
export const fallbackSources={
'insurance-claims':['https://content.naic.org/consumer/how-file-complaint','https://content.naic.org/consumer'],
refunds:['https://www.consumerfinance.gov/consumer-tools/credit-cards/','https://consumer.ftc.gov/'],
'banking-fees':['https://www.consumerfinance.gov/consumer-tools/bank-accounts/','https://www.fdic.gov/resources/consumers/'],
'credit-debt':['https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/','https://www.consumerfinance.gov/consumer-tools/debt-collection/'],
'travel-refunds':['https://www.transportation.gov/individuals/aviation-consumer-protection/refunds','https://www.transportation.gov/airconsumer/latest-news'],
'tax-money':['https://www.irs.gov/refunds','https://www.usa.gov/unclaimed-money'],
'consumer-rights':['https://consumer.ftc.gov/','https://reportfraud.ftc.gov/'],
warranties:['https://consumer.ftc.gov/articles/warranties','https://consumer.ftc.gov/articles/auto-warranties-and-auto-service-contracts']
};
const officialDomains=['.gov','naic.org'];
export function ensureDirs(){fs.mkdirSync(ARTICLES_DIR,{recursive:true});fs.mkdirSync(DATA_DIR,{recursive:true})}
export function slugify(s=''){return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-').slice(0,90)}
export function wordCount(s=''){return (s.trim().match(/\b[\w’'-]+\b/g)||[]).length}
export function cleanText(s=''){return s.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ').trim()}
export function stripTracking(url=''){try{const u=new URL(url);for(const k of [...u.searchParams.keys()])if(/^utm_|^(gclid|fbclid)$/i.test(k))u.searchParams.delete(k);return u.toString()}catch{return url}}
export function normalizeUrlList(xs=[]){return [...new Set(xs.map(stripTracking).filter(x=>{try{return new URL(x).protocol==='https:'}catch{return false}}))]}
export function officialish(url=''){try{const h=new URL(url).hostname.replace(/^www\./,'');return officialDomains.some(d=>d.startsWith('.')?h.endsWith(d):h===d||h.endsWith('.'+d))}catch{return false}}
export function parseRss(xml,feed){return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(x=>x[0]).map(item=>{const get=t=>{const m=item.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${t}>`,'i'));return m?cleanText(m[1]):''};return {title:get('title'),url:stripTracking(get('link')),published:get('pubDate')||get('dc:date'),summary:get('description'),feed:feed.name,domain:feed.domain,categories:feed.categories}}).filter(x=>x.title&&x.url)}
export async function fetchUrl(url,{timeout=12000}={}){const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),timeout);try{const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'RefundMoneyNowBot/1.0 (+https://refundmoneynow.com/editorial-standards)'},signal:ctrl.signal});return {ok:r.ok,status:r.status,url:r.url,text:await r.text(),contentType:r.headers.get('content-type')||''}}catch(e){return {ok:false,status:0,url,error:String(e),text:''}}finally{clearTimeout(timer)}}
export function publishedIndex(){if(!fs.existsSync(ARTICLES_DIR))return[];return fs.readdirSync(ARTICLES_DIR).filter(f=>f.endsWith('.md')).map(file=>{const raw=fs.readFileSync(path.join(ARTICLES_DIR,file),'utf8');const title=(raw.match(/^title:\s*"?(.*?)"?$/m)||[])[1]||'';const category=(raw.match(/^category:\s*"?(.*?)"?$/m)||[])[1]||'';return {file,title:title.replace(/"$/,''),category,raw}})}
const toks=s=>new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>3));
export function similarity(a,b){const A=toks(a),B=toks(b),i=[...A].filter(x=>B.has(x)).length,u=new Set([...A,...B]).size;return u?i/u:0}
export function isDuplicate(title,index=publishedIndex()){return index.some(x=>similarity(title,x.title)>=0.58)}
export function inferCategory(text='',candidates=[]){const t=text.toLowerCase(),map={'insurance-claims':['insurance','insurer','claim','premium'],refunds:['refund','chargeback','billing','subscription','merchant'],'banking-fees':['bank','overdraft','deposit','account fee','debit'],'credit-debt':['credit','debt','collector','loan','reporting'],'travel-refunds':['airline','flight','baggage','travel'],'tax-money':['tax','irs','unclaimed','treasury'],'consumer-rights':['fraud','scam','consumer','settlement','compensation'],warranties:['warranty','recall','repair','service contract']};let best='consumer-rights',score=-1;for(const [cat,ks] of Object.entries(map)){if(candidates.length&&!candidates.includes(cat))continue;const s=ks.reduce((n,k)=>n+(t.includes(k)?1:0),0);if(s>score){score=s;best=cat}}return best}
export function recencyScore(date){const d=new Date(date).getTime();if(!Number.isFinite(d))return 0;const h=(Date.now()-d)/36e5;if(h<0)return 0;if(h<=24)return 10;if(h<=48)return 8;if(h<=96)return 5;if(h<=168)return 2;return 0}
export function monetizeScore(text=''){const t=text.toLowerCase();return [['insurance',5],['claim',4],['credit',4],['debt',4],['bank',3],['refund',4],['compensation',3],['tax',3],['warranty',3],['fee',2],['chargeback',5],['mortgage',5],['loan',4]].reduce((n,[k,w])=>n+(t.includes(k)?w:0),0)}
export function chooseSlot(){const forced=process.env.EDITORIAL_SLOT;if(forced){const f=slots.find((x,i)=>x.id===forced||String(i+1)===forced);if(f)return f}const h=new Date().getUTCHours();if(h<12)return slots[0];if(h<15)return slots[1];if(h<18)return slots[2];if(h<21)return slots[3];return slots[4]}
export function readSeeds(){return JSON.parse(fs.readFileSync(path.join(ROOT,'content','editorial','pillar-seeds.json'),'utf8'))}
export function choosePillar(slot){const idx=publishedIndex();return readSeeds().filter(s=>slot.categories.includes(s.category)&&!isDuplicate(s.title,idx)).sort((a,b)=>monetizeScore(b.title)-monetizeScore(a.title))[0]||null}
export async function discoverReactive(slot){const found=[];for(const feed of reactiveFeeds){const r=await fetchUrl(feed.url);if(!r.ok)continue;for(const x of parseRss(r.text,feed)){const cat=inferCategory(`${x.title} ${x.summary}`,slot.categories);if(!slot.categories.includes(cat)||isDuplicate(x.title))continue;found.push({...x,category:cat,score:recencyScore(x.published)+monetizeScore(x.title+' '+x.summary)+4})}}
for(const src of [{name:'IRS Tax Tips',url:'https://www.irs.gov/newsroom/irs-tax-tips',host:'www.irs.gov',path:'/newsroom/',categories:['tax-money']},{name:'DOT Air Consumer',url:'https://www.transportation.gov/airconsumer/latest-news',host:'www.transportation.gov',path:'/airconsumer/',categories:['travel-refunds']}]){if(!src.categories.some(c=>slot.categories.includes(c)))continue;const r=await fetchUrl(src.url);if(!r.ok)continue;const re=/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;while((m=re.exec(r.text))){let href=m[1];if(href.startsWith('/'))href=`https://${src.host}${href}`;if(!href.startsWith('https://')||!href.includes(src.path))continue;const title=cleanText(m[2]);if(title.length<25||isDuplicate(title))continue;const cat=inferCategory(title,slot.categories);found.push({title,url:href,published:new Date().toISOString(),summary:title,feed:src.name,domain:src.host,category:cat,score:recencyScore(new Date())+monetizeScore(title)+3})}}
return found.sort((a,b)=>b.score-a.score)}
export async function collectEvidence(urls=[]){const out=[];for(const url of normalizeUrlList(urls)){const r=await fetchUrl(url);if(!r.ok)continue;const text=cleanText(r.text).slice(0,9000);if(text.length<350)continue;out.push({url:r.url||url,official:officialish(r.url||url),text,sha256:crypto.createHash('sha256').update(text).digest('hex')})}return out}
export function writeArticle(meta){ensureDirs();const q=v=>String(v??'').replaceAll('"','\\"');const fm=['---',`title: "${q(meta.title)}"`,`description: "${q(meta.description)}"`,`category: "${q(meta.category)}"`,`published: "${q(meta.published)}"`,`modified: "${q(meta.modified||meta.published)}"`,`author: "${q(meta.author||'Refund Money Now Desk')}"`,`status: "${q(meta.status||'draft')}"`,`content_type: "${q(meta.content_type||'reactive')}"`,`source_hash: "${q(meta.source_hash||'')}"`,`sources: [${(meta.sources||[]).map(x=>`"${q(x)}"`).join(', ')}]`,'---',''].join('\n');const file=path.join(ARTICLES_DIR,`${meta.slug}.md`);fs.writeFileSync(file,fm+meta.body.trim()+'\n');return file}
export function updateStatus(file,status){let s=fs.readFileSync(file,'utf8');s=s.replace(/^status:\s*"?.*?"?$/m,`status: "${status}"`);if(/^modified:/m.test(s))s=s.replace(/^modified:\s*.*$/m,`modified: "${new Date().toISOString()}"`);fs.writeFileSync(file,s)}
