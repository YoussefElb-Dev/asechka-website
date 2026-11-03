import { createHash, randomUUID } from 'node:crypto';
import { GitHubCameraStore, cameraKey, sealFilm, openFilm } from './camera-store.js';
import { TogetherError } from './together-store.js';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA=/^[a-f0-9]{40}$/;
export const CHUNK_SIZE=256*1024,MAX_FILE=16*1024*1024;
export const mediaTypes=['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm'];
export const vaultKey=secret=>cameraKey('asechka-vault-v1\0'+secret);
const fail=(message,status=400)=>{throw new TogetherError(message,status);};
export function vaultSummary(data,now=Date.now()){return {vaults:data.vaults.map(v=>({id:v.id,title:v.title,actor:v.actor,opensAt:v.opensAt,createdAt:v.createdAt,ready:Date.parse(v.opensAt)<=now,notes:v.notes.length,files:v.files.map(f=>({id:f.id,name:f.name,type:f.type,size:f.size}))}))};}
export function changeVault(base,input,now=Date.now()){
  if(!input||!['asnat','youssef'].includes(input.actor)||!UUID.test(input.operationId||''))fail('Choose your profile and try saving again.');
  const data=structuredClone(base),time=new Date(now).toISOString();
  if(input.action==='create'){
    const existing=data.vaults.find(v=>v.id===input.operationId);if(existing)return {data,changed:false};
    if(typeof input.title!=='string'||!input.title.trim()||input.title.length>100||!Number.isFinite(Date.parse(input.opensAt))||Date.parse(input.opensAt)<=now+60_000||Date.parse(input.opensAt)>now+20*366*86400_000||typeof input.note!=='string'||input.note.length>10_000)fail('Give your vault a title, a future date, and an optional note (up to 10,000 characters).');
    if(data.vaults.length>=100)fail('Our 100-vault collection is full.',409);
    data.vaults.push({id:input.operationId,title:input.title.trim(),actor:input.actor,opensAt:new Date(input.opensAt).toISOString(),createdAt:time,notes:input.note.trim()?[{id:randomUUID(),actor:input.actor,text:input.note.trim(),createdAt:time}]:[],files:[]});
  }else{
    const v=data.vaults.find(v=>v.id===input.vaultId);if(!v)fail('Vault not found.',404);
    if(input.action==='note'){
      if(v.notes.some(n=>n.id===input.operationId))return {data,changed:false};
      if(Date.parse(v.opensAt)<=now)fail('This vault has reached its date and is sealed against additions.',409);
      if(typeof input.note!=='string'||!input.note.trim()||input.note.length>10_000||v.notes.length>=100)fail('Write a note, up to 10,000 characters.');
      v.notes.push({id:input.operationId,actor:input.actor,text:input.note.trim(),createdAt:time});
    }else if(input.action==='file'){
      if(v.files.some(f=>f.id===input.operationId))return {data,changed:false};
      if(Date.parse(v.opensAt)<=now)fail('This vault has reached its date and is sealed against additions.',409);
      if(v.files.length>=10)fail('Each vault holds up to 10 pictures or videos.',409);
      const f=input.file;if(!f||!mediaTypes.includes(f.type)||typeof f.name!=='string'||f.name.length>150||!Number.isInteger(f.size)||f.size<=0||f.size>MAX_FILE||!Array.isArray(f.chunks)||f.chunks.length!==Math.ceil(f.size/CHUNK_SIZE)||!f.chunks.every(c=>SHA.test(c.sha)&&Number.isInteger(c.size)&&c.size>0&&c.size<=CHUNK_SIZE))fail('This file could not be saved. Choose a picture or video up to 16 MB.');
      v.files.push({id:input.operationId,actor:input.actor,createdAt:time,...f});
    }else fail('Choose a vault action.');
  }
  if(Buffer.byteLength(JSON.stringify(data))>5_000_000)fail("Our vault’s notes collection is full.",409);
  return {data,changed:true};
}
export class GitHubVaultStore extends GitHubCameraStore {
  async read(options){const stored=await this.jsonFile('private/vault.json',options);if(!stored||stored.version!==1)fail('Our vault needs recovery.',503);if(!stored.sealed)return {version:1,vaults:[]};const data=JSON.parse(openFilm(Buffer.from(stored.sealed,'base64'),vaultKey(this.secret())).toString());if(data.version!==1||!Array.isArray(data.vaults))fail('Our vault needs recovery.',503);return data;}
  async change(input){
    if(!this.writable)fail('Vault saving needs a connection.',503);
    for(let attempt=0;attempt<5;attempt++){
      const ref=await this.github('/git/ref/heads/main'),sha=ref.object?.sha;if(!SHA.test(sha||''))fail('Vault connection unavailable.',503);
      const update=changeVault(await this.read({ref:sha,fresh:true}),input,this.now());if(!update.changed)return update.data;
      const parent=await this.github(`/git/commits/${sha}`);if(!SHA.test(parent.tree?.sha||''))fail('Vault connection unavailable.',503);
      const sealed=sealFilm(Buffer.from(JSON.stringify(update.data)),vaultKey(this.secret())).toString('base64');
      const entries=[{path:'private/vault.json',mode:'100644',type:'blob',content:JSON.stringify({version:1,sealed})}];
      if(input.action==='file')input.file.chunks.forEach((c,i)=>entries.push({path:`private/vault/${input.vaultId}/${input.operationId}/${i}.bin`,mode:'100644',type:'blob',sha:c.sha}));
      const tree=await this.github('/git/trees','POST',{base_tree:parent.tree.sha,tree:entries});if(!SHA.test(tree.sha||''))fail('Vault could not be saved.',503);
      const commit=await this.github('/git/commits','POST',{message:'Seal a memory in our time vault',tree:tree.sha,parents:[sha]});if(!SHA.test(commit.sha||''))fail('Vault could not be saved.',503);
      try{await this.github('/git/refs/heads/main','PATCH',{sha:commit.sha,force:false});this.cache.clear();return update.data;}catch(e){this.cache.clear();if(e.status!==409||attempt===4)throw e;}
    }
  }
  async blob(bytes){const value=await this.github('/git/blobs','POST',{encoding:'base64',content:sealFilm(bytes,vaultKey(this.secret())).toString('base64')});if(!SHA.test(value.sha||''))fail('This file could not be saved.',503);return {sha:value.sha,size:bytes.length};}
  async chunk(file,index){const entry=file.chunks[index];if(!entry)fail('Frame not found.',404);const value=await this.github(`/git/blobs/${entry.sha}`);if(value.encoding!=='base64'||typeof value.content!=='string'||value.size>CHUNK_SIZE+100)fail('The file could not be read.',503);const bytes=openFilm(Buffer.from(value.content,'base64'),vaultKey(this.secret()));if(bytes.length!==entry.size)fail('File verification failed.',503);return bytes;}
}
