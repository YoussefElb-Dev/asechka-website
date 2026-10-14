import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { MusicCatalog, MusicError, normalizeTrack } from '../server/music-catalog.js';
import { GitHubMusicStore, checkedMusic, checkedChange, changeMusic } from '../server/music-store.js';
import { createMusicAPI } from '../server/music-api.js';
import { authorize } from '../server/auth.js';

const raw = id => ({kind:'song',trackId:id,trackName:`Song ${id}`,artistName:'Artist',collectionName:'Album',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Music/x/100x100bb.jpg',trackViewUrl:`https://music.apple.com/us/album/song/123?i=${id}`,trackTimeMillis:180000});
const song = id => normalizeTrack(raw(id));
const uuid = '00000000-0000-4000-8000-000000000001';
const favorite = (id=1,rank=1) => ({...song(id),rank,note:'Our song',id:uuid});
const empty = () => ({version:1,tracks:[]});
const change = (rank=1,trackId=1,expectedId=null) => ({action:'save',rank,trackId,note:'Our song',expectedId});

test('catalog accepts songs and trusted artwork/listening URLs, strips unrelated metadata', () => {
  assert.match(song(1).artworkUrl,/600x600bb.jpg$/);
  assert.equal(normalizeTrack({...raw(1),kind:'music-video'}),null);
  assert.equal(normalizeTrack({...raw(1),trackViewUrl:'javascript:alert(1)'}),null);
  assert.equal(normalizeTrack({...raw(1),artworkUrl100:'https://mzstatic.com.evil.example/photo.jpg'}).artworkUrl,'');
  assert.equal(normalizeTrack({...raw(1),artworkUrl100:'https://user:secret@is1-ssl.mzstatic.com/x.jpg'}).artworkUrl,'');
  assert.equal('previewUrl' in normalizeTrack({...raw(1),previewUrl:'some audio'}),false);
});

test('search caches results and supplies verified metadata for save without another call', async () => {
  let calls=0;
  const catalog=new MusicCatalog({fetcher:async url=>{
    calls++; const parsed=new URL(url);
    assert.equal(parsed.hostname,'itunes.apple.com');
    assert.equal(parsed.searchParams.get('term'),'Artist & song');
    return Response.json({results:[raw(1),{...raw(2),kind:'music-video'}]});
  }});
  const [first,second]=await Promise.all([catalog.search('Artist & song'),catalog.search('Artist & song')]);
  assert.deepEqual(first,second); assert.equal(calls,1);
  assert.equal((await catalog.track(1)).trackId,1); assert.equal(calls,1);
  assert.throws(()=>catalog.search('x'),/between 2 and 120/);
  await assert.rejects(catalog.track('https://example.com'),/Choose a song/);
});

test('catalog timeouts fail clearly and repeated uncached requests respect provider limits', async () => {
  const broken=new MusicCatalog({fetcher:async()=>{throw new Error('offline');}});
  await assert.rejects(broken.search('Artist'),/saved songs are safe/);
  const busy=new MusicCatalog({fetcher:async()=>Response.json({results:[]})});
  for(let i=0;i<18;i++)await busy.search(`search ${i}`);
  await assert.rejects(busy.search('search 19'),error=>error.status===429);
});

test('top ten validates ranks, preserves unrelated spots and detects stale edits', () => {
  const base={version:1,tracks:[favorite()]};
  const next=changeMusic(base,change(2,2),song(2),'00000000-0000-4000-8000-000000000002').data;
  assert.deepEqual(next.tracks[0],base.tracks[0]); assert.equal(base.tracks.length,1);
  assert.equal(next.tracks[1].rank,2);
  assert.throws(()=>changeMusic(base,change(1,2),song(2)),error=>error.status===409);
  assert.throws(()=>changeMusic(base,change(2,1),song(1)),/already in our top 10/);
  assert.equal(changeMusic(base,change(1,1),song(1)).changed,false,'retrying a received save is harmless');
  assert.equal(changeMusic(base,{action:'remove',rank:1,expectedId:uuid},null).data.tracks.length,0);
  for(const rank of [0,11,1.5,'1'])assert.throws(()=>checkedChange(change(rank)),error=>error.status===400);
  assert.throws(()=>checkedMusic({version:1,tracks:[favorite(),favorite(2,1)]}),/saved music/);
  assert.throws(()=>checkedChange({...change(),note:'a'.repeat(501)}),error=>error.status===400);
});

test('GitHub storage retries conflicting writes and merges a different simultaneous spot', async () => {
  let remote=empty(), sha='a'.repeat(40), puts=0;
  const store=new GitHubMusicStore({token:()=> 'test-only-token',fetcher:async(url,options)=>{
    assert.match(url,/\/contents\/dist\/music.json/);
    assert.equal(options.headers.Authorization,'Bearer test-only-token');
    if(options.method==='GET')return Response.json({type:'file',encoding:'base64',size:100,sha,content:Buffer.from(JSON.stringify(remote)).toString('base64')});
    puts++; const body=JSON.parse(options.body);
    assert.equal(body.branch,'main');
    if(puts===1){remote={version:1,tracks:[favorite(2,2)]};sha='b'.repeat(40);return Response.json({}, {status:409});}
    assert.equal(body.sha,sha);remote=JSON.parse(Buffer.from(body.content,'base64'));sha='c'.repeat(40);
    return Response.json({content:{sha}});
  }});
  const saved=await store.change(change(),song(1));
  assert.equal(puts,2); assert.deepEqual(saved.tracks.map(x=>x.trackId),[1,2]);
  assert.equal((await store.change(change(),song(1))).tracks.length,2);assert.equal(puts,2);
});

test('a simultaneous edit of the same spot is not silently overwritten', async () => {
  let remote=empty(), puts=0;
  const store=new GitHubMusicStore({token:()=> 'test-only',fetcher:async(url,options)=>{
    if(options.method==='GET')return Response.json({type:'file',encoding:'base64',size:100,sha:'a'.repeat(40),content:Buffer.from(JSON.stringify(remote)).toString('base64')});
    puts++;remote={version:1,tracks:[favorite(2,1)]};return Response.json({}, {status:409});
  }});
  await assert.rejects(store.change(change(),song(1)),error=>error.status===409);
  assert.equal(puts,1);assert.equal(remote.tracks[0].trackId,2);
});

test('missing connection is read-only and upstream errors never expose tokens or erase data', async () => {
  const unconnected=new GitHubMusicStore({token:()=>'',fallback:async()=>JSON.stringify(empty())});
  assert.equal(unconnected.writable,false);assert.deepEqual((await unconnected.read()).data,empty());
  await assert.rejects(unconnected.change(change(),song(1)),/still being connected/);
  const broken=new GitHubMusicStore({token:()=> 'secret-test',fetcher:async()=>Response.json({message:'secret-test'}, {status:401})});
  await assert.rejects(broken.read(),error=>!error.message.includes('secret-test') && error.status===503);
});

test('music API requires signed login and same-origin protected writes; arbitrary metadata is ignored', async () => {
  process.env.SITE_PASSWORD='test-only-code';process.env.SESSION_SECRET=randomBytes(48).toString('hex');
  const origin='https://asechka.example';
  let saved=empty(),lookupCalls=0;
  const api=createMusicAPI({catalog:{search:async()=>[song(1)],track:async id=>{lookupCalls++;return song(id);}},store:{writable:true,read:async()=>({data:saved}),change:async(input,track)=>{saved=changeMusic(saved,input,track).data;return saved;}}});
  const anonymous=await api(new Request(origin+'/api/music'));
  assert.equal(anonymous.status,401);assert.match(anonymous.headers.get('cache-control'),/no-store/);
  const login=await authorize(new Request(origin+'/api/session',{method:'POST',headers:{origin,accept:'application/json','content-type':'application/x-www-form-urlencoded','x-real-ip':'music-test'},body:'password=test-only-code'}));
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const headers={cookie,origin,'content-type':'application/json','x-asechka-music':'1'};
  for(const unsafe of [{origin:'https://evil.example'},{'x-asechka-music':''},{origin:''},{'content-type':'text/plain'}]){
    assert.equal((await api(new Request(origin+'/api/music',{method:'POST',headers:{...headers,...unsafe},body:JSON.stringify(change())}))).status,403);
  }
  assert.equal(lookupCalls,0);
  const response=await api(new Request(origin+'/api/music',{method:'POST',headers,body:JSON.stringify({...change(),artworkUrl:'https://evil.example/',trackUrl:'javascript:alert(1)'})}));
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.tracks[0].trackUrl,song(1).trackUrl);assert.equal(lookupCalls,1);
  assert.equal((await api(new Request(origin+'/api/music',{method:'POST',headers,body:'['}))).status,400);
  assert.equal((await api(new Request(origin+'/api/music-search?q=Artist',{headers:{cookie}}))).status,200);
});
