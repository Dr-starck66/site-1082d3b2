import {test} from 'node:test';
import assert from 'node:assert/strict';
import {total,emptyScenario} from './cost-core.mjs';
test('room quantity, guest meals, vehicles, resort fees and quote taxes have distinct bases',()=>{
 const s={nightly:100,rooms:2,nights:3,guests:4,breakfast:10,mornings:2,parking:12,vehicles:1,transit:5,days:3,transfer:40,tax:30,resort:8,other:9};
 assert.deepEqual(total(s).parts,{room:600,breakfast:80,parking:36,transit:60,transfer:40,tax:30,resort:48,other:9});
 assert.equal(total(s).sum,903);
 assert.equal(total(s).perGuestNight,903/12);
});
test('included extras stay zero and quoted tax is never multiplied',()=>{
 const s={...emptyScenario(),nightly:80,nights:5,guests:2,tax:17};
 assert.equal(total(s).sum,417);
 assert.equal(total(s).parts.tax,17);
});
test('negative, nonfinite, zero occupancy and fractional counts are rejected',()=>{
 for(const [key,value] of [['nightly',-1],['tax',Infinity],['parking',NaN],['nights',0],['rooms',1.5],['guests',0]]) assert.throws(()=>total({...emptyScenario(),[key]:value}),RangeError);
});
test('string numbers from HTML forms are normalized',()=>assert.equal(total({...emptyScenario(),nightly:'125.50',nights:'2'}).sum,251));
