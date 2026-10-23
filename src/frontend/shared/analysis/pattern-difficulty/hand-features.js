// Each hand is processed in isolation. Other-hand notes never reset finger/row history.
// Symmetric pooling preserves hand swaps and finger swaps within each hand.
export const HAND_CONFIG = Object.freeze({ crossHandWeight: .15, binMs: 500,
  strainDecayMs: 600, fatigueLoadSeconds: 20, fatigueRecoverySeconds: 8 });
const CHANNELS = ['speed', 'jack', 'chord', 'tech', 'ln', 'physical', 'strain', 'hold', 'heads'];
const pop = m => (m & 1) + ((m >> 1) & 1);
const rate = (gap, prior = 1000) => 1000 / ((Number.isFinite(gap) ? gap : prior) + 30);
function stats(out, name, values) {
  const sorted = [...values].sort((a,b)=>a-b), n=sorted.length;
  out[name+'_mean']=n?sorted.reduce((a,b)=>a+b,0)/n:0;
  for(const q of [.5,.9,.98,1]) {
    const p=(n-1)*q, i=Math.max(0,Math.floor(p));
    out[name+'_p'+Math.round(100*q)]=n?sorted[i]+(sorted[Math.min(n-1,i+1)]-sorted[i])*(p-i):0;
  }
}
function smooth(values, size) {
  let sum=0;
  return values.map((v,i)=>{sum+=v;if(i>=size)sum-=values[i-size];return Math.max(0,sum/size);});
}
function oneHand(rows, hand, binsCount) {
  const bins=Object.fromEntries(CHANNELS.map(k=>[k,new Float64Array(binsCount)]));
  const last=[-Infinity,-Infinity], held=[-Infinity,-Infinity], chains=[0,0];
  const fingerRates=[], rowRates=[], trillRates=[], jackRates=[];
  let previous=-Infinity,previousDt=Infinity,mask=0,strain=0,headCount=0,handRows=0;
  let doubles=0,changes=0,trills=0,miniJacks=0,heldPeer=0;
  for(const row of rows) {
    const notes=row.notes.filter(n=>(n.col>>1)===hand);
    if(!notes.length)continue;
    const t=row.t,b=Math.floor(t/500),m=notes.reduce((s,n)=>s|1<<(n.col%2),0),size=notes.length;
    const dt=t-previous, hz=rate(dt), continuous=dt<=500;
    const irregular=continuous&&previousDt<=500?Math.min(2,Math.abs(Math.log2(dt/previousDt))):0;
    let j=0,physical=0,coord=0,repeat=0;
    const heldBefore=held.map(e=>e>t);
    for(const n of notes) {
      const c=n.col%2, gap=t-last[c], f=rate(gap);
      const repeated=continuous&&(mask&(1<<c));
      chains[c]=repeated?chains[c]+1:0;
      if(Number.isFinite(gap))fingerRates.push(f);
      if(repeated){repeat++;miniJacks++;jackRates.push(f);}
      j+=(repeated?1:0)*Math.pow(f/5,.65)*(1+.08*Math.min(12,chains[c]));
      // Only the other finger of THIS hand supplies the strong chord/LN constraint.
      const peer=heldBefore[c^1]?1:0;
      physical+=Math.pow(f/5,.35)*(1+.3*(size-1)+.25*peer);
      if(peer){heldPeer++;coord+=.6;}
      if(n.end>t) {
        coord+=.7;
        for(let i=b;i<=Math.floor(n.end/500);i++)bins.hold[i]+=Math.max(0,Math.min(n.end,(i+1)*500)-Math.max(t,i*500))/500;
        bins.ln[Math.floor(n.end/500)]+=1.3;
        held[c]=n.end;
      }
    }
    const change=continuous?pop(m^mask)/2:0;
    if(continuous&&size===1&&pop(mask)===1&&m!==mask){trills++;trillRates.push(hz);}
    if(continuous&&size!==pop(mask))changes++;
    if(size===2)doubles++;
    bins.heads[b]+=2*size;
    bins.speed[b]+=2*Math.pow(size,.3)*Math.pow(hz/5,.35)*(1-.6*repeat/size);
    bins.jack[b]+=2*j;
    bins.chord[b]+=2*(size-1)*Math.pow(hz/5,.35);
    bins.tech[b]+=2*Math.pow(hz/5,.35)*(irregular*size+.35*change*size);
    bins.ln[b]+=2*coord;bins.physical[b]+=2*physical;
    // Local event strain also captures short bursts without a global row clock.
    strain=strain*Math.exp(-(Number.isFinite(dt)?dt:1000)/HAND_CONFIG.strainDecayMs)+physical+.5*j+.25*coord;
    bins.strain[b]=Math.max(bins.strain[b],strain);
    for(const n of notes)last[n.col%2]=t;
    if(Number.isFinite(dt))rowRates.push(hz);
    headCount+=size;handRows++;previous=t;previousDt=dt;mask=m;
  }
  let fatigue=0;
  bins.fatigue=Float64Array.from(bins.physical,load=>{
    const drive=Math.max(0,(load-3)/5)**1.5, tau=load>3?20:8, decay=Math.exp(-.5/tau);
    fatigue=fatigue*decay+drive*(1-decay);return fatigue;
  });
  const descriptors={doubleRatio:handRows?doubles/handRows:0,changeRatio:handRows?changes/handRows:0,
    trillRatio:handRows?trills/handRows:0,jackRatio:headCount?miniJacks/headCount:0,heldPeerRatio:headCount?heldPeer/headCount:0};
  for(const [k,v] of Object.entries({fingerHz:fingerRates,rowHz:rowRates,trillHz:trillRates,jackHz:jackRates}))stats(descriptors,k,v);
  return {bins,descriptors};
}
export function handFeatures(rows, binCount, includeTimeline=false) {
  const hands=[0,1].map(h=>oneHand(rows,h,binCount)), features={};
  for(const k of Object.keys(hands[0].descriptors)) {
    const a=hands[0].descriptors[k],b=hands[1].descriptors[k];
    features['hand_'+k+'_max']=Math.max(a,b);features['hand_'+k+'_min']=Math.min(a,b);
  }
  const pressure={},timeline={};
  for(const channel of Object.keys(hands[0].bins)) {
    for(const seconds of [2,8,30]) {
      const a=smooth(hands[0].bins[channel],seconds*2),b=smooth(hands[1].bins[channel],seconds*2);
      // Pool AFTER temporal smoothing, so alternating hands are not a single continuously busy hand.
      const dominant=a.map((v,i)=>Math.max(v,b[i]));
      const pooled=a.map((v,i)=>Math.max(v,b[i])+.15*Math.min(v,b[i]));
      stats(features,'hand_'+channel+seconds,pooled);
      if(seconds===2) {
        stats(features,'handDominant_'+channel,dominant);
        pressure[channel]=features['hand_'+channel+seconds+'_p90'];
      }
    }
    if(includeTimeline)timeline[channel]=hands.map(h=>Array.from(h.bins[channel]));
  }
  return {features,pressure,...(includeTimeline?{timeline}:{})};
}
