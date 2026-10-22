import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {checkedJournal,checkedJournalChange,changeJournal,GitHubJournalStore} from '../server/journal-store.js';
import {createJournalAPI} from '../server/journal-api.js';
import {authorize} from '../server/auth.js';
const seed=()=>({version:1,victories:[],recipes:[],jokes:[],futureSetting:'preserve me'});
const draft=(kind='Victory',extra={})=>({action:`save${kind}`,id:randomUUID(),operationId:randomUUID(),expectedRevision:null,...{
  Victory:{title:'A brave little step',note:'I saw how much effort you put in.',who:'asechka',date:'2026-10-22'},
  Recipe:{title:'Our kitchen experiment',ingredients:'One thing\nAnother thing',steps:'Do this\nThen this',note:'Our own notes',tried:false,ratings:{me:null,asechka:null}},
  Joke:{title:'Our phrase',meaning:'Only we understand it.',story:'The story in our own words.'}
}[kind],...extra});
const apply=(base,input)=>changeJournal(base,checkedJournalChange(input),new Date('2026-10-22T18:00:00Z'));
const jpeg=()=>{
 const bytes=Buffer.from([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,2,255,217]);
 return 'data:image/jpeg;base64,'+bytes.toString('base64');
};
test('all three collections support independent add/edit/remove, unknown fields and stable retries',()=>{
 let data=seed();
 for(const kind of ['Victory','Recipe','Joke']){
  const input=draft(kind),first=apply(data,input); assert.equal(first.changed,true);assert.equal(apply(first.data,input).changed,false);
  const key={Victory:'victories',Recipe:'recipes',Joke:'jokes'}[kind],current=first.data[key].at(-1);
  const edited=draft(kind,{id:current.id,expectedRevision:current.revision,title:'Our edited words'});
  const next=apply(first.data,edited).data;assert.equal(next[key].at(-1).title,'Our edited words');assert.equal(next.futureSetting,'preserve me');
  assert.throws(()=>apply(next,{...edited,operationId:randomUUID()}),error=>error.status===409);
  assert.throws(()=>apply(first.data,{...input,title:'Changed retry'}),error=>error.status===409);
  const remove={action:`remove${kind}`,id:current.id,expectedRevision:next[key].at(-1).revision,operationId:randomUUID()};
  const removed=apply(next,remove);assert.deepEqual(removed.data[key],data[key]);assert.equal(apply(removed.data,remove).changed,false);
  data=first.data;
 }
 assert.deepEqual([data.victories.length,data.recipes.length,data.jokes.length],[1,1,1]);
});
test('recipe photos and two separate ratings can be added, replaced, cleared and retried',()=>{
 const input=draft('Recipe',{tried:true,ratings:{me:4,asechka:5},photo:jpeg()}),first=apply(seed(),input).data,current=first.recipes[0];
 assert.equal(current.photoId,input.operationId);assert.deepEqual(current.ratings,{me:4,asechka:5});
 assert.equal(apply(first,input).changed,false);
 const update=draft('Recipe',{id:current.id,expectedRevision:current.revision,tried:true,ratings:{me:3,asechka:5}}),second=apply(first,update).data;
 assert.equal(second.recipes[0].photoId,current.photoId);
 const clear={...update,operationId:randomUUID(),expectedRevision:second.recipes[0].revision,removePhoto:true,tried:false,ratings:{me:null,asechka:null}};
 assert.equal(apply(second,clear).data.recipes[0].photoId,null);assert.equal(seed().recipes.length,0);
});
test('invalid dates, ratings, duplicate IDs, large text and invalid images cannot corrupt saved entries',()=>{
 const input=draft();for(const bad of [draft('Victory',{date:'2026-02-30'}),draft('Victory',{who:'someone'}),draft('Recipe',{ratings:{me:5,asechka:null}}),draft('Recipe',{tried:true,ratings:{me:6,asechka:2}}),draft('Recipe',{photo:'data:image/svg+xml,<script/>'}),draft('Joke',{meaning:''}),draft('Joke',{story:'x'.repeat(3001)}),{...input,id:'../private'},draft('Recipe',{photo:jpeg(),removePhoto:true})])assert.throws(()=>checkedJournalChange(bad),error=>error.status===400);
 const data=apply(seed(),input).data;const duplicate=structuredClone(data);duplicate.jokes=[{...draft('Joke'),id:input.id,revision:randomUUID(),createdAt:'2026-10-22T00:00:00Z'}];assert.throws(()=>checkedJournal(duplicate));
 assert.throws(()=>apply(data,draft('Joke',{id:input.id})),error=>error.status===400);assert.equal(data.victories[0].title,input.title);
});
function mockGit(){
 let data=seed(),head='1'.repeat(40),tree='2'.repeat(40),pending,conflict=true;const calls=[];
 return {calls,get data(){return data;},fetcher:async(url,options)=>{
  const path=new URL(url).pathname.replace('/repos/YoussefElb-Dev/asechka-website',''),body=options.body&&JSON.parse(options.body);calls.push({path,method:options.method,body});let value;
  if(path==='/git/ref/heads/main')value={object:{sha:head}};
  else if(path==='/contents/dist/journal.json')value={type:'file',encoding:'base64',size:100,sha:'3'.repeat(40),content:Buffer.from(JSON.stringify(data)).toString('base64')};
  else if(path.startsWith('/git/commits/')&&options.method==='GET')value={tree:{sha:tree}};
  else if(path==='/git/blobs')value={sha:'4'.repeat(40)};
  else if(path==='/git/trees'){
   assert.equal(body.base_tree,tree);assert.ok(body.tree.every(entry=>entry.path==='dist/journal.json'||/^dist\/assets\/recipes\/[a-f0-9-]{36}\.jpg$/.test(entry.path)));
   pending=JSON.parse(body.tree[0].content);value={sha:'5'.repeat(40)};
  }else if(path==='/git/commits'){assert.deepEqual(body.parents,[head]);value={sha:'6'.repeat(40)};}
  else if(path==='/git/refs/heads/main'){
   assert.equal(body.force,false);if(conflict){conflict=false;data=apply(data,draft('Joke')).data;head='7'.repeat(40);tree='8'.repeat(40);return Response.json({}, {status:422});}
   data=pending;head=body.sha;value={object:{sha:head}};
  }else throw Error(`Unexpected path ${path}`);
  return Response.json(value);
 }};
}
test('GitHub atomically saves photo and recipe, preserves concurrent additions and only removes its own photo',async()=>{
 const mock=mockGit(),store=new GitHubJournalStore({token:()=> 'private-test-token',fetcher:mock.fetcher}),input=draft('Recipe',{photo:jpeg()});
 const saved=await store.change(input);assert.equal(saved.recipes.length,1);assert.equal(saved.jokes.length,1);assert.equal(mock.calls.filter(call=>call.path==='/git/blobs').length,1);
 assert.equal(mock.calls.filter(call=>call.method==='PATCH').length,2);const calls=mock.calls.length;await store.change(input);assert.equal(mock.calls.length,calls+2);
 const current=saved.recipes[0];await store.change({action:'removeRecipe',id:current.id,expectedRevision:current.revision,operationId:randomUUID()});
 assert.deepEqual(mock.calls.filter(call=>call.path==='/git/trees').at(-1).body.tree.filter(entry=>entry.sha===null).map(entry=>entry.path),[`dist/assets/recipes/${input.operationId}.jpg`]);
 assert.equal(mock.data.jokes.length,1);
 await assert.rejects(()=>store.photo('../secrets'),error=>error.status===404);
 await assert.rejects(()=>store.photo(randomUUID()),error=>error.status===404);
});
test('API protects reads, photos and writes, bounds requests and never exposes upstream secrets',async()=>{
 process.env.SITE_PASSWORD='test-only-code';process.env.SESSION_SECRET=randomBytes(48).toString('hex');const origin='https://asechka.example';
 let data=seed();const handler=createJournalAPI({collection:{writable:true,read:async()=>data,change:async input=>{data=apply(data,input).data;return data;},photo:async()=>Buffer.from([255,216,255,217])}});
 assert.equal((await handler(new Request(origin+'/api/journal'))).status,401);assert.equal((await handler(new Request(origin+'/api/journal?photo='+randomUUID()))).status,401);
 const login=await authorize(new Request(origin+'/api/session',{method:'POST',headers:{origin,accept:'application/json'},body:new URLSearchParams({password:'test-only-code'})})),cookie=login.headers.get('set-cookie').split(';')[0];
 const headers={cookie,origin,'content-type':'application/json','x-asechka-journal':'1'},body=JSON.stringify(draft());
 for(const change of [{origin:'https://other.example'},{origin:''},{'x-asechka-journal':''},{'sec-fetch-site':'cross-site'}])assert.equal((await handler(new Request(origin+'/api/journal',{method:'POST',headers:{...headers,...change},body}))).status,403);
 assert.equal((await handler(new Request(origin+'/api/journal',{method:'POST',headers,body}))).status,200);
 const get=await handler(new Request(origin+'/api/journal',{headers:{cookie}}));assert.match(get.headers.get('cache-control'),/no-store/);assert.equal((await get.json()).victories.length,1);
 for(const body of ['{broken','{}'])assert.equal((await handler(new Request(origin+'/api/journal',{method:'POST',headers,body}))).status,400);
 assert.equal((await handler(new Request(origin+'/api/journal',{method:'POST',headers,body:'غ'.repeat(235001)}))).status,413);
 const photo=await handler(new Request(origin+'/api/journal?photo='+randomUUID(),{headers:{cookie}}));assert.equal(photo.headers.get('content-type'),'image/jpeg');
 const failed=createJournalAPI({collection:{read:async()=>{throw Error('private-test-token');}}});assert.ok(!(await (await failed(new Request(origin+'/api/journal',{headers:{cookie}}))).text()).includes('private-test-token'));
});
