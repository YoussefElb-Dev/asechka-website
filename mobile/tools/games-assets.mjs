/** Original Soft Orbit game art + synthesized audio. Node built-ins only; no fonts or downloads. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const master = 'mobile/games-assets';
const bundles = ['mobile/ios/Resources/default/games', 'mobile/android/app/src/main/assets/default/games'];
export const games = ['pool', 'tictactoe', 'hangman', 'connect4', 'checkers', 'battleship'];
const titles = ['8-Ball Pool', 'Tic-Tac-Toe', 'Hangman', 'Connect Four', 'Checkers', 'Battleship'];
const palettes = { ink: '#263451', rose: '#cd8ca7', teal: '#76b4ab', lilac: '#a292cf', pearl: '#fffdf8', gold: '#c5a576' };
const gradients = { background: ['#f3effa', '#e8eff9'], rose: ['#f5d4e0', '#c781a1'], teal: ['#c1e5dc', '#6aa49e'], lilac: ['#dcd3ee', '#9683c4'], pearl: ['#ffffff', '#d1dce6'], wood: ['#dfd0c6', '#ad929d'], felt: ['#6b9d97', '#3b6e71'], ocean: ['#d5e8f0', '#a5c8d8'] };
const round = n => Math.round(n * 1000) / 1000;
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

function scene(id) {
  const shapes = [];
  const rect = (x, y, w, h, r, fill, opacity = 1) => shapes.push({ type: 'rect', x, y, w, h, r, fill, opacity });
  const ellipse = (x, y, rx, ry, fill, opacity = 1) => shapes.push({ type: 'ellipse', x, y, rx, ry, fill, opacity });
  const circle = (x, y, r, fill, opacity = 1) => ellipse(x, y, r, r, fill, opacity);
  const polygon = (points, fill, opacity = 1) => shapes.push({ type: 'polygon', points, fill, opacity });
  const line = (x, y, x2, y2, width, fill, opacity = 1) => {
    const angle = Math.atan2(y2 - y, x2 - x), dx = Math.sin(angle) * width / 2, dy = Math.cos(angle) * width / 2;
    polygon([[x-dx,y+dy],[x2-dx,y2+dy],[x2+dx,y2-dy],[x+dx,y-dy]], fill, opacity);
    circle(x, y, width / 2, fill, opacity); circle(x2, y2, width / 2, fill, opacity);
  };
  const shadow = (x, y, rx, ry) => ellipse(x, y, rx, ry, '#626080', .14);
  const ball = (x, y, r, fill, eight = false) => {
    shadow(x+5,y+r*.8,r*.96,r*.4); circle(x,y,r,fill); ellipse(x-r*.25,y-r*.35,r*.45,r*.2,'#ffffff',.35);
    if (eight) { circle(x+4,y+4,r*.42,'#f7f0e8'); circle(x+4,y-2,r*.11,'#14192a'); circle(x+4,y+11,r*.14,'#14192a'); }
  };
  const disc = (x, y, fill, king = false, r = 43) => {
    shadow(x+4,y+16,r*1.07,r*.8); ellipse(x,y+8,r,r*.8, '#91819f'); ellipse(x,y,r,r*.8,fill);
    ellipse(x,y-2,r*.76,r*.59,'#665575',.12); ellipse(x-8,y-12,r*.5,r*.17,'#ffffff',.32);
    if (king) polygon([[x-22,y+9],[x-25,y-13],[x-10,y-4],[x,y-22],[x+11,y-4],[x+25,y-13],[x+22,y+9]], '#fff0cc');
  };
  rect(0,0,960,640,0,'background');
  // Soft lavender paper and blue corner light match the surrounding application.
  for (let r=260;r>=80;r-=30) circle(730,135,r,'#bba7d8',.016);
  for (let r=240;r>=60;r-=30) circle(150,530,r,'#b2d8d5',.022);
  for (const [x,y,r] of [[82,92,3],[857,540,3],[798,72,2],[112,501,2]]) circle(x,y,r,'#8e81b4',.3);
  if (id === 'pool') {
    shadow(486,460,346,90); rect(115,102,730,425,72,'wood'); rect(132,116,696,397,59,'#c2b3c4'); rect(151,134,658,361,45,'felt');
    for (const [x,y] of [[160,147],[480,143],[800,147],[160,482],[480,487],[800,482]]) { circle(x,y,22,'#101828'); circle(x,y-3,15,'#060c17'); }
    for (let i=0;i<25;i++) line(190,164+i*12,774,164+i*12,.7,'#d7fff1',.028);
    ball(527,300,58,'#171e31',true); ball(643,245,38,'rose'); ball(642,354,38,'teal'); ball(324,383,39,'pearl');
    for(let i=0;i<8;i++) circle(385+i*11,357-i*5,2.2,'#effcf3',.33);
    line(73,564,291,416,13,'wood'); line(268,432,302,409,10,'pearl'); line(299,411,307,405,9,'teal');
    line(215,117,266,117,3,'#f1d2b3',.7); line(695,512,745,512,3,'#f1d2b3',.5);
  } else if (id === 'tictactoe') {
    shadow(483,504,250,46); rect(212,62,536,504,64,'#d5cce5'); rect(226,74,508,474,55,'#fcfaff');
    for(const p of [400,560]) { line(p,112,p,510,5,'#b5a9cb',.6); line(268,p-138,692,p-138,5,'#b5a9cb',.6); }
    const cross = (x,y) => { line(x-32,y-32,x+32,y+32,17,'lilac'); line(x-32,y+32,x+32,y-32,17,'lilac'); };
    const ring = (x,y) => { circle(x,y,44,'rose'); circle(x,y,28,'#fcfaff'); ellipse(x-14,y-24,20,5,'#ffffff',.35); };
    cross(321,184); cross(480,342); cross(640,484); ring(638,184); ring(320,342); ring(480,484);
    line(282,147,679,521,5,'#a292cf',.55);
  } else if (id === 'hangman') {
    shadow(480,460,285,48); rect(180,118,600,353,30,'lilac'); rect(195,105,570,348,24,'#fffdf8');
    line(480,120,480,438,3,'#ded5e4');
    for(let i=0;i<5;i++) line(237,171+i*48,426,171+i*48,5,'#d8cfe3');
    circle(620,234,73,'#f3e4ee');
    polygon([[620,282],[570,232],[570,210],[589,194],[609,197],[620,211],[633,197],[653,194],[672,211],[672,232]],'rose');
    line(560,349,685,349,5,'#c4b6d8'); line(581,379,664,379,5,'#d8cfe3');
    for(let i=0;i<5;i++) { rect(281+i*82,488,64,64,14,i===2?'#e3dcef':'#ffffff'); line(296+i*82,536,330+i*82,536,4,i===2?'lilac':'#b5a8cb'); }
    line(301,506,301,526,5,'lilac'); line(301,526,321,526,5,'lilac');
    circle(395,516,12,'rose'); circle(395,516,7,'#ffffff');
    line(547,504,556,526,5,'teal'); line(556,526,565,504,5,'teal');
    for(const y of [504,516,528])line(629,y,649,y,4,'lilac'); line(629,504,629,528,4,'lilac');
  } else if (id === 'connect4') {
    shadow(486,531,302,42); rect(190,99,580,432,35,'lilac'); rect(207,111,546,399,24,'#beb0d9');
    for(let row=0;row<6;row++) for(let col=0;col<7;col++) {
      const x=250+col*77, y=150+row*64; circle(x,y+2,26,'#f5f2fa');
      if(row>=4 || (row===3&&col<4)) { circle(x,y,24,(row===4 || row===3) && col<4?'rose':'teal'); ellipse(x-6,y-10,11,4,'#ffffff',.38); }
    }
    rect(178,513,604,24,12,'lilac');
    ball(481,67,27,'rose'); line(481,12,481,23,4,'#f4c4da',.38);
    for(let i=0;i<4;i++) circle(250+i*77,406,4,'#ffffff',.7);
  } else if (id === 'checkers') {
    shadow(491,512,336,54); rect(149,88,662,467,38,'wood');
    const left=174,top=112,w=76.5,h=51.5;
    for(let row=0;row<8;row++) for(let col=0;col<8;col++) rect(left+col*w,top+row*h,w+.1,h+.1,0,(row+col)%2?'#a698bd':'#f8f2ec');
    disc(288,187,'rose'); disc(441,187,'rose'); disc(594,187,'rose'); disc(365,238,'rose'); disc(671,238,'rose');
    disc(288,393,'teal'); disc(441,393,'teal'); disc(365,444,'teal'); disc(594,393,'teal'); disc(594,290,'teal',true,52);
  } else if (id === 'battleship') {
    shadow(482,513,320,52); rect(148,96,664,447,42,'#a6bacb'); rect(161,108,638,419,33,'ocean');
    for(let i=1;i<10;i++) { line(173+i*61,121,173+i*61,514,1,'#7197af',.35); line(174,124+i*39,785,124+i*39,1,'#7197af',.35); }
    for(const r of [105,148,192]) { ellipse(521,322,r,r*.65,'#6daba8',.3); ellipse(521,322,r-2,(r-2)*.65,'ocean'); }
    polygon([[327,400],[306,370],[306,235],[327,189],[351,235],[351,370]],'pearl'); rect(316,249,24,95,8,'#4c6a88'); rect(312,277,33,13,5,'#9eb0bc'); line(327,221,327,244,4,'#e8f5f7');
    polygon([[518,414],[494,389],[494,302],[518,274],[542,302],[542,389]],'teal'); rect(507,315,22,67,8,'#3c748a');
    line(656,201,656,252,4,'rose'); line(630,226,682,226,4,'rose'); circle(656,226,9,'rose');
    for(const r of [24,17,9]) { ellipse(690,418,r,r*.55,'#d9f5fc',.65); ellipse(690,418,r-3,(r-3)*.55,'ocean'); }
    line(517,322,653,227,2,'#a7efe1',.4);
  }
  return shapes;
}

function svg(shapes, title) {
  const fill = s => `fill="${gradients[s.fill] ? `url(#${s.fill})` : palettes[s.fill] || s.fill}"${s.opacity===1?'':` opacity="${s.opacity}"`}`;
  const nodes = shapes.map(s => {
    if(s.type==='rect') return `<rect x="${round(s.x)}" y="${round(s.y)}" width="${round(s.w)}" height="${round(s.h)}" rx="${s.r}" ${fill(s)}/>`;
    if(s.type==='ellipse') return `<ellipse cx="${round(s.x)}" cy="${round(s.y)}" rx="${round(s.rx)}" ry="${round(s.ry)}" ${fill(s)}/>`;
    return `<polygon points="${s.points.map(p=>p.map(round).join(',')).join(' ')}" ${fill(s)}/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640" role="img" aria-labelledby="title"><title id="title">${esc(title)} — Soft Orbit original cover</title><defs>${Object.entries(gradients).map(([name,colors])=>`<linearGradient id="${name}" x2="1" y2="1">${colors.map((c,i)=>`<stop offset="${i}" stop-color="${c}"/>`).join('')}</linearGradient>`).join('')}</defs>${nodes.join('')}</svg>\n`;
}

// A tiny deterministic rasterizer for this scene vocabulary keeps PNG exports portable.
// Supersample at 2x, then box-filter to a sharp 960x640 native cover.
function raster(shapes) {
  const width=1920,height=1280,pixels=new Uint8Array(width*height*3);
  const rgb = hex => [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  for(const s of shapes) {
    const bounds=s.type==='polygon'?[Math.min(...s.points.map(p=>p[0])),Math.min(...s.points.map(p=>p[1])),Math.max(...s.points.map(p=>p[0])),Math.max(...s.points.map(p=>p[1]))]:s.type==='rect'?[s.x,s.y,s.x+s.w,s.y+s.h]:[s.x-s.rx,s.y-s.ry,s.x+s.rx,s.y+s.ry];
    const [x0,y0,x1,y1]=bounds, colors=(gradients[s.fill]||[palettes[s.fill]||s.fill]).map(rgb);
    for(let y=Math.max(0,Math.floor(y0*2));y<Math.min(height,Math.ceil(y1*2));y++) for(let x=Math.max(0,Math.floor(x0*2));x<Math.min(width,Math.ceil(x1*2));x++) {
      const px=(x+.5)/2,py=(y+.5)/2;
      let inside;
      if(s.type==='ellipse') inside=((px-s.x)/s.rx)**2+((py-s.y)/s.ry)**2<=1;
      else if(s.type==='rect') {const dx=Math.max(s.x+s.r-px,0,px-(s.x+s.w-s.r)),dy=Math.max(s.y+s.r-py,0,py-(s.y+s.h-s.r));inside=dx*dx+dy*dy<=s.r*s.r;}
      else {inside=false;for(let i=0,j=s.points.length-1;i<s.points.length;j=i++){const [ax,ay]=s.points[i],[bx,by]=s.points[j];if((ay>py)!==(by>py)&&px<(bx-ax)*(py-ay)/(by-ay)+ax)inside=!inside;}}
      if(!inside)continue;
      const t=colors.length===1?0:Math.min(1,Math.max(0,((px-x0)/(x1-x0)+(py-y0)/(y1-y0))/2));
      for(let c=0;c<3;c++){const color=colors[0][c]*(1-t)+(colors[1]?.[c]??colors[0][c])*t, offset=(y*width+x)*3+c;pixels[offset]=Math.round(color*s.opacity+pixels[offset]*(1-s.opacity));}
    }
  }
  const data=Buffer.alloc(640*(960*3+1));
  for(let y=0;y<640;y++) for(let x=0;x<960;x++) for(let c=0;c<3;c++){let sum=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)sum+=pixels[((y*2+dy)*width+x*2+dx)*3+c];data[y*2881+1+x*3+c]=Math.round(sum/4);}
  const crc32 = bytes => {let crc=0xffffffff;for(const b of bytes){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;};
  const chunk = (name,bytes) => {const label=Buffer.from(name),out=Buffer.alloc(bytes.length+12);out.writeUInt32BE(bytes.length);label.copy(out,4);bytes.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([label,bytes])),bytes.length+8);return out;};
  const header=Buffer.alloc(13);header.writeUInt32BE(960);header.writeUInt32BE(640,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(data,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}

const sounds = {
  tap: { seconds:.055, tones:[760], gain:.2 },
  invite: { seconds:.34, tones:[523.25,659.25,783.99], gain:.19, melody:true },
  collision: { seconds:.075, tones:[230,910], gain:.3, noise:.2 },
  pocket: { seconds:.16, tones:[190,95], gain:.3, noise:.12, sweep:true },
  drop: { seconds:.13, tones:[340,170], gain:.26, noise:.1, sweep:true },
  move: { seconds:.075, tones:[430,640], gain:.19, noise:.07 },
  splash: { seconds:.26, tones:[220,440], gain:.2, noise:.8, sweep:true },
  hit: { seconds:.17, tones:[110,165], gain:.23, noise:.6, sweep:true },
  win: { seconds:.55, tones:[523.25,659.25,783.99,1046.5], gain:.2, melody:true },
  lose: { seconds:.38, tones:[392,329.63,261.63], gain:.16, melody:true },
};
function wav(spec) {
  const rate=22050, count=Math.round(rate*spec.seconds), data=Buffer.alloc(44+count*2);
  data.write('RIFF');data.writeUInt32LE(36+count*2,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(count*2,40);
  let seed=20261031, phase=0;
  for(let i=0;i<count;i++) {
    const t=i/rate,u=i/(count-1),note=Math.min(spec.tones.length-1,Math.floor(u*spec.tones.length));
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    let sample;
    if(spec.melody) {const nt=(u*spec.tones.length)%1,env=Math.min(1,nt*18)*Math.exp(-3*nt);sample=Math.sin(2*Math.PI*spec.tones[note]*t)*env;}
    else {phase+=2*Math.PI*spec.tones[0]*(spec.sweep?1-u*.65:1)/rate;sample=(Math.sin(phase)+.3*Math.sin(2*Math.PI*(spec.tones[1]||spec.tones[0]*2)*t))/1.3;}
    const envelope=Math.min(1,i/(rate*.004))*Math.min(1,(count-1-i)/(rate*.014))*Math.exp(-(spec.melody?.8:5)*u);
    sample=(sample*(1-(spec.noise||0))+(seed/0xffffffff*2-1)*(spec.noise||0))*envelope*spec.gain;
    data.writeInt16LE(Math.round(Math.max(-.95,Math.min(.95,sample))*32767),44+i*2);
  }
  return data;
}

export async function buildAssets(check=false) {
  const outputs=new Map(), entries=[];
  const add=(path,data,metadata)=>{const bytes=Buffer.isBuffer(data)?data:Buffer.from(data);outputs.set(path,bytes);entries.push({path,...metadata,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),source:'mobile/tools/games-assets.mjs',attribution:'Original project artwork and synthesized audio; no third-party media.'});};
  for(const [index,id] of games.entries()) {const shapes=scene(id);add(`covers/${id}.svg`,svg(shapes,titles[index]),{game:id,kind:'vector',width:960,height:640,format:'svg',destination:'Games hub cover / scalable master'});add(`covers/${id}.png`,raster(shapes),{game:id,kind:'cover',width:960,height:640,format:'png',destination:'Native Games hub cover'});}
  for(const [name,spec] of Object.entries(sounds))add(`audio/${name}.wav`,wav(spec),{kind:'sound',format:'wav',sampleRate:22050,channels:1,bitsPerSample:16,duration:Math.round(22050*spec.seconds)/22050,destination:`Optional native effect: ${name}`});
  const manifest={schema:1,collection:'Soft Orbit Games',license:'Original assets created for this project. No external attribution required.',generator:'node mobile/tools/games-assets.mjs',games,bundleRoots:bundles,assets:entries};
  outputs.set('manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
  let size=0;
  for(const base of [master,...bundles])for(const [path,data] of outputs){const target=resolve(root,base,path);if(check){let actual;try{actual=await readFile(target);}catch{throw new Error(`Missing generated asset: ${relative(root,target)}`);}if(!actual.equals(data))throw new Error(`Stale asset: ${relative(root,target)}; regenerate with node mobile/tools/games-assets.mjs`);}else{await mkdir(dirname(target),{recursive:true});await writeFile(target,data);}if(base===master)size+=data.length;}
  console.log(`${check?'Verified reproducible':'Generated'} ${games.length} covers (SVG + PNG), ${Object.keys(sounds).length} WAV cues, manifest and both native copies; ${(size/1024).toFixed(1)} KiB per bundle.`);
  return manifest;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildAssets(process.argv.includes('--check'));
