import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {checkedTogetherChange,changeTogether} from '../server/together-store.js';
import {heartDay,publicTogether} from '../server/heart-counts.js';
const base=()=>({version:1,bucketList:[],hearts:{me:null,asechka:null}});
const now=new Date('2026-11-02T17:00:00Z');
const send=(data,input,date=now)=>changeTogether(data,checkedTogetherChange({action:'sendHeart',from:'me',operationId:randomUUID(),...input}),date).data;
test('a burst records every tap, both identities and original offline days without throttling',()=>{
  let data=base();data=send(data,{count:321,day:'2026-10-31'});data=send(data,{from:'asechka',count:99,day:'2026-10-31'});
  for(let i=0;i<20;i++)data=send(data,{day:'2026-11-01'});
  assert.deepEqual(data.heartDays['2026-10-31'],{me:321,asechka:99});assert.equal(data.heartDays['2026-11-01'].me,20);
});
test('retries after later hearts and a restart stay idempotent; changed payloads are conflicts',()=>{
  const op={operationId:randomUUID(),count:50,day:'2026-11-01'};
  let data=send(base(),op);data=send(data,{count:8});data=JSON.parse(JSON.stringify(data));
  assert.deepEqual(send(data,op),data);
  assert.throws(()=>send(data,{...op,count:51}),e=>e.status===409);
  assert.throws(()=>send(data,{...op,from:'asechka'}),e=>e.status===409);
  const original={operationId:randomUUID()};data=send(data,original,new Date('2026-11-02T17:00:00Z'));
  assert.deepEqual(send(data,original,new Date('2026-11-03T17:00:00Z')),data);
});
test('days use Eastern midnight across DST and reject impossible, future and unsafe counts',()=>{
  assert.equal(heartDay(new Date('2026-11-01T03:59:59Z')),'2026-10-31');
  assert.equal(heartDay(new Date('2026-11-01T04:00:00Z')),'2026-11-01');
  assert.equal(heartDay(new Date('2026-11-02T04:59:59Z')),'2026-11-01');
  assert.equal(heartDay(new Date('2026-11-02T05:00:00Z')),'2026-11-02');
  for(const input of [{count:0},{count:-1},{count:1.5},{count:Infinity},{count:'100'},{day:'2026-02-30'},{day:'2026-11-03'}])assert.throws(()=>send(base(),input),e=>e.status===400);
});
test('API responses keep daily counts and bounded acknowledgements without publishing the permanent ledger',()=>{
  const data=send(base(),{count:100});const visible=publicTogether(data);
  assert.equal(visible.heartDays['2026-11-02'].me,100);assert.equal(visible.heartReceipts.length,1);assert.equal(visible.heartOperations,undefined);
});
