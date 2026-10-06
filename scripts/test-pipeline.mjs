import fs from 'node:fs';
import path from 'node:path';
import {cleanText,inferCategory,isDuplicate,normalizeUrlList,parseRss,slugify,wordCount} from './lib/editorial.mjs';
let fail=0;function ok(cond,msg){console.log(`${cond?'PASS':'FAIL'} ${msg}`);if(!cond)fail++}
ok(slugify('Bank Fee? Refund!')==='bank-fee-refund','slugify');
ok(wordCount('one two three')===3,'word count');
ok(inferCategory('Airline flight refund after cancellation',['travel-refunds','refunds'])==='travel-refunds','category inference');
ok(normalizeUrlList(['https://example.com/?utm_source=x','http://bad.test']).length===1,'https source normalization');
ok(cleanText('<p>Hello &amp; goodbye</p>').includes('Hello & goodbye'),'HTML cleanup');
const rss='<rss><channel><item><title>FTC returns money to consumers</title><link>https://www.ftc.gov/news-events/news/press-releases/test</link><pubDate>Sat, 26 Sep 2026 12:00:00 GMT</pubDate><description><![CDATA[Refund program]]></description></item></channel></rss>';
ok(parseRss(rss,{name:'FTC',domain:'ftc.gov',categories:['refunds']}).length===1,'RSS parser');
ok(typeof isDuplicate('A completely unique pipeline fixture title')==='boolean','duplicate detector');
const scripts=['scripts/generate-article.mjs','scripts/evidence-gate.mjs','scripts/editorial-run.mjs','scripts/enrich-links.mjs','scripts/discover-topics.mjs'];for(const s of scripts)ok(fs.existsSync(path.join(process.cwd(),s)),`${s} exists`);
if(fail){console.error(`${fail} test(s) failed`);process.exit(1)}console.log('PIPELINE TEST PASS');
