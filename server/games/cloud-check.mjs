// Operator smoke check: creates six disposable rooms, then removes only its own
// room IDs with Redis CAS. Supply the deployed signing key/Redis URL privately.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { WebSocket } from 'ws';
import { createClient } from 'redis';
import { issueTicket } from './tickets.mjs';

const url=process.env.GAMES_CHECK_URL;
assert(url?.startsWith('wss://'),'Set GAMES_CHECK_URL to the deployed secure socket URL.');
assert(process.env.REDIS_URL && process.env.GAMES_TOKEN_SECRET,'Supply private Redis and Games signing configuration.');
assert(process.argv.includes('--write-test-rooms'),'Use --write-test-rooms to run the six disposable live matches.');
const prefix=process.env.GAMES_REDIS_PREFIX||'asechka:games:v1';
const run='qa_'+randomUUID(), ids=new Set(), sockets=[], timings=[];
let counter=0;
const command=(type,body={})=>({type,id:`${run}_${++counter}`,...body});
async function client(actor){
  const ws=new WebSocket(url,{handshakeTimeout:20000}), inbox=[], waiters=[], rooms=new Map();
  sockets.push(ws);
  ws.on('error',()=>{});
  ws.on('message',bytes=>{
    const event=JSON.parse(bytes);
    if(event.room?.id)rooms.set(event.room.id,event.room);
    for(const room of event.rooms||[])rooms.set(room.id,room);
    inbox.push(event);for(const check of [...waiters])check();
  });
  const wait=predicate=>new Promise((accept,reject)=>{
    const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(check),1);reject(new Error('Live game response timed out.'));},20000);
    const check=()=>{const at=inbox.findIndex(predicate);if(at>=0){clearTimeout(timer);waiters.splice(waiters.indexOf(check),1);accept(inbox.splice(at,1)[0]);}};
    waiters.push(check);check();
  });
  await new Promise((accept,reject)=>{ws.once('open',accept);ws.once('error',reject);});
  ws.send(JSON.stringify({type:'auth',ticket:issueTicket(actor,process.env.GAMES_TOKEN_SECRET)}));
  await wait(event=>event.type==='welcome');
  return {ws,rooms,async send(input){const start=performance.now();ws.send(JSON.stringify(input));const response=await wait(event=>event.id===input.id);if(input.type==='move'&&response.type==='ack')timings.push(performance.now()-start);return response;}};
}
const ack=async(c,input)=>{const value=await c.send(input);assert.equal(value.type,'ack',value.error);return value;};
const sync=async(c,id)=>{await ack(c,command('sync',{room:id}));return c.rooms.get(id);};
const move=async(c,id,action)=>{const room=await sync(c,id);const input=command('move',{room:id,seq:room.seq,action});return {input,response:await ack(c,input)};};
async function cleanup(){
  for(const ws of sockets)ws.terminate();
  if(!ids.size)return;
  const redis=createClient({url:process.env.REDIS_URL});redis.on('error',()=>{});await redis.connect();
  try{
    for(let attempt=0;attempt<10;attempt++){
      const old=await redis.get(prefix+':state');if(!old)return;
      const state=JSON.parse(old);state.rooms=state.rooms.filter(room=>!ids.has(room.id));state.receipts=state.receipts.filter(receipt=>!ids.has(receipt.room));
      const changed=await redis.eval("if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end;redis.call('SET',KEYS[1],ARGV[2]);redis.call('PUBLISH',KEYS[2],ARGV[3]);return 1",{keys:[prefix+':state',prefix+':events'],arguments:[old,JSON.stringify(state),JSON.stringify({source:run,kind:'state'})]});
      if(Number(changed)===1)return;
    }
    throw new Error('Live room cleanup was busy; retry cleanup using the recorded QA room IDs.');
  }finally{await redis.close();}
}
try{
  const a=await client('asnat');let b=await client('youssef');
  for(const game of ['tictactoe','connect4','hangman','checkers','battleship','pool']){
    const created=await ack(a,command('create',{game}));ids.add(created.room);
    let room=await sync(a,created.room),id=room.id;
    await ack(b,command('join',{code:room.code}));
    await ack(a,command('ready',{room:id,ready:true}));await ack(b,command('ready',{room:id,ready:true}));
    await ack(a,command('start',{room:id}));
    if(game==='tictactoe'){
      const first=await move(a,id,{type:'place',cell:0});
      const duplicate=await ack(a,first.input);assert.equal(duplicate.duplicate,true);
      b.ws.terminate();b=await client('youssef');
      room=await sync(b,id);assert.equal(room.state.board[0],0);assert.equal(room.status,'playing');
      const invalid=await b.send(command('move',{room:id,seq:room.seq-1,action:{type:'place',cell:8}}));assert.equal(invalid.code,'STALE_STATE');
      await move(b,id,{type:'place',cell:3});await move(a,id,{type:'place',cell:1});await move(b,id,{type:'place',cell:4});await move(a,id,{type:'place',cell:2});
      assert.equal((await sync(b,id)).result,0);
      await ack(a,command('rematch',{room:id}));await ack(b,command('rematch',{room:id}));
      assert.equal((await sync(a,id)).status,'playing');
    }else if(game==='connect4'){
      for(let i=0;i<4;i++){await move(a,id,{type:'drop',column:0});if(i<3)await move(b,id,{type:'drop',column:1});}
      assert.equal((await sync(b,id)).result,0);
    }else if(game==='hangman'){
      await move(a,id,{type:'word',word:'orbit',category:'science'});
      room=await sync(b,id);assert.equal(room.state.word,undefined);assert.equal(room.state.pattern,'_____');
      for(const letter of 'orbit')await move(b,id,{type:'guess',letter});
      assert.equal((await sync(a,id)).result,1);
    }else if(game==='checkers'){
      for(let i=0;i<4;i++){const c=i%2?b:a;room=await sync(c,id);const legal=room.state.legal[0];await move(c,id,{type:'move',from:legal.from,to:legal.to});}
      assert.equal((await sync(b,id)).state.moves.length,4);
    }else if(game==='battleship'){
      const ships=[[0,1,2,3,4],[20,21,22,23],[40,41,42],[60,61,62],[80,81]].map(cells=>({cells}));
      await move(a,id,{type:'fleet',ships});assert.equal((await sync(b,id)).state.fleets[0],null);
      await move(b,id,{type:'fleet',ships});await move(a,id,{type:'fire',cell:0});await move(b,id,{type:'fire',cell:19});
      room=await sync(a,id);assert.deepEqual(room.state.hits[0],[0]);assert.deepEqual(room.state.hits[1],[]);assert.equal(room.state.fleets[1],null);
    }else{
      await move(a,id,{type:'shot',angle:0,power:.35,callPocket:0});
      const one=await sync(a,id),two=await sync(b,id);
      assert(one.state.lastShot.frames.length>1);assert.deepEqual(one.state.balls,two.state.balls);
    }
    console.log(`PASS hosted ${game}`);
  }
  const sorted=[...timings].sort((a,b)=>a-b),percentile=p=>sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)];
  console.log(JSON.stringify({endpoint:new URL(url).host,transport:'WSS/TLS',clients:2,games:6,moveAcknowledgments:sorted.length,p50Ms:Math.round(percentile(.5)*100)/100,p95Ms:Math.round(percentile(.95)*100)/100,reconnect:true,deduplication:true,hiddenState:true,rematch:true,measurement:'This Windows host to deployed Vercel; not a physical-device frame/input measurement.'},null,2));
}finally{await cleanup();console.log('Removed only this run’s disposable QA rooms and receipts.');}
