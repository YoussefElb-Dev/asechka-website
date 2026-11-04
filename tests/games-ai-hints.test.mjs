import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHintGenerator} from '../server/games/ai-hints.mjs';
import {GamesService} from '../server/games/service.mjs';
import {randomUUID} from 'node:crypto';

const models={models:[{name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']}]};
function fixture(clue){const calls=[];const generate=createHintGenerator({key:()=> 'fixture-key',fetcher:async(url,options)=>{calls.push({url,options});return Response.json(calls.length===1?models:{candidates:[{content:{parts:[{text:JSON.stringify({clue})}]}}]});}});return {generate,calls};}
test('Gemini clue uses the existing server key, structured response, and bounded cache',async()=>{
  const {generate,calls}=fixture('A special date that celebrates an important event returning each year.');
  const input={word:'anniversary',category:'romance'};
  assert.match(await generate(input),/special date/);
  await generate(input);assert.equal(calls.length,2);
  const body=JSON.parse(calls[1].options.body);
  assert.equal(body.generationConfig.responseMimeType,'application/json');
  assert.equal(calls[1].options.headers['x-goog-api-key'],'fixture-key');
  assert.equal(JSON.parse(body.contents[0].parts[0].text).answer,'anniversary');
});
for(const personal of [false,true])test(`authenticated hint respects personal=${personal} and keeps the secret out of the guesser view`,async()=>{
  let calls=0;
  const service=await new GamesService({hintGenerator:async input=>{calls++;assert.equal(input.word,'anniversary');return 'A special date that celebrates an important event returning each year.';}}).init();
  const cmd=(type,fields={})=>({type,id:randomUUID(),...fields});
  const created=await service.command('asnat',cmd('create',{game:'hangman'}));
  const room=()=>service.data.rooms.find(r=>r.id===created.room);
  await service.command('youssef',cmd('join',{code:room().code}));
  for(const actor of ['asnat','youssef'])await service.command(actor,cmd('ready',{room:created.room,ready:true}));
  await service.command('asnat',cmd('start',{room:created.room}));
  await service.command('asnat',cmd('move',{room:created.room,seq:room().seq,action:{type:'word',word:'anniversary',category:'romance',personal}}));
  const denied=cmd('move',{room:created.room,seq:room().seq,action:{type:'hint'}});
  await assert.rejects(service.command('asnat',denied));assert.equal(calls,0);
  const hint=cmd('move',{room:created.room,seq:room().seq,action:{type:'hint'}});
  await service.command('youssef',hint);
  const view=service.roomView(room(),'youssef');
  if(personal)assert.equal(view.state.hint,'Revealed letter: A.');
  else assert.match(view.state.hint,/^AI hint · A special date/);
  assert.match(view.state.hint,/Revealed letter: A/);
  assert.equal(view.state.remaining,6);assert.equal(view.state.word,undefined);
  assert.equal(view.state.secretHint,undefined);
  assert.equal((await service.command('youssef',hint)).duplicate,true);assert.equal(calls,personal?0:1);
});
test('answer leaks and provider failures fall back without exposing the secret',async()=>{
  for(const clue of ['The answer is anniversary, a recurring celebration.','You send a letter to someone you care about.']) {
    const {generate}=fixture(clue);assert.equal(await generate({word:clue.includes('anniversary')?'anniversary':'love letter',category:'romance'}),null);
  }
  assert.equal(await createHintGenerator({key:()=>''})({word:'anniversary',category:'romance'}),null);
  assert.equal(await createHintGenerator({key:()=> 'fixture',fetcher:async()=>{throw Error('timeout');}})({word:'anniversary',category:'romance'}),null);
});
