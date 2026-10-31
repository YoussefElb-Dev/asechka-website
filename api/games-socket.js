import { createServer } from 'node:http';
import { startGamesServer } from '../server/games/server.mjs';
import { RedisGamesService } from '../server/games/redis-service.mjs';

// Vercel's Node HTTP-server export supports WebSocket upgrades with Fluid compute.
// Never substitute ephemeral filesystem or in-memory authority in this endpoint.
let endpoint;
if(process.env.REDIS_URL){
  const service=await new RedisGamesService().init();
  endpoint=(await startGamesServer({service,listen:false,path:'/api/games-socket'})).server;
}else{
  endpoint=createServer((_,res)=>{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Connect a persistent Redis database to enable multiplayer.'}));});
  endpoint.on('upgrade',(_,socket)=>socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'));
}
export default endpoint;
