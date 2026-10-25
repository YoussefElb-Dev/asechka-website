import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HeartOutbox,heartDay} from '../dist/heart-outbox.js';
test('rapid web hearts survive reload, profile changes, and immutable retries',()=>{
 let stored=[],id=0;
 const options={load:()=>structuredClone(stored),save:items=>{stored=structuredClone(items)},uuid:()=>`heart-${++id}`};
 let queue=new HeartOutbox(options);
 for(let i=0;i<500;i++)queue.tap('me','2026-10-24');
 const first=queue.seal();assert.equal(first.count,500);
 queue.tap('me','2026-10-24');queue.tap('asechka','2026-10-24');queue=new HeartOutbox(options);
 assert.deepEqual(queue.seal(),first);assert.equal(queue.count('me','2026-10-24'),501);
 assert.equal(queue.count('me','2026-10-24',[first.operationId]),1);
 queue.acknowledge(first.operationId);assert.equal(queue.seal().count,1);
 assert.equal(queue.count('asechka','2026-10-24'),1);
});
test('web heart rollover and failed local writes preserve the previous queue',()=>{
 const queue=new HeartOutbox({save:()=>{},uuid:()=>crypto.randomUUID()});
 queue.tap('me','2026-10-24');queue.tap('me','2026-10-25');
 assert.equal(queue.items.length,2);
 const before=structuredClone(queue.items);queue.save=()=>{throw new Error('Storage full')};
 assert.throws(()=>queue.tap('me','2026-10-25'));assert.deepEqual(queue.items,before);
 assert.equal(heartDay(new Date('2026-11-02T04:59:59Z')),'2026-11-01');
});
