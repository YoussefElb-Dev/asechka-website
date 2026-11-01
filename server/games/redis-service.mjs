import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { GamesService } from './service.mjs';
import { expireGame } from './engine.mjs';

const CAS=`local old=redis.call('GET',KEYS[1]); if (old or '')~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); redis.call('PUBLISH',KEYS[2],ARGV[3]); return 1`;
const RATE=`local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n`;
const PRESENCE=`if tonumber(ARGV[2])>0 then redis.call('ZADD',KEYS[1],ARGV[1],ARGV[3]) else redis.call('ZREM',KEYS[1],ARGV[3]) end; redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[4]); redis.call('PEXPIRE',KEYS[1],90000); return redis.call('ZCARD',KEYS[1])`;
const fresh=()=>({version:1,rooms:[],receipts:[]});
const actors=['asnat','youssef'];

/** Shared durable authority for Vercel instances. Commits and pub/sub are atomic. */
export class RedisGamesService extends GamesService {
  constructor({url=process.env.REDIS_URL,prefix=process.env.GAMES_REDIS_PREFIX||(process.env.VERCEL_ENV==='preview'?`asechka:games:preview:${process.env.VERCEL_GIT_COMMIT_REF||process.env.VERCEL_URL||'default'}`:'asechka:games:v1'),now=Date.now}={}) {
    super({now});this.url=url;this.prefix=prefix;this.instance=randomUUID();this.raw='';this.localPresence=new Map();this.closing=false;
  }
  async init(){
    if(!this.url)throw new Error('Connect a persistent Redis database to this Vercel project.');
    const parsed=new URL(this.url);
    if(parsed.protocol!=='rediss:' && !(parsed.protocol==='redis:'&&['127.0.0.1','localhost','redis'].includes(parsed.hostname)))throw new Error('Games storage requires TLS.');
    this.redis=createClient({url:this.url,socket:{connectTimeout:10_000,reconnectStrategy:attempt=>Math.min(2000,100*2**Math.min(attempt,5))}});
    this.redis.on('error',()=>{});this.subscriber=this.redis.duplicate();this.subscriber.on('error',()=>{});
    try{await this.redis.connect();await this.subscriber.connect();await this.load();
      await this.subscriber.subscribe(this.prefix+':events',message=>{
        let value;try{value=JSON.parse(message);}catch{return;}
        if(value.source===this.instance||this.closing)return;
        const task=this.queue.then(async()=>{await this.load();await this.refreshPresence(false);this.announce();});this.queue=task.catch(()=>{});
      });
      this.refreshTimer=setInterval(()=>{if(this.closing)return;const task=this.queue.then(async()=>{await this.load();await this.refreshPresence(true);this.announce();});this.queue=task.catch(()=>{});},15_000);this.refreshTimer.unref();
      return this;
    }catch(error){this.redis.destroy();this.subscriber.destroy();throw error;}
  }
  async load(){const raw=await this.redis.get(this.prefix+':state');const value=raw?JSON.parse(raw):fresh();if(value.version!==1||!Array.isArray(value.rooms)||!Array.isArray(value.receipts))throw new Error('The game store needs recovery.');this.raw=raw||'';this.data=value;}
  async persist(next){const raw=JSON.stringify(next);const committed=await this.redis.eval(CAS,{keys:[this.prefix+':state',this.prefix+':events'],arguments:[this.raw,raw,JSON.stringify({source:this.instance,kind:'state'})]});if(Number(committed)!==1)throw Object.assign(new Error('Another server committed first.'),{code:'CAS_RETRY'});this.raw=raw;this.data=next;}
  // Account limits are enforced once, across all instances, before CAS retries.
  limit(){}
  async accountLimit(actor,input){let max=0,window=0,kind='';if(input?.type==='create'){max=6;window=60_000;kind='invite';}else if(input?.type==='join'){max=12;window=60_000;kind='join';}else if(input?.type==='react'){max=4;window=10_000;kind='react';}if(!max)return;const count=await this.redis.eval(RATE,{keys:[`${this.prefix}:rate:${actor}:${kind}`],arguments:[String(window)]});if(Number(count)>max)throw Object.assign(new Error('Please give that a moment.'),{code:'RATE_LIMIT'});}
  command(actor,input){
    if(input?.type==='ping')return super.execute(actor,input);
    const task=this.queue.then(async()=>{
      let limited=false;
      for(let attempt=0;attempt<8;attempt++){
        await this.load();await this.refreshPresence(false);
        if(!limited&&!this.data.receipts.some(r=>r.actor===actor&&r.id===input?.id)){await this.accountLimit(actor,input);limited=true;}
        try{return await super.execute(actor,input);}catch(error){if(error.code!=='CAS_RETRY')throw error;}
      }
      throw Object.assign(new Error('The room is busy. Synchronize and retry the same action.'),{code:'RETRY'});
    });this.queue=task.catch(()=>{});return task;
  }
  online(actor,delta){this.localPresence.set(actor,Math.max(0,(this.localPresence.get(actor)||0)+delta));const task=this.queue.then(async()=>{await this.refreshPresence(true);this.announce();});this.queue=task.catch(()=>{});}
  async refreshPresence(notify){
    const now=Date.now();let changed=false;
    for(const actor of actors){const count=Number(await this.redis.eval(PRESENCE,{keys:[`${this.prefix}:presence:${actor}`],arguments:[String(now+45_000),String(this.localPresence.get(actor)||0),this.instance,String(now)]}));if((this.presence.get(actor)||0)!==count)changed=true;this.presence.set(actor,count);}
    if(notify&&changed)await this.redis.publish(this.prefix+':events',JSON.stringify({source:this.instance,kind:'presence'}));
  }
  tick(){const task=this.queue.then(async()=>{
    for(let attempt=0;attempt<8;attempt++){
      await this.load();const next=structuredClone(this.data),changed=[];
      for(const room of next.rooms){if(room.status!=='playing'||room.state?.deadline===undefined||room.state.deadline>this.now())continue;room.state=expireGame(room.game,room.state,this.now());if(room.state.winner!==null){this.settle(room);room.seq++;room.updatedAt=this.now();changed.push(room);}}
      if(!changed.length)return;
      try{await this.persist(next);for(const room of changed)this.publish(room);return;}catch(error){if(error.code!=='CAS_RETRY')throw error;}
    }
  });this.queue=task.catch(()=>{});return task;}
  async close(){this.closing=true;clearInterval(this.refreshTimer);await this.queue;this.localPresence.clear();try{await this.refreshPresence(true);}finally{if(this.subscriber.isOpen)await this.subscriber.close();if(this.redis.isOpen)await this.redis.close();}}
}
