import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { GamesService } from './service.mjs';
import { verifyTicket, ticketSecret } from './tickets.mjs';

export async function startGamesServer({port=Number(process.env.GAMES_PORT||8787),host=process.env.GAMES_HOST||'127.0.0.1',secret=ticketSecret(),directory=process.env.GAMES_DATA_DIR||resolve('.games-data'),allowedOrigins=(process.env.GAMES_ALLOWED_ORIGINS||'https://asechka-website.vercel.app').split(','),service:providedService=null,listen=true,path='/games'}={}){
  if(typeof secret!=='string'||secret.length<32)throw new Error('Set GAMES_TOKEN_SECRET to at least 32 random characters.');
  const service=providedService || await new GamesService({directory}).init();
  const server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.writeHead(req.url==='/health'?200:404);res.end(JSON.stringify(req.url==='/health'?{ok:true,protocol:1}:{error:'Not found'}));});
  const wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!==path||(req.headers.origin&&!allowedOrigins.includes(req.headers.origin))||wss.clients.size>=200){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  const send=(ws,value)=>{if(ws.readyState===WebSocket.OPEN){if(ws.bufferedAmount>2_000_000){ws.close(1013,'Slow connection; reconnect to restore.');return;}ws.send(JSON.stringify(value));}};
  wss.on('connection',ws=>{
    let actor=null,expires=0,alive=true,count=0,window=Date.now();
    const timeout=setTimeout(()=>{if(!actor)ws.close(1008,'Authentication required.');},5000);timeout.unref();
    const unsubscribe=service.onEvent((recipient,event)=>{if(recipient===actor)send(ws,event);});
    ws.on('pong',()=>{alive=true;});
    ws.on('error',()=>{});
    ws.on('message',async(bytes,isBinary)=>{
      let input;
      try{
        if(isBinary)throw new Error('Use JSON text messages.');
        if(Date.now()-window>10_000){count=0;window=Date.now();}if(++count>120){ws.close(1008,'Too many messages.');return;}
        input=JSON.parse(bytes.toString('utf8'));
        if(!actor){if(input.type!=='auth')throw new Error('Authenticate before playing.');const ticket=verifyTicket(input.ticket,secret);actor=ticket.actor;expires=ticket.exp*1000;clearTimeout(timeout);service.online(actor,1);send(ws,{type:'welcome',actor,rooms:service.rooms(actor),presence:service.present()});return;}
        if(Date.now()>=expires){ws.close(1008,'Ticket expired. Reconnect to restore.');return;}
        send(ws,await service.command(actor,input));
      }catch(error){send(ws,{type:'error',id:input?.id,error:error.message||'Invalid command.',code:error.code||'INVALID_ACTION'});if(!actor)ws.close(1008,'Authentication failed.');}
    });
    const heartbeat=setInterval(()=>{if(!alive){ws.terminate();return;}alive=false;ws.ping();},25_000);heartbeat.unref();
    ws.on('close',()=>{clearTimeout(timeout);clearInterval(heartbeat);unsubscribe();if(actor)service.online(actor,-1);});
  });
  if(listen)await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,host,accept);});
  const clock=setInterval(()=>{service.tick().catch(()=>console.error('Games timer persistence failed; retaining the previous state.'));},1000);clock.unref();
  return{server,wss,service,port:server.address()?.port,close:async()=>{clearInterval(clock);for(const ws of wss.clients)ws.terminate();await new Promise(r=>wss.close(r));if(server.listening)await new Promise(r=>server.close(r));await service.queue;if(service.close)await service.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{process.loadEnvFile('.env');}catch(e){if(e.code!=='ENOENT')throw e;}const instance=await startGamesServer();console.log(`Games listening on ${instance.port}; terminate TLS at your reverse proxy.`);for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await instance.close();process.exit(0);});}
