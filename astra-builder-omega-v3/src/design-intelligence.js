export const DESIGN_INTELLIGENCE_VERSION="1.0.0";

export const DESIGN_GENERATION_CONTRACT=`
ASTRA DESIGN INTELLIGENCE Ω:
- Shape the UX before styling: hierarchy, primary action, states, content density and responsive behavior must be intentional.
- Avoid generic AI-design tells by default: purple/blue hero gradients, excessive glassmorphism, card-inside-card layouts, rounded icon tiles above every heading, giant pill controls everywhere, and default Inter/system-font sameness.
- Use a distinct visual direction tied to the product context. Prefer tinted neutrals over flat gray-on-color combinations.
- Keep one clear H1 per surface; use semantic landmarks and real interactive elements.
- Every meaningful image needs useful alt text. Every interactive control must remain keyboard-visible.
- Target touch controls at roughly 44px minimum height/size where practical.
- If motion or transitions are used, include prefers-reduced-motion handling and avoid bounce/elastic motion unless the product explicitly calls for it.
- Mobile behavior is first-class: viewport metadata, responsive layout, overflow safety, and readable typography.
- Do not fake functionality for visual polish. Design quality never overrides ASTRA reliability, evidence or security gates.
`.trim();

const clean=s=>String(s??"");
const count=(s,re)=>(clean(s).match(re)||[]).length;
const has=(s,re)=>re.test(clean(s));
const compact=s=>clean(s).replace(/\s+/g," ").trim();

function fileBy(files,path){return (files||[]).find(f=>f?.path===path)?.content||""}
function allBy(files,re){return (files||[]).filter(f=>re.test(f?.path||"")).map(f=>f.content||"").join("\n")}
function finding(id,status,weight,detail){return{id,status,weight,detail}}

