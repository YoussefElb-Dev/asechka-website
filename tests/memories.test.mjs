import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { checkedMemoryChange, appendMemory, GitHubMemoriesStore, editableMemories } from '../server/memories-store.js';
import { createMemoriesAPI } from '../server/memories-api.js';
import { authorize } from '../server/auth.js';
const empty = () => ({version:1,quotes:[],photos:[]});
const quote = (extra={}) => ({action:'addQuote',operationId:randomUUID(),text:'Every day with you ♡',note:'Us',date:'2026-10-17',...extra});
const change = (base,input) => appendMemory(base,checkedMemoryChange(input));
test('quote additions preserve every existing entry, dates, Unicode, and notes; retries are idempotent',()=>{
 const old={id:randomUUID(),src:`assets/photos/2026/10/${randomUUID()}.jpg`,caption:'Our picture'};
 const base={version:1,quotes:['An older quote'],photos:[old]};const input=quote();const first=change(base,input);
 assert.equal(first.data.quotes[1].text,input.text);assert.equal(first.data.quotes[1].note,'Us');assert.deepEqual(first.data.photos,[old]);assert.equal(base.quotes.length,1);
 assert.equal(change(first.data,input).changed,false);assert.throws(()=>change(first.data,{...input,text:'Changed'}),e=>e.status===409);
});
test('photos keep a safe UUID path and content fingerprint; malformed dates, payloads and URLs are rejected',async()=>{
 const photo='data:image/jpeg;base64,'+(await readFile(new URL('../dist/assets/cats-cuddle.jpg',import.meta.url))).toString('base64');
 const input=quote({action:'addPhoto',photo,caption:'The two of us'});const first=change(empty(),input);
 assert.match(first.item.src,/^assets\/photos\/2026\/10\/[a-f0-9-]+\.jpg$/);assert.equal(first.item.caption,input.caption);assert.equal(change(first.data,input).changed,false);
 for(const extra of [{date:'2026-02-30'},{date:'wrong'},{operationId:'../secret'},{text:''},{text:'a'.repeat(10001)},{note:42}])assert.throws(()=>checkedMemoryChange(quote(extra)),e=>e.status===400);
 for(const bad of ['https://evil.example/secret','data:image/svg+xml;base64,PHN2Zz4=','data:image/jpeg;base64,'+'A'.repeat(440000)])assert.throws(()=>checkedMemoryChange({...input,photo:bad}),e=>e.status===400);
});
function mockGit(initial=empty(),simulateConflict=true){let data=initial,head='1'.repeat(40),tree='2'.repeat(40),pending,conflict=simulateConflict;const calls=[];return{calls,get data(){return data;},fetcher:async(url,options)=>{
 const path=new URL(url).pathname.split('/asechka-website')[1];const body=options.body?JSON.parse(options.body):null;calls.push({path,body,method:options.method});let value;
 if(path==='/git/ref/heads/main')value={object:{sha:head}};
 else if(path==='/contents/dist/memories.json')value={type:'file',encoding:'base64',sha:'3'.repeat(40),size:100,content:Buffer.from(JSON.stringify(data)).toString('base64')};
 else if(path.startsWith('/git/commits/')&&options.method==='GET')value={tree:{sha:tree}};
 else if(path==='/git/blobs')value={sha:'4'.repeat(40)};
 else if(path==='/git/trees'){assert.equal(body.base_tree,tree);pending=JSON.parse(body.tree.find(e=>e.path==='dist/memories.json').content);value={sha:'5'.repeat(40)};}
 else if(path==='/git/commits'){assert.deepEqual(body.parents,[head]);value={sha:'6'.repeat(40)};}
 else if(path==='/git/refs/heads/main'){assert.equal(body.force,false);if(conflict){conflict=false;data=change(data,quote({text:'From the other person'})).data;head='7'.repeat(40);tree='8'.repeat(40);return Response.json({},{status:422});}data=pending;head=body.sha;value={object:{sha:head}};}
 else throw Error(path);return Response.json(value);
}};}
test('atomic photo publication retains unrelated files and simultaneous additions and never force pushes',async()=>{
 const mock=mockGit(),store=new GitHubMemoriesStore({token:()=> 'test-token',fetcher:mock.fetcher});
 const input=quote({action:'addPhoto',caption:'Us',photo:'data:image/jpeg;base64,'+(await readFile(new URL('../dist/assets/cats-cuddle.jpg',import.meta.url))).toString('base64')});
 const saved=await store.change(input);assert.equal(saved.photos.length,1);assert.equal(saved.quotes[0].text,'From the other person');
 const trees=mock.calls.filter(c=>c.path==='/git/trees');assert.equal(trees.length,2);assert.deepEqual(trees[1].body.tree.map(e=>e.path),['dist/memories.json',`dist/${saved.photos[0].src}`]);
 assert.equal(mock.calls.filter(c=>c.path==='/git/blobs').length,1);assert.deepEqual(await store.change(input),saved);
});

