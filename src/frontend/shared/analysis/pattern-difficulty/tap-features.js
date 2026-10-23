// Event-based 4K geometry: no titles, labels, difficulty settings or external estimators.
const pop=m=>(m&1)+((m>>1)&1)+((m>>2)&1)+((m>>3)&1);
function summarize(out,key,a) {
  a.sort((x,y)=>x-y);const n=a.length;
  for(const q of [.5,.75,.9,.95,.99,1]) {
    const p=Math.max(0,n-1)*q,i=Math.floor(p);
    out[key+'_q'+Math.round(q*100)]=n?a[i]+(a[Math.min(n-1,i+1)]-a[i])*(p-i):0;
  }
  out[key+'_mean']=n?a.reduce((s,x)=>s+x,0)/n:0;
  for(const fraction of [.05,.2]) {
    const tail=a.slice(Math.floor(n*(1-fraction)));
    out[key+'_top'+Math.round(fraction*100)]=tail.length?tail.reduce((s,x)=>s+x,0)/tail.length:0;
  }
}
export function tapFeatures(rows) {
  const result={}, channels={finger:[],jack:[],trill:[],chord:[],tech:[],speed:[]};
  const last=Array(4).fill(-Infinity),lastGap=Array(4).fill(1000),chain=Array(4).fill(0);
  const prevHand=[-Infinity,-Infinity],prevMask=[0,0],prevDt=[1000,1000];
  const state=Object.fromEntries(Object.keys(channels).map(k=>[k,[0,0]]));
  const times=rows.map(r=>r.t),heads=rows.map(r=>r.notes.length),prefix=[0];
  heads.forEach(n=>prefix.push(prefix.at(-1)+n));
  for(const ms of [250,1000,4000,16000]) {
    let left=0;const vals=[];
    for(let i=0;i<rows.length;i++) {while(times[left]<=times[i]-ms)left++;vals.push((prefix[i+1]-prefix[left])*1000/ms);}
    summarize(result,'tap_nps'+ms,vals);
  }
  const runs=[],intervals=[],ratios=[],handIntervals=[];
  for(const row of rows) {
    const vals=Object.fromEntries(Object.keys(channels).map(k=>[k,[0,0]]));
    for(let hand=0;hand<2;hand++) {
      const notes=row.notes.filter(n=>(n.col>>1)===hand);if(!notes.length)continue;
      const dt=row.t-prevHand[hand],mask=notes.reduce((a,n)=>a|1<<n.col,0);
      const hz=1000/Math.max(35,dt),size=notes.length;
      if(Number.isFinite(dt))handIntervals.push(hz);
      const repeat=pop(mask&prevMask[hand]);
      const rhythm=dt<600&&prevDt[hand]<600?Math.abs(Math.log2(dt/prevDt[hand])):0;
      for(const n of notes) {
        const gap=row.t-last[n.col],f=1000/Math.max(35,gap);
        if(Number.isFinite(gap))intervals.push(f);
        const direct=gap<500&&Boolean(prevMask[hand]&(1<<n.col));
        if(direct)chain[n.col]++;else {if(chain[n.col])runs.push(chain[n.col]);chain[n.col]=0;}
        vals.finger[hand]+=f**1.3;
        vals.jack[hand]+=direct?f**1.8*(1+Math.min(chain[n.col],16)*.035):0;
        if(gap<600&&lastGap[n.col]<600)ratios.push(Math.min(4,Math.abs(Math.log2(gap/lastGap[n.col]))));
        lastGap[n.col]=gap;
      }
      vals.trill[hand]=size===1&&repeat===0&&dt<500?hz**1.6:0;
      vals.chord[hand]=size===2?hz**1.5:0;
      vals.tech[hand]=hz**1.3*(rhythm+.25*pop(mask^prevMask[hand]));
      vals.speed[hand]=hz**1.5*(1-.5*repeat/size)*size**.3;
      for(const n of notes)last[n.col]=row.t;
      prevHand[hand]=row.t;prevDt[hand]=dt;prevMask[hand]=mask;
    }
    const delta=row===rows[0]?1000:row.t-times[channels.finger.length-1];
    for(const k of Object.keys(channels)) {
      for(let h=0;h<2;h++)state[k][h]=state[k][h]*Math.exp(-delta/700)+vals[k][h];
      channels[k].push(Math.max(...state[k])+.15*Math.min(...state[k]));
    }
  }
  runs.push(...chain.filter(x=>x>0));
  for(const [key,a] of Object.entries({...channels,run:runs,interval:intervals,handInterval:handIntervals,irregular:ratios}))summarize(result,'tap_'+key,a);
  // Fixed-duration section maxima distinguish sustained load from isolated bursts.
  for(const [k,a] of Object.entries(channels))for(const seconds of [1,4,16]) {
    const bins=new Float64Array(Math.floor(times.at(-1)/(seconds*1000))+1);
    a.forEach((v,i)=>{const b=Math.floor(times[i]/(seconds*1000));bins[b]=Math.max(bins[b],v);});
    summarize(result,'tap_peak'+seconds+'_'+k,Array.from(bins));
  }
  return result;
}
