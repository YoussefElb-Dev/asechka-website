import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RedisGamesService } from '../server/games/redis-service.mjs';
const url=process.env.GAMES_TEST_REDIS_URL;
const enabled=!!url;
if(enabled)assert.ok(['127.0.0.1','localhost','redis'].includes(new URL(url).hostname),'Redis tests must use an isolated local/CI database.');
const cmd=(type,fields={})=>({type,id:randomUUID(),...fields});
async function fixture(t){const prefix='asechka:test:'+randomUUID(),a=await new RedisGamesService({url,prefix}).init(),b=await new RedisGamesService({url,prefix}).init();t.after(async()=>{const keys=await a.redis.keys(prefix+':*');if(keys.length)await a.redis.del(keys);await a.close();await b.close();});return{a,b,prefix};}
async function room(a,b,game='tictactoe'){
  const created=await a.command('asnat',cmd('create',{game}));await a.load();let room=a.data.rooms.find(r=>r.id===created.room);await b.command('youssef',cmd('join',{code:room.code}));await a.command('asnat',cmd('ready',{room:room.id,ready:true}));await b.command('youssef',cmd('ready',{room:room.id,ready:true}));await a.command('asnat',cmd('start',{room:room.id}));await a.load();return a.data.rooms.find(r=>r.id===room.id);
}
test('Redis: independent authorities serialize conflicting moves, deduplicate retries and reload durable state',{skip:!enabled},async t=>{
  const{a,b}=await fixture(t);const r=await room(a,b);const op=cmd('move',{room:r.id,seq:r.seq,action:{type:'place',cell:0}});
  const result=await Promise.allSettled([a.command('asnat',op),b.command('asnat',cmd('move',{room:r.id,seq:r.seq,action:{type:'place',cell:1}}))]);assert.equal(result.filter(v=>v.status==='fulfilled').length,1);assert.equal(result.filter(v=>v.status==='rejected'&&v.reason.code==='STALE_STATE').length,1);
  await a.load();await b.load();assert.deepEqual(a.data,b.data);assert.equal(a.data.rooms[0].state.board.filter(v=>v!==null).length,1);
  if(result[0].status==='fulfilled')assert.equal((await b.command('asnat',op)).duplicate,true);
});
test('Redis: pub/sub delivers filtered room changes between instances and presence expires cleanly',{skip:!enabled},async t=>{
  const{a,b}=await fixture(t);a.online('asnat',1);b.online('youssef',1);await a.queue;await b.queue;await a.refreshPresence(false);assert.deepEqual(a.present().sort(),['asnat','youssef']);const r=await room(a,b,'hangman');
  let resolve;const event=new Promise(r=>resolve=r);const cancel=b.onEvent((actor,event)=>{if(actor==='youssef'&&event.type==='rooms'&&event.rooms.some(r=>r.state?.phase==='guess'))resolve(event);});
  const watchdog=setTimeout(()=>resolve(null),4000);try{await a.command('asnat',cmd('move',{room:r.id,seq:r.seq,action:{type:'word',word:'starlight',category:'romance'}}));const visible=await event;assert.ok(visible,'Other instance did not receive its event.');assert.equal(visible.rooms.find(v=>v.id===r.id).state.word,undefined);assert.equal(visible.rooms.find(v=>v.id===r.id).state.pattern,'_________');}finally{clearTimeout(watchdog);cancel();}
  b.online('youssef',-1);await b.queue;await a.refreshPresence(false);assert.deepEqual(a.present(),['asnat']);
});
test('Redis: account invitation rate limits apply across instances',{skip:!enabled},async t=>{const{a,b}=await fixture(t);for(let i=0;i<6;i++)await(i%2?a:b).command('asnat',cmd('create',{game:'tictactoe'}));await assert.rejects(()=>a.command('asnat',cmd('create',{game:'tictactoe'})),error=>error.code==='RATE_LIMIT');});
