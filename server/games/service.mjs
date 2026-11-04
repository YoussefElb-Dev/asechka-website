import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { games, createGame, applyAction, publicState, expireGame } from './engine.mjs';
import { settings as drawingSettings } from './rules/drawing.mjs';
import { generateHangmanHint } from './ai-hints.mjs';

const actors=['asnat','youssef'];
const fail=(message,code='INVALID_ACTION')=>{throw Object.assign(new Error(message),{code});};
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const defaultData=()=>({version:1,rooms:[],receipts:[]});
export class GamesService {
  constructor({directory,now=Date.now,hintGenerator=generateHangmanHint}={}) {this.directory=directory;this.now=now;this.hintGenerator=hintGenerator;this.data=defaultData();this.queue=Promise.resolve();this.listeners=new Set();this.presence=new Map();this.rates=new Map();}
  async init(){if(this.directory){await mkdir(this.directory,{recursive:true,mode:0o700});try{this.data=JSON.parse(await readFile(resolve(this.directory,'matches.json'),'utf8'));if(this.data.version!==1||!Array.isArray(this.data.rooms)||!Array.isArray(this.data.receipts))throw new Error('Invalid match store.');}catch(e){if(e.code!=='ENOENT')throw e;}}return this;}
  async persist(next){if(this.directory){const file=resolve(this.directory,'matches.json');await writeFile(file+'.tmp',JSON.stringify(next),{mode:0o600});await rename(file+'.tmp',file);}this.data=next;}
  onEvent(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  emit(actor,event){for(const fn of this.listeners)fn(actor,event);}
  online(actor,delta){this.presence.set(actor,Math.max(0,(this.presence.get(actor)||0)+delta));this.announce();}
  present(){return actors.filter(a=>(this.presence.get(a)||0)>0);}
  roomView(room,actor){const player=room.players.findIndex(p=>p.actor===actor);return {id:room.id,code:room.code,game:room.game,settings:room.game==='drawing'?Object.fromEntries(Object.entries(room.settings).filter(([key])=>!['customWords','customOnly'].includes(key))):room.settings,players:room.players.map(p=>({...p,online:(this.presence.get(p.actor)||0)>0})),status:room.status,seq:room.seq,state:room.state?publicState(room.game,room.state,player):null,scores:room.scores,result:room.result,seriesWinner:room.seriesWinner,rematchReady:room.rematchReady,round:room.round,updatedAt:room.updatedAt,availableAt:room.availableAt||0};}
  rooms(actor){return this.data.rooms.filter(r=>r.expiresAt>this.now() && (r.players.some(p=>p.actor===actor)||r.status==='lobby')).map(r=>this.roomView(r,actor));}
  announce(){for(const actor of actors)this.emit(actor,{type:'rooms',rooms:this.rooms(actor),presence:this.present()});}
  publish(room){for(const p of room.players)this.emit(p.actor,{type:'room',room:this.roomView(room,p.actor)});if(room.status==='lobby')this.announce();}
  limit(actor,kind,max,window){const key=actor+':'+kind,now=this.now();const entry=this.rates.get(key)||{count:0,until:now+window};if(entry.until<=now){entry.count=0;entry.until=now+window;}if(++entry.count>max)fail('Please give that a moment.','RATE_LIMIT');this.rates.set(key,entry);}
  command(actor,input){const result=this.queue.then(()=>this.execute(actor,input));this.queue=result.catch(()=>{});return result;}
  settle(room){if(room.state.winner!==null && room.state.winner!==undefined){room.result=room.state.winner;room.status='finished';if(room.result===0||room.result===1)room.scores[room.result]++;const needed=Math.floor(room.settings.bestOf/2)+1;room.seriesWinner=room.scores.findIndex(s=>s>=needed);if(room.seriesWinner<0)room.seriesWinner=null;}}
  tick(){const task=this.queue.then(async()=>{const expired=this.data.rooms.filter(r=>r.status==='playing'&&r.state?.deadline!==undefined&&(r.state.deadline<=this.now()||(r.game==='drawing'&&r.state.phase==='draw'&&r.state.revealed.length<Math.min(r.state.config.hints,r.state.word.replace(/[^a-z0-9]/gi,'').length-1)&&r.state.nextHint<=this.now())));if(!expired.length)return;const next=structuredClone(this.data),changed=[];for(const room of next.rooms){if(!expired.some(r=>r.id===room.id))continue;room.state=expireGame(room.game,room.state,this.now());if(room.game==='drawing'||room.state.winner!==null){this.settle(room);room.seq++;room.updatedAt=this.now();changed.push(room);}}if(changed.length){await this.persist(next);for(const room of changed)this.publish(room);}});this.queue=task.catch(()=>{});return task;}
  async execute(actor,input){
    if(!actors.includes(actor))fail('Sign in to play.','AUTH');
    if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.type!=='string')fail('Invalid command.');
    const {type,id}=input;
    if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(id))fail('Every action needs a stable ID.');
    if(type==='ping')return {type:'pong',id};
    if(type==='list')return {type:'rooms',id,rooms:this.rooms(actor),presence:this.present()};
    const hash=fingerprint(input),receipt=this.data.receipts.find(r=>r.actor===actor&&r.id===id);
    if(receipt){if(receipt.hash!==hash)fail('This action ID was already used.','DUPLICATE_ID');const r=this.data.rooms.find(r=>r.id===receipt.room);if(r&&r.players.some(p=>p.actor===actor))this.emit(actor,{type:'room',room:this.roomView(r,actor)});return {type:'ack',id,seq:receipt.seq,duplicate:true};}
    const next=structuredClone(this.data);const now=this.now();
    // Expiration removes abandoned sessions only after thirty days, never on disconnect.
    next.rooms=next.rooms.filter(r=>r.expiresAt>now);
    let room;
    if(type==='create'){
      this.limit(actor,'invite',6,60_000);
      if(!games.includes(input.game))fail('Choose a supported game.');
      if(next.rooms.filter(r=>r.status!=='finished').length>=50)fail('Finish an existing match first.');
      const raw=input.settings||{};if(typeof raw!=='object'||Array.isArray(raw))fail('Invalid match settings.');
      const settings={bestOf:[1,3,5].includes(raw.bestOf)?raw.bestOf:1,theme:['violet','ocean','rose'].includes(raw.theme)?raw.theme:'violet',setter:raw.setter===1?1:0};
      if(input.game==='drawing')Object.assign(settings,drawingSettings(raw),{bestOf:1});
      if(raw.timedSeconds!==undefined){if(!Number.isInteger(raw.timedSeconds)||raw.timedSeconds<30||raw.timedSeconds>600)fail('Choose a timer between 30 and 600 seconds.');settings.timedSeconds=raw.timedSeconds;}
      let code;do{code=randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(next.rooms.some(r=>r.code===code));
      room={id:randomBytes(16).toString('hex'),code,game:input.game,settings,players:[{actor,ready:false}],status:'lobby',seq:0,state:null,scores:[0,0],result:null,seriesWinner:null,round:1,rematchReady:[],updatedAt:now,expiresAt:now+30*86400_000};next.rooms.push(room);
    }else{
      room=type==='join'?next.rooms.find(r=>r.code===String(input.code||'').toUpperCase()):next.rooms.find(r=>r.id===input.room);
      if(!room)fail('This room is unavailable or expired.','NOT_FOUND');
      let player=room.players.findIndex(p=>p.actor===actor);
      if(type==='join'){
        if(player<0){this.limit(actor,'invite',12,60_000);if(room.status!=='lobby'||room.players.length>=2)fail('This room is already full.');room.players.push({actor,ready:false});}
      }else{
        if(player<0)fail('Join this room before playing.','FORBIDDEN');
        if(type==='sync'){this.emit(actor,{type:'room',room:this.roomView(room,actor)});return{type:'ack',id,seq:room.seq};}
        if(type==='ready'){if(room.status!=='lobby'||typeof input.ready!=='boolean')fail('Ready is only available in the lobby.');room.players[player].ready=input.ready;}
        else if(type==='start'){
          if(player!==0||room.status!=='lobby'||room.players.length!==2||!room.players.every(p=>p.ready))fail('Both players must be ready.');
          room.state=createGame(room.game,{...room.settings,now,seed:randomBytes(16).toString('hex')});room.status='playing';
        }else if(type==='move'){
          if(room.status!=='playing')fail('This match is not in progress.');
          if(room.game==='drawing')this.limit(actor,'draw',100,10000);
          if(room.game==='pool' && (room.availableAt||0)>now)fail('The balls are still moving.','SHOT_IN_PROGRESS');
          if(!Number.isInteger(input.seq)||input.seq!==room.seq)fail('Your board changed. Synchronize and try again.','STALE_STATE');
          if(!input.action||typeof input.action!=='object'||Array.isArray(input.action)||JSON.stringify(input.action).length>8000)fail('Invalid move.');
          let moved=applyAction(room.game,room.state,player,input.action,{...room.settings,now});
          if(room.game==='hangman' && input.action.type==='hint' && !room.state.personal && moved.hintUsed && !room.state.hintUsed){
            const clue=await this.hintGenerator({word:room.state.word,category:room.state.category});
            // The timer continues while Google responds. Never resurrect an expired round.
            const expired=expireGame(room.game,room.state,this.now());
            if(expired.winner!==null)moved=expired;
            else if(clue)moved.hint=`AI hint · ${clue} ${moved.hint.slice(moved.hint.lastIndexOf('Revealed letter:'))}`;
          }
          room.state=moved;
          if(room.game==='pool' && input.action.type==='shot')room.availableAt=now+Math.ceil((room.state.lastShot?.duration||0)*1000);
          this.settle(room);
        }else if(type==='rematch'){
          if(room.status!=='finished')fail('Finish this round before rematching.');
          if(!room.rematchReady.includes(actor))room.rematchReady.push(actor);
          if(room.rematchReady.length===2){if(room.seriesWinner!==null){room.scores=[0,0];room.seriesWinner=null;room.round=0;}room.round++;room.settings.setter=1-(room.settings.setter||0);room.state=createGame(room.game,{...room.settings,now,seed:randomBytes(16).toString('hex')});room.status='playing';room.result=null;room.rematchReady=[];}
        }else if(type==='react'){
          this.limit(actor,'reaction',4,10_000);if(!['♡','👏','🎉','😮','✨','👍'].includes(input.emoji))fail('Choose an available reaction.');for(const p of room.players)this.emit(p.actor,{type:'reaction',room:room.id,actor,emoji:input.emoji});return{type:'ack',id,seq:room.seq};
        }else fail('Unknown command.');
      }
      room.seq++;
    }
    room.updatedAt=now;room.expiresAt=now+30*86400_000;
    next.receipts.push({actor,id,hash,room:room.id,seq:room.seq});next.receipts=next.receipts.slice(-4096);
    await this.persist(next);this.publish(room);return{type:'ack',id,seq:room.seq,room:room.id};
  }
}
