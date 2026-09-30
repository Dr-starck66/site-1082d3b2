function ev(name,ok,detail,partial=false){return{name,status:ok?"PASS":partial?"PARTIAL":"FAIL",detail}}
export function staticChecks(files,spec){
  const map=Object.fromEntries(files.map(f=>[f.path,f.content||""]));const all=files.map(f=>f.content||"").join("\n");const out=[];
  out.push(ev("Project files",files.length>=8,files.length+" fichiers générés"));
  out.push(ev("Unique paths",new Set(files.map(f=>f.path)).size===files.length,"aucun conflit de chemin"));
  out.push(ev("README",!!map["README.md"],"README.md présent"));
  out.push(ev("Deploy manifest",!!map["deploy.json"],"deploy.json présent"));
  out.push(ev("Preview bundle",!!map["preview/index.html"]&&!!map["preview/styles.css"]&&!!map["preview/app.js"],"preview autonome"));
  out.push(ev("Backend health",files.some(f=>/health/i.test(f.path+" "+f.content)),"endpoint/contrôle health détecté"));
  out.push(ev("Tests present",files.some(f=>/(test|spec)/i.test(f.path)),"fichiers de tests détectés"));
  out.push(ev("No TODO placeholders",!/(TODO|lorem ipsum|coming soon)/i.test(all),"pas de placeholder évident"));
  out.push(ev("No obvious secrets",!/(sk-or-v1-|ghp_|AKIA[0-9A-Z]{16}|api[_-]?key\s*[:=]\s*["'][^"']{8,})/i.test(all),"pas de secret évident"));
  const pkg=files.find(f=>/package\.json$/.test(f.path));let pkgOk=true;if(pkg){try{JSON.parse(pkg.content)}catch{pkgOk=false}}out.push(ev("package.json parse",pkg?pkgOk:true,pkg?"JSON valide":"aucun package.json",!pkg));
  const acceptance=spec?.acceptance||[];out.push(ev("Acceptance criteria",acceptance.length>=3,acceptance.length+" critères définis"));
  return out;
}
export function benchmark(files,evidence,spec){
  const pass=evidence.filter(e=>e.status==="PASS").length,total=evidence.length||1;const tests=files.filter(f=>/(test|spec)/i.test(f.path)).length;const dirs=new Set(files.map(f=>f.path.split("/")[0])).size;
  const quality=Math.round(pass/total*100);const completeness=Math.min(100,Math.round((files.length/18)*60+(tests/3)*20+((spec?.acceptance?.length||0)/6)*20));const architecture=Math.min(100,dirs*13+Math.min(35,files.length));
  return{quality,completeness,architecture,files:files.length,tests,competitors:{lovable:"UNVERIFIED",bolt:"UNVERIFIED"},note:"Aucun classement contre Lovable/Bolt n'est déclaré sans exécution du même benchmark sur leurs sorties."};
}