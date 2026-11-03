import { createHash } from 'node:crypto';
import { authorize, privateHeaders } from './auth.js';
import { RedisLocationStore, LocationError } from './location-store.js';
import { VaultPresence } from './vault-presence.js';
import { GitHubVaultStore,vaultSummary,CHUNK_SIZE,MAX_FILE,mediaTypes } from './vault-store.js';
import { TogetherError } from './together-store.js';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const digest=v=>createHash('sha256').update(v).digest('hex');
export function createVaultAPI({collection=new GitHubVaultStore(),storage=new RedisLocationStore(),presence=new VaultPresence({storage}),now=Date.now}={}){
  return async request=>{
    const url=new URL(request.url);url.pathname='/api/vault';url.searchParams.delete('__vault');request=new Request(url,request);const denied=await authorize(request);if(denied)return denied;
    const json=(v,status=200)=>Response.json(v,{status,headers:privateHeaders}),session=digest(request.headers.get('cookie')||'');
    const find=async id=>{if(!UUID.test(id||''))throw new LocationError('Vault not found.',404);const d=await collection.read({fresh:true}),v=d.vaults.find(v=>v.id===id);if(!v)throw new LocationError('Vault not found.',404);return {d,v};};
    const unlocked=async(id,token)=>{const value=await find(id);if(Date.parse(value.v.opensAt)>now())throw new LocationError('This vault has not reached its opening date.',403);await presence.authorize(token,session,id);return value;};
    try{
      if(request.method==='GET'){
        if(url.searchParams.has('open')){const {v}=await unlocked(url.searchParams.get('open'),request.headers.get('x-asechka-vault-grant'));return json({vault:{...v,files:v.files.map(({chunks,...f})=>({...f,chunkCount:chunks.length}))}});}
        if(url.searchParams.has('file')){const {v}=await unlocked(url.searchParams.get('vault'),request.headers.get('x-asechka-vault-grant')),f=v.files.find(f=>f.id===url.searchParams.get('file')),index=Number(url.searchParams.get('chunk'));if(!f||!Number.isInteger(index)||index<0||index>=f.chunks.length)throw new LocationError('File not found.',404);const bytes=await collection.chunk(f,index);await presence.authorize(request.headers.get('x-asechka-vault-grant'),session,v.id);return new Response(bytes,{headers:{...privateHeaders,'Content-Type':'application/octet-stream'}});}
        return json({...vaultSummary(await collection.read({fresh:true}),now()),serverTime:now(),writable:collection.writable});
      }
      if(request.method!=='POST')return json({error:'Use GET or POST.'},405);
      if(Number(request.headers.get('content-length')||0)>370000)return json({error:'Upload this file in smaller pieces.'},413);
      const reader=request.body?.getReader();if(!reader)return json({error:'Choose a vault action.'},400);let size=0;const parts=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>370000){await reader.cancel();return json({error:'Upload this file in smaller pieces.'},413);}parts.push(Buffer.from(value));}}finally{reader.releaseLock();}
      let input;try{input=JSON.parse(Buffer.concat(parts).toString());}catch{return json({error:'Choose a vault action.'},400);}
      if(!input||!['asnat','youssef'].includes(input.actor))throw new LocationError('Choose your profile.');
      if(input.action==='challenge'){const {v}=await find(input.vaultId);if(Date.parse(v.opensAt)>now())throw new LocationError('Wait until the vault’s opening date.',403);return json(await presence.create(input,session));}
      if(['join','pulse','leave'].includes(input.action))return json(await presence.change(input,session));
      if(['create','note'].includes(input.action))return json({...vaultSummary(await collection.change(input),now()),serverTime:now(),writable:true});
      if(!['upload','finishUpload'].includes(input.action)||!UUID.test(input.fileId||'')||!UUID.test(input.vaultId||''))throw new LocationError('Choose a vault action.');
      const {d,v}=await find(input.vaultId);if(v.files.some(f=>f.id===input.fileId))return json({...vaultSummary(d,now()),complete:true});
      if(Date.parse(v.opensAt)<=now())throw new LocationError('The date has arrived. This vault is sealed against additions.',409);
      if(v.files.length>=10)throw new LocationError('Each vault holds 10 pictures or videos.',409);
      const f=input.file;if(!f||!mediaTypes.includes(f.type)||typeof f.name!=='string'||f.name.length>150||!Number.isInteger(f.size)||f.size<=0||f.size>MAX_FILE)throw new LocationError('Choose a supported picture or video up to 16 MB.');
      const c=await storage.connect(),prefix=`${storage.prefix}:upload:${session}:${input.vaultId}:${input.fileId}`,meta={vaultId:input.vaultId,actor:input.actor,file:f},manifest=JSON.stringify(meta),old=await c.get(prefix+':meta');
      if(old&&JSON.stringify(storage.open(old))!==manifest)throw new LocationError('This upload changed. Choose the file again.',409);
      if(!old){const accepted=await c.set(prefix+':meta',storage.seal(meta),{EX:3600,NX:true});if(!accepted&&JSON.stringify(storage.open(await c.get(prefix+':meta')))!==manifest)throw new LocationError('This upload changed. Choose the file again.',409);}
      const count=Math.ceil(f.size/CHUNK_SIZE);
      if(input.action==='upload'){
        if(!Number.isInteger(input.index)||input.index<0||input.index>=count||typeof input.bytes!=='string'||input.bytes.length>Math.ceil(CHUNK_SIZE/3)*4||! /^[A-Za-z0-9+/]+={0,2}$/.test(input.bytes))throw new LocationError('This file piece is invalid.');
        const bytes=Buffer.from(input.bytes,'base64'),expected=input.index===count-1?f.size-input.index*CHUNK_SIZE:CHUNK_SIZE;if(bytes.length!==expected||bytes.toString('base64')!==input.bytes)throw new LocationError('This file piece is incomplete.');
        const key=prefix+':'+input.index,oldChunk=await c.get(key);if(oldChunk&&storage.open(oldChunk).hash!==digest(bytes))throw new LocationError('This piece was already uploaded with different contents.',409);
        if(!oldChunk){const accepted=await c.set(key,storage.seal({hash:digest(bytes),bytes:input.bytes}),{EX:3600,NX:true});if(!accepted&&storage.open(await c.get(key)).hash!==digest(bytes))throw new LocationError('This piece changed during upload. Choose the file again.',409);}return json({uploaded:input.index+1,total:count});
      }
      const chunks=[];for(let i=0;i<count;i++){const raw=await c.get(prefix+':'+i);if(!raw)throw new LocationError('An upload piece expired. Choose the file again.',409);const chunk=storage.open(raw),bytes=Buffer.from(chunk.bytes,'base64'),expected=i===count-1?f.size-i*CHUNK_SIZE:CHUNK_SIZE;if(digest(bytes)!==chunk.hash||bytes.length!==expected)throw new LocationError('Upload verification failed.',503);chunks.push(bytes);}
      const refs=[];for(let i=0;i<chunks.length;i+=4)refs.push(...await Promise.all(chunks.slice(i,i+4).map(bytes=>collection.blob(bytes))));
      const result=await collection.change({action:'file',actor:input.actor,operationId:input.fileId,vaultId:input.vaultId,file:{...f,chunks:refs}});
      await c.del([prefix+':meta',...Array.from({length:count},(_,i)=>prefix+':'+i)]);
      return json({...vaultSummary(result,now()),complete:true});
    }catch(e){return json({error:e instanceof LocationError||e instanceof TogetherError?e.message:'Our time vault needs a moment. Your sealed memories are safe.'},e instanceof LocationError||e instanceof TogetherError?e.status:503);}
  };
}
export const handleVault=createVaultAPI();
