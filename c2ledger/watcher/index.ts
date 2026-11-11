
const ENGINE=String(Bun.env.ENGINE_URL||"https://c2ledger-engine-production.up.railway.app");
const ADMIN=String(Bun.env.ADMIN_TOKEN||"");
const EVM_CHAINS=[
 {id:"ethereum",url:"https://ethereum-rpc.publicnode.com"},
 {id:"bsc",url:"https://bsc-rpc.publicnode.com"},
 {id:"polygon",url:"https://polygon-bor-rpc.publicnode.com"}
];
function textFromHex(input){
 try{
  if(typeof input!=="string"||!input.startsWith("0x")||input.length<10) return "";
  const bytes=Buffer.from(input.slice(2),"hex");
  return bytes.toString("utf8").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g," ").slice(0,12000);
 }catch{return "";}
}
function indicators(text){
 const urls=[...text.matchAll(/https?:\/\/[^\s"'<>]{4,240}/gi)].map(x=>x[0]).slice(0,6);
 const ips=[...text.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g)].map(x=>x[0]).slice(0,6);
 const domains=urls.map(u=>{try{return new URL(u).hostname}catch{return ""}}).filter(Boolean);
 return {urls,ips,domains};
}
async function rpc(url,method,params){
 const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(10000)});
 if(!r.ok) throw new Error("HTTP "+r.status);
 const j=await r.json(); if(j.error) throw new Error(String(j.error.message||"rpc error")); return j.result;
}

