import { randomBytes, createHash } from 'node:crypto';
import { LocationError, validatePosition } from './location-store.js';
export const PROXIMITY_METRES=100,MAX_ACCURACY=50,PRESENCE_AGE=45_000;
const digest=v=>createHash('sha256').update(v).digest('hex');
export function nearby(a,b,now=Date.now()){
  if(!a||!b||now-a.capturedAt>PRESENCE_AGE||now-b.capturedAt>PRESENCE_AGE||a.accuracy>MAX_ACCURACY||b.accuracy>MAX_ACCURACY)return false;
  const rad=x=>x*Math.PI/180,dl=rad(b.latitude-a.latitude),dn=rad(b.longitude-a.longitude),h=Math.sin(dl/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dn/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)))<=PROXIMITY_METRES;
}
const CAS=`if (redis.call('GET',KEYS[1]) or '')~=ARGV[1] then return 0 end;redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]);return 1`;
export class VaultPresence {
  constructor({storage,now=Date.now}){this.storage=storage;this.now=now;}
  async create({vaultId,actor,deviceId,position},session){
    this.checkIdentity(actor,deviceId);const p=validatePosition({position},this.now());if(p.accuracy>MAX_ACCURACY)throw new LocationError('Move somewhere with a clearer GPS signal (accuracy within 50 m).',409);
    const token=randomBytes(32).toString('base64url'),key=this.storage.prefix+':vault:'+token,secret=randomBytes(32).toString('base64url'),now=this.now();
    const data={vaultId,secretHash:digest(secret),createdAt:now,expiresAt:now+120_000,host:{actor,deviceId,session,position:p,at:now},guest:null};
    await(await this.storage.connect()).set(key,this.storage.seal(data),{EX:120});return {challenge:token,secret,expiresAt:data.expiresAt};
  }
  checkIdentity(actor,deviceId){if(!['asnat','youssef'].includes(actor)||typeof deviceId!=='string'||!/^[\w-]{20,80}$/.test(deviceId))throw new LocationError('Choose a profile on this device first.');}
  async change(input,session){
    this.checkIdentity(input.actor,input.deviceId);if(typeof input.challenge!=='string'||!/^[\w-]{43}$/.test(input.challenge))throw new LocationError('Scan a fresh vault QR code.');
    const p=validatePosition(input,this.now()),c=await this.storage.connect(),key=this.storage.prefix+':vault:'+input.challenge;
    for(let i=0;i<5;i++){
      const raw=await c.get(key);if(!raw)throw new LocationError('The together check expired. Scan a fresh QR code.',409);const data=this.storage.open(raw),now=this.now();
      let member=data.host.session===session&&data.host.actor===input.actor&&data.host.deviceId===input.deviceId?data.host:data.guest?.session===session&&data.guest.actor===input.actor&&data.guest.deviceId===input.deviceId?data.guest:null;
      if(input.action==='join'&&!member){if(data.expiresAt<=now||now-data.createdAt>120_000||data.guest||typeof input.secret!=='string'||digest(input.secret)!==data.secretHash||data.host.actor===input.actor||data.host.deviceId===input.deviceId||data.host.session===session)throw new LocationError('Use your own profile on the other phone and scan a fresh QR.',403);if(!nearby(data.host.position,p,now))throw new LocationError('Both phones need fresh locations within 100 m, with GPS accuracy within 50 m.',409);data.guest={actor:input.actor,deviceId:input.deviceId,session,position:p,at:now};member=data.guest;}
      if(!member)throw new LocationError('This check belongs to another phone.',403);
      if(input.action==='leave'){data.expiresAt=now;await c.del(key);return {open:false};}
      member.position=p;member.at=now;
      const open=!!data.guest&&now-data.host.at<=PRESENCE_AGE&&now-data.guest.at<=PRESENCE_AGE&&nearby(data.host.position,data.guest.position,now);
      if(open)data.expiresAt=now+60_000;
      const ttl=Math.max(1,Math.ceil((data.expiresAt-now)/1000));
      if(Number(await c.eval(CAS,{keys:[key],arguments:[raw,this.storage.seal(data),String(ttl)]}))===1)return {challenge:input.challenge,vaultId:data.vaultId,open,expiresAt:data.expiresAt};
    }
    throw new LocationError('The together check changed. Try again.',409);
  }
  async authorize(token,session,vaultId){
    if(typeof token!=='string'||!/^[\w-]{43}$/.test(token))throw new LocationError('Open this vault together first.',403);
    const raw=await(await this.storage.connect()).get(this.storage.prefix+':vault:'+token),now=this.now();if(!raw)throw new LocationError('Our together session ended. Scan again.',403);const d=this.storage.open(raw);
    if(d.vaultId!==vaultId||!d.guest||d.expiresAt<=now||![d.host.session,d.guest.session].includes(session)||now-d.host.at>PRESENCE_AGE||now-d.guest.at>PRESENCE_AGE||!nearby(d.host.position,d.guest.position,now))throw new LocationError('Both phones need to stay online, nearby, and in the vault.',403);return true;
  }
}
