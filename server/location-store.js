import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { createClient } from 'redis';

export const LOCATION_TTL = 300;
export const LIVE_AGE = 60_000;
// Consent stays enabled until stopped. Individual positions expire after five minutes.
export const SHARE_DURATION = null;
const actors = ['asnat', 'youssef'];
const hash = value => createHash('sha256').update(value).digest('hex');
const CAS = `local owner=redis.call('GET',KEYS[1]); if (owner or '')~=ARGV[1] then return 0 end; if ARGV[2]=='' then redis.call('DEL',KEYS[1],KEYS[2]) else local old=redis.call('GET',KEYS[2]); if old and tonumber(cjson.decode(old).capturedAt)>tonumber(ARGV[4]) then return -1 end; redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3]) end; return 1`;
const START = `redis.call('SET',KEYS[1],ARGV[1]);redis.call('DEL',KEYS[2]);return 1`;
export class LocationError extends Error { constructor(message, status=400) { super(message); this.status=status; } }
export function validatePosition(input, now=Date.now()) {
  const p=input?.position;
  if (!p || !Number.isFinite(p.latitude) || Math.abs(p.latitude)>90 || !Number.isFinite(p.longitude) || Math.abs(p.longitude)>180 || !Number.isFinite(p.accuracy) || p.accuracy<0 || p.accuracy>100_000 || !Number.isSafeInteger(p.capturedAt) || p.capturedAt<now-90_000 || p.capturedAt>now+10_000) throw new LocationError('Waiting for a fresh location. Check location permission and try again.');
  return {latitude:p.latitude,longitude:p.longitude,accuracy:Math.round(p.accuracy),capturedAt:p.capturedAt};
}
export class RedisLocationStore {
  constructor({url=process.env.REDIS_URL, prefix=process.env.VERCEL_ENV==='preview' ? `asechka:location:preview:${process.env.VERCEL_GIT_COMMIT_REF || 'default'}` : 'asechka:location:v1', secret=()=>process.env.SESSION_SECRET, now=Date.now, client}={}) {Object.assign(this,{url,prefix,secret,now,client});}
  key(){const secret=this.secret();if(!secret || secret.length<32)throw new Error('Location encryption is unavailable.');return createHash('sha256').update('asechka-location-v1\0'+secret).digest();}
  seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key(),iv);cipher.setAAD(Buffer.from(this.prefix));const encrypted=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');}
  open(raw){if(!raw)return null;const b=Buffer.from(raw,'base64'),cipher=createDecipheriv('aes-256-gcm',this.key(),b.subarray(0,12));cipher.setAAD(Buffer.from(this.prefix));cipher.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString());}
  async connect(){
    if(this.client)return this.client;
    if(!this.connecting)this.connecting=(async()=>{if(!this.url)throw new Error('Location storage is unavailable.');const url=new URL(this.url);if(url.protocol!=='rediss:' && !(url.protocol==='redis:'&&['localhost','127.0.0.1','redis'].includes(url.hostname)))throw new Error('Location storage needs TLS.');const c=createClient({url:this.url,socket:{connectTimeout:5000,reconnectStrategy:false}});c.on('error',()=>{});await c.connect();this.client=c;return c;})().catch(e=>{this.connecting=null;throw e;});
    return this.connecting;
  }
  async view(){const c=await this.connect(),now=this.now(),owners=await c.mGet(actors.map(a=>`${this.prefix}:${a}`)),points=await c.mGet(actors.map(a=>`${this.prefix}:${a}:point`));return {serverTime:now,people:actors.map((actor,i)=>{const owner=this.open(owners[i]);if(!owner)return {actor,sharing:false,live:false};const point=points[i]?this.open(JSON.parse(points[i]).cipher):null;return {actor,sharing:true,live:!!point&&now-point.position.capturedAt<=LIVE_AGE,...(point?point:{})};})};}
  async owner(actor){const c=await this.connect();return this.open(await c.get(`${this.prefix}:${actor}`));}
  async change(input, sessionHash=''){
    if(!input || !actors.includes(input.actor) || !['start','update','stop'].includes(input.action))throw new LocationError('Choose your profile and a location action.');
    const c=await this.connect(),key=`${this.prefix}:${input.actor}`,now=this.now();
    if(input.action==='start') {
      const token=randomBytes(32).toString('base64url'),value={sessionHash,tokenHash:hash(token),startedAt:now};
      await c.eval(START,{keys:[key,key+':point'],arguments:[this.seal(value)]});return {...await this.view(),token};
    }
    if(typeof input.token!=='string'||!/^[\w-]{43}$/.test(input.token))throw new LocationError('Start sharing from this device first.',409);
    const position=input.action==='update'?validatePosition(input,now):null;
    const raw=await c.get(key),owner=this.open(raw);
    if(!owner||owner.tokenHash!==hash(input.token))throw new LocationError('Sharing ended or moved to another device. Tap Share to start again.',409);
    const next=position?JSON.stringify({capturedAt:position.capturedAt,cipher:this.seal({position,receivedAt:now})}):'';
    const result=Number(await c.eval(CAS,{keys:[key,key+':point'],arguments:[raw,next,String(LOCATION_TTL),String(position?.capturedAt||0)]}));
    if(result!==1)throw new LocationError(result===-1?'An older location was ignored.':'Sharing changed on another device. Tap Share to start again.',409);
    return this.view();
  }
}
