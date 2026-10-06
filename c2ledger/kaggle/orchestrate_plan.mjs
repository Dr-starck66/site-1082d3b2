import fs from "node:fs/promises";
import crypto from "node:crypto";

const planPath=process.argv[2]||"c2ledger/kaggle/out/scenario-plan.json";
const engine=String(process.env.C2LEDGER_ENGINE_URL||"http://127.0.0.1:3000").replace(/\/$/,"");
const token=String(process.env.C2LEDGER_ADMIN_TOKEN||"");
const targets={
  "lab-edge":"http://lab-edge:3200",
  "lab-ci":"http://lab-ci:3200",
  "lab-data":"http://lab-data:3200"
};
const effects=new Set(["plant-marker","stage-synthetic-data","rotate-canary","degrade-service","recover"]);

if(!token) throw new Error("C2LEDGER_ADMIN_TOKEN is required");
const plan=JSON.parse(await fs.readFile(planPath,"utf8"));
if(plan.schema!=="c2ledger-kaggle-plan/v1"||!Array.isArray(plan.steps)) throw new Error("invalid plan");
const validate=await fetch(engine+"/api/kaggle/validate",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify(plan)});
if(!validate.ok) throw new Error("engine plan validation failed: "+validate.status+" "+await validate.text());
const validated=await validate.json();

const rows=[];
for(const step of validated.steps){
  if(!targets[step.target]||!effects.has(step.effect)) throw new Error("local orchestration boundary failed");
  const body={target:targets[step.target],effect:step.effect,id:step.id,service:step.service,count:step.count};
  const res=await fetch(engine+"/api/range/effect",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify(body)});
  const txt=await res.text();
  if(!res.ok) throw new Error("range effect failed "+step.target+" "+step.effect+": "+res.status+" "+txt);
  rows.push({target:step.target,effect:step.effect,result:JSON.parse(txt)});
}
const canonical=JSON.stringify(rows);
const digest=crypto.createHash("sha256").update(canonical).digest("hex");
const report={schema:"c2ledger-ephemeral-lab-report/v1",status:"PASS",steps:rows.length,digest,rows};
await fs.writeFile("c2ledger/kaggle/out/lab-report.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({status:"PASS",steps:rows.length,digest},null,2));
