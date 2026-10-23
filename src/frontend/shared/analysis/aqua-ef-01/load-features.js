// ef-relative-2 browser port. Frozen v1 features stay unchanged.
import {extractAquaFeatures} from './base-features.js';
export const FEATURE_VERSION='ef-relative-2';
export const PROFILES={
  original:{coverage:.2,gate:4,rest:1,light:.35,single:.125,decay:[15,120],debt:3},
  gentle:{coverage:.2,gate:2,rest:.5,light:.15,single:.08,decay:[30,180],debt:1},
  responsive:{coverage:.15,gate:3,rest:.8,light:.25,single:.1,decay:[20,150],debt:2}
};
const sum=a=>a.reduce((s,x)=>s+x,0),clip=x=>Math.max(0,Math.min(1,x));
const bounded=x=>x<=180?x:180+20*-Math.expm1(-(x-180)/20);
function quantile(a,q){const v=[...a].sort((a,b)=>a-b),p=(v.length-1)*q,i=Math.floor(p);return v[i]+(v[Math.min(i+1,v.length-1)]-v[i])*(p-i);}
function weightedQuantile(values,weights,q){const order=Array.from(values,(_,i)=>i).sort((i,j)=>values[i]-values[j]),target=q*sum(weights);let s=0;for(const i of order){s+=weights[i];if(s>=target)return values[i];}return values[order.at(-1)];}

export function segmentAnchor(notes){
  const times=[...new Set(notes.map(n=>n[0]))],unit=times.length>1?quantile(times.slice(1).map((t,i)=>t-times[i]),.5):1;
  const t=times.map(x=>(x-times[0])/Math.max(unit,1e-12)),gaps=t.map((x,i)=>i?x-t[i-1]:1),rows=times.map(()=>[0,0]),lookup=new Map(times.map((x,i)=>[x,i]));
  for(const [time,c] of notes)rows[lookup.get(time)][c%2]=1;
  const weights=rows.map(sum),total=sum(weights),out={};
  for(const tau of [1,4,8]){
    let load=[0,0];const signed=[];
    for(let i=0;i<rows.length;i++){load=rows[i].map((x,c)=>load[c]*Math.exp(-Math.min(700,gaps[i]/tau))+x);signed.push((load[0]-load[1])/Math.max(sum(load),1e-12));}
    const absolute=signed.map(Math.abs),prefix=`seg${tau}`;
    out[prefix+'_mean']=sum(absolute.map((x,i)=>x*weights[i]))/total;
    out[prefix+'_p50']=weightedQuantile(absolute,weights,.5);out[prefix+'_p95']=weightedQuantile(absolute,weights,.95);
    for(const threshold of [.35,.65]){
      const tag=prefix+`_t${Math.round(threshold*100)}`,runs=[],duration=[],strength=[];let count=0,span=0,dose=0,sign=0;
      for(let i=0;i<signed.length;i++){
        const direction=Math.abs(signed[i])>=threshold?Math.sign(signed[i]):0;
        if(direction!==sign||gaps[i]>4){if(count){runs.push(count);duration.push(span);strength.push(dose);}count=span=dose=0;}
        if(direction){count+=weights[i];span+=Math.min(4,gaps[i]);dose+=Math.abs(signed[i])*weights[i];}sign=direction;
      }
      if(count){runs.push(count);duration.push(span);strength.push(dose);}
      out[tag+'_share']=sum(weights.map((x,i)=>absolute[i]>=threshold?x:0))/total;
      out[tag+'_run_p90']=runs.length?Math.log1p(weightedQuantile(runs,runs,.9)):0;
      out[tag+'_long_share']=sum(runs.filter(x=>x>=16))/total;
      out[tag+'_duration_p90']=runs.length?Math.log1p(weightedQuantile(duration,runs,.9)):0;
      out[tag+'_dose']=sum(strength)/total;
    }
    let switches=0;for(let i=1;i<signed.length;i++)switches+=weights[i]*Number(Math.sign(signed[i])!==Math.sign(signed[i-1]))*Math.min(absolute[i],absolute[i-1]);
    out[prefix+'_switch']=switches/total;
  }
  let repetition=0,counts=[0,0];
  for(let i=0;i<rows.length;i++){
    const repeat=rows[i].map((x,c)=>x*(i?rows[i-1][c]:0)*Number(gaps[i]<=4+1e-9));
    repetition+=Math.abs(repeat[0]-repeat[1])*Math.abs(rows[i][0]-rows[i][1]);counts=counts.map((x,c)=>x+rows[i][c]);
  }
  out.repeat_bias=repetition/total;out.global_share_gap=Math.abs(counts[0]-counts[1])/total;return out;
}

