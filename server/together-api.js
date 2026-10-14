import { authorize, privateHeaders } from './auth.js';
import { GitHubTogetherStore, TogetherError } from './together-store.js';
const store=new GitHubTogetherStore();
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...privateHeaders,'Content-Type':'application/json; charset=utf-8',...(status===429?{'Retry-After':'5'}:{})}});
export function createTogetherAPI({favorites=store}={}){
  return async request=>{
    const denied=await authorize(request);if(denied)return denied;
    try{
      const url=new URL(request.url);
      if(url.pathname==='/api/daily-memory'){
        if(request.method!=='GET')return json({error:'Method not allowed.'},405);
        return json(await favorites.memory());
      }
      if(url.pathname==='/api/together-photo'){
        if(request.method!=='GET')return json({error:'Method not allowed.'},405);
        const photo=await favorites.photo(url.searchParams.get('kind'),url.searchParams.get('id'));
        return new Response(photo.bytes,{headers:{...privateHeaders,'Content-Type':photo.type}});
      }
      if(url.pathname!=='/api/together')return json({error:'Not found.'},404);
      if(request.method==='GET')return json({...await favorites.read(),writable:favorites.writable});
      if(request.method!=='POST')return json({error:'Method not allowed.'},405);
      if(Number(request.headers.get('content-length') || 0)>440000)return json({error:'That picture is a little too big. Choose it again.'},413);
      const body=await request.text();
      if(Buffer.byteLength(body,'utf8')>440000)return json({error:'That picture is a little too big. Choose it again.'},413);
      let input;try{input=JSON.parse(body);}catch{return json({error:'Please try that little change again.'},400);}
      return json({...await favorites.change(input),writable:true});
    }catch(error){return json({error:error instanceof TogetherError?error.message:'Our little memories are taking a break. Try again shortly.'},error instanceof TogetherError?error.status:503);}
  };
}
export const handleTogether=createTogetherAPI();
