'use strict';
const assert = require('assert');
const { canonicalizeRequest, EVIDENCED_HISTORICAL_PATHS } = require('./seo-recovery');

const cases = [
  [{host:'www.echangismerencontre.com', proto:'https', pathname:'/'}, 'https://echangismerencontre.com/'],
  [{host:'echangismerencontre.com', proto:'http', pathname:'/'}, 'https://echangismerencontre.com/'],
  [{host:'echangismerencontre.com', proto:'https', pathname:'/index.php'}, 'https://echangismerencontre.com/'],
  [{host:'echangismerencontre.com', proto:'https', pathname:'/index.html'}, 'https://echangismerencontre.com/'],
  [{host:'preview.up.railway.app', proto:'https', pathname:'/index.htm'}, 'https://preview.up.railway.app/'],
];
for (const [input, expected] of cases) {
  const got = canonicalizeRequest(input);
  assert.equal(got.action, 'redirect');
  assert.equal(got.status, 301);
  assert.equal(got.location, expected);
}
const pass = canonicalizeRequest({host:'echangismerencontre.com', proto:'https', pathname:'/articles/wyylde-avis.html'});
assert.equal(pass.action, 'pass');
assert.equal(pass.pathname, '/articles/wyylde-avis.html');
assert.deepEqual([...EVIDENCED_HISTORICAL_PATHS], ['/']);
console.log('PASS seo-recovery: 6/6 checks');
