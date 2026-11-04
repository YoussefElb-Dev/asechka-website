import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {create,apply,view,expire,settings} from '../server/games/rules/drawing.mjs';
import {GamesService} from '../server/games/service.mjs';
const choose=(s,now=1000)=>apply(s,s.drawer,{type:'choose',index:0},{now});
const stroke={type:'stroke',tool:'pen',color:'#a292cf',width:.012,points:[[.1,.2],[.6,.8]]};
test('drawing choices, custom pool and seed stay private on every public projection',()=>{
  const s=create({now:0,customWords:['Our secret','Only us','A memory'],customOnly:true});
  assert.equal(view(s,0).choices.length,3);assert.deepEqual(view(s,1).choices,[]);
  for(const p of [0,1]){const v=view(s,p);assert(!('config'in v));assert(!('seed'in v));}
  const active=choose(s);assert.equal(view(active,1).word,null);assert(!JSON.stringify(view(active,1)).includes(active.word));assert.equal(view(active,0).word,active.word);
  assert.deepEqual(s,create({now:0,customWords:['Our secret','Only us','A memory'],customOnly:true}));
});
test('drawing tools are artist-only and validate bounded original stroke data',()=>{
  let s=choose(create());const before=structuredClone(s);
  assert.throws(()=>apply(s,1,stroke,{now:2000}),/artist/);
  for(const bad of [{...stroke,color:'url(bad)'},{...stroke,width:NaN},{...stroke,points:[[Infinity,.5]]},{...stroke,points:[[1.1,0]]},{...stroke,points:Array(151).fill([0,0])}])assert.throws(()=>apply(s,0,bad,{now:2000}));
  s=apply(s,0,stroke,{now:2000});assert.deepEqual(s.strokes[0],{tool:stroke.tool,color:stroke.color,width:stroke.width,points:stroke.points});assert.deepEqual(before.strokes,[]);
  s=apply(s,0,{...stroke,tool:'fill'},{now:2001});assert.equal(s.strokes.length,2);
  s=apply(s,0,{type:'undo'},{now:2002});assert.equal(s.strokes.length,1);s=apply(s,0,{type:'clear'},{now:2003});assert.deepEqual(s.strokes,[]);
});
test('near guesses stay in chat, exact guesses score both profiles and duplicates cannot rescore',()=>{
  let s=choose(create({customWords:['rainbow'],wordChoices:1,customOnly:true}));
  assert.throws(()=>apply(s,0,{type:'guess',text:s.word},{now:2000}),/artist/);
  s=apply(s,1,{type:'guess',text:'rainbo'},{now:2000});assert.equal(s.chat.at(-1).kind,'close');assert.equal(s.phase,'draw');
  assert.throws(()=>apply(s,1,{type:'guess',text:'x'},{now:2200}),/moment/);
  s=apply(s,1,{type:'guess',text:' RAINBOW '},{now:2500});assert.equal(s.phase,'reveal');assert(s.points[1]>s.points[0]);assert(s.points[0]>100);assert.equal(view(s,1).word,'rainbow');assert.throws(()=>apply(s,1,{type:'guess',text:'rainbow'},{now:3000}));
});
test('timeouts select a word, reveal letters without giving the whole word, alternate artists and finish a round',()=>{
  let s=create({now:0,rounds:1,drawSeconds:30,hints:3,customWords:['cat'],customOnly:true,wordChoices:1});
  s=expire(s,15000);assert.equal(s.phase,'draw');s=expire(s,40000);assert.equal(s.revealed.length,2);assert(view(s,1).pattern.includes('_'));
  s=expire(s,45000);assert.equal(s.phase,'reveal');assert.equal(s.lastResult.correct,false);
  s=expire(s,50000);assert.equal(s.drawer,1);assert.equal(s.phase,'choose');assert.equal(view(s,0).word,null);
  s=expire(s,65000);s=expire(s,95000);s=expire(s,100000);assert.equal(s.phase,'finished');assert.equal(s.winner,'draw');assert.equal(s.deadline,undefined);
});
test('invalid drawing settings cannot create a broken room',()=>{
  for(const v of [{rounds:0},{drawSeconds:Infinity},{hints:4},{customWords:['x\n<script>']},{customOnly:true},{customWords:'bad'},{customOnly:'yes'}])assert.throws(()=>settings(v));
});
test('the production command queue publishes timer transitions and idempotent strokes for two profiles',async()=>{
  let now=1000;const service=await new GamesService({now:()=>now}).init();let events=[];service.onEvent((actor,event)=>events.push({actor,event}));
  const cmd=(actor,type,extra={})=>service.command(actor,{id:randomUUID(),type,...extra});
  const made=await cmd('asnat','create',{game:'drawing',settings:{rounds:1,drawSeconds:30,customWords:['rainbow'],customOnly:true,wordChoices:1}}),id=made.room;
  await cmd('youssef','join',{code:service.data.rooms[0].code});for(const actor of ['asnat','youssef'])await cmd(actor,'ready',{room:id,ready:true});await cmd('asnat','start',{room:id});
  assert(!('customWords'in service.roomView(service.data.rooms[0],'youssef').settings));
  now=16000;await service.tick();assert.equal(service.data.rooms[0].state.phase,'draw');
  const action={id:randomUUID(),type:'move',room:id,seq:service.data.rooms[0].seq,action:stroke};await service.command('asnat',action);await service.command('asnat',action);assert.equal(service.data.rooms[0].state.strokes.length,1);
  now=27000;await service.tick();assert.equal(service.data.rooms[0].state.revealed.length,1);
  now=46000;await service.tick();assert.equal(service.data.rooms[0].state.phase,'reveal');now=51000;await service.tick();assert.equal(service.data.rooms[0].state.drawer,1);assert.equal(service.data.rooms[0].state.phase,'choose');
  assert(events.some(x=>x.actor==='youssef'&&x.event.room?.state?.phase==='reveal'));
});
