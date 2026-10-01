const wait=ms=>new Promise(r=>setTimeout(r,ms));
export function classifyError(err){
 const m=String(err?.message||err||"unknown error"),s=m.toLowerCase();
 if(/401|403|unauthor|forbidden|token|api key|credential/.test(s))return{kind:"AUTH",retryable:false,advice:"credentials/configuration required"};
 if(/429|rate.?limit|quota|too many/.test(s))return{kind:"RATE_LIMIT",retryable:true,advice:"backoff then retry"};
 if(/timeout|timed out|abort|network|fetch|502|503|504|econn|socket/.test(s))return{kind:"TRANSIENT_NETWORK",retryable:true,advice:"retry with exponential backoff"};
 if(/non json|non-json|json|parse|unexpected token|réponse ia non json/.test(s))return{kind:"FORMAT",retryable:true,advice:"retry generation with stricter JSON request"};
 if(/model|provider|inference 5|unavailable/.test(s))return{kind:"MODEL_PROVIDER",retryable:true,advice:"retry provider/router"};
 if(/zero-cost|endpoint.*manquant|missing/.test(s))return{kind:"CONFIG",retryable:false,advice:"configuration must be supplied"};
 return{kind:"UNKNOWN",retryable:true,advice:"checkpoint and controlled restart"};
}
export class RescueSupervisor{
 constructor({onEvent,checkpoint,restore,maxAttempts=3,maxRestarts=2}={}){
  this.onEvent=onEvent||(()=>{});this.checkpointFn=checkpoint||(()=>null);this.restoreFn=restore||(()=>null);
  this.maxAttempts=maxAttempts;this.maxRestarts=maxRestarts;this.events=[];this.busy=false;
 }
 emit(type,status,detail,meta={}){const e={at:new Date().toISOString(),type,status,detail,...meta};this.events.push(e);if(this.events.length>50)this.events.shift();this.onEvent(e);return e}
 checkpoint(label){try{this.checkpointFn(label);this.emit("CHECKPOINT","PASS",label)}catch(e){this.emit("CHECKPOINT","PARTIAL",String(e?.message||e))}}
 restore(){try{return this.restoreFn()}catch(e){this.emit("RESTORE","FAIL",String(e?.message||e));return null}}
 async run(name,fn,{attempts=this.maxAttempts,onRetry}={}){
  let last;
  for(let i=1;i<=attempts;i++){
   try{const v=await fn(i);if(i>1)this.emit(name,"PASS","recovered on attempt "+i,{attempt:i});return v}
   catch(e){last=e;const d=classifyError(e);this.emit(name,i<attempts&&d.retryable?"PARTIAL":"FAIL",d.kind+": "+String(e?.message||e).slice(0,220),{attempt:i,kind:d.kind});
    if(!d.retryable||i>=attempts)throw Object.assign(e instanceof Error?e:new Error(String(e)),{rescue:d});
    if(onRetry)await onRetry({attempt:i,diagnosis:d,error:e});
    await wait(Math.min(8000,500*Math.pow(2,i-1)));
   }
  }
  throw last;
 }
 installGlobal({restart}={}){
  const panic=async raw=>{if(this.busy)return;this.busy=true;const d=classifyError(raw);this.emit("GLOBAL","FAIL",d.kind+": "+String(raw?.message||raw).slice(0,220));this.checkpoint("global-crash");
   const key="astra-rescue-restarts";const n=Number(sessionStorage.getItem(key)||0);
   if(n<this.maxRestarts&&d.retryable){sessionStorage.setItem(key,String(n+1));this.emit("RESTART","PARTIAL","automatic UI restart "+(n+1)+"/"+this.maxRestarts);await wait(700);restart?.()}
   else this.emit("CIRCUIT_BREAKER","FAIL","automatic restart stopped to prevent a loop");
  };
  addEventListener("error",e=>panic(e.error||e.message));addEventListener("unhandledrejection",e=>panic(e.reason));
 }
 clearRestartCounter(){sessionStorage.setItem("astra-rescue-restarts","0")}
}
export const sleep=wait;
