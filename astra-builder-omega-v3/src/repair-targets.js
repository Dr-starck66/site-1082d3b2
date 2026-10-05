const clean=s=>String(s??"").replace(/\x1b\[[0-9;]*m/g," ").replace(/\s+/g," ").trim();

export function selectRepairTargets({evidence=[],files=[]}={}){
  const paths=new Set((files||[]).map(f=>String(f?.path||"")).filter(Boolean));
  const labels=(evidence||[]).filter(e=>e?.status!=="PASS").map(e=>clean((e?.name||"")+" · "+(e?.detail||"")));
  const failureText=labels.join("\n");
  const explicit=[],fallback=[];
  const add=(arr,p)=>{if(/\/tests\/astra-contract\.test\./.test(p))return;if(paths.has(p)&&!arr.includes(p))arr.push(p)};

  for(const m of failureText.matchAll(/((?:backend|frontend|preview)\/(?:src|tests)?\/?[A-Za-z0-9._\/-]+\.(?:ts|tsx|js|jsx|html|css))/g))add(explicit,m[1]);

  const designFailure=/ASTRA DESIGN INTELLIGENCE|heading-hierarchy|responsive-viewport|semantic-landmarks|responsive-layout/i.test(failureText);
  const frontendFailure=/Build frontend|Tests frontend|frontend\/|src\/App\.tsx|vite:|rolldown|Unexpected token/i.test(failureText);
  const backendFailure=/Build backend|Tests backend|backend\/|src\/(?:app|auth|repository|server)\.ts|tsc\s+--noEmit|Runtime health/i.test(failureText);

  for(const label of labels){
    const scope=/frontend/i.test(label)?"frontend":/(?:backend|runtime health|tsc\s+--noEmit)/i.test(label)?"backend":null;
    if(!scope)continue;
    for(const m of label.matchAll(/(?:^|[^A-Za-z0-9_\/])((?:src|tests)\/[A-Za-z0-9._\/-]+\.(?:ts|tsx|js|jsx))/g))add(explicit,scope+"/"+m[1]);
  }

  const hasFrontend=explicit.some(p=>p.startsWith("frontend/"));
  const hasBackend=explicit.some(p=>p.startsWith("backend/"));
  const hasPreview=explicit.some(p=>p.startsWith("preview/"));

  if(frontendFailure&&!hasFrontend)add(fallback,"frontend/src/App.tsx");
  if(backendFailure&&!hasBackend){
    if(/authRouter|requireAuth|auth\.ts/i.test(failureText))add(fallback,"backend/src/auth.ts");
    else add(fallback,"backend/src/app.ts");
  }
  if(designFailure&&!hasPreview){
    add(fallback,"preview/index.html");add(fallback,"preview/styles.css");add(fallback,"preview/app.js");
  }

  const out=[...explicit,...fallback];
  if(!out.length){
    const order=designFailure
      ?["preview/index.html","preview/styles.css","preview/app.js","frontend/src/App.tsx"]
      :frontendFailure
        ?["frontend/src/App.tsx","frontend/src/main.tsx"]
        :backendFailure
          ?["backend/src/app.ts","backend/src/auth.ts","backend/src/repository.ts"]
          :["frontend/src/App.tsx","backend/src/app.ts","preview/app.js"];
    for(const p of order)add(out,p);
  }
  return{targets:out.slice(0,4),designFailure,frontendFailure,backendFailure,failureText};
}

export function repairTargetSelfTest(){
  const files=[
    {path:"frontend/src/App.tsx",content:"..."},
    {path:"frontend/src/main.tsx",content:"x"},
    {path:"preview/index.html",content:"x"},
    {path:"preview/styles.css",content:"x"},
    {path:"preview/app.js",content:"x"},
    {path:"backend/src/app.ts",content:"x"}
  ];
  const a=selectRepairTargets({files,evidence:[
    {name:"ASTRA DESIGN INTELLIGENCE Ω",status:"FAIL",detail:"heading-hierarchy: H1 count=0"},
    {name:"Build frontend",status:"FAIL",detail:"Unexpected token File: /tmp/run/frontend/src/App.tsx"}
  ]});
  const b=selectRepairTargets({files,evidence:[{name:"Tests frontend",status:"FAIL",detail:"Unexpected token"}]});
  return{
    ok:a.targets.includes("frontend/src/App.tsx")&&a.targets.includes("preview/index.html")&&b.targets[0]==="frontend/src/App.tsx",
    a:a.targets,b:b.targets
  };
}
