import { floatHearts } from './heart-motion.js';
import { HeartOutbox } from './heart-outbox.js';
import { sharedStreak, projectStreak, streakDay } from './heart-streak.js';
const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const timeText=value=>new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));
const dateText=value=>value?new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(new Date(value.length===10?`${value}T12:00:00`:value)):'';
const uuid=()=>crypto.randomUUID();
let shared=null, fingerprint='', side='', busy=false, filter='all', editing=null, returnFocus=null, chosenPhoto=null, photoBusy=false;
try{side=localStorage.getItem('asechka-heart-side') || '';}catch{}
if(!['me','asechka'].includes(side))side='';
try{shared=JSON.parse(localStorage.getItem('asechka-heart-ledger') || 'null');}catch{}
let heartSending=false,heartTimer;
const heartQueue=new HeartOutbox({load:()=>{try{return JSON.parse(localStorage.getItem('asechka-heart-outbox')||'[]')}catch{return []}},save:items=>localStorage.setItem('asechka-heart-outbox',JSON.stringify(items))});
function queueHeartFlush(){if(!heartTimer)heartTimer=setTimeout(()=>{heartTimer=null;flushHearts();},600);}
async function flushHearts(){
  if(heartSending || !navigator.onLine || !heartQueue.items.length)return;
  if(busy){queueHeartFlush();return;}
  heartSending=true;
  const status=$('[data-heart-status]');
  try{
    while(heartQueue.items.length){const body=heartQueue.seal();const result=await api('/api/together',body);installState(result);heartQueue.acknowledge(body.operationId);renderHearts();}
    if(status)status.textContent='Every little heart is saved for both of us. ♡';
  }catch(error){if(status)status.textContent=error.status===401?'Unlock our little door to send your saved hearts.':'Your hearts are saved on this device. We’ll try again when connected.';if(error.status===401)notice(error.message,error);}
  finally{heartSending=false;}
}
window.addEventListener('online',()=>{loadShared({quiet:true});flushHearts();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(heartTimer);heartTimer=null;flushHearts();}else queueHeartFlush();});
class RequestError extends Error{constructor(message,status){super(message);this.status=status;}}
async function api(path,body){
  let response;
  try{response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(body?55000:15000),headers:{Accept:'application/json',...(body?{'Content-Type':'application/json','X-Asechka-Together':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
  catch{throw new RequestError('Our connection is taking a little longer. Your edits are still here—try again.',0);}
  let result;try{result=await response.json();}catch{throw new RequestError('Our little memories are taking a break. Please try again shortly.',response.status);}
  if(!response.ok)throw new RequestError(result.error || 'Please try again shortly.',response.status);
  return result;
}
function notice(text,error){
  const target=$('[data-shared-status]');if(target)target.textContent=text;
  $$('[data-retry-shared]').forEach(button=>button.hidden=!error || error.status===401);
  $$('[data-shared-login]').forEach(link=>link.hidden=error?.status!==401);
}
function isWritable(){return shared?.writable===true;}
function installState(data){
  if(data.version!==1 || !Array.isArray(data.bucketList) || !data.hearts)throw new RequestError('Our little plans couldn’t be read. Try again shortly.',503);
  if(shared?.updatedAt && data.updatedAt && shared.updatedAt>data.updatedAt)return;
  if(shared?.updatedAt===data.updatedAt && (shared?.streakStatus?.asOf || "")>(data.streakStatus?.asOf || ""))return;
  shared=data;
  try{localStorage.setItem('asechka-heart-ledger',JSON.stringify({version:1,bucketList:[],hearts:data.hearts,heartDays:data.heartDays,heartReceipts:data.heartReceipts,heartStreak:data.heartStreak,streakStatus:data.streakStatus,updatedAt:data.updatedAt}));}catch{}
  $$('[data-add-plan]').forEach(button=>button.disabled=!isWritable());
  renderHearts();renderSummary();
  const next=JSON.stringify(data.bucketList);
  if(next!==fingerprint){fingerprint=next;renderList();}
}
async function loadShared({quiet=false}={}){
  if(busy || heartSending)return;
  try{installState(await api('/api/together'));notice(isWritable()?'Our little plans and hearts, saved for both of us.':'Shared saving is being connected. Our memories are safe.');}
  catch(error){if(!quiet || error.status===401)notice(error.message,error);if(error.status===401){if(shared)shared.writable=false;renderHearts();$$('[data-add-plan]').forEach(button=>button.disabled=true);}}
  finally{const list=$('#bucket-list');if(list)list.setAttribute('aria-busy','false');}
}
function renderSummary(){
  const list=shared?.bucketList || [], done=list.filter(item=>item.completed).length, remaining=list.length-done;
  $$('[data-bucket-count]').forEach(target=>target.textContent=`${remaining} ${remaining===1?'little wish':'little wishes'} · ${done} ${done===1?'memory':'memories'} made`);
  const summary=$('[data-bucket-summary]');if(summary)summary.textContent=list.length?`${remaining} still dreaming · ${done} we’ve made into memories.`:'Our first little wish is waiting to be written.';
  const preview=$('[data-preview-wishes]');if(preview){preview.replaceChildren();list.filter(item=>!item.completed).slice(0,3).forEach(item=>preview.append(node('li','',item.title)));}
}
function currentStreak(){
  const data=projectStreak(shared,heartQueue.items);
  return {data,result:sharedStreak(data,navigator.onLine && shared?.streakStatus?.today && Math.abs(Date.now()-Date.parse(shared.streakStatus.asOf))<90000 ? shared.streakStatus.today:streakDay())};
}
let streakButton, streakDialog;
function renderStreak(){
  const invitation=$('[data-heart-invitation]');if(!invitation)return;
  if(!streakButton){
    streakButton=node('button','shared-streak');streakButton.type='button';streakButton.addEventListener('click',openHeartHistory);invitation.after(streakButton);
  }
  const {result:r}=currentStreak();
  streakButton.textContent=shared ? `✦ ${r.days} days together · ${r.lives} ${r.lives===1?'life':'lives'} ♡`:'Our shared streak · connect to sync';
  streakButton.setAttribute('aria-label',shared ? `Our shared streak: ${r.days} days, ${r.lives} ${r.lives===1?'life':'lives'}. Open heart history`:'Our shared heart history');
  streakButton.disabled=!shared;
  if(streakDialog?.open)fillHeartHistory();
}
function fillHeartHistory(){
  const {data,result:r}=currentStreak();
  const body=streakDialog.querySelector('.shared-heart-history-body');body.replaceChildren();
  body.append(node('p','shared-heart-total',`${r.days} days together · ${r.lives} ${r.lives===1?'life':'lives'} saved`),node('p','','One heart from either of us keeps our day. A missed day automatically uses one shared life. Without a life, we start again with our next heart.'),node('p','',`Unused lives stack. Our next life arrives ${dateText(r.nextLifeOn)}; we get one more on the 12th each month. Days end at midnight Eastern time.`));
  const days=new Set([...Object.keys(data.heartDays),...r.protectedDays]);
  if(!days.size)body.append(node('p','','Our daily heart history starts with our first heart.'));
  for(const day of [...days].sort().reverse()){
    const row=node('div','shared-heart-history-day');row.append(node('strong','',dateText(day)));
    row.append(node('span','',r.protectedDays.includes(day)?'♡ Protected with a life':`Youssef ${data.heartDays[day]?.me || 0} ♡ · Asnat ${data.heartDays[day]?.asechka || 0} ♡`));body.append(row);
  }
}
function openHeartHistory(){
  if(!streakDialog){
    streakDialog=node('dialog','shared-heart-history');streakDialog.setAttribute('aria-labelledby','heart-history-title');
    const heading=node('h2','','Our little heart history');heading.id='heart-history-title';
    const close=node('button','shared-heart-history-close','Done');close.type='button';close.addEventListener('click',()=>streakDialog.close());
    streakDialog.append(heading,node('div','shared-heart-history-body'),close);document.body.append(streakDialog);
    streakDialog.addEventListener('close',()=>streakButton.focus({preventScroll:true}));
  }
  fillHeartHistory();streakDialog.showModal();
}
function renderHearts(){
  renderStreak();
  const select=$('[data-heart-side]');if(select && select.value!==side)select.value=side;
  if(select)select.disabled=busy;
  const button=$('[data-send-heart]');if(button){button.disabled=!side || !isWritable();button.setAttribute('aria-label',side==='asechka'?'Send him a thinking-of-you heart':'Send Asechka a thinking-of-you heart');}
  const invitation=$('[data-heart-invitation]');if(invitation)invitation.textContent=!side?'Choose your side, then leave a little heart.':side==='asechka'?'A little heart, from you to him.':'A little heart, from you to Asechka.';
  const message=$('[data-heart-message]'), own=$('[data-own-heart]');if(!message)return;
  message.replaceChildren();
  if(!side){message.append(node('span','','Your little hearts will wait here for each other.'));if(own)own.textContent='';return;}
  const incoming=shared?.hearts[side==='me'?'asechka':'me'];
  if(incoming){message.append(node('span','',side==='me'?'Asechka was thinking of you. ♡':'He was thinking of you. ♡'));const time=node('time','',timeText(incoming.sentAt));time.dateTime=incoming.sentAt;message.append(time);}
  else message.append(node('span','',side==='me'?'A little place for a heart from Asechka.':'A little place for a heart from him.'));
  const sent=shared?.hearts[side];if(own)own.textContent=sent?`Your last little heart: ${timeText(sent.sentAt)}`:'';
}
const heartSide=$('[data-heart-side]');
heartSide?.addEventListener('change',()=>{side=heartSide.value;try{localStorage.setItem('asechka-heart-side',side);}catch{}$('[data-heart-status]').textContent='';renderHearts();});
$('[data-send-heart]')?.addEventListener('click',event=>{
  if(!side || !isWritable())return;
  floatHearts(event.currentTarget);
  const status=$('[data-heart-status]');
  try{heartQueue.tap(side);renderStreak();status.textContent='Your little hearts are saved on this device. ♡';queueHeartFlush();}
  catch{status.textContent='This browser couldn’t save that heart. Please free some storage and try again.';}
});
$$('[data-retry-shared]').forEach(button=>button.addEventListener('click',()=>{loadShared();loadMemory();}));
async function loadMemory(){
  const host=$('[data-daily-memory]');if(!host)return;
  try{
    const data=await api('/api/daily-memory'), memory=data.memory;
    const date=$('[data-memory-day]');if(date)date.textContent=dateText(data.day);
    if(host.dataset.memoryKey===`${data.day}:${memory?.id}`)return;
    host.dataset.memoryKey=`${data.day}:${memory?.id}`;host.replaceChildren();
    if(!memory){host.append(node('p','soft-loading','A little room for the memories we’re about to make. ♡'));return;}
    if(memory.kind==='quote'){
      host.append(node('blockquote','daily-quote',memory.text));if(memory.note)host.append(node('p','daily-note',memory.note));
      const link=node('a','daily-link','Find it in our quotes ↗');link.href='/quotes.html';host.append(link);
    }else if(memory.kind==='photo'){
      const photo=node('a','daily-photo');photo.href='/pictures.html';const image=node('img');image.src=memory.image;image.alt=memory.caption || 'A picture from our saved memories';image.decoding='async';
      image.addEventListener('error',()=>{image.hidden=true;photo.append(node('p','','This little picture is waiting in our album.'));},{once:true});photo.append(image,node('p','',memory.caption || 'one of our little moments ♡'));host.append(photo);
      const link=node('a','daily-link','Revisit our pictures ↗');link.href='/pictures.html';host.append(link);
    }else if(memory.kind==='song'){
      const song=node('div','daily-song'), art=node('div','daily-song-art'), copy=node('div');
      const validLink=typeof memory.url==='string' && /^https:\/\/(?:music|itunes)\.apple\.com\//.test(memory.url);
      if(memory.artwork && /^https:\/\/[^/]+\.mzstatic\.com\//.test(memory.artwork) && validLink){const image=node('img');image.src=memory.artwork;image.alt=`${memory.album} album artwork`;art.append(image);image.addEventListener('error',()=>{image.replaceWith(node('span','daily-song-empty','♫'));},{once:true});}
      else art.append(node('span','daily-song-empty','♫'));
      if(validLink){const badge=node('a','itunes-badge');badge.href=memory.url;badge.target='_blank';badge.rel='noopener noreferrer';badge.setAttribute('aria-label',`Get ${memory.title} on iTunes Store (opens in a new tab)`);const image=node('img');image.src='/assets/itunes-badge.svg';image.alt='Get it on iTunes Store';badge.append(image);art.append(badge);}
      copy.append(node('h4','',memory.title),node('p','',memory.artist),node('p','',memory.album));if(validLink){const listen=node('a','daily-link','Listen in Apple Music ↗');listen.href=memory.url;listen.target='_blank';listen.rel='noopener noreferrer';copy.append(listen);}song.append(art,copy);host.append(song);if(memory.note)host.append(node('p','daily-note',memory.note));const link=node('a','daily-link','See our shared soundtrack ↗');link.href='/music.html';host.append(link);
    }
  }catch(error){host.dataset.memoryKey='';host.replaceChildren(node('p','soft-loading',error.status===401?'Unlock our little door to see today’s memory.':error.message));const retry=node('button','quiet-link','Try today’s memory again');retry.type='button';retry.addEventListener('click',loadMemory);host.append(retry);}
  finally{host.setAttribute('aria-busy','false');}
}
function photoButton(item){
  const button=node('button','bucket-photo-button');button.type='button';button.setAttribute('aria-label',`Open our photo for ${item.title}`);
  const image=node('img');image.src=`/api/together-photo?kind=bucket&id=${item.photoId}`;image.alt=`Our memory: ${item.title}`;image.loading='lazy';image.decoding='async';button.append(image);
  image.addEventListener('error',()=>{button.replaceChildren(node('span','bucket-photo-fallback','This photo is taking a little longer. Tap to try again.'));},{once:true});
  button.addEventListener('click',()=>openPhoto(item));return button;
}
function renderList(){
  const host=$('#bucket-list');if(!host)return;
  const active=document.activeElement, restore=active?.closest('[data-item-id]')?{id:active.closest('[data-item-id]').dataset.itemId,action:active.dataset.planAction}:null;
  host.replaceChildren();const list=shared?.bucketList || [];
  const empty=$('#bucket-empty');empty.hidden=list.length!==0;
  if(!list.length)return;
  const shown=list.filter(item=>filter==='all' || (filter==='done'?item.completed:!item.completed));
  if(!shown.length){host.append(node('p','bucket-filter-empty',filter==='done'?'Our first “we did it” moment is still ahead of us. ♡':'Every little wish here became a memory. Time for our next one?'));return;}
  for(const item of shown){
    const card=node('article','bucket-card');card.dataset.itemId=item.id;
    if(item.completed && item.photoId)card.append(photoButton(item));
    const content=node('div','bucket-card-content'), top=node('div','bucket-card-top');top.append(node('span',`plan-state${item.completed?' done':''}`,item.completed?'We did it ♡':'Still dreaming'),node('span','plan-index',String(list.indexOf(item)+1).padStart(2,'0')));
    content.append(top,node('h3','',item.title));if(item.place){const place=node('p','bucket-place');place.append(node('span','','⌁'),node('span','',item.place));content.append(place);}if(item.note)content.append(node('p','bucket-note',item.note));
    if(item.completedAt)content.append(node('p','bucket-done-date',`Made into a memory · ${dateText(item.completedAt)}`));
    const actions=node('div','bucket-card-actions');
    const complete=node('button','button button-outline',item.completed?'Still dreaming again':'We did it ♡');complete.type='button';complete.dataset.planAction='complete';complete.disabled=!isWritable() || busy;complete.setAttribute('aria-label',item.completed?`Move ${item.title} back to still dreaming`:`Complete ${item.title}`);complete.addEventListener('click',()=>item.completed?toggleItem(item,false):openPlan(item,{complete:true}));actions.append(complete);
    const edit=node('button','bucket-edit',item.completed && !item.photoId?'Add a picture ↗':'Edit');edit.type='button';edit.dataset.planAction='edit';edit.disabled=!isWritable() || busy;edit.setAttribute('aria-label',`Edit ${item.title}`);edit.addEventListener('click',()=>openPlan(item));actions.append(edit);
    const remove=node('button','bucket-remove','Remove');remove.type='button';remove.dataset.planAction='remove';remove.disabled=!isWritable() || busy;remove.setAttribute('aria-label',`Remove ${item.title}`);remove.addEventListener('click',()=>openPlan(item,{remove:true}));actions.append(remove);content.append(actions);card.append(content);host.append(card);
  }
  if(restore)host.querySelector(`[data-item-id="${restore.id}"] [data-plan-action="${restore.action}"]`)?.focus({preventScroll:true});
}
$$('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;$$('[data-filter]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));renderList();}));
async function toggleItem(item,completed){
  if(busy)return;busy=true;renderList();
  try{installState(await api('/api/together',{action:'toggleItem',id:item.id,expectedRevision:item.revision,completed,operationId:uuid()}));notice('A little wish to look forward to again.');}
  catch(error){notice(error.message,error);if(error.status===409)await loadAfterConflict();}
  finally{busy=false;renderList();renderHearts();}
}
async function loadAfterConflict(){try{installState(await api('/api/together'));}catch{}}
const dialog=$('#plan-dialog'), form=$('#plan-form');
function syncPhotoField(){
  const completed=$('#plan-completed').checked;$('#plan-photo-field').hidden=!completed;
  const preview=$('#plan-photo-preview');const source=chosenPhoto || (editing?.item?.photoId?`/api/together-photo?kind=bucket&id=${editing.item.photoId}`:null);
  preview.hidden=!source;if(source)$('#plan-photo-preview-image').src=source;
  $('#clear-chosen-photo').hidden=!chosenPhoto;
  $('#save-plan').textContent=completed?'Save our memory':'Save our wish';
}
function openPlan(item,{complete=false,remove=false}={}){
  if(!dialog || busy || !isWritable())return;
  returnFocus=document.activeElement;editing={id:item?.id || uuid(),item: item?structuredClone(item):null,remove};chosenPhoto=null;photoBusy=false;form.reset();
  $('#plan-dialog-title').textContent=remove?'Make room for another wish.':item?'Our little plan.':'Add a little wish.';
  $('#plan-dialog-description').textContent=remove?'':'It doesn’t have to be grand. It just has to be ours.';
  form.hidden=remove;$('#delete-plan-confirmation').hidden=!remove;
  $('#delete-plan-description').textContent=remove?`Remove “${item.title}” from our list?`:'';
  $('#plan-title').value=item?.title || '';$('#plan-place').value=item?.place || '';$('#plan-note').value=item?.note || '';
  $('#plan-completed').checked=complete || item?.completed || false;$('#plan-form-status').textContent='';$('#review-latest-plan').hidden=true;$('#plan-login').hidden=true;$('#plan-photo-help').textContent='Keep a picture with this completed wish.';
  $('#save-plan').disabled=false;$('#confirm-delete-plan').disabled=false;syncPhotoField();
  dialog.showModal();document.body.classList.add('shared-dialog-open');(remove?$('#confirm-delete-plan'):$('#plan-title')).focus();
}
function closePlan(){if(busy || photoBusy)return;dialog.close();}
dialog?.addEventListener('close',()=>{document.body.classList.remove('shared-dialog-open');chosenPhoto=null;editing=null;returnFocus?.focus({preventScroll:true});});
dialog?.addEventListener('cancel',event=>{if(busy || photoBusy)event.preventDefault();});
$$('[data-close-plan]').forEach(button=>button.addEventListener('click',closePlan));
$$('[data-add-plan]').forEach(button=>{button.disabled=true;button.addEventListener('click',()=>openPlan(null));});
$('#plan-completed')?.addEventListener('change',syncPhotoField);
$('#clear-chosen-photo')?.addEventListener('click',()=>{chosenPhoto=null;$('#plan-photo').value='';$('#plan-photo-help').textContent='Keep a picture with this completed wish.';syncPhotoField();});
async function compressPhoto(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPG, PNG, or WebP photo.');
  if(file.size>25000000)throw new Error('Choose a photo smaller than 25 MB.');
  let bitmap;
  try{bitmap=await createImageBitmap(file);}catch{throw new Error('This photo couldn’t be opened. Try a JPG, PNG, or WebP picture.');}
  try{
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    let quality=.86, data=canvas.toDataURL('image/jpeg',quality);
    while(data.length>420000 && quality>.34){quality-=.08;data=canvas.toDataURL('image/jpeg',quality);}
    if(data.length>420000){const small=document.createElement('canvas');small.width=Math.round(canvas.width*.65);small.height=Math.round(canvas.height*.65);small.getContext('2d').drawImage(canvas,0,0,small.width,small.height);data=small.toDataURL('image/jpeg',.72);}
    if(data.length>420000)throw new Error('This picture is still a little too big. Choose a smaller version.');return data;
  }finally{bitmap.close();}
}
$('#plan-photo')?.addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  photoBusy=true;$('#save-plan').disabled=true;$('#plan-photo-help').textContent='Getting your picture ready…';
  try{chosenPhoto=await compressPhoto(file);$('#plan-photo-help').textContent='Your picture is ready to save with this memory. ♡';syncPhotoField();}
  catch(error){$('#plan-photo-help').textContent=error.message;event.target.value='';}
  finally{photoBusy=false;$('#save-plan').disabled=busy;}
});
async function savePlan(remove=false){
  if(busy || photoBusy || !editing)return;
  const snapshot=editing;
  const input={action:remove?'removeItem':'saveItem',id:snapshot.id,expectedRevision:snapshot.item?.revision || null,operationId:uuid()};
  if(!remove)Object.assign(input,{title:$('#plan-title').value,place:$('#plan-place').value,note:$('#plan-note').value,completed:$('#plan-completed').checked,...(chosenPhoto && $('#plan-completed').checked?{photo:chosenPhoto}:{})});
  busy=true;$('#save-plan').disabled=true;$('#confirm-delete-plan').disabled=true;$('#plan-form-status').textContent=remove?'Making a little space…':'Keeping this little plan for both of us…';$('#review-latest-plan').hidden=true;
  try{installState(await api('/api/together',input));busy=false;dialog.close();notice(remove?'A little space for our next wish.':input.completed?'One more little memory, kept for us. ♡':'Our little wish is saved. ♡');}
  catch(error){$('#plan-form-status').textContent=error.message;$('#plan-login').hidden=error.status!==401;if(error.status===409){await loadAfterConflict();$('#review-latest-plan').hidden=false;}}
  finally{busy=false;$('#save-plan').disabled=false;$('#confirm-delete-plan').disabled=false;renderHearts();renderList();}
}
form?.addEventListener('submit',event=>{event.preventDefault();savePlan();});
$('#confirm-delete-plan')?.addEventListener('click',()=>savePlan(true));
$('#review-latest-plan')?.addEventListener('click',()=>{const current=shared?.bucketList.find(item=>item.id===editing?.id);const removing=editing?.remove;dialog.close();if(current)openPlan(current,{remove:removing});else notice('This little wish was removed on the other screen.');});
function openPhoto(item){
  const lightbox=$('#bucket-lightbox');if(!lightbox)return;returnFocus=document.activeElement;
  $('#bucket-lightbox-image').src=`/api/together-photo?kind=bucket&id=${item.photoId}`;$('#bucket-lightbox-image').alt=`Our memory: ${item.title}`;$('#bucket-lightbox-caption').textContent=item.title;lightbox.showModal();document.body.classList.add('shared-dialog-open');
}
$('#close-bucket-photo')?.addEventListener('click',()=>$('#bucket-lightbox').close());
$('#bucket-lightbox')?.addEventListener('close',()=>{document.body.classList.remove('shared-dialog-open');returnFocus?.focus({preventScroll:true});});
loadShared();loadMemory();renderHearts();queueHeartFlush();
setInterval(()=>{if(!document.hidden && !busy && !dialog?.open){loadShared({quiet:true});queueHeartFlush();}},15000);
setInterval(()=>{if(!document.hidden && !busy)loadMemory();},60000);
window.addEventListener('focus',()=>{if(!busy && !dialog?.open){loadShared({quiet:true});loadMemory();}});
