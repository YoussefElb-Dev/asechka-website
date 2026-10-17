import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { checkedMemoryChange, appendMemory, GitHubMemoriesStore } from '../server/memories-store.js';
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
function mockGit(){let data=empty(),head='1'.repeat(40),tree='2'.repeat(40),pending,conflict=true;const calls=[];return{calls,get data(){return data;},fetcher:async(url,options)=>{
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
