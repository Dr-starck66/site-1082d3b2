import fs from 'node:fs';
import {chooseSlot,discoverReactive,ensureDirs} from './lib/editorial.mjs';
ensureDirs();const slot=chooseSlot();const results=await discoverReactive(slot);fs.writeFileSync('data/discovery.json',JSON.stringify({slot,generatedAt:new Date().toISOString(),results:results.slice(0,25)},null,2));console.log(`Discovered ${results.length} candidates for ${slot.id}`);for(const x of results.slice(0,10))console.log(`${x.score}\t${x.category}\t${x.title}`);