const edit = (data, kind, index, extra={}) => {
 const item=editableMemories(data)[kind==='Quote'?'quotes':'photos'][index];
 return {action:`update${kind}`,operationId:randomUUID(),id:item.editKey,expectedVersion:item.editVersion,date:item.date||'2026-10-18',...(kind==='Quote'?{text:item.text,note:item.note||''}:{caption:item.caption||''}),...extra};
};

test('website edits preserve legacy entries and unknown fields, reject stale drafts, and safely retry',()=>{
 const base={version:1,quotes:['An old little word',{id:randomUUID(),text:'Us',note:'Before',extra:'Keep me'}],photos:[],other:'Keep this too'};
 const input=edit(base,'Quote',0,{text:'أحبك يا حبيبتي ♡',note:'For you'});
 const first=change(base,input);assert.equal(first.data.quotes[0].id,input.id);assert.equal(first.data.quotes[0].text,input.text);assert.equal(first.data.other,base.other);
 assert.deepEqual(first.data.quotes[1],base.quotes[1]);assert.equal(change(first.data,input).changed,false);
 assert.throws(()=>change(first.data,{...input,operationId:randomUUID(),text:'A stale draft'}),e=>e.status===409);
 assert.throws(()=>change(first.data,{...input,text:'Reuse another payload'}),e=>e.status===409);
 const second=change(first.data,edit(first.data,'Quote',1,{text:'Updated',note:''}));assert.equal(second.item.extra,'Keep me');assert.equal('note' in second.item,false);
 const decorated=editableMemories(second.data);assert.match(decorated.quotes[0].editVersion,/^[a-f0-9]{64}$/);assert.equal('editVersion' in second.data.quotes[0],false);
 assert.equal(base.quotes[0],'An old little word');
});

test('quote removal confirms a current version, preserves other entries, and is idempotent',()=>{
 const base=change(change(empty(),quote()).data,quote({text:'Keep this one'})).data;
 const input=edit(base,'Quote',0,{action:'removeQuote'});
 assert.throws(()=>change(base,{...input,expectedVersion:'0'.repeat(64)}),e=>e.status===409);
 const removed=change(base,input);assert.equal(removed.data.quotes.length,1);assert.equal(removed.data.quotes[0].text,'Keep this one');assert.equal(change(removed.data,input).changed,false);
 for(const invalid of [{id:'../anything'},{expectedVersion:'nope'},{action:'overwriteEverything'}])assert.throws(()=>checkedMemoryChange({...input,...invalid}),e=>e.status===400);
});

