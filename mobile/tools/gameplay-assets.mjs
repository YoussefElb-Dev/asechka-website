/** Export approved imagegen masters into exact, independently movable native art.
 * Requires sharp for authoring only (npm install --no-save sharp, or NODE_PATH).
 * Runtime and CI consume the checked-in PNGs and hashes; no image library needed.
 */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const sharp = createRequire(import.meta.url)('sharp');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = resolve(root, 'mobile/game-art-source');
const output = resolve(root, 'mobile/games-assets');
const entries = [];
const ids = ['pool','tictactoe','hangman','connect4','checkers','battleship'];
async function emit(path, input, width, height, metadata={}) {
  const data = await sharp(input).resize(width,height,{fit:'fill'}).png({compressionLevel:9, palette:true, colours:256, dither:0}).toBuffer();
  await mkdir(dirname(resolve(output,path)),{recursive:true});
  await writeFile(resolve(output,path),data);
  entries.push({path,width,height,format:'png',bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),...metadata});
}
const defs = `<defs><linearGradient id="pearl" x2="0.8" y2="1"><stop stop-color="#fffefe"/><stop offset="1" stop-color="#f7f3fc"/></linearGradient><linearGradient id="lilac" x2="0.3" y2="1"><stop stop-color="#d6c6ec"/><stop offset="1" stop-color="#a58bc6"/></linearGradient><linearGradient id="rose" x2="0.3" y2="1"><stop stop-color="#e8c3ce"/><stop offset="1" stop-color="#bb9ba8"/></linearGradient><linearGradient id="sea" x2="1" y2="1"><stop stop-color="#d7edf5"/><stop offset="1" stop-color="#afcfdf"/></linearGradient><linearGradient id="felt" x2="1" y2="1"><stop stop-color="#6ca9a0"/><stop offset="1" stop-color="#46867f"/></linearGradient></defs>`;
function svg(w,h,body){return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}${body}</svg>`);}
async function vector(game,name,w,h,body){
  const input=svg(w,h,body),path=`gameplay/${game}/${name}`;
  await mkdir(resolve(source,'vectors',game),{recursive:true});
  await writeFile(resolve(source,'vectors',game,`${name}.svg`),input);
  await emit(`${path}.png`,input,w,h,{game,kind:'board',source:`mobile/game-art-source/vectors/${game}/${name}.svg`});
}
// Grids are exact and share the same normalized coordinates as native hitboxes.
await vector('tictactoe','board',900,900,`<rect width="900" height="900" rx="48" fill="url(#lilac)"/><rect x="9" y="9" width="882" height="882" rx="40" fill="url(#pearl)" stroke="#e6dbf0" stroke-width="3"/><path d="M300 48V852M600 48V852M48 300H852M48 600H852" stroke="#c7b6df" stroke-width="5" stroke-linecap="round"/>`);
await vector('connect4','board',840,720,`<rect width="840" height="720" rx="32" fill="url(#lilac)"/><rect x="7" y="7" width="826" height="706" rx="27" fill="none" stroke="#e7d9f5" stroke-width="4"/>`);
let squares='';for(let r=0;r<8;r++)for(let c=0;c<8;c++)squares+=`<rect x="${c*100}" y="${r*100}" width="100" height="100" fill="${(r+c)%2?'#aa9abb':'#f7f2ec'}"/>`;
await vector('checkers','board',800,800,squares);
await vector('battleship','board',1000,1000,`<rect width="1000" height="1000" rx="22" fill="url(#sea)"/>${Array.from({length:9},(_,i)=>`<path d="M${(i+1)*100} 0V1000M0 ${(i+1)*100}H1000" stroke="#8fb9cd" stroke-opacity=".65" stroke-width="2"/>`).join('')}<rect x="2" y="2" width="996" height="996" rx="20" fill="none" stroke="#e9f6fb" stroke-width="4"/>`);
await vector('pool','board',1080,580,`<rect width="1080" height="580" rx="54" fill="url(#rose)"/><rect x="8" y="8" width="1064" height="564" rx="47" fill="none" stroke="#f2dbe1" stroke-width="6"/><rect x="25" y="25" width="1030" height="530" rx="30" fill="#bda8bd"/><rect x="40" y="40" width="1000" height="500" rx="18" fill="url(#felt)"/><path d="M150 18H198M882 562H930" stroke="#fff0d4" stroke-width="5" stroke-linecap="round"/>`);
await vector('pool','cue',600,24,`<rect x="2" y="5" width="570" height="14" rx="7" fill="url(#rose)"/><rect x="504" y="5" width="70" height="14" rx="4" fill="url(#pearl)"/><rect x="574" y="5" width="24" height="14" rx="5" fill="#8fc7bd"/><path d="M12 8H490" stroke="#fff9fc" stroke-opacity=".5" stroke-width="2"/>`);
await vector('pool','pocket',96,96,`<circle cx="48" cy="48" r="47" fill="#484b65"/><circle cx="48" cy="48" r="39" fill="#101827"/><circle cx="48" cy="44" r="32" fill="#080f1c"/><path d="M15 40A34 34 0 0 1 75 25" fill="none" stroke="#79819b" stroke-opacity=".5" stroke-width="3"/>`);
await vector('hangman','key',128,128,`<rect x="4" y="8" width="120" height="116" rx="24" fill="#d9cde9"/><rect x="4" y="3" width="120" height="116" rx="24" fill="url(#pearl)" stroke="#e8dff2" stroke-width="2"/>`);
await vector('common','heart',128,128,`<path d="M64 112L16 64C-10 36 25 0 50 27L64 42L78 27C103 0 138 36 112 64Z" fill="#d697b2" stroke="#f0c5d6" stroke-width="3"/>`);
await vector('common','hit',128,128,`<circle cx="64" cy="64" r="49" fill="#f6dbe5" fill-opacity=".6"/><path d="M40 40L88 88M88 40L40 88" stroke="#b5577d" stroke-width="12" stroke-linecap="round"/><circle cx="64" cy="64" r="54" fill="none" stroke="#ce8da7" stroke-width="4"/>`);
await vector('common','miss',128,128,`<ellipse cx="64" cy="68" rx="53" ry="33" fill="none" stroke="#effbff" stroke-width="5"/><ellipse cx="64" cy="68" rx="35" ry="21" fill="none" stroke="#f5fcff" stroke-width="4"/><circle cx="64" cy="66" r="10" fill="#f5fcff"/>`);
for(const game of ids)await emit(`covers/${game}.png`,resolve(source,'covers',`${game}.png`),960,640,{game,kind:'cover',source:`mobile/game-art-source/covers/${game}.png`});
// Crop independent cells; keep each object's original generated alpha. The opaque
// core bounds exclude isolated low-alpha specks outside an exported sprite.
async function kit(game,cols,rows,names){
  const file=resolve(source,'kits',`${game}.png`),meta=await sharp(file).metadata();
  if(!meta.hasAlpha)throw new Error(`${game}: expected genuine transparent source`);
  for(let i=0;i<names.length;i++){
    const x=Math.round((i%cols)*meta.width/cols),y=Math.round(Math.floor(i/cols)*meta.height/rows);
    const w=Math.round((i%cols+1)*meta.width/cols)-x,h=Math.round((Math.floor(i/cols)+1)*meta.height/rows)-y;
    let cell=await sharp(file).extract({left:x,top:y,width:w,height:h}).png().toBuffer();
    const {data,info}=await sharp(cell).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    // Keep the largest alpha island. Transparent exports occasionally carry
    // isolated gutter flecks, which must not become part of a movable sprite.
    const labels=new Int32Array(w*h),queue=new Int32Array(w*h);let label=0,best=0,bestCount=0;
    for(let start=0;start<w*h;start++)if(!labels[start]&&data[start*info.channels+3]>100){
      let head=0,tail=1;queue[0]=start;labels[start]=++label;
      while(head<tail){const at=queue[head++],xx=at%w;for(const next of [xx>0?at-1:-1,xx<w-1?at+1:-1,at>=w?at-w:-1,at<w*(h-1)?at+w:-1])if(next>=0&&!labels[next]&&data[next*info.channels+3]>100){labels[next]=label;queue[tail++]=next;}}
      if(tail>bestCount){bestCount=tail;best=label;}
    }
    for(let at=0;at<w*h;at++){
      const xx=at%w,near=labels[at]===best||(xx>0&&labels[at-1]===best)||(xx<w-1&&labels[at+1]===best)||(at>=w&&labels[at-w]===best)||(at<w*(h-1)&&labels[at+w]===best);
      if(!near)data[at*info.channels+3]=0;
    }
    let minX=w,minY=h,maxX=0,maxY=0;
    for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(data[(yy*w+xx)*info.channels+3]>150){minX=Math.min(minX,xx);minY=Math.min(minY,yy);maxX=Math.max(maxX,xx);maxY=Math.max(maxY,yy);}
    if(minX>=maxX||minY>=maxY)throw new Error(`${game}/${names[i]}: empty sprite`);
    const inset=3;minX=Math.max(0,minX-inset);minY=Math.max(0,minY-inset);maxX=Math.min(w,maxX+inset+1);maxY=Math.min(h,maxY+inset+1);
    cell=await sharp(data,{raw:info}).extract({left:minX,top:minY,width:maxX-minX,height:maxY-minY}).png().toBuffer();
    if(['pool','connect4','checkers'].includes(game)){
      // A round sprite has an exact round silhouette, matching the game's
      // collision shape, independent of tiny artifacts at a source-sheet edge.
      const m=await sharp(cell).metadata(),diameter=Math.min(m.width,m.height)-6;
      const mask=svg(m.width,m.height,`<ellipse cx="${m.width/2}" cy="${m.height/2}" rx="${diameter/2}" ry="${diameter/2}" fill="white"/>`);
      cell=await sharp(cell).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
    }
    const height=game==='battleship'?640:game==='hangman'?600:256,width=game==='battleship'?192:game==='hangman'?900:256;
    await emit(`gameplay/${game}/${names[i]}.png`,cell,width,height,{game,kind:game==='hangman'?'board':'sprite',source:`mobile/game-art-source/kits/${game}.png`,cell:i});
    // Lower memory export for previews and low density devices, same geometry.
    await emit(`gameplay/${game}/${names[i]}-small.png`,cell,width/2,height/2,{game,kind:'sprite-small',source:`mobile/game-art-source/kits/${game}.png`,cell:i});
  }
}
await kit('tictactoe',2,1,['x','o']);
await kit('connect4',2,1,['rose','mint']);
await kit('checkers',2,2,['rose','mint','rose-king','mint-king']);
await kit('pool',4,4,Array.from({length:16},(_,i)=>`ball-${i}`));
await kit('battleship',5,1,['carrier','battleship','cruiser','submarine','destroyer']);
await kit('hangman',1,1,['book']);
await writeFile(resolve(output,'gameplay-assets.json'),JSON.stringify({schema:1,style:'Approved Soft Orbit refinements',generator:'node mobile/tools/gameplay-assets.mjs',assets:entries},null,2)+'\n');
console.log(`Exported ${entries.length} approved covers, exact boards, sprites and resolution variants.`);
