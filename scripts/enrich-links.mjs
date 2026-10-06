import fs from 'node:fs';
import path from 'node:path';
import {ARTICLES_DIR,publishedIndex,similarity} from './lib/editorial.mjs';
const target=process.argv[2];if(!target){console.error('Usage: node scripts/enrich-links.mjs <article.md>');process.exit(2)}
let s=fs.readFileSync(target,'utf8');if(/## Related reading/.test(s)){console.log('Related links already present');process.exit(0)}
const title=(s.match(/^title:\s*"?(.*?)"?$/m)||[])[1]||'';const category=(s.match(/^category:\s*"?(.*?)"?$/m)||[])[1]||'';
const related=publishedIndex().filter(x=>path.resolve(path.join(ARTICLES_DIR,x.file))!==path.resolve(target)).map(x=>({...x,score:(x.category===category?1:0)+similarity(title,x.title)})).sort((a,b)=>b.score-a.score).slice(0,3);
if(!related.length){console.log('No related articles yet');process.exit(0)}
const links='\n\n## Related reading\n\n'+related.map(x=>`- [${x.title.replace(/"$/,'')}](/article/${x.file.replace(/\.md$/,'')})`).join('\n')+'\n';fs.writeFileSync(target,s.trimEnd()+links);console.log(`Added ${related.length} internal links`);
