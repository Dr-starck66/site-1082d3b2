import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

function browserPath(){
  if(process.env.CHROMIUM_PATH)return process.env.CHROMIUM_PATH;
  if(existsSync("/usr/bin/chromium-browser"))return "/usr/bin/chromium-browser";
  if(existsSync("/usr/bin/chromium"))return "/usr/bin/chromium";
  return "/usr/bin/chromium-browser";
}

export async function runMemoryVaultProbe(port){
  const browser=await chromium.launch({
    headless:true,
    executablePath:browserPath(),
    args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--disable-background-networking"]
  });
  const probeId="vault-probe-"+Date.now();
  try{
    const page=await browser.newPage();
    await page.goto("http://127.0.0.1:"+port+"/",{waitUntil:"domcontentloaded",timeout:20000});
    await page.waitForFunction(()=>window.__ASTRA_MEMORY_VAULT__&&window.__ASTRA_STATE__,null,{timeout:10000});

    const saved=await page.evaluate(async id=>{
      const s=window.__ASTRA_STATE__;
      s.workspaceId=id;
      s.status="PASS";
      s.spec={appName:id,goal:"Memory Vault persistence probe",features:["reload"],acceptance:["restore exact state"]};
      s.files=[{path:"probe.txt",content:"ASTRA_MEMORY_VAULT_OK"}];
      s.evidence=[{name:"probe",status:"PASS",detail:"before reload"}];
      const row=await window.__ASTRA_MEMORY_VAULT__.save();
      return {id:row.id,files:row.files.length,version:row.version};
    },probeId);

    await page.reload({waitUntil:"domcontentloaded",timeout:20000});
    await page.waitForFunction(()=>window.__ASTRA_MEMORY_VAULT__,null,{timeout:10000});

    const restored=await page.evaluate(async id=>{
      const rows=await window.__ASTRA_MEMORY_VAULT__.list();
      const row=rows.find(x=>x.id===id);
      if(!row)return {ok:false,stage:"list"};
      const restored=await window.__ASTRA_MEMORY_VAULT__.restore(id);
      const s=window.__ASTRA_STATE__;
      const ok=!!restored&&s.workspaceId===id&&s.spec?.goal==="Memory Vault persistence probe"&&s.files?.[0]?.content==="ASTRA_MEMORY_VAULT_OK"&&s.evidence?.[0]?.status==="PASS";
      await window.__ASTRA_MEMORY_VAULT__.remove(id);
      return {ok,stage:"restore",rows:rows.length,workspaceId:s.workspaceId,goal:s.spec?.goal,file:s.files?.[0]?.content,evidence:s.evidence?.[0]?.status};
    },probeId);

    return {
      status:restored.ok?"PASS":"FAIL",
      saved,
      restored,
      reloadVerified:restored.ok,
      secretsStored:false,
      storage:"IndexedDB"
    };
  }finally{
    await browser.close();
  }
}
