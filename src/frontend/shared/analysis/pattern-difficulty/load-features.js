// Time-weighted hand load: sparse rests and dense bursts get their actual duration.
// The existing tap statistics are event-weighted, which can overvalue brief bursts.
const stats=(out,key,a)=>{
  const sorted=[...a].sort((x,y)=>x-y),n=a.length;
  for(const p of [2,4,8])out[key+'_power'+p]=n?(a.reduce((s,x)=>s+x**p,0)/n)**(1/p):0;
  for(const q of [.7,.9]){
    const tail=sorted.slice(Math.floor(n*q));
    out[key+'_top'+Math.round((1-q)*100)]=tail.length?tail.reduce((s,x)=>s+x,0)/tail.length:0;
  }
};
export function loadFeatures(rows) {
  const end=rows.at(-1)?.t??0,step=250,bins=Math.floor(end/step)+1;
  const hands=[0,1].map(()=>Object.fromEntries(['finger','repeat','chord','change'].map(k=>[k,new Float64Array(bins)])));
  const state=[0,1].map(()=>({last:[-Infinity,-Infinity],mask:0,t:-Infinity,run:[0,0]}));
  for(const row of rows)for(let h=0;h<2;h++){
    const notes=row.notes.filter(n=>(n.col>>1)===h);if(!notes.length)continue;
    const s=state[h],dt=row.t-s.t,mask=notes.reduce((a,n)=>a|1<<(n.col%2),0),b=Math.floor(row.t/step);
    const hz=1000/Math.max(25,dt),continuous=dt<=500;
    for(const n of notes){
      const c=n.col%2,gap=row.t-s.last[c],f=1000/Math.max(25,gap);
      const direct=continuous&&Boolean(s.mask&(1<<c));s.run[c]=direct?s.run[c]+1:0;
      hands[h].finger[b]+=f**2;
      hands[h].repeat[b]+=direct?f**2*(1+.04*Math.min(16,s.run[c])):0;
    }
    hands[h].chord[b]+=notes.length===2?hz**2:0;
    hands[h].change[b]+=continuous&&mask!==s.mask?hz**2:0;
    for(const n of notes)s.last[n.col%2]=row.t;
    s.mask=mask;s.t=row.t;
  }
  const out={};
  for(const channel of ['finger','repeat','chord','change'])for(const seconds of [1,4,16]){
    const width=seconds*1000/step;
    const averages=hands.map(hand=>{
      let sum=0;return hand[channel].map((v,i)=>{sum+=v;if(i>=width)sum-=hand[channel][i-width];return Math.sqrt(Math.max(0,sum/seconds));});
    });
    const values=averages[0].map((v,i)=>Math.max(v,averages[1][i])+.15*Math.min(v,averages[1][i]));
    stats(out,'load_'+channel+seconds,values);
  }
  return out;
}
