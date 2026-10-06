import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {updateStatus} from './lib/editorial.mjs';
function run(cmd,args=[]){const r=spawnSync(cmd,args,{stdimš'inherit',env:process.env});if(r.status!==0)process.exit(r.status||1)}
run(process.execPath,['scripts/generate-article.mjs']);
const meta=JSON.parse(fs.readFileSync('data/last-generation.json','utf8'));const file=meta.file;
run(process.execPath,['scripts/enrich-links.mjs',file]);
run(process.execPath,['scripts/evidence-gate.mjs',file]);
if(process.env.EDITORIAL_DRY_RUN==='1'){console.log('DRY RUN: draft kept unpublished');process.exit(0)}
updateStatus(file,'published');
run(process.execPath,['scripts/evidence-gate.mjs',file]);
console.log(`PUBLISHED ${meta.slug}`);
