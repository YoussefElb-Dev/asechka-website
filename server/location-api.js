import { authorize, privateHeaders } from './auth.js';
import { RedisLocationStore, LocationError } from './location-store.js';
import { createHash } from 'node:crypto';
export function createLocationAPI({store=new RedisLocationStore()}={}) {
  return async request=>{
    const url=new URL(request.url);url.pathname='/api/location';url.searchParams.delete('__location');request=new Request(url,request);
    const denied=await authorize(request);
    // A sharing capability is scoped to updating/stopping its own pin. This keeps
    // an explicitly enabled background session alive after the website cookie expires.
    if(denied && (denied.status!==401 || request.method!=='POST'))return denied;
    const json=(v,status=200)=>Response.json(v,{status,headers:privateHeaders});
    try {
      if(request.method==='GET')return json(await store.view());
      if(request.method!=='POST')return json({error:'Use GET or POST.'},405);
      if(request.headers.get('origin')!==url.origin||request.headers.get('x-asechka-location')!=='1'||request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return json({error:'Please share from Asechka.'},403);
      if(Number(request.headers.get('content-length')||0)>2048)return json({error:'Too much data.'},413);
      const reader=request.body?.getReader();if(!reader)return json({error:'Choose a location action.'},400);
      let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();return json({error:'Too much data.'},413);}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
      let input;try{input=JSON.parse(Buffer.concat(chunks).toString());}catch{return json({error:'Choose a location action.'},400);}
      if(denied && !['update','stop'].includes(input?.action))return denied;
      return json(await store.change(input,createHash('sha256').update(request.headers.get('cookie')||'').digest('hex')));
    }catch(e){return json({error:e instanceof LocationError?e.message:'Our location connection needs a moment. Try again soon.'},e instanceof LocationError?e.status:503);}
  };
}
export const handleLocation=createLocationAPI();
