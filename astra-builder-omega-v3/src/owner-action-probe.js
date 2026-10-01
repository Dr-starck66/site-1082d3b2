import { inspectActionSurface, normalizeActionPlan, executeApprovedActions } from "./claw-action.js";

export async function runOwnerActionProbe(){
  const domain=String(process.env.RAILWAY_PUBLIC_DOMAIN||"").trim();
  if(!domain)throw new Error("RAILWAY_PUBLIC_DOMAIN missing");
  const url="https://"+domain+"/owner-probe.html";
  const inspection=await inspectActionSurface({url,ownerMode:true,ownerDomains:[domain]});
  const raw={summary:"owner mode fixture",actions:[
    {type:"fill",selector:"#probeTitle",value:"ASTRA_OWNER_OK"},
    {type:"select",selector:"#probeMode",value:"review"},
    {type:"check",selector:"#probeCheck",value:true},
    {type:"click",selector:"#probeSubmit"}
  ]};
  const normalized=normalizeActionPlan(raw,inspection);
  if(normalized.actions.length!==4)throw new Error("OWNER_PROBE_PLAN_GATE:"+JSON.stringify(normalized));
  const out=await executeApprovedActions({url,ownerMode:true,ownerDomains:[domain],actions:normalized.actions});
  const ok=out.status==="PASS"&&/OWNER_ACTION_OK/.test(out.final?.text||"")&&/ASTRA_OWNER_OK/.test(out.final?.text||"")&&/"mode":"review"/.test(out.final?.text||"");
  return{status:ok?"PASS":"FAIL",ok,mode:out.mode,trace:out.trace,final:out.final};
}
