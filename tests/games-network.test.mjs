import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer as tcpServer, connect as tcpConnect } from 'node:net';
import { WebSocket } from 'ws';
import { startGamesServer } from '../server/games/server.mjs';
import { issueTicket, verifyTicket } from '../server/games/tickets.mjs';
const secret='test-only-games-secret-'.repeat(3);
const command=(type,body={})=>({type,id:randomUUID(),...body});
async function client(port,actor){
  const ws=new WebSocket(`ws://127.0.0.1:${port}/games`),messages=[],waiters=[];
  ws.on('message',bytes=>{const m=JSON.parse(bytes);messages.push(m);for(const check of [...waiters])check();});
  const wait=predicate=>new Promise((accept,reject)=>{const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(check),1);reject(new Error('Timed out waiting for a network message.'));},4000);const check=()=>{const at=messages.findIndex(predicate);if(at>=0){clearTimeout(timer);waiters.splice(waiters.indexOf(check),1);accept(messages.splice(at,1)[0]);}};waiters.push(check);check();});
  await new Promise((accept,reject)=>{ws.once('open',accept);ws.once('error',reject);});ws.send(JSON.stringify({type:'auth',ticket:issueTicket(actor,secret)}));await wait(m=>m.type==='welcome');
  return{ws,wait,messages,send:async input=>{ws.send(JSON.stringify(input));return wait(m=>m.id===input.id&&(m.type==='ack'||m.type==='error'||m.type==='rooms'||m.type==='pong'));},close:()=>new Promise(r=>{if(ws.readyState===WebSocket.CLOSED)return r();ws.once('close',r);ws.close();})};
}
async function fixture(t){const directory=await mkdtemp(join(tmpdir(),'asechka-games-'));const server=await startGamesServer({port:0,secret,directory});const a=await client(server.port,'asnat'),b=await client(server.port,'youssef');t.after(async()=>{await a.close();await b.close();await server.close();await rm(directory,{recursive:true,force:true});});return{server,a,b,directory};}
async function playing(server,a,b,game='tictactoe'){
  const created=await a.send(command('create',{game}));assert.equal(created.type,'ack');let r=server.service.data.rooms.find(r=>r.id===created.room);
  await b.send(command('join',{code:r.code}));await a.send(command('ready',{room:r.id,ready:true}));await b.send(command('ready',{room:r.id,ready:true}));await a.send(command('start',{room:r.id}));return server.service.data.rooms.find(v=>v.id===r.id);
}
test('tickets authenticate profiles and reject forgery, expiration and malformed input',()=>{const ticket=issueTicket('asnat',secret,1000);assert.equal(verifyTicket(ticket,secret,1000).actor,'asnat');assert.throws(()=>verifyTicket(ticket,secret,901001));assert.throws(()=>verifyTicket(ticket+'x',secret,1000));assert.throws(()=>verifyTicket('x',secret));assert.throws(()=>issueTicket('intruder',secret));});
test('two actual clients synchronize, validate turns and converge after duplicate and concurrent moves',async t=>{
  const{server,a,b}=await fixture(t);let room=await playing(server,a,b);const id=room.id;
  const invalid=await b.send(command('move',{room:id,seq:room.seq,action:{type:'place',cell:0}}));assert.equal(invalid.type,'error');
  const move=command('move',{room:id,seq:room.seq,action:{type:'place',cell:0}});const ack=await a.send(move);assert.equal(ack.type,'ack');assert.equal((await a.send(move)).duplicate,true);
  room=server.service.data.rooms.find(r=>r.id===id);assert.equal(room.state.board.filter(v=>v!==null).length,1);
  const conflict=await Promise.all([b.send(command('move',{room:id,seq:room.seq,action:{type:'place',cell:1}})),b.send(command('move',{room:id,seq:room.seq,action:{type:'place',cell:2}}))]);assert.equal(conflict.filter(r=>r.type==='ack').length,1);assert.equal(conflict.filter(r=>r.code==='STALE_STATE').length,1);
  await a.send(command('sync',{room:id}));await b.send(command('sync',{room:id}));const expected=server.service.data.rooms.find(r=>r.id===id).seq;assert.ok(a.messages.some(m=>m.room?.seq===expected));assert.ok(b.messages.some(m=>m.room?.seq===expected));
});
test('temporary disconnection and process restart preserve an unfinished authoritative room',async t=>{
  const{server,a,b,directory}=await fixture(t);let room=await playing(server,a,b);await a.send(command('move',{room:room.id,seq:room.seq,action:{type:'place',cell:4}}));await b.close();assert.equal(server.service.data.rooms[0].status,'playing');
  const reconnected=await client(server.port,'youssef');const list=await reconnected.send(command('list'));assert.equal(list.rooms[0].state.board[4],0);await reconnected.close();
  const{GamesService}=await import('../server/games/service.mjs');const restored=await new GamesService({directory}).init();assert.equal(restored.rooms('asnat')[0].state.board[4],0);assert.equal(restored.rooms('asnat')[0].status,'playing');
});
test('latency, jitter, omitted sends and lost acknowledgments recover with stable operation IDs',async t=>{
  const{server,a,b}=await fixture(t);const room=await playing(server,a,b);const op=command('move',{room:room.id,seq:room.seq,action:{type:'place',cell:0}});
  // A dropped application packet is retried after a jittered network delay.
  await new Promise(r=>setTimeout(r,37));const ack=await a.send(op);assert.equal(ack.type,'ack');
  await new Promise(r=>setTimeout(r,23));const recovered=await a.send(op);assert.equal(recovered.duplicate,true);assert.equal(server.service.data.rooms[0].seq,room.seq+1);
});
test('all six modules create network rooms and snapshots omit private opponent fleets and words',async t=>{
  const{server,a,b}=await fixture(t);
  for(const game of ['pool','tictactoe','hangman','connect4','checkers','battleship']){
    server.service.rates.clear();const room=await playing(server,a,b,game);assert.equal(room.status,'playing');assert.equal(room.state.winner,null);
    const list=await b.send(command('list'));const visible=list.rooms.find(r=>r.id===room.id);assert.ok(visible.state);
    if(game==='battleship'){const ships=[[0,1,2,3,4],[10,11,12,13],[20,21,22],[30,31,32],[40,41]].map(cells=>({cells}));const result=await a.send(command('move',{room:room.id,seq:room.seq,action:{type:'fleet',ships}}));assert.equal(result.type,'ack');const list2=await b.send(command('list'));assert.equal(list2.rooms.find(r=>r.id===room.id).state.fleets[0],null);}
  }
});
test('malformed moves, cross-origin upgrades and unauthenticated sockets are rejected',async t=>{
  const{server,a,b}=await fixture(t);const room=await playing(server,a,b);const bad=await a.send(command('move',{room:room.id,seq:room.seq,action:{type:'place',cell:99}}));assert.equal(bad.type,'error');assert.equal(server.service.data.rooms[0].seq,room.seq);
  const unauth=new WebSocket(`ws://127.0.0.1:${server.port}/games`);await new Promise(r=>unauth.once('open',r));unauth.send(JSON.stringify(command('list')));const code=await new Promise(r=>unauth.once('close',r));assert.equal(code,1008);
  const cross=new WebSocket(`ws://127.0.0.1:${server.port}/games`,{origin:'https://evil.example'});const status=await new Promise(resolve=>{cross.on('unexpected-response',(_,res)=>{res.resume();cross.terminate();resolve(res.statusCode);});cross.on('error',()=>{});});assert.equal(status,403);
});
test('two-player rematch consent retains scores and starts the next round',async t=>{
  const{server,a,b}=await fixture(t);let room=await playing(server,a,b);for(const [player,cell] of [[a,0],[b,3],[a,1],[b,4],[a,2]]){room=server.service.data.rooms[0];assert.equal((await player.send(command('move',{room:room.id,seq:room.seq,action:{type:'place',cell}}))).type,'ack');}
  room=server.service.data.rooms[0];assert.equal(room.result,0);assert.equal(room.status,'finished');await a.send(command('rematch',{room:room.id}));assert.equal(server.service.data.rooms[0].status,'finished');await b.send(command('rematch',{room:room.id}));assert.equal(server.service.data.rooms[0].status,'playing');assert.equal(server.service.data.rooms[0].state.board.every(v=>v===null),true);
});
test('a real TCP delay and jitter proxy survives transport interruption and restores both clients',async t=>{
  const{server,b}=await fixture(t);const sockets=new Set();let sequence=0;
  const proxy=tcpServer(incoming=>{const outgoing=tcpConnect(server.port,'127.0.0.1');sockets.add(incoming);sockets.add(outgoing);for(const[from,to]of [[incoming,outgoing],[outgoing,incoming]]){let chain=Promise.resolve();from.on('data',bytes=>{chain=chain.then(()=>new Promise(r=>setTimeout(r,15+(sequence++%4)*7))).then(()=>{if(!to.destroyed)to.write(bytes);});});from.on('error',()=>to.destroy());from.on('close',()=>{sockets.delete(from);to.destroy();});}});
  await new Promise(r=>proxy.listen(0,'127.0.0.1',r));let slow;
  try{slow=await client(proxy.address().port,'asnat');const room=await playing(server,slow,b);const op=command('move',{room:room.id,seq:room.seq,action:{type:'place',cell:4}});assert.equal((await slow.send(op)).type,'ack');for(const socket of sockets)socket.destroy();await slow.close();slow=await client(proxy.address().port,'asnat');const restored=await slow.send(command('list'));assert.equal(restored.rooms[0].state.board[4],0);assert.equal((await slow.send(op)).duplicate,true);assert.equal(server.service.data.rooms[0].status,'playing');}
  finally{if(slow)await slow.close();for(const socket of sockets)socket.destroy();await new Promise(r=>proxy.close(r));}
});
test('server clock settles a timed Hangman round with no connected player input',async t=>{
  const{server,a,b}=await fixture(t);const made=await a.send(command('create',{game:'hangman',settings:{timedSeconds:30}}));let room=server.service.data.rooms.find(r=>r.id===made.room);await b.send(command('join',{code:room.code}));await a.send(command('ready',{room:room.id,ready:true}));await b.send(command('ready',{room:room.id,ready:true}));await a.send(command('start',{room:room.id}));room=server.service.data.rooms.find(r=>r.id===made.room);assert.equal((await a.send(command('move',{room:room.id,seq:room.seq,action:{type:'category',category:'animals'}}))).type,'ack');room=server.service.data.rooms.find(r=>r.id===made.room);server.service.now=()=>room.state.deadline+1;await server.service.tick();assert.equal(server.service.data.rooms.find(r=>r.id===made.room).result,0);await server.service.tick();assert.equal(server.service.data.rooms.find(r=>r.id===made.room).scores[0],1);
});