test('photo caption edits keep the original image; replacements and removals publish atomically',async()=>{
 const photo='data:image/jpeg;base64,'+(await readFile(new URL('../dist/assets/cats-cuddle.jpg',import.meta.url))).toString('base64');
 const base=change(empty(),quote({action:'addPhoto',photo,caption:'Before'})).data;
 const mock=mockGit(base,false),store=new GitHubMemoriesStore({token:()=> 'test-token',fetcher:mock.fetcher});
 let saved=await store.change(edit(base,'Photo',0,{caption:'Our day ♡'}));assert.equal(saved.photos[0].src,base.photos[0].src);
 assert.equal(mock.calls.filter(c=>c.path==='/git/blobs').length,0);
 const input=edit(saved,'Photo',0,{photo,caption:'A new picture'}),oldSrc=saved.photos[0].src;
 saved=await store.change(input);assert.equal(saved.photos[0].id,base.photos[0].id);assert.notEqual(saved.photos[0].src,oldSrc);
 let entries=mock.calls.filter(c=>c.path==='/git/trees').at(-1).body.tree;
 assert.equal(entries.find(e=>e.path===`dist/${oldSrc}`).sha,null);assert.ok(entries.find(e=>e.path===`dist/${saved.photos[0].src}`).sha);
 assert.deepEqual(await store.change(input),saved);
 const removal=edit(saved,'Photo',0,{action:'removePhoto'});await store.change(removal);
 entries=mock.calls.filter(c=>c.path==='/git/trees').at(-1).body.tree;assert.equal(entries.length,2);assert.equal(entries[1].sha,null);assert.equal(mock.data.photos.length,0);
 assert.equal(mock.calls.filter(c=>c.path==='/git/blobs').length,1);
});

test('removing a photo does not delete a file still used by another saved memory',async()=>{
 const photo='data:image/jpeg;base64,'+(await readFile(new URL('../dist/assets/cats-cuddle.jpg',import.meta.url))).toString('base64');
 const base=change(empty(),quote({action:'addPhoto',photo})).data;base.photos.push({...base.photos[0],id:randomUUID()});
 const removed=change(base,edit(base,'Photo',0,{action:'removePhoto'}));assert.equal(removed.removedPhoto,undefined);assert.equal(removed.data.photos.length,1);
});

test('photo delivery reads newly saved paths immediately, even when another server has old metadata cached',async()=>{
 const id=randomUUID(),firstPath=`assets/photos/2026/10/${randomUUID()}.jpg`,secondPath=`assets/photos/2026/10/${randomUUID()}.jpg`;
 let path=firstPath;const paths=[];
 const store=new GitHubMemoriesStore({token:()=> 'test-token',fetcher:async url=>{
  const pathname=new URL(url).pathname.split('/contents/')[1];paths.push(pathname);
  const content=pathname==='dist/memories.json'?JSON.stringify({version:1,quotes:[],photos:[{id,src:path}]}):pathname;
  return Response.json({type:'file',encoding:'base64',sha:'3'.repeat(40),size:content.length,content:Buffer.from(content).toString('base64')});
 }});
 await store.read();path=secondPath;
 assert.equal((await store.photo('memory',id)).bytes.toString(),`dist/${secondPath}`);
 assert.equal(paths.filter(p=>p==='dist/memories.json').length,2);
});
test('shared collection requires login and protected same-origin writes, bounds payloads, and hides credentials',async()=>{
 process.env.SITE_PASSWORD='test-only-code';process.env.SESSION_SECRET=randomBytes(48).toString('hex');const origin='https://asechka.example';let data=empty();
 const handler=createMemoriesAPI({collection:{writable:true,read:async()=>data,change:async input=>(data=change(data,input).data)}});
 assert.equal((await handler(new Request(origin+'/api/memories'))).status,401);
 const login=await authorize(new Request(origin+'/api/session',{method:'POST',headers:{origin,accept:'application/json'},body:new URLSearchParams({password:'test-only-code'})}));const cookie=login.headers.get('set-cookie').split(';')[0];
 const headers={cookie,origin,'content-type':'application/json','x-asechka-memories':'1'};
 for(const bad of [{...headers,origin:'https://evil.example'},{cookie,origin,'content-type':'application/json'}])assert.equal((await handler(new Request(origin+'/api/memories',{method:'POST',headers:bad,body:JSON.stringify(quote())}))).status,403);
 const result=await handler(new Request(origin+'/api/memories',{method:'POST',headers,body:JSON.stringify(quote())}));assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/no-store/);
 assert.equal((await (await handler(new Request(origin+'/api/memories',{headers:{cookie}}))).json()).quotes.length,1);
 assert.equal((await handler(new Request(origin+'/api/memories',{method:'POST',headers,body:'a'.repeat(440001)}))).status,413);
 const bad=new GitHubMemoriesStore({token:()=> 'private-token',fetcher:async()=>Response.json({error:'private-token'},{status:403})});await assert.rejects(bad.read(),e=>!e.message.includes('private-token'));
});
