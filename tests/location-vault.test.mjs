import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {EphemeralRedis} from './helpers/ephemeral-redis.mjs';
import {RedisLocationStore,validatePosition,LOCATION_TTL} from '../server/location-store.js';
import {VaultPresence,nearby} from '../server/vault-presence.js';
import {changeVault,vaultSummary,vaultKey,CHUNK_SIZE,GitHubVaultStore} from '../server/vault-store.js';
import {createVaultAPI} from '../server/vault-api.js';
import {createLocationAPI} from '../server/location-api.js';
import {openFilm} from '../server/camera-store.js';
import {sessionToken} from '../server/auth.js';
const secret='location-vault-tests-secret-1234567890';
const point=(now,extra={})=>({latitude:40.7128,longitude:-74.006,accuracy:12,capturedAt:now,...extra});
function fixture(){let clock=Date.now();const now=()=>clock,client=new EphemeralRedis(now),storage=new RedisLocationStore({client,secret:()=>secret,prefix:'test:location',now}),presence=new VaultPresence({storage,now});return {now,advance:ms=>clock+=ms,client,storage,presence};}
const identity=(actor)=>({actor,deviceId:actor+'-fixture-phone-1234567890'});
async function together(f,vaultId=randomUUID()){
  const host=identity('asnat'),guest=identity('youssef'),challenge=await f.presence.create({...host,vaultId,position:point(f.now())},'host-cookie');
  const joined=await f.presence.change({action:'join',...guest,...challenge,position:point(f.now())},'guest-cookie');return {host,guest,challenge,joined,vaultId};
}
test('location: indefinite consent, encrypted pins, freshness, expiry without history, and owner-only stop',async()=>{
  const f=fixture(),a=await f.storage.change({action:'start',actor:'asnat'},'host-cookie');assert.equal(a.endsAt,undefined);assert(a.token);
  await f.storage.change({action:'update',actor:'asnat',token:a.token,position:point(f.now())});let v=await f.storage.view();assert(v.people[0].live);
  const raw=await f.client.get('test:location:asnat:point');assert(!raw.includes('40.7128'));assert(!raw.includes('-74.006'));assert(!JSON.stringify(v).includes(a.token));
  await assert.rejects(()=>f.storage.change({action:'stop',actor:'asnat',token:'x'.repeat(43)}),e=>e.status===409);
  f.advance(61_000);v=await f.storage.view();assert(!v.people[0].live);assert(v.people[0].position);
  f.advance(LOCATION_TTL*1000);v=await f.storage.view();assert(v.people[0].sharing);assert(!v.people[0].position);
  f.advance(31*86400000);await f.storage.change({action:'update',actor:'asnat',token:a.token,position:point(f.now())});assert((await f.storage.view()).people[0].live);
  await f.storage.change({action:'stop',actor:'asnat',token:a.token});assert.equal((await f.storage.view()).people[0].sharing,false);
});
test('location: replacing a device revokes its previous token and rejects stale or impossible GPS',async()=>{
  const f=fixture(),old=await f.storage.change({action:'start',actor:'asnat'}),next=await f.storage.change({action:'start',actor:'asnat'});
  await assert.rejects(()=>f.storage.change({action:'update',actor:'asnat',token:old.token,position:point(f.now())}),e=>e.status===409);
  await f.storage.change({action:'update',actor:'asnat',token:next.token,position:point(f.now())});
  await assert.rejects(()=>f.storage.change({action:'update',actor:'asnat',token:next.token,position:point(f.now()-1000)}),e=>e.status===409);
  for(const extra of [{latitude:91},{longitude:Infinity},{accuracy:-1},{capturedAt:f.now()-91_000},{capturedAt:f.now()+11_000}])assert.throws(()=>validatePosition({position:point(f.now(),extra)},f.now()));
});
test('location: scoped background updates survive cookie expiry, starting/reading still needs sign-in',async()=>{
  process.env.SITE_PASSWORD='fixture-door';process.env.SESSION_SECRET=secret;
  const f=fixture(),api=createLocationAPI({store:f.storage}),start=await f.storage.change({action:'start',actor:'asnat'});
  const req=body=>new Request('https://asechka.test/api/location',{method:'POST',headers:{Origin:'https://asechka.test','Content-Type':'application/json','X-Asechka-Location':'1'},body:JSON.stringify(body)});
  assert.equal((await api(req({action:'start',actor:'asnat'}))).status,401);
  assert.equal((await api(new Request('https://asechka.test/api/location'))).status,401);
  assert.equal((await api(req({action:'update',actor:'asnat',token:start.token,position:point(f.now())}))).status,200);
  const cross=req({action:'stop',actor:'asnat',token:start.token});cross.headers.set('Origin','https://evil.test');assert.equal((await api(cross)).status,403);
  assert.equal((await api(req({action:'stop',actor:'asnat',token:start.token}))).status,200);
});
test('vault: future date is immutable, notes stay sealed in summaries, additions and retries are bounded',()=>{
  const now=Date.now(),id=randomUUID(),create={action:'create',actor:'asnat',operationId:id,title:'Our first winter',opensAt:new Date(now+120_000).toISOString(),note:'Our secret future note'};
  let d=changeVault({version:1,vaults:[]},create,now).data;assert(!JSON.stringify(vaultSummary(d,now)).includes('Our secret future note'));assert(!vaultSummary(d,now).vaults[0].ready);assert(vaultSummary(d,now+120_001).vaults[0].ready);
  assert.equal(changeVault(d,create,now).changed,false);const note={action:'note',actor:'youssef',vaultId:id,operationId:randomUUID(),note:'A second secret'};d=changeVault(d,note,now).data;assert.equal(changeVault(d,note,now).changed,false);
  assert.throws(()=>changeVault(d,{...note,operationId:randomUUID()},now+120_001),e=>e.status===409);assert.throws(()=>changeVault(d,{...note,action:'changeDate'},now));assert.throws(()=>changeVault({version:1,vaults:[]},{...create,operationId:randomUUID(),opensAt:new Date(now-100).toISOString()},now));
});
test('vault: two separate profiles, devices and signed-in sessions must scan a fresh QR and be nearby',async()=>{
  const f=fixture(),host=identity('asnat'),guest=identity('youssef'),vaultId=randomUUID(),code=await f.presence.create({...host,vaultId,position:point(f.now())},'host-cookie');
  const join={action:'join',...guest,...code,position:point(f.now())};
  for(const bad of [{actor:'asnat'},{deviceId:host.deviceId},{secret:'x'.repeat(43)},{position:point(f.now(),{latitude:41})},{position:point(f.now(),{accuracy:51})}])await assert.rejects(()=>f.presence.change({...join,...bad},'guest-cookie'));
  await assert.rejects(()=>f.presence.change(join,'host-cookie'),e=>e.status===403);
  const result=await f.presence.change(join,'guest-cookie');assert(result.open);await f.presence.authorize(code.challenge,'host-cookie',vaultId);await f.presence.authorize(code.challenge,'guest-cookie',vaultId);
  await assert.rejects(()=>f.presence.authorize(code.challenge,'third-cookie',vaultId));await assert.rejects(()=>f.presence.authorize(code.challenge,'host-cookie',randomUUID()));await assert.rejects(()=>f.presence.change({...join,deviceId:'third-phone-fixture-123456'},'third-cookie'));
});
test('vault: stale GPS, either phone leaving and expired QR codes all relock access',async()=>{
  const f=fixture(),t=await together(f);f.advance(46_000);await assert.rejects(()=>f.presence.authorize(t.challenge.challenge,'host-cookie',t.vaultId));
  const g=fixture(),u=await together(g);await g.presence.change({action:'leave',...u.guest,challenge:u.challenge.challenge,position:point(g.now())},'guest-cookie');await assert.rejects(()=>g.presence.authorize(u.challenge.challenge,'host-cookie',u.vaultId));
  const h=fixture(),code=await h.presence.create({...identity('asnat'),vaultId:randomUUID(),position:point(h.now())},'host-cookie');h.advance(121_000);await assert.rejects(()=>h.presence.change({action:'join',...identity('youssef'),...code,position:point(h.now())},'guest-cookie'));
  assert(!nearby(point(h.now()-46_000),point(h.now()),h.now()));assert(!nearby(point(h.now()),point(h.now(),{accuracy:60}),h.now()));
});
test('vault: both fresh heartbeats keep a together session open past the initial QR lifetime',async()=>{
  const f=fixture(),t=await together(f);for(let i=0;i<20;i++){f.advance(10_000);for(const [who,cookie] of [[t.host,'host-cookie'],[t.guest,'guest-cookie']]){const result=await f.presence.change({action:'pulse',...who,challenge:t.challenge.challenge,position:point(f.now())},cookie);assert(result.open);}await f.presence.authorize(t.challenge.challenge,'host-cookie',t.vaultId);}
});
test('vault: media is authenticated ciphertext in Git blobs and metadata is sealed in a single non-force commit',async()=>{
  const data={version:1,vaults:[]},secretValue=secret;let treeEntries,blob;
  const store=new GitHubVaultStore({secret:()=>secretValue,token:()=> 'fixture-only',fetcher:async(url,options)=>{const path=new URL(url).pathname.split('/asechka-website')[1],body=options.body&&JSON.parse(options.body);let value;
    if(path==='/git/ref/heads/main')value={object:{sha:'1'.repeat(40)}};else if(path==='/contents/private/vault.json')value={type:'file',sha:'9'.repeat(40),size:50,encoding:'base64',content:Buffer.from(JSON.stringify({version:1,sealed:null})).toString('base64')};else if(path==='/git/commits/'+'1'.repeat(40))value={tree:{sha:'2'.repeat(40)}};else if(path==='/git/trees'){treeEntries=body.tree;value={sha:'3'.repeat(40)};}else if(path==='/git/commits')value={sha:'4'.repeat(40)};else if(path==='/git/refs/heads/main'){assert.equal(body.force,false);value={};}else if(path==='/git/blobs'){blob=Buffer.from(body.content,'base64');value={sha:'5'.repeat(40)};}else throw Error(path);return Response.json(value);}});
  const bytes=Buffer.from('private-video-or-photo-fixture');await store.blob(bytes);assert(!blob.includes(bytes));assert.deepEqual(openFilm(blob,vaultKey(secretValue)),bytes);
  await store.change({action:'create',actor:'asnat',operationId:randomUUID(),title:'A secret title',note:'Even the notes are encrypted',opensAt:new Date(Date.now()+120_000).toISOString()});assert.equal(treeEntries[0].path,'private/vault.json');assert(!treeEntries[0].content.includes('A secret title'));const saved=JSON.parse(treeEntries[0].content);assert.equal(JSON.parse(openFilm(Buffer.from(saved.sealed,'base64'),vaultKey(secretValue))).vaults[0].notes[0].text,'Even the notes are encrypted');
});
test('vault API: date and both phones are enforced again for note and video downloads; uploads are chunked',async()=>{
  process.env.SITE_PASSWORD='fixture-door';process.env.SESSION_SECRET=secret;const f=fixture(),key=createHash('sha256').update(secret+'\0fixture-door').digest(),cookie='asechka_session='+sessionToken(key),otherCookie='asechka_session='+sessionToken(key),session=createHash('sha256').update(cookie).digest('hex');
  let data={version:1,vaults:[]};const blobs=new Map(),collection={writable:true,read:async()=>data,change:async input=>{data=changeVault(data,input,f.now()).data;return data;},blob:async bytes=>{const sha=createHash('sha1').update(bytes).digest('hex');blobs.set(sha,bytes);return {sha,size:bytes.length};},chunk:async(file,i)=>blobs.get(file.chunks[i].sha)};
  const api=createVaultAPI({collection,storage:f.storage,presence:f.presence,now:f.now});const req=(body,query='',token,c=cookie)=>new Request('https://asechka.test/api/vault'+query,{method:body?'POST':'GET',headers:{cookie:c,Origin:'https://asechka.test',Accept:'application/json',...(token?{'X-Asechka-Vault-Grant':token}:{}),...(body?{'Content-Type':'application/json','X-Asechka-Vault':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const id=randomUUID();assert.equal((await api(req({action:'create',actor:'asnat',operationId:id,title:'Our vault',note:'Never in the sealed response',opensAt:new Date(f.now()+120_000).toISOString()}))).status,200);
  let summary=await(await api(req())).json();assert(!JSON.stringify(summary).includes('Never in the sealed response'));
  assert.equal((await api(req({action:'challenge',...identity('asnat'),vaultId:id,position:point(f.now())}))).status,403);
  const fileId=randomUUID(),file={name:'little-video.mp4',type:'video/mp4',size:CHUNK_SIZE+2};for(let i=0;i<2;i++)assert.equal((await api(req({action:'upload',actor:'asnat',vaultId:id,fileId,file,index:i,bytes:Buffer.alloc(i?2:CHUNK_SIZE,42).toString('base64')}))).status,200);
  assert.equal((await api(req({action:'finishUpload',actor:'asnat',vaultId:id,fileId,file}))).status,200);assert.equal(data.vaults[0].files[0].chunks.length,2);
  assert.equal((await api(req(null,'?open='+id))).status,403);assert.equal((await api(req(null,'?vault='+id+'&file='+fileId+'&chunk=0'))).status,403);
  f.advance(120_001);const code=await(await api(req({action:'challenge',...identity('asnat'),vaultId:id,position:point(f.now())}))).json();
  const joined=await api(req({action:'join',...identity('youssef'),...code,position:point(f.now())},'',null,otherCookie));assert.equal(joined.status,200);
  const open=await api(req(null,'?open='+id,code.challenge));assert.equal(open.status,200);assert((await open.json()).vault.notes[0].text.includes('Never in the sealed response'));
  assert.equal((await api(req(null,'?vault='+id+'&file='+fileId+'&chunk=0',code.challenge))).status,200);
  f.advance(46_000);assert.equal((await api(req(null,'?open='+id,code.challenge))).status,403);assert.equal((await api(req(null,'?vault='+id+'&file='+fileId+'&chunk=0',code.challenge))).status,403);
  const unsafe=req({action:'note',actor:'asnat',vaultId:id,operationId:randomUUID(),note:'cross-site'});unsafe.headers.set('Origin','https://evil.test');assert.equal((await api(unsafe)).status,403);
});
test('Redis: real Lua ownership, persistent consent, expiring encrypted pin, and vault handshake',{skip:!process.env.GAMES_TEST_REDIS_URL},async t=>{
  const storage=new RedisLocationStore({url:process.env.GAMES_TEST_REDIS_URL,prefix:'asechka:feature-test:'+randomUUID(),secret:()=>secret});const c=await storage.connect();t.after(async()=>{const keys=await c.keys(storage.prefix+':*');if(keys.length)await c.del(keys);await c.close();});
  const start=await storage.change({action:'start',actor:'asnat'},'real-host');await storage.change({action:'update',actor:'asnat',token:start.token,position:point(Date.now())});assert.equal(await c.ttl(storage.prefix+':asnat'),-1);assert((await c.ttl(storage.prefix+':asnat:point'))>0);assert((await storage.view()).people[0].live);
  const presence=new VaultPresence({storage}),vaultId=randomUUID(),code=await presence.create({...identity('asnat'),vaultId,position:point(Date.now())},'real-host');await presence.change({action:'join',...identity('youssef'),...code,position:point(Date.now())},'real-guest');await presence.authorize(code.challenge,'real-guest',vaultId);await storage.change({action:'stop',actor:'asnat',token:start.token});assert(!(await storage.view()).people[0].sharing);
});
