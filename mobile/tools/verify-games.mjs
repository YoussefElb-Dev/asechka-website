/** Fail closed on incomplete source integration or stale native Games assets. */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildAssets, games } from './games-assets.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=path=>readFile(resolve(root,path),'utf8');
try {
const manifest=await buildAssets(true);
let bytes=0;
for(const asset of manifest.assets) {
  const data=await readFile(resolve(root,'mobile/games-assets',asset.path));bytes+=data.length;
  if(asset.format==='svg') {
    const svg=data.toString();assert(/viewBox="0 0 960 640"/.test(svg),`${asset.path}: incorrect SVG viewBox`);
    assert(!/<(?:script|image|foreignObject|text|use)\b|(?:href|onload|onclick)\s*=/i.test(svg),`${asset.path}: only original self-contained vector shapes are allowed`);
    assert.equal(asset.width,960);assert.equal(asset.height,640);
  } else if(asset.format==='png') {
    assert(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
    assert.equal(data.readUInt32BE(16),480);assert.equal(data.readUInt32BE(20),320);
  } else if(asset.format==='wav') {
    assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,16),'WAVEfmt ');
    assert.equal(data.readUInt16LE(20),1);assert.equal(data.readUInt16LE(22),1);
    assert.equal(data.readUInt32LE(24),22050);assert.equal(data.readUInt16LE(34),16);
    assert.equal(data.readUInt32LE(40),data.length-44);assert.equal(data.readUInt32LE(4),data.length-8);
    assert.equal(data.readInt16LE(44),0);assert.equal(data.readInt16LE(data.length-2),0);
    let peak=0;for(let i=44;i<data.length;i+=2)peak=Math.max(peak,Math.abs(data.readInt16LE(i)));
    assert(peak>100&&peak<31130,`${asset.path}: silent or clipped cue`);
    assert(asset.duration<=.6);
  } else assert.fail(`Unexpected format: ${asset.format}`);
}
assert(bytes<512*1024,'Games assets exceeded 512 KiB per bundle');
if(!process.argv.includes('--assets-only')) {
  const engine=await import(pathToFileURL(resolve(root,'server/games/engine.mjs')));
  assert.deepEqual([...engine.games].sort(),[...games].sort(),'All six authoritative modules must be registered');
  for(const game of games) {
    const rule=await import(pathToFileURL(resolve(root,`server/games/rules/${game}.mjs`)));
    for(const name of ['create','apply','view'])assert.equal(typeof rule[name],'function',`${game}.${name} missing`);
    const state=engine.createGame(game);assert.equal(state.winner,null);assert.doesNotThrow(()=>JSON.stringify(engine.publicState(game,state,0)));
  }
  for(const path of ['server/games/server.mjs','server/games/service.mjs','server/games/redis-service.mjs','server/games/tickets.mjs','server/games-session-api.js','api/games-session.js','api/games-socket.js','tests/games-redis.test.mjs'])assert((await read(path)).length>100,`${path} missing`);
  for(const base of ['mobile/ios/Sources','mobile/android/app/src/main/java/app/asechka/android']) {
    const names=(await readdir(resolve(root,base))).filter(n=>/^Games.*\.(swift|java)$/.test(n));
    assert(names.length>=3,`${base}: native games UI, models and transport must be present`);
    const sources=(await Promise.all(names.map(n=>read(`${base}/${n}`)))).join('\n');
    for(const game of games)assert(sources.includes(`"${game}"`)||new RegExp(`\\bcase\\s+[^\\n]*\\b${game}\\b`).test(sources),`${base}: ${game} is absent from the native catalog`);
    // Native Canvas art is also original integrated artwork. Accept that explicit
    // renderer, or loading the generated card PNGs; never accept bundling alone.
    const usesCovers=/games\/covers|covers\//.test(sources)&&(/BitmapFactory|UIImage|Image\(uiImage/.test(sources));
    const usesNativeArt=base.includes('/ios/')
      ? /struct GamesArtwork:\s*View/.test(sources)&&/GamesArtwork\(kind:/.test(sources)&&/Canvas\s*\{/.test(sources)
      : /class GamesArt extends View/.test(sources)&&/new GamesArt\(/.test(sources)&&/onDraw\(Canvas/.test(sources);
    assert(usesCovers||usesNativeArt,`${base}: wire the generated cover PNGs or original GamesArt renderer into the native UI`);
  }
  const project=await read('mobile/ios/project.yml'),gradle=await read('mobile/android/app/build.gradle'),portable=await read('mobile/android/build.ps1');
  assert(/path: Resources\/default\s+type: folder\s+buildPhase: resources/.test(project),'Xcode must copy the complete default/games folder');
  const version=project.match(/MARKETING_VERSION:\s*'([^']+)'/)[1],build=project.match(/CURRENT_PROJECT_VERSION:\s*'([^']+)'/)[1];
  assert.equal(gradle.match(/versionName\s+'([^']+)'/)[1],version,'Android/iOS version mismatch');
  assert.equal(gradle.match(/versionCode\s+(\d+)/)[1],build,'Android/iOS build mismatch');
  assert(portable.includes(`'--version-code','${build}'`)&&portable.includes(`'--version-name','${version}'`),'Portable Android builder version mismatch');
  console.log(`Verified all six server modules, native catalogs, bundled resource configuration and matching version ${version} (${build}).`);
}
console.log(`Games asset checks passed: ${manifest.assets.length} assets, ${(bytes/1024).toFixed(1)} KiB, exact Android/iOS copies.`);
} catch(error) {
  console.error(`Games verification failed: ${error.message}`);
  process.exitCode=1;
}
