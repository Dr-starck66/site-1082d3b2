export const AUTHORIZED_RANGE_PROFILE={
  mode:"AUTHORIZED_RANGE_EFFECTS",
  deployable:true,
  targetPolicy:{
    publicInternet:false,
    arbitraryHosts:false,
    localhost:true,
    privateAddressSpace:true,
    railwayPrivateNetwork:true
  },
  effects:["plant-marker","degrade-service","stage-synthetic-data","rotate-canary","recover"],
  prohibited:["shell","arbitrary-command","exploit-delivery","credential-theft","propagation","destructive-action"]
} as const;

function privateIPv4(host:string){
  const m=host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if(!m) return false;
  const [a,b,c,d]=m.slice(1).map(Number);
  if([a,b,c,d].some(x=>x<0||x>255)) return false;
  return a===10 || (a===172&&b>=16&&b<=31) || (a===192&&b===168) || a===127;
}
function explicitHosts(){
  return new Set(String(Bun.env.C2LEDGER_RANGE_ALLOWED_HOSTS||"")
    .split(",").map(x=>x.trim().toLowerCase()).filter(Boolean));
}
export function authorizedRangeUrl(raw:string){
  const u=new URL(raw);
  if(u.protocol!=="http:"&&u.protocol!=="https:") throw new Error("range node protocol blocked");
  const h=u.hostname.toLowerCase();
  const ok=h==="localhost"||h==="127.0.0.1"||h.endsWith(".railway.internal")||privateIPv4(h)||explicitHosts().has(h);
  if(!ok) throw new Error("range node target blocked: public/arbitrary hosts are not allowed");
  return u;
}
export function validateEffect(effect:string){
  if(!(AUTHORIZED_RANGE_PROFILE.effects as readonly string[]).includes(effect)) throw new Error("unsupported range effect");
  return effect;
}
