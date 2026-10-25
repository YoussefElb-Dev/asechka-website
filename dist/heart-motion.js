const LIMIT=96,colors=['#a18bd3','#889fce','#d393bd'];
let canvas,context,particles=[],frame=0,sprites=[],observer;
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
const reduced=()=>motionPreference.matches || document.body.classList.contains('motion-paused');
function promote(){
  if(!canvas)return;
  if(typeof canvas.showPopover==='function'){
    if(canvas.matches(':popover-open'))canvas.hidePopover();
    canvas.showPopover();
  }else{
    // Older browsers do not have the top layer API. A fixed canvas in the active
    // dialog also stays above its content without inheriting a card's clipping.
    const host=[...document.querySelectorAll('dialog[open]')].at(-1)||document.body;
    if(canvas.parentElement!==host)host.append(canvas);
  }
}
function resize(){
  const ratio=Math.min(devicePixelRatio||1,2),width=innerWidth,height=innerHeight;
  canvas.width=Math.ceil(width*ratio);canvas.height=Math.ceil(height*ratio);
  canvas.style.width=width+'px';canvas.style.height=height+'px';context.setTransform(ratio,0,0,ratio,0,0);
}
function setup(){
  if(canvas)return;
  canvas=document.createElement('canvas');canvas.id='floating-heart-layer';canvas.setAttribute('aria-hidden','true');canvas.setAttribute('popover','manual');
  Object.assign(canvas.style,{position:'fixed',inset:'0',margin:'0',padding:'0',border:'0',background:'transparent',pointerEvents:'none',overflow:'visible',zIndex:'2147483647',maxWidth:'none',maxHeight:'none'});
  document.body.append(canvas);context=canvas.getContext('2d',{alpha:true});resize();
  sprites=colors.map(color=>{const sprite=document.createElement('canvas');sprite.width=sprite.height=96;const c=sprite.getContext('2d');c.scale(2,2);c.fillStyle=color;c.beginPath();c.moveTo(24,43);c.bezierCurveTo(19,37,2,27,4,16);c.bezierCurveTo(6,1,20,1,24,12);c.bezierCurveTo(28,1,42,1,44,16);c.bezierCurveTo(46,27,29,37,24,43);c.closePath();c.fill();return sprite;});
  addEventListener('resize',resize,{passive:true});
  observer=new MutationObserver(records=>{if(particles.length && records.some(r=>r.target.tagName==='DIALOG'))promote();});
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
}
function stop(){cancelAnimationFrame(frame);frame=0;particles=[];if(context)context.clearRect(0,0,innerWidth,innerHeight);if(canvas && typeof canvas.hidePopover==='function' && canvas.matches(':popover-open'))canvas.hidePopover();}
function draw(now){
  if(reduced()){stop();return;}
  context.clearRect(0,0,innerWidth,innerHeight);
  let alive=0;
  for(let index=0;index<particles.length;index++){const p=particles[index];if(now-p.born>=p.duration)continue;particles[alive++]=p;const t=(now-p.born)/p.duration;if(t<0)continue;const size=p.size*(.6+.4*Math.min(1,t*12));context.save();context.globalAlpha=Math.min(1,t*15)*Math.min(1,(1-t)*4);context.translate(p.x+Math.sin(t*7+p.phase)*26,p.y-t*(p.y+90));context.rotate(Math.sin(t*5+p.phase)*.24);context.drawImage(sprites[p.color],-size/2,-size/2,size,size);context.restore();}
  particles.length=alive;
  if(particles.length)frame=requestAnimationFrame(draw);else stop();
}
export function floatHearts(anchor,count=1){
  if(reduced())return;setup();
  const rect=anchor.getBoundingClientRect();
  for(let i=0;i<count;i++){if(particles.length>=LIMIT)particles.shift();particles.push({born:performance.now(),x:rect.left+rect.width*(.3+Math.random()*.4),y:rect.top+rect.height/2,phase:Math.random()*Math.PI*2,size:20+Math.random()*15,duration:2000+Math.random()*450,color:Math.floor(Math.random()*3)});}
  if(!frame){promote();frame=requestAnimationFrame(draw);}
}
