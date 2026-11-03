/** Deterministic Redis contract fixture with TTL and compare-and-set semantics. */
export class EphemeralRedis {
  constructor(now=Date.now){this.now=now;this.values=new Map();}
  async get(key){const v=this.values.get(key);if(v?.until && v.until<=this.now()){this.values.delete(key);return null;}return v?.value??null;}
  async set(key,value,options={}){if(options.NX&&await this.get(key))return null;this.values.set(key,{value,until:options.EX?this.now()+options.EX*1000:null});return 'OK';}
  async mGet(keys){return Promise.all(keys.map(k=>this.get(k)));}
  async del(keys,...more){for(const key of Array.isArray(keys)?keys:[keys,...more])this.values.delete(key);return 1;}
  async eval(script,{keys,arguments:a}){
    if(script.includes("redis.call('SET',KEYS[1],ARGV[1])")){await this.set(keys[0],a[0]);await this.del(keys[1]);return 1;}
    if((await this.get(keys[0])||'')!==a[0])return 0;
    if(keys.length===2){if(a[1]===''){await this.del(keys);return 1;}const old=await this.get(keys[1]);if(old&&JSON.parse(old).capturedAt>Number(a[3]))return -1;await this.set(keys[1],a[1],{EX:Number(a[2])});return 1;}
    await this.set(keys[0],a[1],{EX:Number(a[2])});return 1;
  }
}
