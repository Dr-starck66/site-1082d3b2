import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {collectEvidence,choosePillar,chooseSlot,discoverReactive,fallbackSources,normalizeUrlList,slugify,writeArticle,wordCount} from './lib/editorial.mjs';

const key=process.env.GEMINI_API_KEY||'';
const model=process.env.GEMINI_MODEL||'gemini-2.5-flash';

const slot=chooseSlot();
let topic;
if(slot.kind==='pillar'){
  const seed=choosePillar(slot);
  if(!seed){console.error('No unused pillar seed is available for this slot.');process.exit(3)}
  topic={...seed,sourceTitle:seed.title,sourceSummary:'Evergreen evidence-first consumer money guide.'};
}else{
  const discovered=await discoverReactive(slot);
  const pick=discovered[0];
  if(!pick){console.error('No sufficiently fresh reactive topic was discovered from official feeds. FAIL CLOSED.');process.exit(4)}
  topic={title:pick.title,category:pick.category,keywords:[pick.title],sources:[pick.url,...(fallbackSources[pick.category]||[])],sourceTitle:pick.title,sourceSummary:pick.summary,published:pick.published};
}

const candidateSources=normalizeUrlList([...(topic.sources||[]),...(fallbackSources[topic.category]||[])]);
const evidence=await collectEvidence(candidateSources);
if(evidence.length<2||!evidence.some(x=>x.official)){
  console.error(`EVIDENCE COLLECTION FAIL: ${evidence.length} usable sources, official=${evidence.some(x=>x.official)}`);
  process.exit(5);
}

const evidenceText=evidence.map((e,i)=>`SOURCE S${i+1}\nURL: ${e.url}\nEXTRACT:\n${e.text.slice(0,7500)}`).join('\n\n');
const min=slot.targetWords[0],max=slot.targetWords[1];
const prompt=`You are the editorial desk of RefundMoneyNow.com, a US consumer-money publication.

Write ONE ${slot.kind==='pillar'?'evergreen pillar':'timely reactive'} article based ONLY on the evidence supplied below. Do not rely on memory for changing rules, dates, dollar amounts, deadlines, eligibility or legal rights. If the evidence does not support a claim, omit it.

TOPIC: ${topic.title}
CATEGORY: ${topic.category}
TARGET LENGTH: ${min}-${max} words.
AUDIENCE: US consumers.

STYLE:
- Natural newsroom English, varied sentence length, concrete examples, no fake personal anecdotes.
- No clickbait, no hype, no generic AI phrases such as "in today's fast-paced world", "delve", "unlock", "game-changer", "navigate the complexities", or "comprehensive guide".
- For reactive stories, include sections titled exactly "## What changed", "## What this means for consumers", and "## What to verify before you act".
- For pillar stories, include a practical section whose H2 contains "checklist" or "step-by-step", plus "## What to verify before you act".
- Add original utility: synthesize the sources into a decision path, checklist, exceptions, and escalation options. Do not merely rewrite or stitch the source pages.
- Never promise a refund, payout, approval, legal outcome or savings.
- Never invent quotes.
- Use H2 headings with ##. Bullets are allowed.
- Every paragraph containing a material factual rule, deadline, amount, agency action or eligibility statement MUST end with one or more citation markers like [S1] or [S1][S2].
- Include a short section titled "What to verify before you act".
- Do not include a Sources section; the site renders sources separately.

Return STRICT JSON only with keys: title, description, body. The description must be 120-165 characters. The body must be Markdown.

EVIDENCE:
${evidenceText}`;

async function callGemini(){
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  let last;
  for(let attempt=0;attempt<3;attempt++){
    const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.55,topP:0.9,responseMimeType:'application/json'}})});
    if(r.ok){
      const data=await r.json();
      return data?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('')||'';
    }
    last={status:r.status,text:(await r.text()).slice(0,1000)};
    if(![429,500,502,503,504].includes(r.status))break;
    await new Promise(res=>setTimeout(res,1200*(attempt+1)));
  }
  console.error('Gemini API failed:',last?.status,last?.text);
  return '';
}

function callCopilot(){
  const r=spawnSync('copilot',['-p',prompt,'-s'],{
    encoding:'utf8',
    env:process.env,
    maxBuffer:16*1024*1024
  });
  if(r.status!==0){
    console.error('Copilot CLI failed:',r.status,(r.stderr||r.stdout||'').slice(-3000));
    return '';
  }
  return (r.stdout||'').trim();
}

let raw='';
let provider='';
if(key){
  raw=await callGemini();
  provider='gemini';
}
if(!raw && process.env.GITHUB_TOKEN){
  raw=callCopilot();
  provider='github-copilot-cli';
}
if(!raw){
  console.error('GENERATION FAIL: no working generator is available. Nothing was published.');
  process.exit(6);
}

let obj;
try{obj=JSON.parse(raw)}
catch{
  const m=raw.match(/\{[\s\S]*\}/);
  if(m)try{obj=JSON.parse(m[0])}catch{}
}
if(!obj?.title||!obj?.description||!obj?.body){
  console.error('Generator did not return valid JSON article. Provider:',provider);
  console.error(raw.slice(0,1800));
  process.exit(7);
}
if(wordCount(obj.body)<Math.floor(min*0.82)){
  console.error(`Draft too short: ${wordCount(obj.body)} words`);
  process.exit(8);
}

const slug=slugify(obj.title);
const sourceHash=evidence.map(x=>x.sha256).join('-');
const file=writeArticle({
  slug,title:obj.title,description:obj.description,category:topic.category,
  published:new Date().toISOString(),modified:new Date().toISOString(),
  author:'Refund Money Now Desk',status:'draft',content_type:slot.kind,
  source_hash:sourceHash,sources:evidence.map(x=>x.url),body:obj.body
});
fs.writeFileSync('data/last-generation.json',JSON.stringify({
  slot,provider,topic:{title:topic.title,category:topic.category},slug,file,
  evidence:evidence.map(({url,sha256,official})=>({url,sha256,official})),
  words:wordCount(obj.body),createdAt:new Date().toISOString()
},null,2));
console.log(`DRAFT CREATED ${slug} (${wordCount(obj.body)} words, ${evidence.length} sources, slot=${slot.id}, provider=${provider})`);
