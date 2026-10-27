// Optional design-time export. Native builds use the committed PNGs and need no image tooling.
const fs=require('fs'),path=require('path'),sharp=require('sharp');
const root=path.resolve(__dirname,'../..'),art=path.join(root,'dist/assets/soft-solid');
async function main(){
 const manifest=JSON.parse(fs.readFileSync(path.join(art,'manifest.json'),'utf8'));
 for(const {name,file,master,widget} of manifest.assets){
  const png=await sharp(path.join(art,master)).resize(name==='widget-orbit'?32:384).png().toBuffer();
  fs.writeFileSync(path.join(art,file),png);
  fs.writeFileSync(path.join(root,'mobile/android/app/src/main/res/drawable-nodpi','art_'+name.replaceAll('-','_')+'.png'),png);
  const targets=['mobile/ios/Resources/Assets.xcassets'];if(widget)targets.push('mobile/ios/Widgets/Assets.xcassets');
  for(const target of targets){const dir=path.join(root,target,name+'.imageset');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,file),png);fs.writeFileSync(path.join(dir,'Contents.json'),JSON.stringify({images:[{idiom:'universal',filename:file}],info:{version:1,author:'xcode'}},null,2)+'\n');}
 }
 console.log('Exported and bundled '+manifest.assets.length+' Soft Solid PNG assets.');
}
main().catch(e=>{console.error(e);process.exit(1)});
