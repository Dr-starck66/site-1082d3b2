export const fields = ['nightly','rooms','nights','guests','breakfast','mornings','parking','vehicles','transit','days','transfer','tax','resort','other'];
export function validateScenario(s) {
  for (const key of fields) {
    const n = Number(s[key]);
    if (!Number.isFinite(n) || n < 0 || n > 1e7) throw new RangeError(`Invalid ${key}`);
    if (['rooms','nights','guests','mornings','vehicles','days'].includes(key) && !Number.isInteger(n)) throw new RangeError(`Non-integer ${key}`);
  }
  if (Number(s.rooms)<1 || Number(s.nights)<1 || Number(s.guests)<1) throw new RangeError('Rooms, nights and guests must be positive');
}
// Extends the existing FreeHotels /calculateur algorithm. Extra fees must be
// entered ONLY when excluded from the room price; tax is the quoted stay total.
export function total(s) {
  validateScenario(s);
  const n=Object.fromEntries(fields.map(k=>[k,Number(s[k])]));
  const parts={room:n.nightly*n.rooms*n.nights,breakfast:n.breakfast*n.guests*n.mornings,parking:n.parking*n.vehicles*n.nights,transit:n.transit*n.guests*n.days,transfer:n.transfer,tax:n.tax,resort:n.resort*n.rooms*n.nights,other:n.other};
  const sum=Object.values(parts).reduce((a,b)=>a+b,0);
  return {parts,sum,perNight:sum/n.nights,perGuestNight:sum/(n.nights*n.guests)};
}
export const emptyScenario = () => Object.fromEntries(fields.map(k=>[k,['rooms','nights','guests','mornings','days'].includes(k)?1:0]));
