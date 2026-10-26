import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {GitHubTogetherStore,changeTogether,checkedTogetherChange} from '../server/together-store.js';
import {publicTogether} from '../server/heart-counts.js';
test('old heart conflicts expose only the requested authenticated receipt for exact recovery',()=>{
 const op=randomUUID(),other=randomUUID();
 const base={version:1,bucketList:[],hearts:{me:null,asechka:null}};
 const data=changeTogether(base,checkedTogetherChange({action:'sendHeart',from:'me',count:10,day:'2026-10-25',operationId:op}),new Date('2026-10-26T12:00:00Z')).data;
 data.heartOperations[other]='asechka|99|2026-10-25';
 const visible=publicTogether(data,new Date(),op);
 assert.deepEqual(visible.heartReceipt,{operationId:op,from:'me',count:10,day:'2026-10-25'});
 assert.equal(visible.heartOperations,undefined);
 assert.equal(publicTogether(data).heartReceipt,undefined);
 assert.equal(publicTogether(data,new Date(),randomUUID()).heartReceipt,null);
});
test('repeated repository races remain retryable, while real receipt conflicts stay 409',async()=>{
 const base={version:1,bucketList:[],hearts:{me:null,asechka:null}};
 const op=randomUUID();let patches=0;
 const store=new GitHubTogetherStore({token:()=> 'fixture',fetcher:async(url,options)=>{
   const path=new URL(url).pathname.split('/asechka-website')[1];
   if(path==='/git/ref/heads/main')return Response.json({object:{sha:'1'.repeat(40)}});
   if(path==='/contents/dist/together.json')return Response.json({type:'file',size:100,sha:'2'.repeat(40),encoding:'base64',content:Buffer.from(JSON.stringify(base)).toString('base64')});
   if(path==='/git/commits/'+'1'.repeat(40))return Response.json({tree:{sha:'3'.repeat(40)}});
   if(path==='/git/trees' || path==='/git/commits')return Response.json({sha:'4'.repeat(40)});
   if(path==='/git/refs/heads/main'){patches++;return Response.json({}, {status:422});}
   throw new Error(path);
 }});
 await assert.rejects(store.change({action:'sendHeart',from:'me',count:50,operationId:op}),error=>error.status===503);
 assert.equal(patches,3);
 const saved=changeTogether(base,checkedTogetherChange({action:'sendHeart',from:'me',count:10,operationId:op})).data;
 assert.throws(()=>changeTogether(saved,checkedTogetherChange({action:'sendHeart',from:'me',count:50,operationId:op})),error=>error.status===409);
});
