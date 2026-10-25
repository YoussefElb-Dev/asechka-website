export const heartDay=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export class HeartOutbox {
  constructor({load=()=>[],save=()=>{},uuid=()=>crypto.randomUUID()}={}){
    this.save=save;this.uuid=uuid;
    const stored=load();this.items=Array.isArray(stored)?stored.filter(x=>['me','asechka'].includes(x.from)&&/^\d{4}-\d{2}-\d{2}$/.test(x.day)&&typeof x.operationId==='string'&&Number.isSafeInteger(x.count)&&x.count>0&&x.count<=1000000):[];
  }
  commit(next){this.save(next);this.items=next;}
  tap(from,day=heartDay()){
    if(!['me','asechka'].includes(from))throw new Error('Choose your side first.');
    const next=this.items.map(x=>({...x})),batch=[...next].reverse().find(x=>!x.sealed&&x.from===from&&x.day===day&&x.count<1000000);
    if(batch)batch.count++;else next.push({from,day,count:1,operationId:this.uuid(),sealed:false});
    this.commit(next);
  }
  seal(){
    if(!this.items.length)return null;
    const next=this.items.map(x=>({...x}));next[0].sealed=true;this.commit(next);
    const {sealed,...body}=next[0];return {action:'sendHeart',...body};
  }
  acknowledge(id){this.commit(this.items.filter(x=>x.operationId!==id));}
  count(from,day,receipts=[]){const received=new Set(receipts);return this.items.reduce((sum,x)=>sum+(x.from===from&&x.day===day&&!received.has(x.operationId)?x.count:0),0);}
}
