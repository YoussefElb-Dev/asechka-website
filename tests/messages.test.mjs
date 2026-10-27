import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {checkedTogetherChange,changeTogether} from '../server/together-store.js';
const base=()=>({version:1,bucketList:[],hearts:{me:null,asechka:null}});
const day=new Date('2026-10-27T18:00:00Z');
const send=(actor='asnat',text='A little hello just for you')=>checkedTogetherChange({action:'sendMessage',operationId:randomUUID(),actor,text});
test('messages are shared, daily limited per person, and retries do not spend another slot',()=>{
 let data=base(); const first=send();data=changeTogether(data,first,day).data;
 assert.equal(changeTogether(data,first,day).changed,false);
 data=changeTogether(data,send(),day).data;data=changeTogether(data,send(),day).data;
 assert.throws(()=>changeTogether(data,send(),day),e=>e.status===429);
 data=changeTogether(data,send('youssef'),day).data;assert.equal(data.messages.length,4);
 data=changeTogether(data,send(),new Date('2026-10-28T04:01:00Z')).data;assert.equal(data.messages.length,5);
});
test('only the recipient can close, and closing destroys the full body while preserving history and quota',()=>{
 let data=changeTogether(base(),send('asnat','x'.repeat(200)),day).data;const id=data.messages[0].id;
 const close=actor=>checkedTogetherChange({action:'closeMessage',operationId:randomUUID(),actor,id});
 assert.throws(()=>changeTogether(data,close('asnat'),day),e=>e.status===403);
 data=changeTogether(data,close('youssef'),day).data;
 assert.equal(data.messages[0].text,undefined);assert.equal(data.messages[0].preview.length,61);assert.ok(data.messages[0].closedAt);
 assert.equal(changeTogether(data,close('youssef'),day).changed,false);
});
test('message validation rejects invalid profiles, IDs and oversized/empty text',()=>{
 for(const body of [{actor:'other',text:'hi'},{actor:'asnat',text:''},{actor:'asnat',text:'x'.repeat(1001)}]) {
  assert.throws(()=>changeTogether(base(),checkedTogetherChange({action:'sendMessage',operationId:randomUUID(),...body}),day));
 }
 assert.throws(()=>checkedTogetherChange({action:'closeMessage',operationId:randomUUID(),actor:'asnat',id:'no'}));
});
