export function inferRole(system=""){
 const s=String(system).toLowerCase();
 if(s.includes("architect"))return"architect";if(s.includes("frontend")||s.includes("ux"))return"frontend";if(s.includes("backend"))return"backend";if(s.includes("database"))return"database";if(s.includes("auth"))return"auth";if(s.includes("devops"))return"ops";if(s.includes("adversary"))return"adversary";if(s.includes("verify"))return"verifier";if(s.includes("repair")||s.includes("improve"))return"builder";return"general";
}
export function candidates(cfg,requested,system="",bias="balanced"){
 const role=inferRole(system),pool=[requested];
 const balanced={architect:[cfg.architect,cfg.verifier,cfg.adversary],frontend:[cfg.frontend,cfg.backend,cfg.verifier],backend:[cfg.backend,cfg.frontend,cfg.verifier],database:[cfg.backend,cfg.architect,cfg.verifier],auth:[cfg.backend,cfg.adversary,cfg.verifier],ops:[cfg.ops,cfg.backend,cfg.verifier],adversary:[cfg.adversary,cfg.verifier,cfg.architect],verifier:[cfg.verifier,cfg.adversary,cfg.architect],builder:[cfg.frontend,cfg.backend,cfg.verifier],general:[cfg.frontend,cfg.verifier,cfg.adversary]};
 const critic={...balanced,frontend:[cfg.frontend,cfg.verifier,cfg.adversary,cfg.backend],backend:[cfg.backend,cfg.verifier,cfg.adversary,cfg.frontend],builder:[cfg.frontend,cfg.verifier,cfg.adversary,cfg.backend],ops:[cfg.ops,cfg.verifier,cfg.backend],general:[cfg.verifier,cfg.adversary,cfg.frontend]};
 const builder={...balanced,architect:[cfg.architect,cfg.frontend,cfg.backend,cfg.verifier],adversary:[cfg.adversary,cfg.frontend,cfg.verifier],verifier:[cfg.verifier,cfg.frontend,cfg.adversary],general:[cfg.frontend,cfg.backend,cfg.verifier]};
 const table=bias==="critic"?critic:bias==="builder"?builder:balanced;
 for(const m of table[role]||[])if(m&&!pool.includes(m))pool.push(m);
 return{role,models:pool.filter(Boolean),bias};
}
export function routeAttempt(cfg,requested,system,attempt=1,bias="balanced"){const r=candidates(cfg,requested,system,bias),i=Math.min(Math.max(0,attempt-1),r.models.length-1);return{role:r.role,model:r.models[i]||requested,attempt,fallback:i>0,bias:r.bias}}
