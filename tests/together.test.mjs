import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {checkedTogetherChange,checkedPhoto,changeTogether,GitHubTogetherStore} from '../server/together-store.js';
import {dailyMemory} from '../server/daily-memory.js';
import {createTogetherAPI} from '../server/together-api.js';
import {authorize} from '../server/auth.js';
const empty=()=>({version:1,bucketList:[],hearts:{me:null,asechka:null}});
const draft=(extra={})=>({action:'saveItem',id:randomUUID(),expectedRevision:null,operationId:randomUUID(),title:'Watch the stars',place:'Somewhere quiet',note:'Bring a blanket ♡',completed:false,...extra});
const change=(data,input)=>changeTogether(data,checkedTogetherChange(input),new Date('2026-10-14T16:00:00Z')).data;
test('shared plans preserve notes and photos through completion, reopening, and stale conflicts',()=>{
  const input=draft(),saved=change(empty(),input),item=saved.bucketList[0];
  assert.equal(item.title,input.title);assert.equal(item.note,input.note);assert.equal(item.completedAt,null);
  const completed=change(saved,{action:'toggleItem',id:item.id,expectedRevision:item.revision,operationId:randomUUID(),completed:true});
  assert.equal(completed.bucketList[0].completedAt,'2026-10-14T16:00:00.000Z');
  assert.throws(()=>change(completed,{...input,title:'A stale edit',expectedRevision:item.revision,operationId:randomUUID()}),error=>error.status===409);
  const withPhoto=structuredClone(completed);withPhoto.bucketList[0].photoId=randomUUID();
  const reopened=change(withPhoto,{action:'toggleItem',id:item.id,expectedRevision:withPhoto.bucketList[0].revision,operationId:randomUUID(),completed:false});
  assert.equal(reopened.bucketList[0].photoId,withPhoto.bucketList[0].photoId);assert.equal(reopened.bucketList[0].completedAt,null);
  const removed=change(reopened,{action:'removeItem',id:item.id,expectedRevision:reopened.bucketList[0].revision,operationId:randomUUID()});assert.equal(removed.bucketList.length,0);
});
test('hearts retain separate sender timestamps, throttle rapid taps, and tolerate repeat requests',()=>{
  const input={action:'sendHeart',from:'me',operationId:randomUUID()};
  const saved=change(empty(),input);assert.equal(saved.hearts.asechka,null);assert.equal(saved.hearts.me.id,input.operationId);
  assert.deepEqual(change(saved,input),saved);
  assert.throws(()=>change(saved,{...input,operationId:randomUUID()}),error=>error.status===429);
  const reply=change(saved,{action:'sendHeart',from:'asechka',operationId:randomUUID()});assert.equal(reply.hearts.me.id,input.operationId);assert.ok(reply.hearts.asechka.sentAt);
});
test('photos accept bounded real JPEGs and reject HTML, remote URLs, oversized and malformed uploads',async()=>{
  const bytes=await readFile(new URL('../dist/assets/cats-cuddle.jpg',import.meta.url));const jpeg='data:image/jpeg;base64,'+bytes.toString('base64');
  assert.deepEqual(checkedPhoto(jpeg),bytes);
  for(const bad of ['https://example.com/cat.jpg','data:image/svg+xml;base64,PHN2Zz4=','data:image/jpeg;base64,PGh0bWw+','data:image/jpeg;base64,'+'A'.repeat(430000)])assert.throws(()=>checkedPhoto(bad),error=>error.status===400);
  assert.throws(()=>checkedTogetherChange(draft({photo:jpeg})),error=>error.status===400);
  assert.ok(checkedTogetherChange(draft({completed:true,photo:jpeg})).photo);
});
test('daily memories use a shared Eastern day, ignore unsafe media, and are stable under reordered sources',()=>{
  const quotes=[{id:randomUUID(),text:'My favorite little universe.'},{id:randomUUID(),text:'More days with you.'}];
  const photos=[{id:randomUUID(),src:'https://evil.example/photo.jpg'},{id:randomUUID(),src:`assets/photos/2026/10/${randomUUID()}.jpg`,caption:'Us'}];
  const first=dailyMemory({quotes,photos},{tracks:[]},new Date('2026-10-15T03:59:59Z'));
  assert.equal(first.day,'2026-10-14');assert.ok(first.memory);assert.notEqual(first.memory.id,photos[0].id);
  assert.deepEqual(first,dailyMemory({quotes:[...quotes].reverse(),photos:[...photos].reverse()},{tracks:[]},new Date('2026-10-14T10:00:00Z')));
  assert.equal(dailyMemory({quotes,photos},{tracks:[]},new Date('2026-10-15T04:00:00Z')).day,'2026-10-15');
  assert.equal(dailyMemory({},{}).memory,null);
});
test('a daily song retains its real album artwork, listening link, and personal note',async()=>{
  const saved={trackId:123456,title:'Our song',artist:'Our artist',album:'Our album',artworkUrl:'https://is1-ssl.mzstatic.com/image/thumb/Music/test/600x600bb.jpg',trackUrl:'https://music.apple.com/us/album/test/123?i=123456',durationMs:180000};
  const song={...saved,id:randomUUID(),note:'This one feels like us.'};
  const {memory}=dailyMemory({quotes:[],photos:[]},{tracks:[song]});
  assert.equal(memory.kind,'song');assert.equal(memory.artwork,song.artworkUrl);assert.equal(memory.url,song.trackUrl);assert.equal(memory.note,song.note);
});
function gitMock({conflict=false}={}){
  let data=empty(),head='1'.repeat(40),tree='2'.repeat(40),pending,conflicted=false;const calls=[];
  return {calls,get data(){return data;},fetcher:async(url,options)=>{
    const path=new URL(url).pathname.split('/asechka-website')[1];const body=options.body?JSON.parse(options.body):null;calls.push({path,method:options.method,body});let value;
    if(path==='/git/ref/heads/main')value={object:{sha:head}};
    else if(path==='/contents/dist/together.json')value={type:'file',encoding:'base64',size:100,sha:'3'.repeat(40),content:Buffer.from(JSON.stringify(data)).toString('base64')};
    else if(path.startsWith('/git/commits/') && options.method==='GET')value={tree:{sha:tree}};
    else if(path==='/git/blobs')value={sha:'4'.repeat(40)};
    else if(path==='/git/trees'){assert.equal(body.base_tree,tree);pending=JSON.parse(body.tree.find(entry=>entry.path==='dist/together.json').content);value={sha:'5'.repeat(40)};}
    else if(path==='/git/commits'){assert.deepEqual(body.parents,[head]);value={sha:'6'.repeat(40)};}
    else if(path==='/git/refs/heads/main'){
      assert.equal(body.force,false);
      if(conflict && !conflicted){conflicted=true;data=change(data,draft({title:'A wish from the other screen'}));head='7'.repeat(40);tree='8'.repeat(40);return Response.json({}, {status:422});}
      data=pending;head=body.sha;value={object:{sha:head}};
    }else throw new Error(`Unexpected request ${path}`);
    return Response.json(value);
  }};
}
test('an atomic photo save commits only shared data and its JPEG, retaining the complete repository tree',async()=>{
  const mock=gitMock(),store=new GitHubTogetherStore({token:()=> 'test-token',fetcher:mock.fetcher});
  const bytes=await readFile(new URL('../dist/assets/cats-cuddle.jpg',import.meta.url));const input=draft({completed:true,photo:'data:image/jpeg;base64,'+bytes.toString('base64')});
  const saved=await store.change(input);assert.equal(saved.bucketList[0].photoId,input.operationId);
  const entries=mock.calls.find(call=>call.path==='/git/trees').body.tree;
  assert.deepEqual(entries.map(entry=>entry.path),['dist/together.json',`dist/assets/bucket/${input.operationId}.jpg`]);
  assert.equal(mock.calls.filter(call=>call.method==='PATCH').length,1);assert.deepEqual(mock.data,saved);
});
test('concurrent GitHub writes retry with the new tree and preserve the other visitor’s wish',async()=>{
  const mock=gitMock({conflict:true}),store=new GitHubTogetherStore({token:()=> 'test-token',fetcher:mock.fetcher});
  const data=await store.change(draft());assert.equal(data.bucketList.length,2);assert.ok(data.bucketList.some(item=>item.title==='A wish from the other screen'));
  assert.equal(mock.calls.filter(call=>call.method==='PATCH').length,2);
});
test('protected shared APIs reject unauthenticated and cross-site writes; safe responses never expose credentials',async()=>{
  process.env.SITE_PASSWORD='test-only-code';process.env.SESSION_SECRET=randomBytes(48).toString('hex');const origin='https://asechka.example';
  const mock=gitMock(),store=new GitHubTogetherStore({token:()=> 'keep-this-private',fetcher:mock.fetcher}),handler=createTogetherAPI({favorites:store});
  for(const path of ['/api/together','/api/daily-memory','/api/together-photo?kind=bucket&id='+randomUUID()])assert.equal((await handler(new Request(origin+path))).status,401);
  const login=await authorize(new Request(origin+'/api/session',{method:'POST',headers:{origin,accept:'application/json'},body:new URLSearchParams({password:'test-only-code'})}));const cookie=login.headers.get('set-cookie').split(';')[0];
  const body=JSON.stringify(draft());
  for(const headers of [{cookie,origin:'https://evil.example','content-type':'application/json','x-asechka-together':'1'},{cookie,origin,'content-type':'application/json'}])assert.equal((await handler(new Request(origin+'/api/together',{method:'POST',headers,body}))).status,403);
  const result=await handler(new Request(origin+'/api/together',{method:'POST',headers:{cookie,origin,'content-type':'application/json','x-asechka-together':'1'},body}));assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/no-store/);assert.ok(!(await result.text()).includes('keep-this-private'));
  const bad=new GitHubTogetherStore({token:()=> 'keep-this-private',fetcher:async()=>Response.json({error:'keep-this-private'},{status:403})});await assert.rejects(bad.read(),error=>!error.message.includes('keep-this-private'));
});
