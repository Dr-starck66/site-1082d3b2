'use strict';

const CANONICAL_HOST = 'echangismerencontre.com';

// Directly evidenced historical path(s) only.
const EVIDENCED_HISTORICAL_PATHS = new Set(['/']);

// Defensive technical aliases. These are NOT claimed as recovered historical URLs.
const DEFENSIVE_ALIASES = new Map([
  ['/index.php', '/'],
  ['/index.html', '/'],
  ['/index.htm', '/'],
  ['/default.html', '/'],
  ['/default.htm', '/'],
]);

function cleanHost(host = '') {
  return String(host).toLowerCase().split(':')[0].trim();
}
function normalizePath(pathname = '/') {
  let p = String(pathname || '/');
  try { p = decodeURI(p); } catch (_) {}
  if (!p.startsWith('/')) p = '/' + p;
  p = '/' + p.replace(/^\/+/, '');
  p = p.replace(/\/{2,}/g, '/');
  return p || '/';
}
function canonicalizeRequest({ host = '', proto = 'https', pathname = '/' } = {}) {
  const h = cleanHost(host);
  const p = normalizePath(pathname);
  const targetPath = DEFENSIVE_ALIASES.get(p) || p;
  const isCanonicalFamily = h === CANONICAL_HOST || h === `www.${CANONICAL_HOST}`;
  const canonicalOrigin = isCanonicalFamily
    ? `https://${CANONICAL_HOST}`
    : `${proto === 'http' ? 'http' : 'https'}://${h || CANONICAL_HOST}`;

  const needsHostRedirect = h === `www.${CANONICAL_HOST}`;
  const needsHttpsRedirect = h === CANONICAL_HOST && proto !== 'https';
  const needsAliasRedirect = targetPath !== p;

  if (needsHostRedirect || needsHttpsRedirect || needsAliasRedirect) {
    return {
      action: 'redirect',
      status: 301,
      location: `${canonicalOrigin}${targetPath}`,
      reason: needsAliasRedirect ? 'legacy-alias' : (needsHostRedirect ? 'www-canonicalization' : 'https-canonicalization'),
    };
  }
  return { action: 'pass', pathname: targetPath };
}
module.exports = { CANONICAL_HOST, EVIDENCED_HISTORICAL_PATHS, DEFENSIVE_ALIASES, canonicalizeRequest };
