import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile(new URL('../dist/assets/artwork/prompts.json',import.meta.url),'utf8'));
test('all twelve generated PNG originals are bundled identically on both native platforms',async()=>{
 assert.equal(manifest.assets.length,12);
 for(const {name,file,prompt} of manifest.assets){
  assert.ok(prompt.includes('Soft Orbit'));assert.ok(!('path' in manifest.assets.find(a=>a.name===name)));
  const source=await readFile(new URL('../dist/assets/artwork/'+file,import.meta.url));
  assert.deepEqual([...source.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const android=await readFile(new URL('../mobile/android/app/src/main/res/drawable-nodpi/art_'+name.replaceAll('-','_')+'.png',import.meta.url));
  const ios=await readFile(new URL('../mobile/ios/Resources/Assets.xcassets/'+name+'.imageset/'+file,import.meta.url));
  assert.deepEqual(android,source,name);assert.deepEqual(ios,source,name);
 }
});
test('the widget extension includes the same five PNGs used by its six widget families',async()=>{
 for(const name of ['quote-words','send-love','our-time','shared-streak','widget-orbit']){
  const source=await readFile(new URL('../dist/assets/artwork/'+name+'.png',import.meta.url));
  const widget=await readFile(new URL('../mobile/ios/Widgets/Assets.xcassets/'+name+'.imageset/'+name+'.png',import.meta.url));assert.deepEqual(source,widget,name);
 }
});
