export function metricSnapshot({files=[],evidence=[],startedAt=0,cost=0,status="UNVERIFIED"}={}){
 const pass=evidence.filter(x=>x.status==="PASS").length,fail=evidence.filter(x=>x.status==="FAIL").length,partial=evidence.filter(x=>x.status==="PARTIAL").length,total=evidence.length||1;
 return{files:files.length,tests:files.filter(f=>/(test|spec)/i.test(f.path)).length,quality:Math.round(pass/total*100),fail,partial,latencyMs:startedAt?Date.now()-startedAt:0,cost,status};
}
export function compare(base,next){const score=x=>(x.quality*0.5)+Math.min(20,x.tests*3)+Math.min(15,x.files*.5)-x.fail*15-x.partial*2-Math.min(10,(x.latencyMs||0)/10000)-Math.min(20,(x.cost||0)*20);const a=score(base),b=score(next),delta=Math.round((b-a)*10)/10;return{baseScore:Math.round(a*10)/10,nextScore:Math.round(b*10)/10,delta,verdict:delta>0?"IMPROVED":delta===0?"TIE":"REGRESSION"}}
export function matrix(samples=[]){const by={};for(const s of samples){const k=s.label||"run";(by[k]??=[]).push(s.metrics||s)}return Object.fromEntries(Object.entries(by).map(([k,v])=>[k,{runs:v.length,quality:avg(v,"quality"),latencyMs:avg(v,"latencyMs"),files:avg(v,"files"),tests:avg(v,"tests"),fail:avg(v,"fail")}]))}
function avg(a,k){return Math.round((a.reduce((n,x)=>n+(Number(x[k])||0),0)/(a.length||1))*10)/10}
