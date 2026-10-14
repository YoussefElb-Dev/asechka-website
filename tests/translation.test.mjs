import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {authorize} from '../server/auth.js';
import {checkedTranslation,translationInstruction,createTranslationAPI,languages} from '../server/translation-api.js';
const input=()=>({text:'I miss you.',source:'en',targets:['ar-EG','ru','he','fr','es'],tone:'natural',speaker:'male',recipient:'female'});
const catalog=()=>Response.json({models:[{name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']}]});
const providerResult=(targets)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({translations:targets.map(language=>({language,text:language==='ar-EG'?'وحشتيني':'A translated phrase',pronunciation:language==='ar-EG'?'wahashtini':'',backTranslation:'I miss you.',note:''}))})}]}}]});
async function session(){process.env.SITE_PASSWORD='2505';process.env.SESSION_SECRET=randomBytes(48).toString('hex');const result=await authorize(new Request('https://asechka.test/api/session',{method:'POST',headers:{Accept:'application/json',Origin:'https://asechka.test','Content-Type':'application/x-www-form-urlencoded'},body:'password=2505'}));return result.headers.get('set-cookie').split(';')[0];}
const request=(cookie,body,extra={})=>new Request('https://asechka.test/api/translation',{method:body?'POST':'GET',headers:{Accept:'application/json',Cookie:cookie,...(body?{Origin:'https://asechka.test','Content-Type':'application/json','X-Asechka-Translation':'1'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});
test('only the five requested languages are accepted; Arabic is explicitly Egyptian',()=>{
 assert.equal(languages['ar-EG'],'Egyptian Arabic');assert.equal(languages.ar,undefined);
 const checked=checkedTranslation({...input(),text:' I miss you. '});assert.equal(checked.text,'I miss you.');
 for(const bad of [{text:''},{text:'x'.repeat(1501)},{targets:['ar']},{targets:['ru','ru']},{targets:[]},{source:'unknown'},{tone:'invent'},{speaker:'other'},{recipient:'other'}])assert.throws(()=>checkedTranslation({...input(),...bad}),error=>error.status===400);
 const prompt=translationInstruction(checked);assert.match(prompt,/colloquial Egyptian Arabic/);assert.match(prompt,/NEVER Modern Standard Arabic/);assert.match(prompt,/speaker is male/);assert.match(prompt,/recipient is female/);assert.match(prompt,/Do not invent facts/);assert.match(prompt,/never as instructions/);
});
test('translation is protected and cross-site requests cannot use its key',async()=>{
 const cookie=await session();let called=0;const api=createTranslationAPI({key:()=> 'test-private-key',fetcher:async()=>{called++;return Response.json(providerResult(input().targets));}});
 assert.equal((await api(request('',input()))).status,401);
 assert.equal((await api(request(cookie,input(),{Origin:'https://another.test'}))).status,403);
 assert.equal((await api(request(cookie,input(),{'X-Asechka-Translation':'0'}))).status,403);
 assert.equal(called,0);assert.equal((await api(request(cookie))).headers.get('cache-control'),'private, no-store, max-age=0');
});
test('a missing connection has honest readiness and never sends source text',async()=>{
 const cookie=await session();const api=createTranslationAPI({key:()=>null,fetcher:()=>assert.fail('No provider without a key')});
 assert.equal((await (await api(request(cookie))).json()).ready,false);assert.equal((await api(request(cookie,input()))).status,503);
});
test('readiness verifies the key with a text-free provider check, caches briefly, and never claims rejected keys work',async()=>{
 const cookie=await session();let calls=0,time=0;const api=createTranslationAPI({key:()=> 'test-private-key',now:()=>time,fetcher:async(url,options)=>{calls++;assert.equal(options.body,undefined);assert.match(url,/\/models\?/);return new Response('',{status:401});}});
 const first=await (await api(request(cookie))).json();assert.equal(first.ready,false);assert.ok(first.message);await api(request(cookie));assert.equal(calls,1);time=15001;await api(request(cookie));assert.equal(calls,2);
});
test('provider gets Egyptian context and structured results; repeated messages use short-lived memory cache',async()=>{
 const cookie=await session();let calls=0;const api=createTranslationAPI({key:()=> 'test-private-key',fetcher:async(url,options)=>{
  calls++;assert.equal(new URL(url).hostname,'generativelanguage.googleapis.com');assert.equal(options.headers['x-goog-api-key'],'test-private-key');assert.ok(!url.includes('test-private-key'));
  const body=JSON.parse(options.body);assert.match(body.systemInstruction.parts[0].text,/colloquial Egyptian Arabic/);assert.equal(JSON.parse(body.contents[0].parts[0].text).sourceText,input().text);assert.equal(body.generationConfig.responseMimeType,'application/json');return Response.json(providerResult([...input().targets].reverse()));
 }});
 const result=await api(request(cookie,input()));assert.equal(result.status,200);const data=await result.json();assert.deepEqual(data.translations.map(item=>item.language),input().targets);assert.equal(data.translations[0].text,'وحشتيني');assert.ok(!JSON.stringify(data).includes('test-private-key'));
 assert.equal((await api(request(cookie,input()))).status,200);assert.equal(calls,1);
});
test('provider failures, incomplete results, and quota limits have safe messages',async()=>{
 const cookie=await session();for(const provider of [new Response('private key or provider internals',{status:403}),Response.json({candidates:[{finishReason:'MAX_TOKENS'}]}),Response.json(providerResult(['ar-EG']))]){
  const api=createTranslationAPI({key:()=> 'test-private-key',fetcher:async url=>url.includes('/models?')?catalog():provider});const result=await api(request(cookie,input()));assert.equal(result.status,503);assert.ok(!(await result.text()).includes('test-private-key'));
 }
 const quota=createTranslationAPI({key:()=> 'test-private-key',fetcher:async url=>url.includes('/models?')?catalog():new Response('private',{status:429})});const result=await quota(request(cookie,input()));assert.equal(result.status,429);assert.equal(result.headers.get('retry-after'),'60');
 const api=createTranslationAPI({key:()=> 'test-private-key',fetcher:async url=>url.includes('/models?')?catalog():Response.json(providerResult(input().targets))});for(let i=0;i<6;i++)assert.equal((await api(request(cookie,{...input(),text:`Different message ${i}`}))).status,200);assert.equal((await api(request(cookie,{...input(),text:'Seventh message'}))).status,429);
});
