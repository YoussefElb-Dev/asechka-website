// Development fixture: production request validators and conflict logic, with isolated in-memory data.
// It never contacts GitHub, Vercel, Gemini, or the user's private content.
import {createMemoriesAPI} from './backend/memories-api.js';
import {checkedMemoryChange,appendMemory} from './backend/memories-store.js';
import {createJournalAPI} from './backend/journal-api.js';
import {checkedJournalChange,changeJournal} from './backend/journal-store.js';
import {createKeepsakesAPI} from './backend/keepsakes-api.js';
import {checkedKeepsakeChange,changeKeepsakes} from './backend/keepsakes-store.js';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {authorize} from './backend/auth.js';
import {createMusicAPI} from './backend/music-api.js';
import {changeMusic,checkedChange} from './backend/music-store.js';
import {createTogetherAPI} from './backend/together-api.js';
import {changeTogether,checkedTogetherChange} from './backend/together-store.js';
import {dailyMemory} from './backend/daily-memory.js';
import {checkedTranslation} from './backend/translation-api.js';
process.env.SITE_PASSWORD='native-test-code';
process.env.SESSION_SECRET='native-android-isolated-test-session-secret';
const id=()=>randomUUID();
const photos=new Map();
let music={version:1,tracks:[]};
let together={version:1,bucketList:[],hearts:{me:null,asechka:null}};
const memories={version:1,quotes:[{id:id(),text:'Every ordinary day feels a little brighter with you.',date:'2026-10-17',note:'A little thought, kept for us.'}],photos:[]};
const galleryId=id();memories.photos.push({id:galleryId,src:`assets/photos/2026/10/${galleryId}.jpg`,caption:'A little fixture photo',date:'2026-10-17',alt:'Two cozy cats'});
const originalQuote=structuredClone(memories.quotes[0]),originalPhoto=structuredClone(memories.photos[0]);
const song={trackId:123456,title:'Our favorite song',artist:'Our favorite artist',album:'A little soundtrack',artworkUrl:'',trackUrl:'https://music.apple.com/us/album/our-song/123?i=123456',durationMs:181000};
const musicAPI=createMusicAPI({catalog:{search:async()=>[song],track:async()=>song},store:{writable:true,read:async()=>({data:music}),change:async(change,track)=>{music=changeMusic(music,checkedChange(change),track).data;return music;}}});
const togetherAPI=createTogetherAPI({favorites:{writable:true,read:async()=>together,memory:async()=>dailyMemory(memories,music),photo:async(kind,photoId)=>({bytes:kind==='memory'&&!photos.has(photoId)?await readFile(new URL('../app/src/main/assets/default/cats-cozy.jpg',import.meta.url)):photos.get(photoId),type:'image/jpeg'}),change:async input=>{const checked=checkedTogetherChange(input);together=changeTogether(together,checked).data;if(checked.photo)photos.set(checked.operationId,checked.photo);return together;}}});
const memoriesAPI=createMemoriesAPI({collection:{writable:true,read:async()=>memories,change:async input=>{const change=checkedMemoryChange(input);const update=appendMemory(memories,change);Object.assign(memories,update.data);if(change.photo)photos.set(change.operationId,change.photo);return memories;}}});
const originalKeepsakes={version:1,since:{id:id(),revision:id(),startedAt:'2026-10-16T19:41:00.000Z',startedTalkingAt:'2026-09-27',timeZone:'America/New_York',monthlyMessage:'Another little month together.',yearlyMessage:'Another year of us.'},letters:[{id:id(),revision:id(),title:'you need a smile',text:'A little fixture letter, only for testing.'},{id:id(),revision:id(),title:'you miss me',text:'Another fixture letter.'}],things:[{id:id(),revision:id(),text:'How we celebrate the little wins.'}]};
let keepsakes=structuredClone(originalKeepsakes),journal={version:1,victories:[],recipes:[],jokes:[]};
const journalAPI=createJournalAPI({collection:{writable:true,read:async()=>journal,photo:async id=>photos.get(id),change:async input=>{const c=checkedJournalChange(input);journal=changeJournal(journal,c).data;if(c.photo)photos.set(c.operationId,c.photo);return journal;}}});
const keepsakesAPI=createKeepsakesAPI({collection:{writable:true,read:async()=>keepsakes,change:async input=>{keepsakes=changeKeepsakes(keepsakes,checkedKeepsakeChange(input)).data;return keepsakes;}}});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
createServer(async(req,res)=>{
  try{
    const request=new Request(new URL(req.url,'http://127.0.0.1:4777'),{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Readable.toWeb(req),duplex:'half'})});
    const path=new URL(request.url).pathname;
    let response;
    if(path==='/__reset'){journal={version:1,victories:[],recipes:[],jokes:[]};keepsakes=structuredClone(originalKeepsakes);music={version:1,tracks:[]};together={version:1,bucketList:[],hearts:{me:null,asechka:null}};memories.quotes=[structuredClone(originalQuote)];memories.photos=[structuredClone(originalPhoto)];photos.clear();response=json({ok:true});}
    else if(path==='/__add-memory'){memories.quotes.push({id:id(),text:'A new little thought from the website.',date:'2026-10-17',note:''});response=json({ok:true});}
    else if(path==='/api/journal')response=await journalAPI(request);
    else if(path==='/api/keepsakes')response=await keepsakesAPI(request);
    else if(path==='/api/memories')response=await memoriesAPI(request);
    else if(path.startsWith('/api/music'))response=await musicAPI(request);
    else if(['/api/together','/api/together-photo','/api/daily-memory'].includes(path))response=await togetherAPI(request);
    else{
      response=await authorize(request);
      if(!response){
        if(path==='/memories.json')response=json(memories);
        else if(path==='/api/translation'){
          if(request.method==='GET')response=json({ready:true,languages:{'ar-EG':'Egyptian Arabic',ru:'Russian',he:'Hebrew',fr:'French',es:'Spanish'}});
          else{const input=checkedTranslation(await request.json());response=input.text==='simulate failure'?json({error:'Our test translator needs a moment.'},503):json({translations:input.targets.map(language=>({language,text:language==='he'?'אני אוהבת אותך':language==='ru'?'Я тебя люблю':language==='ar-EG'?'بحبك':language==='fr'?'Je t’aime':'Te quiero',pronunciation:['ar-EG','ru','he'].includes(language)?'A natural pronunciation guide':'',backTranslation:'I love you.',note:''}))});}
        }else if(path.startsWith('/assets/'))response=new Response(await readFile(new URL('../app/src/main/assets/default/'+(path.startsWith('/assets/photos/')?'cats-cozy.jpg':path.slice(8)),import.meta.url)),{headers:{'Content-Type':path.endsWith('.png')?'image/png':'image/jpeg'}});
        else response=json({error:'Not found'},404);
      }
    }
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
}).listen(4777,'127.0.0.1',()=>console.log('Isolated native-app fixture: http://127.0.0.1:4777'));
