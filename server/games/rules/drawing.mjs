import { createHash } from 'node:crypto';

// Original two-player drawing/guessing rules. The server owns words and time.
export const COLORS = ['#263451','#a292cf','#cd8ca7','#76b4ab','#c5a576','#8cb4d5','#ffffff'];
const WORDS = 'butterfly,rainbow,snowman,umbrella,pizza,cat,dog,elephant,octopus, penguin,castle,rocket,moon,sun,star,flower,tree,bicycle,airplane,train,camera,guitar,book,crown,heart,ice cream,birthday cake,hot air balloon,lighthouse,waterfall,treasure chest,roller coaster,mermaid,dinosaur,dragon,robot,beach,mountain,volcano,spaceship,fireworks,snowflake,glasses,headphones,teapot,strawberry,pineapple,watermelon,turtle,rabbit,hedgehog,sailboat,submarine,skateboard,windmill,tent,campfire,carrot,mushroom,ghost,witch,pirate,unicorn,koala,flamingo,peacock,lion,crocodile,jellyfish,raincoat,scarecrow,mailbox,clock,ladder,bridge,igloo,whale,hamburger,sandcastle,ferris wheel,cowboy,astronaut,beekeeper,spider web,traffic light,shooting star,wedding ring,love letter,coffee cup,palm tree,teddy bear,fire engine,toothbrush,cheese,donut,popcorn,violin,paintbrush'.split(',').map(w=>w.trim());
const copy = s => structuredClone(s);
const normalize = s => s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const assertPlayer = p => { if(p!==0&&p!==1)throw new Error('Invalid player'); };
export function settings(raw={}) {
  const value = {rounds:3,drawSeconds:80,wordChoices:3,hints:2,customWords:[],customOnly:false};
  for(const [key,min,max] of [['rounds',1,5],['drawSeconds',30,180],['wordChoices',1,5],['hints',0,3]]) if(raw[key]!==undefined){if(!Number.isInteger(raw[key])||raw[key]<min||raw[key]>max)throw new Error(`Invalid drawing ${key}`);value[key]=raw[key];}
  if(raw.customWords!==undefined){if(!Array.isArray(raw.customWords)||raw.customWords.length>100)throw new Error('Use up to 100 custom words');value.customWords=[...new Set(raw.customWords.map(w=>{if(typeof w!=='string'||! /^[\p{L}\p{N}][\p{L}\p{N} '\-]{0,39}$/u.test(w.trim()))throw new Error('Custom words need 1–40 letters');return normalize(w);} ))];}
  if(raw.customOnly!==undefined&&typeof raw.customOnly!=='boolean')throw new Error('Invalid custom word setting');
  value.customOnly=raw.customOnly===true;
  if(value.customOnly&&value.customWords.length<value.wordChoices)throw new Error('Add enough custom words for the word choices');
  return value;
}
function choose(s,now){
  s.phase='choose';s.turn=s.drawer;s.word=null;s.strokes=[];s.revealed=[];s.lastResult=null;
  const pool=s.config.customOnly?s.config.customWords:[...new Set([...WORDS,...s.config.customWords])];
  s.choices=[...pool].sort((a,b)=>rank(s,a)-rank(s,b)).slice(0,s.config.wordChoices);
  s.deadline=now+15000;
}
const rank=(s,w)=>createHash('sha256').update(`${s.seed}:${s.turnIndex}:${w}`).digest().readUInt32BE();
function start(s,word,now){s.word=word;s.choices=[];s.phase='draw';s.startedAt=now;s.deadline=now+s.config.drawSeconds*1000;s.nextHint=now+s.config.drawSeconds*1000/(s.config.hints+1);}
function reveal(s,now,correct){
  let guessPoints=0,drawPoints=0;
  if(correct){guessPoints=100+Math.ceil(400*Math.max(0,s.deadline-now)/(s.config.drawSeconds*1000));drawPoints=100+Math.round(guessPoints*.25);s.points[1-s.drawer]+=guessPoints;s.points[s.drawer]+=drawPoints;}
  s.lastResult={correct,word:s.word,guessPoints,drawPoints};s.phase='reveal';s.deadline=now+5000;
  s.chat.push({player:1-s.drawer,text:correct?'Guessed the word!':'Time is up!',kind:correct?'correct':'system'});s.chat=s.chat.slice(-40);
}
export function create(raw={}){
  const s={turn:0,drawer:0,winner:null,phase:'choose',round:1,turnIndex:0,points:[0,0],word:null,choices:[],strokes:[],chat:[],revealed:[],seed:raw.seed||'drawing',config:settings(raw),lastResult:null};
  choose(s,raw.now??0);return s;
}
export function expire(state,now){
  const s=copy(state);if(s.winner!==null)return s;
  if(s.phase==='draw'&&now<s.deadline){
    while(s.revealed.length<s.config.hints&&now>=s.nextHint){const letters=[...s.word].map((c,i)=>/[\p{L}\p{N}]/u.test(c)&&!s.revealed.includes(i)?i:-1).filter(i=>i>=0);if(letters.length<=1)break;s.revealed.push(letters[rank(s,String(s.revealed.length))%letters.length]);s.nextHint+=s.config.drawSeconds*1000/(s.config.hints+1);}
  }else if(now>=s.deadline){
    if(s.phase==='choose')start(s,s.choices[0],now);
    else if(s.phase==='draw')reveal(s,now,false);
    else if(s.phase==='reveal'){
      s.turnIndex++;
      if(s.turnIndex>=s.config.rounds*2){s.phase='finished';s.winner=s.points[0]===s.points[1]?'draw':s.points[0]>s.points[1]?0:1;delete s.deadline;}
      else{s.drawer=s.turnIndex%2;s.round=Math.floor(s.turnIndex/2)+1;choose(s,now);}
    }
  }
  return s;
}
const distance=(a,b)=>{let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}return row[b.length];};
export function apply(state,player,action,raw={}){
  assertPlayer(player);const now=raw.now??0,s=expire(state,now);
  if(s.winner!==null)throw new Error('Game is over');
  if(!action||typeof action!=='object')throw new Error('Invalid drawing action');
  if(s.phase==='choose'&&action.type==='choose'){
    if(player!==s.drawer||!Number.isInteger(action.index)||!s.choices[action.index])throw new Error('Choose one of your words');
    start(s,s.choices[action.index],now);return s;
  }
  if(s.phase!=='draw')throw new Error('Wait for the next drawing');
  if(action.type==='guess'){
    if(player===s.drawer)throw new Error('The artist cannot guess');
    if(typeof action.text!=='string'||!action.text.trim()||action.text.length>80)throw new Error('Write a guess of up to 80 characters');
    if(now-(s.lastGuessAt??-Infinity)<450)throw new Error('Give your guesses a moment');s.lastGuessAt=now;
    const text=normalize(action.text);
    if(text===normalize(s.word)){reveal(s,now,true);return s;}
    const close=text.length>3&&distance(text,normalize(s.word))===1;
    s.chat.push({player,text:action.text.trim(),kind:close?'close':'guess'});s.chat=s.chat.slice(-40);return s;
  }
  if(player!==s.drawer)throw new Error('Only the artist can draw');
  if(action.type==='clear'){s.strokes=[];return s;}
  if(action.type==='undo'){s.strokes.pop();return s;}
  if(action.type!=='stroke'||!['pen','eraser','fill'].includes(action.tool)||!COLORS.includes(action.color)||!Number.isFinite(action.width)||action.width<.002||action.width>.08||!Array.isArray(action.points)||action.points.length<1||action.points.length>150)throw new Error('Invalid brush stroke');
  if(s.strokes.length>=300)throw new Error('Undo or clear before drawing more');
  const points=action.points.map(p=>{if(!Array.isArray(p)||p.length!==2||!p.every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw new Error('Keep drawing inside the canvas');return p.map(n=>Math.round(n*10000)/10000);});
  s.strokes.push({tool:action.tool,color:action.color,width:action.width,points});return s;
}
export function view(state,player){
  assertPlayer(player);
  // Explicit projection: never send the pool, seed or active word to the guesser.
  const {turn,drawer,winner,phase,round,points,strokes,chat,deadline,lastResult}=state;
  const pattern=state.word?[...state.word].map((c,i)=>/[\p{L}\p{N}]/u.test(c)&&!state.revealed.includes(i)?'_':c).join(''):'';
  return copy({turn,drawer,winner,phase,round,points,strokes,chat,deadline,lastResult,pattern,rounds:state.config.rounds,word:player===drawer||phase==='reveal'||phase==='finished'?state.word:null,choices:player===drawer&&phase==='choose'?state.choices:[]});
}
