import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { UUID, photoPath, dailyMemory } from './daily-memory.js';
const repo = 'https://api.github.com/repos/YoussefElb-Dev/asechka-website';
const SHA = /^[a-f0-9]{40}$/;
const PHOTO_LIMIT = 320000;
export class TogetherError extends Error {
  constructor(message,status=503){super(message);this.status=status;}
}
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function checkedTogether(data){
  const ids = new Set();
  if(!data || data.version!==1 || !Array.isArray(data.bucketList) || data.bucketList.length>200 || !data.hearts) throw new TogetherError('Our little plans couldn’t be read. Nothing has been changed.');
  for(const item of data.bucketList){
    if(!UUID.test(item.id) || ids.has(item.id) || !UUID.test(item.revision) || typeof item.title!=='string' || !item.title.trim() || item.title.length>140 ||
      typeof item.note!=='string' || item.note.length>1000 || typeof item.place!=='string' || item.place.length>140 || typeof item.completed!=='boolean' ||
      !timestamp(item.createdAt) || !(item.completedAt===null || timestamp(item.completedAt)) || !(item.photoId===null || UUID.test(item.photoId))) throw new TogetherError('Our little plans couldn’t be read. Nothing has been changed.');
    ids.add(item.id);
  }
  for(const who of ['me','asechka']){
    const heart=data.hearts[who];
    if(heart!==null && (!heart || !UUID.test(heart.id) || !timestamp(heart.sentAt))) throw new TogetherError('Our little hearts couldn’t be read. Nothing has been changed.');
  }
  return data;
}
export function checkedPhoto(value){
  if(typeof value!=='string' || !value.startsWith('data:image/jpeg;base64,') || value.length>Math.ceil(PHOTO_LIMIT/3)*4+30) throw new TogetherError('Choose a JPG, PNG, or WebP photo and try again.',400);
  const encoded=value.slice(23);
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length%4!==0) throw new TogetherError('This photo couldn’t be read. Choose it again.',400);
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.length<20 || bytes.length>PHOTO_LIMIT || bytes[0]!==255 || bytes[1]!==216 || bytes.at(-2)!==255 || bytes.at(-1)!==217) throw new TogetherError('This photo couldn’t be read. Choose it again.',400);
  let position=2, dimensions;
  while(position+4<bytes.length){
    if(bytes[position]!==255) break;
    const marker=bytes[position+1];
    if(marker===218 || marker===217) break;
    if(marker===255){position++;continue;}
    const length=bytes.readUInt16BE(position+2);
    if(length<2 || position+2+length>bytes.length) break;
    if([192,193,194].includes(marker) && length>=8){dimensions={height:bytes.readUInt16BE(position+5),width:bytes.readUInt16BE(position+7)};break;}
    position+=length+2;
  }
  if(!dimensions || dimensions.width<1 || dimensions.height<1 || dimensions.width>2000 || dimensions.height>2000) throw new TogetherError('This photo couldn’t be read. Choose it again.',400);
  return bytes;
}
export function checkedTogetherChange(input){
  const actions=['saveItem','toggleItem','removeItem','sendHeart'];
  if(!input || !actions.includes(input.action) || !UUID.test(input.operationId)) throw new TogetherError('Please try that little change again.',400);
  if(input.action==='sendHeart'){
    if(!['me','asechka'].includes(input.from)) throw new TogetherError('Choose who is sending this little heart.',400);
    return {action:input.action,operationId:input.operationId,from:input.from};
  }
  if(!UUID.test(input.id) || !(input.expectedRevision===null || UUID.test(input.expectedRevision))) throw new TogetherError('Choose a plan and try again.',400);
  const change={action:input.action,id:input.id,operationId:input.operationId,expectedRevision:input.expectedRevision};
  if(input.action!=='removeItem'){
    if(typeof input.completed!=='boolean') throw new TogetherError('Choose whether this plan is complete.',400);
    change.completed=input.completed;
  }
  if(input.action==='saveItem'){
    for(const [key,max] of [['title',140],['place',140],['note',1000]]) if(typeof input[key]!=='string' || input[key].length>max) throw new TogetherError('Keep the title and place under 140 characters, and the note under 1,000.',400);
    if(!input.title.trim()) throw new TogetherError('Give your little plan a title.',400);
    Object.assign(change,{title:input.title.trim(),place:input.place.trim(),note:input.note.trim()});
    if(input.photo!==undefined){
      if(!input.completed) throw new TogetherError('Mark this plan complete to add your memory photo.',400);
      change.photo=checkedPhoto(input.photo);
    }
  }
  return change;
}
export function changeTogether(base,change,now=new Date()){
  checkedTogether(base);
  const data=structuredClone(base), time=now.toISOString();
  if(change.action==='sendHeart'){
    const last=data.hearts[change.from];
    if(last?.id===change.operationId) return {data:base,changed:false};
    if(last && now.getTime()-Date.parse(last.sentAt)<5000) throw new TogetherError('Your little heart is already on its way. Give it a few seconds.',429);
    data.hearts[change.from]={id:change.operationId,sentAt:time};
  }else{
    const index=data.bucketList.findIndex(item=>item.id===change.id), current=data.bucketList[index];
    if(current?.revision===change.operationId || change.action==='removeItem' && !current) return {data:base,changed:false};
    if((current?.revision ?? null)!==change.expectedRevision) throw new TogetherError('This plan just changed on the other screen. Refresh it and try again.',409);
    if(change.action==='removeItem') data.bucketList.splice(index,1);
    else if(change.action==='toggleItem'){
      if(!current) throw new TogetherError('This little plan has moved. Refresh the list.',409);
      if(current.completed===change.completed) return {data:base,changed:false};
      Object.assign(current,{completed:change.completed,completedAt:change.completed ? time : null,revision:change.operationId});
    }else{
      if(!current && data.bucketList.length>=200) throw new TogetherError('Our list is full of lovely plans. Finish or remove one before adding another.',400);
      const item={id:change.id,title:change.title,note:change.note,place:change.place,completed:change.completed,
        createdAt:current?.createdAt || time,completedAt:change.completed ? current?.completedAt || time : null,
        revision:change.operationId,photoId:change.photo ? change.operationId : current?.photoId || null};
      if(current) data.bucketList[index]=item; else data.bucketList.push(item);
    }
  }
  data.updatedAt=time;
  return {data,changed:true};
}
export class GitHubTogetherStore{
  constructor({token=()=>process.env.MUSIC_GITHUB_TOKEN,fetcher=fetch,now=()=>Date.now(),fallback=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8')}={}){
    this.token=token;this.fetcher=fetcher;this.now=now;this.fallback=fallback;this.cache=new Map();this.photos=new Map();
  }
  get writable(){return !!this.token();}
  async github(path,method='GET',body){
    let response;
    try{response=await this.fetcher(repo+path,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${this.token()}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','Content-Type':'application/json','User-Agent':'Asechka-Together'},...(body?{body:JSON.stringify(body)}:{})});}
    catch{throw new TogetherError('Our shared connection is taking a little longer. Please try again.');}
    if(!response.ok){
      if(method==='PATCH' && [409,422].includes(response.status)) throw new TogetherError('Our plans changed while we were saving.',409);
      throw new TogetherError('Our shared connection needs a little attention. Your memories are safe.');
    }
    try{return await response.json();}catch{throw new TogetherError('Our shared connection couldn’t be read. Try again shortly.');}
  }
  async file(path,ref='main'){
    const file=await this.github(`/contents/${path}?ref=${ref}`);
    if(file.type!=='file' || file.encoding!=='base64' || typeof file.content!=='string' || file.size>2000000 || !SHA.test(file.sha)) throw new TogetherError('This little memory couldn’t be read. Nothing has been changed.');
    return Buffer.from(file.content,'base64');
  }
  async jsonFile(path,{ref='main',fresh=false}={}){
    if(!this.writable) return JSON.parse(await this.fallback(path));
    const cached=this.cache.get(path);
    if(ref==='main' && !fresh && cached?.until>this.now()) return structuredClone(cached.data);
    let data;
    try{data=JSON.parse((await this.file(path,ref)).toString('utf8'));}catch(error){if(error instanceof TogetherError)throw error;throw new TogetherError('Our saved memories couldn’t be read. Nothing has been changed.');}
    if(ref==='main') this.cache.set(path,{data,until:this.now()+5000});
    return data;
  }
  async read(options){return checkedTogether(await this.jsonFile('dist/together.json',options));}
  async memory(){
    const [memories,music]=await Promise.all([this.jsonFile('dist/memories.json'),this.jsonFile('dist/music.json')]);
    return dailyMemory(memories,music,new Date(this.now()));
  }
  async photo(kind,id){
    if(!UUID.test(id) || !['bucket','memory'].includes(kind)) throw new TogetherError('This picture couldn’t be found.',404);
    let path;
    if(kind==='bucket'){
      if(!(await this.read()).bucketList.some(item=>item.photoId===id)) throw new TogetherError('This picture couldn’t be found.',404);
      path=`dist/assets/bucket/${id}.jpg`;
    }else{
      const photo=(await this.jsonFile('dist/memories.json')).photos?.find(photo=>photo.id===id && photoPath.test(photo.src));
      if(!photo)throw new TogetherError('This picture couldn’t be found.',404);
      path=`dist/${photo.src}`;
    }
    const cached=this.photos.get(path);
    if(cached) return cached;
    const bytes=this.writable ? await this.file(path) : await readFile(new URL(`../${path}`,import.meta.url));
    const image={bytes,type:path.endsWith('.png')?'image/png':path.endsWith('.webp')?'image/webp':'image/jpeg'};
    if(this.photos.size>=10)this.photos.delete(this.photos.keys().next().value);
    this.photos.set(path,image);
    return image;
  }
  async change(input){
    if(!this.writable) throw new TogetherError('Shared saving is still being connected. Try again shortly.');
    const change=checkedTogetherChange(input);
    let photoBlob;
    for(let attempt=0;attempt<3;attempt++){
      const ref=await this.github('/git/ref/heads/main'), sha=ref.object?.sha;
      if(!SHA.test(sha))throw new TogetherError('Our shared connection couldn’t be read. Nothing has been changed.');
      const base=await this.read({ref:sha,fresh:true});
      const update=changeTogether(base,change,new Date(this.now()));
      if(!update.changed)return base;
      const parent=await this.github(`/git/commits/${sha}`);
      if(!SHA.test(parent.tree?.sha))throw new TogetherError('Our shared connection couldn’t be read. Nothing has been changed.');
      const entries=[{path:'dist/together.json',mode:'100644',type:'blob',content:JSON.stringify(update.data,null,2)+'\n'}];
      if(change.photo){
        photoBlob ||= await this.github('/git/blobs','POST',{encoding:'base64',content:change.photo.toString('base64')});
        if(!SHA.test(photoBlob.sha))throw new TogetherError('Your picture couldn’t be saved. Please try again.');
        entries.push({path:`dist/assets/bucket/${change.operationId}.jpg`,mode:'100644',type:'blob',sha:photoBlob.sha});
      }
      const previousPhoto=base.bucketList.find(item=>item.id===change.id)?.photoId;
      if(previousPhoto && (change.action==='removeItem' || change.photo)) entries.push({path:`dist/assets/bucket/${previousPhoto}.jpg`,mode:'100644',type:'blob',sha:null});
      const tree=await this.github('/git/trees','POST',{base_tree:parent.tree.sha,tree:entries});
      if(!SHA.test(tree.sha))throw new TogetherError('Our little plans couldn’t be saved. Please try again.');
      const commit=await this.github('/git/commits','POST',{message:change.action==='sendHeart'?'Leave a little thinking-of-you heart':change.action==='removeItem'?'Remove a little shared plan':'Save a little shared plan',tree:tree.sha,parents:[sha]});
      if(!SHA.test(commit.sha))throw new TogetherError('Our little plans couldn’t be saved. Please try again.');
      try{
        await this.github('/git/refs/heads/main','PATCH',{sha:commit.sha,force:false});
        this.cache.clear();
        return update.data;
      }catch(error){this.cache.clear();if(!(error instanceof TogetherError) || error.status!==409 || attempt===2)throw error;}
    }
  }
}
