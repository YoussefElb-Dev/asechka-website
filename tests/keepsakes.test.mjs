import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {sinceUs,anniversaryAt,localDateTime,fromLocalDateTime} from '../dist/keepsake-time.js';
import {checkedKeepsakes,checkedKeepsakeChange,changeKeepsakes,GitHubKeepsakesStore} from '../server/keepsakes-store.js';
import {createKeepsakesAPI} from '../server/keepsakes-api.js';
import {authorize} from '../server/auth.js';
const seed=JSON.parse(await readFile(new URL('../dist/keepsakes.json',import.meta.url),'utf8'));
const draft=(extra={})=>({action:'saveThing',id:randomUUID(),operationId:randomUUID(),expectedRevision:null,text:'How you believe in me.',...extra});
const apply=(data,input)=>changeKeepsakes(data,checkedKeepsakeChange(input),new Date('2026-10-20T21:00:00Z'));

test('the actual beginning and 18 personal details remain intact, with an expanded editable letter collection',()=>{
  assert.deepEqual(checkedKeepsakes(seed),seed);
  assert.equal(seed.since.startedAt,'2026-10-16T15:41:00-04:00');
  assert.equal(seed.things.length,18);assert.ok(seed.letters.length>=12);
  assert.equal(seed.things.at(-1).text,'How you believe in me in all cases and circumstances.');
  assert.ok(seed.things.some(item=>item.text.includes('lil off')));
});
test('elapsed time starts at the supplied minute, never goes negative, and celebrates a week',()=>{
  assert.deepEqual(sinceUs(seed.since,Date.parse(seed.since.startedAt)).elapsed,{days:0,hours:0,minutes:0,seconds:0});
  assert.deepEqual(sinceUs(seed.since,Date.parse('2026-10-20T19:41:05Z')).elapsed,{days:4,hours:0,minutes:0,seconds:5});
  assert.match(sinceUs(seed.since,Date.parse('2026-10-23T19:41:00Z')).message,/One whole week/);
  assert.equal(sinceUs(seed.since,Date.parse('2026-10-15T19:41:00Z')).elapsed.days,0);
});
test('the first conversation date is independently editable and survives older clients',()=>{
  assert.equal(seed.since.startedTalkingAt,'2026-09-27');
  const input={action:'saveSince',id:seed.since.id,expectedRevision:seed.since.revision,operationId:randomUUID(),startedAt:seed.since.startedAt,monthlyMessage:'',yearlyMessage:'',startedTalkingAt:'2026-09-28'};
  const saved=apply(seed,input).data;assert.equal(saved.since.startedTalkingAt,'2026-09-28');assert.equal(saved.since.startedAt,new Date(seed.since.startedAt).toISOString());assert.equal(apply(saved,input).changed,false);
  const legacy={...input,operationId:randomUUID(),expectedRevision:saved.since.revision};delete legacy.startedTalkingAt;
  assert.equal(apply(saved,legacy).data.since.startedTalkingAt,'2026-09-28');
  assert.equal(apply(seed,{...input,startedTalkingAt:null}).data.since.startedTalkingAt,null);
  assert.throws(()=>checkedKeepsakeChange({...input,startedTalkingAt:'2026-02-30'}),error=>error.status===400);
});
test('anniversaries keep 3:41 Eastern across DST, roll over precisely, and use custom messages',()=>{
  assert.equal(new Date(anniversaryAt(seed.since.startedAt,1)).toISOString(),'2026-11-16T20:41:00.000Z');
  assert.equal(new Date(anniversaryAt(seed.since.startedAt,12)).toISOString(),'2027-10-16T19:41:00.000Z');
  const before=sinceUs(seed.since,Date.parse('2026-11-16T20:40:59Z'));
  assert.equal(before.months,0);assert.equal(before.monthly.seconds,1);assert.doesNotMatch(before.message,/whole month/);
  const at=sinceUs({...seed.since,monthlyMessage:'One month, my love.'},Date.parse('2026-11-16T20:41:00Z'));
  assert.equal(at.months,1);assert.equal(at.message,'One month, my love.');
  assert.equal(new Date(at.nextMonth).toISOString(),'2026-12-16T20:41:00.000Z');
  const yearly=sinceUs({...seed.since,yearlyMessage:'Our first year ♡'},Date.parse('2027-10-16T19:41:00Z'));
  assert.equal(yearly.years,1);assert.equal(yearly.message,'Our first year ♡');
  assert.equal(new Date(yearly.nextYear).toISOString(),'2028-10-16T19:41:00.000Z');
});
test('month-end and leap dates clamp without shifting later anniversaries; local editing rejects the DST gap',()=>{
  assert.equal(localDateTime(new Date(anniversaryAt('2026-01-31T15:41:00-05:00',1)).toISOString()),'2026-02-28T15:41');
  assert.equal(localDateTime(new Date(anniversaryAt('2026-01-31T15:41:00-05:00',2)).toISOString()),'2026-03-31T15:41');
  assert.equal(localDateTime(new Date(anniversaryAt('2024-02-29T15:41:00-05:00',12)).toISOString()),'2025-02-28T15:41');
  assert.equal(fromLocalDateTime('2026-11-16T15:41'),'2026-11-16T20:41:00.000Z');
  assert.equal(localDateTime(seed.since.startedAt),'2026-10-16T15:41');
  assert.throws(()=>fromLocalDateTime('2027-03-14T02:30'),/does not exist/);
});
test('add/edit/remove retains other content, preserves unknown fields, and retries exactly once',()=>{
  const base={...structuredClone(seed),futureSetting:'keep me'},input=draft({text:'  My own words.\nA second line.  '});
  const first=apply(base,input);assert.equal(first.changed,true);assert.equal(base.things.length,18);
  assert.equal(first.data.things.at(-1).text,'My own words.\nA second line.');assert.equal(first.data.futureSetting,'keep me');
  assert.deepEqual(first.data.letters,base.letters);assert.deepEqual(first.data.since,base.since);
  assert.equal(apply(first.data,input).changed,false);
  assert.throws(()=>apply(first.data,{...input,text:'Reused key, different words'}),error=>error.status===409);
  const current=first.data.things.at(-1),update=draft({id:current.id,expectedRevision:current.revision,text:'An edited detail.'});
  const edited=apply(first.data,update).data;assert.equal(edited.things.at(-1).text,update.text);
  assert.throws(()=>apply(edited,{...update,operationId:randomUUID()}),error=>error.status===409);
  const remove={action:'removeThing',id:current.id,expectedRevision:edited.things.at(-1).revision,operationId:randomUUID()};
  const removed=apply(edited,remove);assert.equal(removed.data.things.length,18);assert.equal(apply(removed.data,remove).changed,false);
});
test('letters and the beginning can be edited independently, with conflicts and stable retries',()=>{
  const input=draft({action:'saveLetter',id:seed.letters[0].id,expectedRevision:seed.letters[0].revision,title:'your own title',text:'Your own letter.'});
  const edited=apply(seed,input).data;assert.equal(edited.letters[0].title,input.title);assert.deepEqual(edited.things,seed.things);
  const since={action:'saveSince',id:seed.since.id,expectedRevision:seed.since.revision,operationId:randomUUID(),startedAt:'2026-10-16T15:41:00-04:00',monthlyMessage:'Us, every month.',yearlyMessage:'Us, every year.'};
  const saved=apply(edited,since).data;assert.equal(saved.since.monthlyMessage,since.monthlyMessage);assert.deepEqual(saved.letters,edited.letters);
  assert.equal(apply(saved,since).changed,false);
  assert.throws(()=>apply(saved,{...since,operationId:randomUUID()}),error=>error.status===409);
  assert.throws(()=>apply(seed,draft({id:seed.since.id})),error=>error.status===400);
});
test('malformed, empty, oversized, duplicate and unsafe changes are rejected without changing the source',()=>{
  for(const input of [draft({text:''}),draft({text:'a'.repeat(2001)}),draft({action:'saveLetter',title:'x'.repeat(161)}),draft({id:'../secrets'}),draft({expectedRevision:undefined}),draft({action:'anything'})])assert.throws(()=>checkedKeepsakeChange(input),error=>error.status===400);
  const duplicate=structuredClone(seed);duplicate.things[1].id=duplicate.things[0].id;assert.throws(()=>checkedKeepsakes(duplicate));
  const original=structuredClone(seed);assert.throws(()=>apply(seed,draft({id:seed.letters[0].id})));assert.deepEqual(seed,original);
});
function mockGit({conflict=false}={}){
  let data=structuredClone(seed),head='1'.repeat(40),tree='2'.repeat(40),pending,conflicted=false;
  const calls=[];
  return {calls,get data(){return data;},fetcher:async(url,options)=>{
    const parsed=new URL(url),path=parsed.pathname.replace('/repos/YoussefElb-Dev/asechka-website',''),body=options.body&&JSON.parse(options.body);calls.push({path,method:options.method,body});let value;
    if(path==='/git/ref/heads/main')value={object:{sha:head}};
    else if(path==='/contents/dist/keepsakes.json'){assert.ok([head,'main'].includes(parsed.searchParams.get('ref')));value={type:'file',encoding:'base64',size:100,sha:'3'.repeat(40),content:Buffer.from(JSON.stringify(data)).toString('base64')};}
    else if(path.startsWith('/git/commits/')&&options.method==='GET')value={tree:{sha:tree}};
    else if(path==='/git/trees'){
      assert.equal(body.base_tree,tree);assert.deepEqual(body.tree.map(entry=>entry.path),['dist/keepsakes.json']);
      pending=JSON.parse(body.tree[0].content);value={sha:'5'.repeat(40)};
    }else if(path==='/git/commits'){assert.deepEqual(body.parents,[head]);value={sha:'6'.repeat(40)};}
    else if(path==='/git/refs/heads/main'){
      assert.equal(body.force,false);
      if(conflict&&!conflicted){conflicted=true;data=apply(data,draft({text:'A detail from the other screen.'})).data;head='7'.repeat(40);tree='8'.repeat(40);return Response.json({}, {status:422});}
      data=pending;head=body.sha;value={object:{sha:head}};
    }else throw new Error(`Unexpected ${path}`);
    return Response.json(value);
  }};
}
test('GitHub saves atomically touch only keepsakes, preserve other repo files, and merge concurrent additions',async()=>{
  const mock=mockGit({conflict:true}),store=new GitHubKeepsakesStore({token:()=> 'private-test-token',fetcher:mock.fetcher});
  const input=draft();const saved=await store.change(input);assert.equal(saved.things.length,20);assert.equal(mock.calls.filter(call=>call.method==='PATCH').length,2);
  assert.deepEqual(saved.letters,seed.letters);assert.deepEqual(saved.since,seed.since);assert.deepEqual(mock.data,saved);
  const calls=mock.calls.length;await store.change(input);assert.equal(mock.calls.length,calls+2);
});
test('API requires login and protected same-origin writes, enforces body size and keeps upstream secrets private',async()=>{
  process.env.SITE_PASSWORD='test-only-code';process.env.SESSION_SECRET=randomBytes(48).toString('hex');const origin='https://asechka.example';
  const mock=mockGit(),store=new GitHubKeepsakesStore({token:()=> 'private-test-token',fetcher:mock.fetcher}),handler=createKeepsakesAPI({collection:store});
  assert.equal((await handler(new Request(origin+'/api/keepsakes'))).status,401);
  const login=await authorize(new Request(origin+'/api/session',{method:'POST',headers:{origin,accept:'application/json'},body:new URLSearchParams({password:'test-only-code'})}));const cookie=login.headers.get('set-cookie').split(';')[0];
  const headers={cookie,origin,'content-type':'application/json','x-asechka-keepsakes':'1'},body=JSON.stringify(draft());
  for(const changed of [{origin:'https://other.example'},{origin:''},{'x-asechka-keepsakes':''},{'sec-fetch-site':'cross-site'}])assert.equal((await handler(new Request(origin+'/api/keepsakes',{method:'POST',headers:{...headers,...changed},body}))).status,403);
  const get=await handler(new Request(origin+'/api/keepsakes',{headers:{cookie}}));assert.equal((await get.json()).writable,true);assert.match(get.headers.get('cache-control'),/no-store/);
  for(const bad of ['{broken',JSON.stringify({})])assert.equal((await handler(new Request(origin+'/api/keepsakes',{method:'POST',headers,body:bad}))).status,400);
  assert.equal((await handler(new Request(origin+'/api/keepsakes',{method:'POST',headers,body:'غ'.repeat(35001)}))).status,413);
  const saved=await handler(new Request(origin+'/api/keepsakes',{method:'POST',headers,body}));assert.equal(saved.status,200);assert.ok(!(await saved.text()).includes('private-test-token'));
  const failed=createKeepsakesAPI({collection:{read:async()=>{throw new Error('private-test-token');}}});
  const error=await failed(new Request(origin+'/api/keepsakes',{headers:{cookie}}));assert.equal(error.status,503);assert.ok(!(await error.text()).includes('private-test-token'));
  const readOnly=createKeepsakesAPI({collection:new GitHubKeepsakesStore({token:()=>null})});
  const fallback=await readOnly(new Request(origin+'/api/keepsakes',{headers:{cookie}}));assert.equal((await fallback.json()).writable,false);
});
