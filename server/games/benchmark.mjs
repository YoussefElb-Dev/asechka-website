import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startGamesServer } from './server.mjs';
import { issueTicket } from './tickets.mjs';

const secret='benchmark-only-secret-'.repeat(3),directory=await mkdtemp(join(tmpdir(),'asechka-bench-'));
const server=await startGamesServer({port:0,secret,directory});const clients=[];
async function connect(actor){const ws=new WebSocket(`ws://127.0.0.1:${server.port}/games`),pending=new Map();ws.on('message',bytes=>{const value=JSON.parse(bytes);if(value.type==='welcome')pending.get('welcome')?.(value);else if(['ack','error','pong'].includes(value.type))pending.get(value.id)?.(value);});const welcome=new Promise(r=>pending.set('welcome',r));await new Promise(r=>ws.once('open',r));ws.send(JSON.stringify({type:'auth',ticket:issueTicket(actor,secret)}));await welcome;clients.push(ws);return async(type,body={})=>{const id=randomUUID(),start=performance.now();const result=await new Promise((r,reject)=>{const timer=setTimeout(()=>reject(new Error('Benchmark timed out.')),5000);pending.set(id,value=>{clearTimeout(timer);pending.delete(id);r(value);});ws.send(JSON.stringify({type,id,...body}));});if(result.type==='error')throw new Error(result.error);return{...result,milliseconds:performance.now()-start};};}
try{
  const a=await connect('asnat'),b=await connect('youssef'),durations=[];
  for(let i=0;i<12;i++){
    server.service.rates.clear();const created=await a('create',{game:'tictactoe'});let room=server.service.data.rooms.find(r=>r.id===created.room);await b('join',{code:room.code});await a('ready',{room:room.id,ready:true});await b('ready',{room:room.id,ready:true});await a('start',{room:room.id});
    for(const[send,cell]of [[a,0],[b,3],[a,1],[b,4],[a,2]]){room=server.service.data.rooms.find(r=>r.id===room.id);const result=await send('move',{room:room.id,seq:room.seq,action:{type:'place',cell}});durations.push(result.milliseconds);}
  }
  durations.sort((a,b)=>a-b);const percentile=p=>Number(durations[Math.ceil(p*durations.length)-1].toFixed(3));
  const report={measuredAt:new Date().toISOString(),environment:{os:process.platform,arch:process.arch,node:process.version,transport:'Two real WebSocket clients over IPv4 loopback',persistence:'Atomic JSON file rename before acknowledgment',rooms:12,moves:durations.length},moveAcknowledgmentMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:durations.at(-1)},limits:'Local loopback only. Not a same-region cloud, physical iOS/Android, input-to-photon, 60 FPS, 120 Hz, or WAN benchmark.'};
  await mkdir(resolve('benchmark-results'),{recursive:true});await writeFile(resolve('benchmark-results/games.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{for(const ws of clients)ws.terminate();await server.close();await rm(directory,{recursive:true,force:true});}
