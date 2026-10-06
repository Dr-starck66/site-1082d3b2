import fs from 'node:fs';
import path from 'node:path';
import {ARTICLES_DIR,officialish,wordCount} from './lib/editorial.mjs';

const requested=process.argv[2];
const files=requested?[path.resolve(requested)]:fs.readdirSync(ARTICLES_DIR).filter(x=>x.endsWith('.md')).map(x=>path.join(ARTICLES_DIR,x));
let bad=[];
for(const f of files){
  if(!fs.existsSync(f)){bad.push(`${f}: file not found`);continue}
  const s=fs.readFileSync(f,'utf8');const title=(s.match(/^title:\s*"?(.*?)"?$/m)||[])[1]||path.basename(f);const type=(s.match(/^content_type:\s*"?(.*?)"?$/m)||[])[1]||'legacy';const front=s.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);const body=front?.[2]||s;
  const src=(s.match(/^sources:\s*\[(.*?)\]/m)||[])[1]||'';const urls=[...src.matchAll(/https:\/\/[^"',\]]+/g)].map(x=>x[0]);
  if(type!=='legacy'){
    if(urls.length<2)bad.push(`${path.basename(f)}: requires >=2 source URLs`);
    if(!urls.some(officialish))bad.push(`${path.basename(f)}: requires an official/primary source`);
    const refs=[...body.matchAll(/\[S(\d+)\]/g)].map(x=>Number(x[1]));
    if(!refs.length)bad.push(`${path.basename(f)}: no inline [S#] evidence markers`);
    if(refs.some(n=>n<1||n>urls.length))bad.push(`${path.basename(f)}: citation points outside source list`);
    const wc=wordCount(body);const min=type.includes('pillar')?1200:550;if(wc<min)bad.push(`${path.basename(f)}: too short (${wc} words; minimum ${min})`);
    if(!/## What to verify before you act/i.test(body))bad.push(`${path.basename(f)}: missing verification section`);
    if(type.includes('reactive')&&!/## What changed/i.test(body))bad.push(`${path.basename(f)}: reactive story missing What changed section`);
    if(type.includes('reactive')&&!/## What this means for consumers/i.test(body))bad.push(`${path.basename(f)}: reactive story missing consumer-impact section`);
    if(type.includes('pillar')&&!/^## .*?(checklist|step-by-step)/im.test(body))bad.push(`${path.basename(f)}: pillar missing practical checklist/step-by-step section`);
  }
  if(/\b(guaranteed|always get|100% guaranteed|definitely entitled|will get your money back|risk[- ]free)\b/i.test(body))bad.push(`${path.basename(f)}: prohibited certainty language`);
  if(/\b(in today's fast-paced world|delve into|game[- ]changer|navigate the complexities|unlock the power|comprehensive guide)\b/i.test(body))bad.push(`${path.basename(f)}: generic AI-style phrase detected`);
  if(/\b(I am your lawyer|I am your financial adviser|we guarantee|our legal advice)\b/i.test(body))bad.push(`${path.basename(f)}: impermissible professional/promise wording`);
  if(/\$\d{3,}/.test(title)&&type!=='legacy'&&!/\[S\d+\]/.test(body))bad.push(`${path.basename(f)}: money claim lacks evidence markers`);
}
if(bad.length){console.error('EVIDENCE GATE FAIL\n'+bad.join('\n'));process.exit(1)}console.log(`EVIDENCE GATE PASS (${files.length} file${files.length===1?'':'s'})`);
