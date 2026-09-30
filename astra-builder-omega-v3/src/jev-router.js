export function inferRole(system=""){
 const s=String(system).toLowerCase();
 if(s.includes("architect"))return"architect";if(s.includes("frontend")||s.includes("ux"))return"frontend";if(s.includes("backend"))return"backend";if(s.includes("database"))return"database";if(s.includes("auth"))return"auth";if(s.includes("devops"))return"ops";if(s.includes("adversary"))return"adversary";if(s.includes("verify"))return"verifier";if(s.includes("repair")||s.includes("improve"))return"builder";return"general";
}
export function candidates(cfg,requested,system=""){
 const role=inferRole(system),pool=[requested];
 const byRole={architect:[cfg.architect,cfg.verifier,cfg.adversary],frontend:[cfg.frontend,cfg.backend,cfg.verifier],backend:[cfg.backend,cfg.frontend,cfg.verifier],database:[cfg.backend,cfg.architect,cfg.verifier],auth:[cfg.backend,cfg.adversary,cfg.verifier],ops:[cfg.ops,cfg.backend,cfg.verifier],adversary:[cfg.adversary,cfg.verifier,cfg.architect],verifier:[cfg.verifier,cfg.adversary,cfg.architect],builder:[cfg.frontend,cfg.backend,cfg.verifier],general:[cfg.frontend,cfg.verifier,cfg.adversary]};
 for(const m of byRole[role]||[])if(m&&!pool.includes(m))pool.push(m);
 return{role,models:pool.filter(Boolean)};
}
export function routeAttempt(cfg,requested,system,attempt=1){const r=candidates(cfg,requested,system),i=Math.min(Math.max(0,attempt-1),r.models.length-1);return{role:r.role,model:r.models[i]||requested,attempt,fallback:i>0}}
