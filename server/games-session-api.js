import { authorize, privateHeaders } from './auth.js';
import { issueTicket, ticketSecret } from './games/tickets.mjs';
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...privateHeaders, 'Content-Type': 'application/json; charset=utf-8' } });
const attempts = new Map();
export async function handleGamesSession(request) {
  const denied = await authorize(request);
  if (denied) return denied;
  if (request.method !== 'POST') return json({error:'Use POST to connect.'}, 405);
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('x-asechka-games') !== '1' || !request.headers.get('content-type')?.startsWith('application/json')) return json({error:'Connect from Asechka.'},403);
  try {
    if (Number(request.headers.get('content-length') || 0) > 1024) return json({error:'Request too large.'},413);
    const reader=request.body?.getReader(); let size=0;const chunks=[];
    if (!reader) return json({error:'Choose a profile.'},400);
    try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024){await reader.cancel();return json({error:'Request too large.'},413);}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!input || !['asnat','youssef'].includes(input.actor) || Object.keys(input).some(k=>k!=='actor')) return json({error:'Choose your Asechka profile.'},400);
    const key=request.headers.get('cookie');const now=Date.now();
    for(const [k,v] of attempts)if(now-v.at>60_000)attempts.delete(k);
    const entry=attempts.get(key)||{at:now,count:0};entry.count++;attempts.set(key,entry);
    if(entry.count>30)return json({error:'Please wait a moment before reconnecting.'},429);
    const url=process.env.GAMES_WS_URL || (process.env.REDIS_URL ? new URL('/api/games-socket',request.url).href.replace(/^http/,'ws') : undefined); const secret=ticketSecret();
    if (!url || !secret || secret.length<32) return json({error:'Games need a configured real-time service. See mobile/GAMES.md.'},503);
    const parsed=new URL(url);
    if (parsed.protocol!=='wss:' && !(process.env.NODE_ENV!=='production' && parsed.protocol==='ws:' && ['127.0.0.1','localhost','10.0.2.2'].includes(parsed.hostname))) return json({error:'Games require a secure server address.'},503);
    return json({ticket:issueTicket(input.actor,secret),url,expiresIn:900});
  } catch {return json({error:'Could not connect to games. Please try again.'},400);}
}
