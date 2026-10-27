import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile(new URL('../dist/assets/soft-solid/manifest.json',import.meta.url),'utf8'));
test('the selected Soft Solid PNGs are bundled identically on both native platforms',async()=>{
 assert.equal(manifest.style,'B - Soft solid');assert.equal(manifest.assets.length,18);
 for(const {name,file,master} of manifest.assets){
  const vector=await readFile(new URL('../dist/assets/soft-solid/'+master,import.meta.url),'utf8');assert.ok(vector.includes('<svg'));
  const source=await readFile(new URL('../dist/assets/soft-solid/'+file,import.meta.url));
  assert.deepEqual([...source.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(source.readUInt32BE(16),name==='widget-orbit'?32:384);
  const android=await readFile(new URL('../mobile/android/app/src/main/res/drawable-nodpi/art_'+name.replaceAll('-','_')+'.png',import.meta.url));
  const ios=await readFile(new URL('../mobile/ios/Resources/Assets.xcassets/'+name+'.imageset/'+file,import.meta.url));
  assert.deepEqual(android,source,name);assert.deepEqual(ios,source,name);
 }
});
test('the widget extension includes the same five PNGs used by its six widget families',async()=>{
 for(const name of ['quote-words','send-love','our-time','shared-streak','widget-orbit']){
  const source=await readFile(new URL('../dist/assets/soft-solid/'+name+'.png',import.meta.url));
  const widget=await readFile(new URL('../mobile/ios/Widgets/Assets.xcassets/'+name+'.imageset/'+name+'.png',import.meta.url));assert.deepEqual(source,widget,name);
 }
});
