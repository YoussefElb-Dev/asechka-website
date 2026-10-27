const fs=require('fs');
const path=require('path');
const sharp=require('sharp');
const out=__dirname;
const purple='#6B5CB5',ink='#263451',muted='#646F8B',pale='#EEEBF8',blue='#EAF1FC';
const icons=[
 ['messages','Messages','<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>'],
 ['hearts','Send love','<path d="M20.2 5.5c-2-2-5.2-1.7-8.2 1.3-3-3-6.2-3.3-8.2-1.3-3 3-.7 6.5 2 9.2L12 21l6.2-6.3c2.7-2.7 5-6.2 2-9.2Z"/>'],
 ['home','Home','<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>'],
 ['photos','Photos','<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m4 18 5-5 3 3 4-6 5 8"/>'],
 ['quotes','Quotes','<path d="M4 6h6v7H6c0 3-1 4-3 5M15 6h6v7h-4c0 3-1 4-3 5"/>'],
 ['music','Music','<path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>'],
 ['days','Our days','<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18M8 14h2m4 0h2m-8 4h2"/>'],
 ['words','Words','<path d="M3 19 8 5l5 14M5 14h6m5-3h4v8m0-4c-6-2-6 5 0 3"/>'],
 ['vocab','Secret vocab','<path d="M12 6c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v15"/>'],
 ['open-when','Open when','<rect x="3" y="6" width="18" height="15" rx="3"/><path d="m3 8 9 6 9-6M8 3h8"/>'],
 ['victories','Tiny victories','<path d="m12 2 3.2 6.5 7.2 1-5.2 5 1.2 7.2-6.4-3.4-6.4 3.4 1.2-7.2-5.2-5 7.2-1Z"/>'],
 ['recipes','Recipes for two','<path d="M5 3v6c0 3 5 3 5 0V3M7.5 3v18M18 3c-5 3-5 10 0 10V3Zm0 10v8"/>'],
 ['kept-close','Little things','<path d="M6 3h12v18l-6-4-6 4Z"/>'],
 ['beginning','Our beginning','<path d="M12 12c-3-5-9-6-10-1-1 6 6 7 10 1s11-5 10 1c-1 5-7 4-10-1Z"/>'],
 ['streak','Shared streak','<path d="M13 2c2 6-3 7-3 11 0 2 2 3 3 1 1-1 1-3 1-4 8 6 7 12-2 12C4 22 2 14 7 8c0 4 1 4 2 4 1-5 1-7 4-10Z"/>'],
 ['widgets','Widgets','<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>']
];
function content(id,solid){
 const d=icons.find(a=>a[0]===id)[2];
 if(!solid)return `<g fill="none" stroke="${purple}" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">${d}</g>`;
 const special={
 messages:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6" fill="none" stroke="white" stroke-width="1.8"/>',
 home:'<path d="m2 10 10-8 10 8v11H2Z"/><path d="M9 21v-8h6v8" fill="white"/>',
 photos:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.8" fill="white"/><path d="m4 18 5-5 3 3 4-6 5 8" fill="none" stroke="white" stroke-width="1.6"/>',
 quotes:'<path d="M3 5h7v8c0 4-3 6-7 7v-3c3-1 3-2 3-4H3Zm11 0h7v8c0 4-3 6-7 7v-3c3-1 3-2 3-4h-3Z"/>',
 days:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4" stroke="'+purple+'" stroke-width="2.5"/><path d="M3 10h18M8 14h2m4 0h2m-8 4h2" fill="none" stroke="white" stroke-width="1.8"/>',
 vocab:'<path d="M12 6C9 4 6 4 3 5v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z"/><path d="M12 6v15" stroke="white" stroke-width="1.6"/>',
 'open-when':'<rect x="3" y="6" width="18" height="15" rx="3"/><path d="m3 8 9 6 9-6" fill="none" stroke="white" stroke-width="1.8"/><path d="M8 3h8" stroke="'+purple+'" stroke-width="2"/>',
 };
 if(special[id])return `<g fill="${purple}" stroke-linecap="round" stroke-linejoin="round">${special[id]}</g>`;
 if(['hearts','victories','kept-close','streak','widgets'].includes(id))return `<g fill="${purple}" stroke="${purple}" stroke-width="1" stroke-linejoin="round">${d}</g>`;
 return `<g fill="none" stroke="${purple}" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round">${d}</g>`;
}
function icon(id,x,y,size,solid){return `<g transform="translate(${x} ${y}) scale(${size/24})">${content(id,solid)}</g>`;}
const text=(x,y,s,size=22,color=ink,weight=400)=>`<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${s}</text>`;
function board(solid){let s=`<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="1590" viewBox="0 0 1320 1590"><rect width="1320" height="1590" fill="#F8F8FC"/>`;
 s+=text(64,83,solid?'B · Soft solid':'A · Clean outline',40,ink,700)+text(64,126,'Simple logo icons · same lavender theme',23,muted);
 s+='<rect x="48" y="166" width="1224" height="900" rx="32" fill="white"/>';
 icons.forEach(([id,label],i)=>{const col=i%4,row=Math.floor(i/4),x=72+col*302,y=196+row*216;
 s+=`<rect x="${x+85}" y="${y}" width="96" height="96" rx="26" fill="${pale}"/>`+icon(id,x+105,y+20,56,solid)+`<text x="${x+133}" y="${y+135}" text-anchor="middle" font-family="Arial,sans-serif" font-size="23" fill="${ink}">${label}</text>`;
 });
 s+=text(64,1124,'How they look in the app',28,ink,700);
 s+=`<rect x="64" y="1155" width="364" height="91" rx="44" fill="${pale}"/>`+icon('hearts',91,1177,44,solid)+text(155,1211,'Send a heart',27,purple,700);
 s+=`<rect x="452" y="1155" width="364" height="91" rx="44" fill="white" stroke="#DEDDF2" stroke-width="2"/>`+icon('messages',479,1177,44,solid)+text(542,1211,'Messages',27,purple,700);
 s+=`<rect x="840" y="1155" width="416" height="345" rx="28" fill="${blue}"/>`+text(866,1199,'Hearts, from us both',22,purple,700)+icon('hearts',1186,1174,38,solid)+text(868,1271,'Asnat 128 · Youssef 96',27,ink,700)+text(868,1324,'Last sent · Today, 10:41',20,muted)+text(868,1458,'Widget preview · sample data',18,muted);
 s+=`<rect x="64" y="1272" width="752" height="140" rx="26" fill="white"/>`;
 [['home','Home'],['photos','Photos'],['quotes','Quotes'],['music','Music'],['days','Days'],['words','Words']].forEach(([id,label],i)=>{
 const x=82+i*120;
 if(!i)s+=`<rect x="${x-2}" y="1284" width="110" height="112" rx="24" fill="${pale}"/>`;
 s+=icon(id,x+32,1298,42,solid)+`<text x="${x+53}" y="1377" text-anchor="middle" font-family="Arial,sans-serif" font-size="19" fill="${!i?purple:muted}">${label}</text>`;
 });
 s+=text(64,1471,'No 3D · no textures · no decorative backgrounds',22,muted)+text(64,1532,'Preview only · transparent PNG originals included',19,muted);
 return s+'</svg>';
}
async function main(){
 fs.mkdirSync(path.join(out,'png'),{recursive:true});fs.mkdirSync(path.join(out,'svg'),{recursive:true});
 for(const solid of [false,true]){
 const style=solid?'B-Soft-Solid':'A-Clean-Outline',svg=board(solid);
 fs.writeFileSync(path.join(out,style+'.svg'),svg);await sharp(Buffer.from(svg)).png().toFile(path.join(out,style+'.png'));
 for(const [id] of icons){const master=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96">${content(id,solid)}</svg>`;fs.writeFileSync(path.join(out,'svg',style+'-'+id+'.svg'),master);await sharp(Buffer.from(master)).png().toFile(path.join(out,'png',style+'-'+id+'.png'));}
 }
 const a=await sharp(path.join(out,'A-Clean-Outline.png')).resize(660,795).toBuffer(),b=await sharp(path.join(out,'B-Soft-Solid.png')).resize(660,795).toBuffer();
 await sharp({create:{width:1320,height:795,channels:4,background:'#F8F8FC'}}).composite([{input:a,left:0,top:0},{input:b,left:660,top:0}]).png().toFile(path.join(out,'Minimal-Logo-Preview.png'));
 fs.writeFileSync(path.join(out,'README.md'),'# Minimal logo icon previews\n\nA: clean rounded outlines. B: soft solid symbols. Both use #6B5CB5 with the existing lavender/blue theme. Icons are original SVG geometry exported to transparent 96px PNG files, with no textures, shadows, or generated-image details. Preview widget counts are sample data. This is a design preview; the installed apps have not been changed.\n');
 console.log('Created two PNG preview boards, 32 transparent PNG icons, and editable SVG masters.');
}
main().catch(e=>{console.error(e);process.exit(1)});
