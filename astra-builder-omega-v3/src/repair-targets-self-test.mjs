import assert from"node:assert/strict";
import{repairTargetSelfTest,selectRepairTargets}from"./repair-targets.js";
const r=repairTargetSelfTest();
assert.equal(r.ok,true,JSON.stringify(r));
const files=[{path:"backend/src/auth.ts",content:"x"},{path:"frontend/src/App.tsx",content:"x"}];
const x=selectRepairTargets({files,evidence:[{name:"Build backend",status:"FAIL",detail:"src/auth.ts(2,1): error TS1005"}]});
assert.deepEqual(x.targets.slice(0,1),["backend/src/auth.ts"]);
console.log("[ASTRA REPAIR TARGET SELFTEST]",JSON.stringify(r));
