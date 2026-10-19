import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { checkedMemoryChange, appendMemory, editableMemories } from '../server/memories-store.js';
const initial=()=>({version:1,quotes:[{id:randomUUID(),text:'Our little universe',date:'2026-10-18'}],photos:[]});
const apply=(data,change)=>appendMemory(data,checkedMemoryChange(change),new Date('2026-10-18T16:00:00Z'));
const action=(data,type,extra={})=>({action:type,operationId:randomUUID(),id:data.quotes[0].id,kind:'quote',actor:'asnat',...extra});
test('both profiles can like, unlike, and retry without reviving an old like',()=>{
 let data=initial();const first=action(data,'setLike',{liked:true});
 data=apply(data,first).data;data=apply(data,action(data,'setLike',{actor:'youssef',liked:true})).data;
 data=apply(data,action(data,'setLike',{liked:false})).data;
 assert.deepEqual(data.quotes[0].social.likes,{asnat:false,youssef:true});
 assert.equal(apply(data,first).changed,false);
 assert.equal(data.quotes[0].social.likes.asnat,false);
 assert.throws(()=>apply(data,{...first,liked:false}),e=>e.status===409);
});
test('comments preserve Unicode, identity and time, are idempotent, and can only be removed as their author',()=>{
 let data=initial();const comment=action(data,'addComment',{text:'  I love this ♡ بحبك  '});
 data=apply(data,comment).data;
 assert.equal(data.quotes[0].social.comments[0].text,'I love this ♡ بحبك');
 assert.equal(data.quotes[0].social.comments[0].author,'asnat');
 assert.equal(data.quotes[0].social.comments[0].createdAt,'2026-10-18T16:00:00.000Z');
 assert.equal(apply(data,comment).changed,false);
 assert.throws(()=>apply(data,action(data,'removeComment',{actor:'youssef',commentId:comment.operationId})),e=>e.status===403);
 data=apply(data,action(data,'removeComment',{commentId:comment.operationId})).data;
 assert.equal(data.quotes[0].social.comments.length,0);
 assert.equal(apply(data,comment).changed,false);
});
test('interactions preserve content edit versions and survive concurrent caption edits',()=>{
 let data=initial();const editable=editableMemories(data).quotes[0];
 data=apply(data,action(data,'setLike',{liked:true})).data;
 assert.equal(editableMemories(data).quotes[0].editVersion,editable.editVersion);
 data=apply(data,{action:'updateQuote',operationId:randomUUID(),id:editable.editKey,expectedVersion:editable.editVersion,text:'Our next chapter',note:'Us',date:'2026-10-18'}).data;
 assert.equal(data.quotes[0].text,'Our next chapter');assert.equal(data.quotes[0].social.likes.asnat,true);
});
test('legacy string posts gain stable ids when their first interaction is saved',()=>{
 let data={version:1,quotes:['A little thought'],photos:[]};const id=editableMemories(data).quotes[0].editKey;
 data=apply(data,{action:'addComment',operationId:randomUUID(),kind:'quote',id,actor:'youssef',text:'Kept forever'}).data;
 assert.equal(data.quotes[0].id,id);assert.equal(data.quotes[0].text,'A little thought');
 assert.equal(editableMemories(data).quotes[0].editKey,id);
});
test('new photo and quote posts retain the selected author and creation time',()=>{
 const data=apply({version:1,quotes:[],photos:[]},{action:'addQuote',operationId:randomUUID(),text:'From me',note:'',date:'2026-10-18',author:'youssef'}).data;
 assert.equal(data.quotes[0].author,'youssef');assert.equal(data.quotes[0].createdAt,'2026-10-18T16:00:00.000Z');
});
test('invalid social requests and reactions to deleted posts are rejected without modifying data',()=>{
 const data=initial();const original=JSON.stringify(data);
 for(const extra of [{actor:'anyone'},{kind:'video'},{id:'bad'},{liked:1}])
  assert.throws(()=>checkedMemoryChange(action(data,'setLike',{liked:true,...extra})),e=>e.status===400);
 for(const text of ['', ' '.repeat(2), 'a'.repeat(1001), 123])
  assert.throws(()=>checkedMemoryChange(action(data,'addComment',{text})),e=>e.status===400);
 assert.throws(()=>apply(data,action(data,'setLike',{id:randomUUID(),liked:true})),e=>e.status===409);
 assert.equal(JSON.stringify(data),original);
});
test('social operations retain unrelated photos and metadata and bound receipt storage',()=>{
 let data=initial();data.unknown={keep:'yes'};
 for(let i=0;i<150;i++)data=apply(data,action(data,'setLike',{liked:i%2===0})).data;
 assert.equal(data.quotes[0].social.receipts.length,128);assert.deepEqual(data.unknown,{keep:'yes'});
 assert.deepEqual(data.photos,[]);
});