function stringsDeep(value,depth=0,out=[]){
 if(depth>6||out.length>120) return out;
 if(typeof value==="string"){out.push(value); if(/^0x[0-9a-f]{10,}$/i.test(value)){const t=textFromHex(value); if(t) out.push(t);} return out;}
 if(Array.isArray(value)){for(const x of value) stringsDeep(x,depth+1,out); return out;}
 if(value&&typeof value==="object"){for(const x of Object.values(value)) stringsDeep(x,depth+1,out);}
 return out;
}
async function tronLatest(){
 const r=await fetch("https://api.trongrid.io/wallet/getnowblock",{method:"POST",headers:{"content-type":"application/json"},body:"{}",signal:AbortSignal.timeout(10000)});
 if(!r.ok) throw new Error("TRON HTTP "+r.status); const j=await r.json(); if(j?.Error) throw new Error(String(j.Error));
 return j;
}
async function aptosLatest(){
 const infoR=await fetch("https://fullnode.mainnet.aptoslabs.com/v1",{headers:{"accept":"application/json"},signal:AbortSignal.timeout(10000)});
 if(!infoR.ok) throw new Error("Aptos ledger HTTP "+infoR.status); const info=await infoR.json();
 const h=String(info.block_height||info.ledger_version||""); if(!h) throw new Error("Aptos block height missing");
 const r=await fetch("https://fullnode.mainnet.aptoslabs.com/v1/blocks/by_height/"+encodeURIComponent(h)+"?with_transactions=true",{headers:{"accept":"application/json"},signal:AbortSignal.timeout(10000)});
 if(!r.ok) throw new Error("Aptos block HTTP "+r.status); return await r.json();
}
async function ingest(body){
 if(!ADMIN) throw new Error("admin token unavailable");
 const r=await fetch(ENGINE+"/api/intel/ingest",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+ADMIN},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 const j=await r.json(); if(!r.ok) throw new Error(j.error||("ingest HTTP "+r.status)); return j;
}
async function getCursors(){
 if(!ADMIN) return {status:"PARTIAL",cursors:{},reason:"admin token unavailable"};
 try{
  const r=await fetch(ENGINE+"/api/admin/watcher/cursors",{headers:{"authorization":"Bearer "+ADMIN},signal:AbortSignal.timeout(10000)});
  const j=await r.json();if(!r.ok) return {status:"PARTIAL",cursors:{},reason:j.error||("cursor HTTP "+r.status)};
  return {status:"PASS",cursors:j.cursors||{},updatedAt:j.updatedAt||null};
 }catch(e){return {status:"PARTIAL",cursors:{},reason:String(e)}}
}
async function advanceCursor(chain,height){
 try{
  const r=await fetch(ENGINE+"/api/admin/watcher/cursors",{method:"POST",headers:{"authorization":"Bearer "+ADMIN,"content-type":"application/json"},body:JSON.stringify({chain,height:String(height)}),signal:AbortSignal.timeout(10000)});
  const j=await r.json();if(!r.ok) throw new Error(j.error||("cursor HTTP "+r.status));return j;
 }catch(e){return {status:"PARTIAL",advanced:false,chain,height:String(height),reason:String(e)}}
}
function seenHeight(cursors,chain,height){
 const prev=cursors?.[chain]?.height;if(prev===undefined||prev===null)return false;
 try{return BigInt(String(prev))>=BigInt(String(height))}catch{return false}
}
let scanned=0,signals=0,ingested=0,failures=0,chainsOk=0,skippedChains=0,cursorFailures=0,duplicateObservations=0;
const cursorState=await getCursors();const cursors=cursorState.cursors||{};
if(cursorState.status!=="PASS"){cursorFailures++;console.log("CURSOR_PARTIAL",JSON.stringify({reason:cursorState.reason||"unavailable"}));}
for(const chain of EVM_CHAINS){
 try{
  const block=await rpc(chain.url,"eth_getBlockByNumber",["latest",true]);
  const height=BigInt(String(block?.number||"0x0")).toString();
  const txs=Array.isArray(block?.transactions)?block.transactions.slice(0,350):[];
  if(seenHeight(cursors,chain.id,height)){chainsOk++;skippedChains++;console.log("CHAIN_SKIP",chain.id,JSON.stringify({height,previous:cursors?.[chain.id]?.height,reason:"already-processed"}));continue;}
  scanned+=txs.length;
  for(const tx of txs){
   const text=textFromHex(tx?.input); if(!text) continue;
   const ind=indicators(text); if(!ind.urls.length&&!ind.ips.length) continue;
   signals++; const rawIp=ind.ips[0]||undefined, domain=ind.domains[0]||undefined;
   const r=await ingest({chain:chain.id,txHash:tx.hash,address:tx.to||tx.from,rawIp,domain,confidence:rawIp?85:70,tags:["auto-chain-watch","plaintext-network-indicator","defensive-observation"]});
   if(r.status==="PASS"){ingested++;if(r.duplicate)duplicateObservations++;}
  }
  const cu=await advanceCursor(chain.id,height);if(cu.status!=="PASS"){cursorFailures++;console.log("CURSOR_PARTIAL",chain.id,JSON.stringify(cu));}else{cursors[chain.id]={height:cu.height};}
  chainsOk++; console.log("CHAIN_OK",chain.id,JSON.stringify({block:block?.number,height,txs:txs.length,cursorAdvanced:cu.advanced!==false}));
 }catch(e){failures++; console.log("CHAIN_PARTIAL",chain.id,String(e));}
}
try{
 const block=await tronLatest(); const height=String(block?.block_header?.raw_data?.number??"0"),txs=Array.isArray(block?.transactions)?block.transactions.slice(0,350):[];
 if(seenHeight(cursors,"tron",height)){chainsOk++;skippedChains++;console.log("CHAIN_SKIP","tron",JSON.stringify({height,previous:cursors?.tron?.height,reason:"already-processed"}));}
 else{
  scanned+=txs.length;
  for(const tx of txs){
   const texts=stringsDeep(tx?.raw_data?.contract||[]).join(" "); const ind=indicators(texts); if(!ind.urls.length&&!ind.ips.length) continue;
   signals++; const addr=tx?.raw_data?.contract?.[0]?.parameter?.value?.contract_address||tx?.raw_data?.contract?.[0]?.parameter?.value?.to_address;
   const r=await ingest({chain:"tron",txHash:tx?.txID||tx?.txid,address:addr,rawIp:ind.ips[0]||undefined,domain:ind.domains[0]||undefined,confidence:ind.ips.length?85:70,tags:["auto-chain-watch","plaintext-network-indicator","defensive-observation","tron"]});
   if(r.status==="PASS"){ingested++;if(r.duplicate)duplicateObservations++;}
  }
  const cu=await advanceCursor("tron",height);if(cu.status!=="PASS"){cursorFailures++;console.log("CURSOR_PARTIAL","tron",JSON.stringify(cu));}else{cursors.tron={height:cu.height};}
  chainsOk++;console.log("CHAIN_OK","tron",JSON.stringify({block:height,txs:txs.length,cursorAdvanced:cu.advanced!==false}));
 }
}catch(e){failures++; console.log("CHAIN_PARTIAL","tron",String(e));}
try{
 const block=await aptosLatest(); const height=String(block?.block_height??"0"),txs=Array.isArray(block?.transactions)?block.transactions.slice(0,350):[];
 if(seenHeight(cursors,"aptos",height)){chainsOk++;skippedChains++;console.log("CHAIN_SKIP","aptos",JSON.stringify({height,previous:cursors?.aptos?.height,reason:"already-processed"}));}
 else{
  scanned+=txs.length;
  for(const tx of txs){
   const texts=stringsDeep(tx?.payload||{}).join(" "); const ind=indicators(texts); if(!ind.urls.length&&!ind.ips.length) continue;
   signals++;
   const r=await ingest({chain:"aptos",txHash:tx?.hash,address:tx?.sender,rawIp:ind.ips[0]||undefined,domain:ind.domains[0]||undefined,confidence:ind.ips.length?85:70,tags:["auto-chain-watch","plaintext-network-indicator","defensive-observation","aptos"]});
   if(r.status==="PASS"){ingested++;if(r.duplicate)duplicateObservations++;}
  }
  const cu=await advanceCursor("aptos",height);if(cu.status!=="PASS"){cursorFailures++;console.log("CURSOR_PARTIAL","aptos",JSON.stringify(cu));}else{cursors.aptos={height:cu.height};}
  chainsOk++;console.log("CHAIN_OK","aptos",JSON.stringify({block:height,txs:txs.length,cursorAdvanced:cu.advanced!==false}));
 }
}catch(e){failures++; console.log("CHAIN_PARTIAL","aptos",String(e));}
console.log("WATCH_SUMMARY",JSON.stringify({scanned,signals,ingested,duplicateObservations,failures,chainsOk,skippedChains,cursorFailures,totalChains:5,time:new Date().toISOString()}));
try{
 const ar=await fetch(ENGINE+"/api/alerts/dispatch",{method:"POST",headers:{"authorization":"Bearer "+ADMIN,"content-type":"application/json"},body:"{}",signal:AbortSignal.timeout(10000)});
 const aj=await ar.json(); console.log("ALERT_DISPATCH",JSON.stringify({http:ar.status,status:aj.status,targets:aj.targets||0,delivered:aj.delivered||0,failed:aj.failed||0,pending:aj.pending||0,reason:aj.reason||null}));
}catch(e){console.log("ALERT_DISPATCH_PARTIAL",String(e));}
if(chainsOk===0) process.exit(1);
