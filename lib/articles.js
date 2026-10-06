import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(),'content','articles');

function parseFrontmatter(raw){
  const m=raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if(!m) return {meta:{},body:raw};
  const meta={};
  for(const line of m[1].split('\n')){
    const i=line.indexOf(':'); if(i<0) continue;
    const k=line.slice(0,i).trim(); let v=line.slice(i+1).trim();
    if(v.startsWith('[')&&v.endsWith(']')) v=v.slice(1,-1).split(',').map(x=>x.trim().replace(/^['"]|['"]$/g,''));
    else v=v.replace(/^['"]|['"]$/g,'');
    meta[k]=v;
  }
  return {meta,body:m[2].trim()};
}

export function getArticles(){
  if(!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f=>f.endsWith('.md')).map(file=>{
    const slug=file.replace(/\.md$/,'');
    const {meta,body}=parseFrontmatter(fs.readFileSync(path.join(dir,file),'utf8'));
    return {slug,...meta,body};
  }).filter(a=>a.status!=='draft').sort((a,b)=>new Date(b.published)-new Date(a.published));
}
export function getArticle(slug){ return getArticles().find(a=>a.slug===slug); }
export function getByCategory(slug){ return getArticles().filter(a=>a.category===slug); }
export function renderBody(body){
  const blocks=body.split(/\n\n+/);
  return blocks.map((b,i)=>{
    if(b.startsWith('## ')) return {type:'h2',text:b.slice(3),key:i};
    if(b.startsWith('- ')) return {type:'ul',items:b.split('\n').map(x=>x.replace(/^- /,'')),key:i};
    return {type:'p',text:b,key:i};
  });
}
