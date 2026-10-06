import fs from 'node:fs';import path from 'node:path';
const dir=path.join(process.cwd(),'content','articles');const now=Date.now();let n=0;
for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.md'))){const p=path.join(dir,f);let s=fs.readFileSync(p,'utf8');const status=(s.match(/^status:\s*"?(.*?)"?$/m)||[])[1];const publishAt=(s.match(/^publish_at:\s*"?(.*?)"?$/m)||[])[1];if(status==='scheduled'&&publishAt&&new Date(publishAt).getTime()<=now){s=s.replace(/^status:\s*"?scheduled"?$/m,'status: "published"').replace(/^published:\s*.*$/m,`published: "${new Date().toISOString()}"`);fs.writeFileSync(p,s);n++}}
console.log(`Published ${n} scheduled article(s).`);
