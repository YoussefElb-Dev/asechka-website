import {readFile,mkdir,copyFile,writeFile,rename} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

// Run after a signed release build. Commit dist/updates and deploy together atomically.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const apk=resolve(process.argv[2]||join(root,'mobile/android/build/Asechka.apk'));
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||join(process.env.LOCALAPPDATA||'', 'AsechkaAndroid/toolchain/sdk');
const bt=join(sdk,'build-tools/36.0.0');
const java=process.env.JAVA_HOME?join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):'java';
const certs=execFileSync(java,['-jar',join(bt,'lib/apksigner.jar'),'verify','--print-certs',apk],{encoding:'utf8'});
const certificate='f94c188b9b9b0a23cee08e4e5a38359f5c13ebe11e5f22dbc4ddca866be6aba0';
if(!certs.includes(`certificate SHA-256 digest: ${certificate}`))throw new Error('Only the original release signing identity can publish app updates.');
const info=execFileSync(join(bt,process.platform==='win32'?'aapt.exe':'aapt'),['dump','badging',apk],{encoding:'utf8'});
const [,packageName,code,versionName]=info.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/)||[];
if(packageName!=='app.asechka.android'||!code||!versionName)throw new Error('Invalid release APK.');
const gradle=await readFile(join(root,'mobile/android/app/build.gradle'),'utf8');
if(!gradle.includes(`versionCode ${code}`)||!gradle.includes(`versionName '${versionName}'`))throw new Error('APK does not match the source version.');
const folder=join(root,'dist/updates');await mkdir(folder,{recursive:true});
const bytes=await readFile(apk),sha256=createHash('sha256').update(bytes).digest('hex');
try {
  const old=JSON.parse(await readFile(join(folder,'android.json'),'utf8'));
  if(old.versionCode>Number(code))throw new Error('Refusing an update downgrade.');
  if(old.versionCode===Number(code)&&old.sha256!==sha256)throw new Error('Increase versionCode before publishing a different APK.');
}catch(e){if(e.code!=='ENOENT')throw e;}
const name=`Asechka-Android-${versionName}.apk`;
await copyFile(apk,join(folder,name));
await writeFile(join(folder,name+'.sha256'),`${sha256}  ${name}\n`);
const manifest={packageName,versionCode:Number(code),versionName,minSdk:Number(info.match(/sdkVersion:'(\d+)'/)?.[1]||23),url:`https://asechka-website.vercel.app/updates/${name}`,bytes:bytes.length,sha256,notes:process.env.ANDROID_RELEASE_NOTES||'Update inside Asechka; spelling suggestions across writing fields; word tiles fit the screen; centered chance dots; Google AI hints with a built-in fallback.'};
await writeFile(join(folder,'android.json.tmp'),JSON.stringify(manifest,null,2)+'\n');
await rename(join(folder,'android.json.tmp'),join(folder,'android.json'));
console.log(`Prepared verified Android ${versionName} (${code}), ${bytes.length} bytes.`);