function occupancy(times,edges,coverage){
  const starts=[],ends=[],prefix=[0];
  for(const t of times){if(ends.length&&t<=ends.at(-1))ends[ends.length-1]=Math.max(ends.at(-1),t+coverage);else{starts.push(t);ends.push(t+coverage);}}
  for(let i=0;i<starts.length;i++)prefix.push(prefix.at(-1)+ends[i]-starts[i]);
  const values=new Float64Array(edges.length-1);let index=-1,previous=0;
  for(let i=0;i<edges.length;i++){
    while(index+1<starts.length&&starts[index+1]<=edges[i])index++;
    const covered=index<0?0:prefix[index]+Math.max(0,Math.min(ends[index]-starts[index],edges[i]-starts[index]));
    if(i)values[i-1]=clip((covered-previous)/(edges[i]-edges[i-1]));previous=covered;
  }return values;
}
export function enduranceProfile(notes,profile){
  const p=PROFILES[profile];if(!p)throw Error('未知 AquaTide 恢复参数');
  const t=notes.map(n=>Math.round((n[0]-notes[0][0])*1e6)/1e9),duration=t.at(-1)+p.coverage,bins=Math.ceil(duration*10-1e-8);
  const edges=Array.from({length:bins},(_,i)=>i/10);edges.push(duration);const dt=edges.slice(1).map((x,i)=>x-edges[i]);
  const finger=[0,1].map(c=>occupancy(t.filter((_,i)=>notes[i][1]%2===c),edges,p.coverage)),busy=occupancy([...new Set(t)],edges,p.coverage),rest=busy.map(x=>1-x),single=busy.map((x,i)=>clip(2*x-finger[0][i]-finger[1][i]));
  const counts=new Float64Array(bins),pressure=new Float64Array(bins);for(const time of t)counts[Math.min(bins-1,Math.floor(time*10+1e-8))]++;
  let rolling=0,elapsed=0;for(let i=0;i<bins;i++){rolling+=counts[i]-(i>=10?counts[i-10]:0);elapsed+=dt[i];pressure[i]=rolling/Math.min(elapsed,1);}
  const positive=[],positiveWeights=[];for(let i=0;i<bins;i++)if(pressure[i]>0){positive.push(pressure[i]);positiveWeights.push(dt[i]);}
  const reference=weightedQuantile(positive,positiveWeights,.9),q=pressure.map(x=>Math.min(1.5,x/Math.max(reference,1e-12))),duty=busy.map((x,i)=>x*Math.min(1,q[i]**p.gate));
  const ending=[0,0],peaks=[0,0],state=[[],[]],restRuns=[],blocks=[];
  let effective=0,dose=0,run=0,peakRun=0,restRun=0,block=0,peakBlock=0,restTotal=0,singleTotal=0;
  for(let i=0;i<bins;i++){
    const seconds=dt[i],drive=Math.max(Math.max(0,(q[i]-.7)/.3)**2,.25*duty[i]);
    const recovery=p.rest*rest[i]+p.light*busy[i]*Math.max(0,1-q[i]*q[i])**2+p.single*single[i]/(1+q[i]*q[i]);
    effective+=duty[i]*seconds;dose+=drive*seconds;restTotal+=rest[i]*seconds;singleTotal+=single[i]/(1+q[i]*q[i])*seconds;
    run=Math.max(0,run+(duty[i]-p.debt*rest[i])*seconds);peakRun=Math.max(peakRun,run);
    if(busy[i]<1e-8){restRun+=seconds;if(restRun>=1){if(block)blocks.push(block);block=0;}}
    else{if(restRun)restRuns.push(restRun);restRun=0;block+=duty[i]*seconds;peakBlock=Math.max(peakBlock,block);}
    for(const [j,rise] of [[0,30],[1,90]]){
      const decay=p.decay[j];if(recovery>1e-12){const a=Math.exp(-recovery*seconds/decay);ending[j]=ending[j]*a+drive*decay/recovery/rise*(1-a);}else ending[j]+=drive*seconds/rise;
      peaks[j]=Math.max(peaks[j],ending[j]);state[j].push(ending[j]);
    }
  }
  if(restRun)restRuns.push(restRun);if(block)blocks.push(block);
  const out={work:bounded(effective)/180,dose:bounded(dose)/180,continuous:bounded(peakRun)/180,fatigue_short:bounded(peaks[0]*30)/180,fatigue_long:bounded(peaks[1]*90)/180,duty:effective/duration,joint_rest:restTotal/duration,single_recovery:singleTotal/duration,relative_peak:weightedQuantile(q,dt,.9)};
  for(const window of [10,30,60]){
    const width=Math.min(bins,window*10),duties=[],rests=[];let seconds=0,work=0,free=0;
    for(let i=0;i<bins;i++){
      seconds+=dt[i];work+=duty[i]*dt[i];free+=rest[i]*dt[i];
      if(i>=width){seconds-=dt[i-width];work-=duty[i-width]*dt[i-width];free-=rest[i-width]*dt[i-width];}
      if(i>=width-1){duties.push(work/seconds);rests.push(free/seconds);}
    }out[`local${window}_duty`]=quantile(duties,.9);out[`local${window}_rest`]=quantile(rests,.1);
  }
  for(const [j,name] of [[0,'short'],[1,'long']]){
    const weights=duty.map((x,i)=>Math.max(x*dt[i],1e-12));
    out[`state_${name}_p90`]=bounded(weightedQuantile(state[j],weights,.9)*[30,90][j])/180;
    out[`state_${name}_mean`]=bounded(sum(state[j].map((x,i)=>x*duty[i]*dt[i]))/Math.max(effective,1e-12)*[30,90][j])/180;
  }
  out.block_peak=bounded(peakBlock)/180;out.block_p90=blocks.length?bounded(weightedQuantile(blocks,blocks,.9))/180:0;
  for(const threshold of [.5,2,5])out[`recovery_ge${threshold}`]=sum(restRuns.filter(x=>x>=threshold))/Math.max(duration,1e-12);
  return {features:out,weight:Math.max(effective,1e-12)};
}

export function extractAquaV2Features(heads,{profile='original'}={}){
  const hands=extractAquaFeatures(heads);
  for(const h of hands){const notes=heads.filter(n=>Math.floor(n[1]/2)===h.hand);h.segments=segmentAnchor(notes);h.profiles={[profile]:enduranceProfile(notes,profile)};}
  const total=sum(hands.map(h=>h.profiles[profile].weight));for(const h of hands)h.profiles[profile].weight/=total;
  return hands;
}
export function featureView(hand,model){
  return model.label==='F'?{features:model.featureSet==='base'?hand.F:{...hand.F,...hand.segments},weight:hand.weightF}
    :model.featureSet==='base'?{features:hand.E,weight:hand.weightE}:hand.profiles[model.profile];
}
