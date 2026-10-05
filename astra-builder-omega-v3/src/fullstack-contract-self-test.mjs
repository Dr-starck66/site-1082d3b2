import assert from"node:assert/strict";
import{fullstackContractSelfTest,fullstackContractAudit}from"./fullstack-contract.js";
const r=fullstackContractSelfTest();
assert.equal(r.ok,true,JSON.stringify(r));
const extra=fullstackContractAudit([{path:"backend/src/app.ts",content:'export const app=1; import x from "./missing.ts"; void x;'}]);
assert.equal(extra.status,"FAIL");
assert.ok(extra.issues.some(x=>x.code==="MISSING_RELATIVE_IMPORT"));
console.log("[ASTRA FULLSTACK CONTRACT SELFTEST]",JSON.stringify({...r,extra:extra.issues.length}));