export function auditDesign(files=[],spec={}){
  const html=fileBy(files,"preview/index.html")||allBy(files,/\.(?:html|tsx|jsx)$/i);
  const css=fileBy(files,"preview/styles.css")||allBy(files,/\.(?:css|scss|sass)$/i);
  const source=[html,css,allBy(files,/\.(?:tsx|jsx|html|css)$/i)].join("\n");
  const findings=[];

  const acceptance=Array.isArray(spec?.acceptance)?spec.acceptance:[];
  const productTruth=clean(spec?.goal).trim().length>12&&acceptance.length>=3;
  findings.push(finding("product-truth",productTruth?"PASS":"WARN",1,productTruth?"goal + acceptance context present":"durable product context is thin"));

  if(html){
    const h1=count(html,/<h1\b/gi);
    findings.push(finding("heading-hierarchy",h1===1?"PASS":"FAIL",3,`H1 count=${h1}; expected exactly 1`));

    const viewport=/<meta[^>]+name=["']viewport["'][^>]*>/i.test(html);
    findings.push(finding("responsive-viewport",viewport?"PASS":"FAIL",3,viewport?"viewport metadata present":"viewport metadata missing"));

    const imgs=[...html.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]);
    const missingAlt=imgs.filter(tag=>!/\balt\s*=\s*["'][^"']*["']/i.test(tag)&&!/aria-hidden\s*=\s*["']true["']/i.test(tag)).length;
    findings.push(finding("image-alt",missingAlt===0?"PASS":"FAIL",3,missingAlt===0?`all ${imgs.length} image(s) have alt/aria-hidden`:`${missingAlt} image(s) missing alt/aria-hidden`));

    const semantic=/<main\b/i.test(html)&&(/<header\b/i.test(html)||/<nav\b/i.test(html));
    findings.push(finding("semantic-landmarks",semantic?"PASS":"WARN",1,semantic?"main + header/nav landmarks present":"semantic landmarks are incomplete"));
  }else{
    findings.push(finding("preview-surface","WARN",1,"no preview HTML surface available to inspect"));
  }

  if(css||source){
    const gradients=count(source,/(?:linear|radial|conic)-gradient\s*\(/gi);
    findings.push(finding("gradient-restraint",gradients<=2?"PASS":"WARN",gradients>4?2:1,`gradient declarations=${gradients}`));

    const cardMentions=count(source,/\bcard\b/gi);
    findings.push(finding("card-restraint",cardMentions<=12?"PASS":"WARN",1,`card mentions=${cardMentions}`));

    const genericFont=has(css,/font-family\s*:[^;]*(?:Inter|Arial|system-ui|-apple-system)/i);
    const customFont=has(css,/font-family\s*:[^;]*(?:"[^"]+"|'[^']+')/i)||has(css,/@font-face|@import[^;]*(?:fonts\.|font)/i);
    findings.push(finding("typographic-distinction",!genericFont||customFont?"PASS":"WARN",1,genericFont&&!customFont?"generic/default font stack dominates":"font direction is not obviously generic-only"));

    const focus=has(css,/:focus(?:-visible)?\b/i);
    const interactive=has(html,/<(?:button|a|input|select|textarea)\b/i);
    findings.push(finding("keyboard-focus",!interactive||focus?"PASS":"WARN",2,!interactive?"no interactive controls detected":focus?"explicit focus treatment present":"interactive controls lack explicit focus/focus-visible styling"));

    const motion=has(css,/\b(?:animation|transition)\s*:/i);
    const reduced=has(css,/prefers-reduced-motion/i);
    findings.push(finding("reduced-motion",!motion||reduced?"PASS":"WARN",1,!motion?"no authored motion detected":reduced?"reduced-motion handling present":"motion exists without prefers-reduced-motion handling"));

    const touch=has(css,/(?:min-)?height\s*:\s*(?:4[4-9]|[5-9]\d)px/i)||has(css,/(?:min-)?width\s*:\s*(?:4[4-9]|[5-9]\d)px/i);
    findings.push(finding("touch-targets",!interactive||touch?"PASS":"WARN",1,!interactive?"no interactive controls detected":touch?"44px+ target sizing signal detected":"no clear 44px+ touch-target sizing signal"));

    const responsive=has(css,/@media\b|clamp\s*\(|min\s*\(|max\s*\(/i);
    findings.push(finding("responsive-layout",responsive?"PASS":"WARN",2,responsive?"responsive layout signal present":"no media/container responsive signal detected"));

    const bounce=has(css,/\b(?:bounce|elastic)\b/i);
    findings.push(finding("motion-restraint",bounce?"WARN":"PASS",1,bounce?"bounce/elastic motion token detected":"no bounce/elastic motion token detected"));
  }

  const fails=findings.filter(x=>x.status==="FAIL");
  const warnings=findings.filter(x=>x.status==="WARN");
  const penalty=fails.reduce((n,x)=>n+x.weight*18,0)+warnings.reduce((n,x)=>n+x.weight*5,0);
  const score=Math.max(0,Math.min(100,100-penalty));
  const warningWeight=warnings.reduce((n,x)=>n+x.weight,0);
  const status=fails.length?"FAIL":warningWeight>=5?"PARTIAL":"PASS";
  const top=[...fails,...warnings].slice(0,5).map(x=>`${x.id}: ${compact(x.detail)}`);
  return{
    version:DESIGN_INTELLIGENCE_VERSION,
    status,
    score,
    counts:{pass:findings.filter(x=>x.status==="PASS").length,warn:warnings.length,fail:fails.length},
    findings,
    summary:top.length?top.join(" · "):"deterministic design gate clean"
  };
}

export function designAuditEvidence(files=[],spec={}){
  const r=auditDesign(files,spec);
  return{
    name:"ASTRA DESIGN INTELLIGENCE Ω",
    status:r.status,
    detail:`v${r.version} · score ${r.score}/100 · ${r.counts.fail} fail · ${r.counts.warn} warn · ${r.summary}`
  };
}
