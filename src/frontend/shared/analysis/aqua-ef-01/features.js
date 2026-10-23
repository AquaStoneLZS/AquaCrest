// Shared browser features for AquaTide and AquaReef.
import {extractAquaV2Features} from './load-features.js';
export const FEATURE_VERSION='aqua-ef-0.1';
const sum=a=>a.reduce((s,x)=>s+x,0),clip=x=>Math.max(0,Math.min(1,x));
const bounded=x=>x<=180?x:180+20*-Math.expm1(-(x-180)/20);
function quantile(a,q){const v=[...a].sort((a,b)=>a-b),p=(v.length-1)*q,i=Math.floor(p);return v[i]+(v[Math.min(i+1,v.length-1)]-v[i])*(p-i);}
function wq(values,weights,q){const order=Array.from(values,(_,i)=>i).sort((i,j)=>values[i]-values[j]),target=q*sum(weights);let s=0;for(const i of order){s+=weights[i];if(s>=target)return values[i];}return values[order.at(-1)];}
function stats(out,name,values,weights){out[name+'_mean']=sum(values.map((v,i)=>v*weights[i]))/sum(weights);out[name+'_p90']=wq(values,weights,.9);}

export function handEvents(notes){
  const times=[...new Set(notes.map(n=>n[0]))],unit=times.length>1?quantile(times.slice(1).map((v,i)=>v-times[i]),.5):1;
  const t=times.map(x=>Math.round((x-times[0])/Math.max(unit,1e-12)*1e10)/1e10),rows=times.map(()=>[0,0]),lookup=new Map(times.map((v,i)=>[v,i]));
  for(const [time,c] of notes)rows[lookup.get(time)][c%2]=1;
  const gaps=t.map((x,i)=>i?x-t[i-1]:1),repeat=[],rotation=[],overlap=[],effort=[],last=[-Infinity,-Infinity];
  for(let i=0;i<rows.length;i++){
    const prev=i?rows[i-1]:[0,0],close=gaps[i]<=4+1e-9,rep=rows[i].map((x,c)=>x*prev[c]*Number(close));repeat.push(rep);
    const rot=Number(sum(rows[i].map((x,c)=>x*prev[c]))===0&&sum(prev)>0&&close);rotation.push(rot);overlap.push(Number(sum(rep)>0));
    const e=rows[i].map((x,c)=>{if(!x)return 0;const delta=t[i]-last[c],rate=Number.isFinite(delta)?Math.min(2,(1.35/(delta+.35))**1.16):0;last[c]=t[i];return 1+.45*rate+.20*rep[c]+.15*(sum(rows[i])-1)-.12*rot;});effort.push(e);
  }return {times,t,rows,gaps,effort,repeat,rotation,overlap};
}

export function patternFeatures(notes){
  const events=handEvents(notes),{t,rows,gaps,effort,repeat,rotation,overlap}=events,weights=rows.map(sum),total=sum(weights),F={},E={};
  E.pattern_repeat=sum(repeat.map(sum))/total;E.pattern_rotation=sum(rotation.map((x,i)=>x*weights[i]))/total;
  E.pattern_overlap=sum(overlap.map((x,i)=>x*weights[i]))/total;E.pattern_chord=sum(rows.map((r,i)=>Number(sum(r)>1)*weights[i]))/total;E.pattern_effort=sum(effort.map(sum))/total;
  for(const tau of [1,4,16]){
    let state=[0,0];const history=[],tag=`pattern_m${tau}`;
    for(let i=0;i<rows.length;i++){state=state.map((x,c)=>x*Math.exp(-Math.min(700,gaps[i]/tau))+effort[i][c]);history.push(state);}
    const signed=history.map(s=>(s[0]-s[1])/Math.max(sum(s),1e-12)),gap=signed.map(Math.abs);
    stats(F,tag+'_gap',gap,weights);F[tag+'_persistent']=Math.abs(sum(signed.map((x,i)=>x*weights[i]))/total);
    F[tag+'_repeat_gap']=sum(repeat.map((r,i)=>Math.abs(r[0]-r[1])*gap[i]*weights[i]))/total;
    F[tag+'_switch']=sum(signed.slice(1).map((x,i)=>weights[i+1]*Number(Math.sign(x)!==Math.sign(signed[i]))*Math.min(gap[i+1],gap[i])))/total;
    for(const threshold of [.35,.65]){
      const runs=[];let count=0,direction=0;
      for(let i=0;i<signed.length;i++){const next=Math.abs(signed[i])>=threshold?Math.sign(signed[i]):0;if(next!==direction||gaps[i]>4+1e-9){if(count)runs.push(count);count=0;}if(next)count+=weights[i];direction=next;}
      if(count)runs.push(count);F[tag+`_t${Math.round(threshold*100)}_long`]=sum(runs.filter(x=>x>=16))/total;F[tag+`_t${Math.round(threshold*100)}_run90`]=runs.length?Math.log1p(wq(runs,runs,.9)):0;
    }
    const ratio=history.map(s=>Math.min(...s)/Math.max(...s,1e-12));stats(F,tag+'_ratio_response',ratio.map(r=>4*r*(1-r)),weights);
    const deficit=history.map(s=>1+sum(s.map(x=>{const p=x/Math.max(sum(s),1e-12);return p*Math.log2(Math.max(p,1e-12));})));stats(F,tag+'_entropy_deficit',deficit,weights);
  }
  for(const width of [16,64,128]){
    const local=[],weightsLocal=[],recovery=[];
    for(let start=0;start<rows.length;start+=Math.max(1,width/4)){
      const stop=Math.min(rows.length,start+width);if(stop-start<Math.min(width/2,rows.length))continue;
      const totals=[0,1].map(c=>sum(effort.slice(start,stop).map(r=>r[c])));local.push(Math.abs(totals[0]-totals[1])/sum(totals));weightsLocal.push(sum(weights.slice(start,stop)));
      const free=[0,1].map(c=>{const boundaries=[t[start],...t.slice(start,stop).filter((_,i)=>rows[start+i][c]>0),t[stop-1]+1];return sum(boundaries.slice(1).map((x,i)=>Math.max(0,x-boundaries[i]-1)));});
      recovery.push(Math.abs(free[0]-free[1])/Math.max(t[stop-1]-t[start]+1,1e-12));
    }stats(F,`pattern_w${width}_effort_share`,local,weightsLocal);stats(F,`pattern_w${width}_recovery_gap`,recovery,weightsLocal);
  }return {F,E,events};
}

function occupancy(times,edges){
  const starts=[],ends=[],prefix=[0];for(const t of times){if(ends.length&&t<=ends.at(-1))ends[ends.length-1]=Math.max(ends.at(-1),t+.2);else{starts.push(t);ends.push(t+.2);}}
  for(let i=0;i<starts.length;i++)prefix.push(prefix.at(-1)+ends[i]-starts[i]);
  const values=new Float64Array(edges.length-1);let index=-1,previous=0;
  for(let i=0;i<edges.length;i++){while(index+1<starts.length&&starts[index+1]<=edges[i])index++;const covered=index<0?0:prefix[index]+Math.max(0,Math.min(ends[index]-starts[index],edges[i]-starts[index]));if(i)values[i-1]=clip((covered-previous)/(edges[i]-edges[i-1]));previous=covered;}return values;
}

export function fingerEndurance({times,rows,effort}){
  const t=times.map(x=>Math.round((x-times[0])*1e6)/1e9),duration=t.at(-1)+.2,n=Math.ceil(duration*10-1e-8),edges=Array.from({length:n},(_,i)=>i/10);edges.push(duration);
  const dt=edges.slice(1).map((x,i)=>x-edges[i]),count=Array.from({length:n},()=>[0,0]),impulse=Array.from({length:n},()=>[0,0]);
  for(let i=0;i<t.length;i++){const b=Math.min(n-1,Math.floor(t[i]*10+1e-8));for(let c=0;c<2;c++){count[b][c]+=rows[i][c];impulse[b][c]+=effort[i][c];}}
  function smooth(a){const out=[],rolling=[0,0];let elapsed=0;for(let i=0;i<n;i++){elapsed+=dt[i];for(let c=0;c<2;c++)rolling[c]+=a[i][c]-(i>=10?a[i-10][c]:0);out.push(rolling.map(x=>x/Math.min(elapsed,1)));}return out;}
  const base=smooth(count),pressure=smooth(impulse),combined=base.map(sum),pv=[],pw=[];
  for(let i=0;i<n;i++)if(combined[i]>0){pv.push(combined[i]);pw.push(dt[i]);}
  const reference=wq(pv,pw,.9),q=pressure.map(r=>r.map(x=>Math.max(0,Math.min(2,x/Math.max(reference,1e-12))))),finger=[0,1].map(c=>occupancy(t.filter((_,i)=>rows[i][c]>0),edges)),busy=occupancy(t,edges);
  const body=base.map((r,i)=>Math.min(1,sum(r)/Math.max(reference,1e-12))**4*busy[i]),workweight=body.map((x,i)=>x*dt[i]),effective=sum(workweight),out={};
  for(const seconds of [.25,.5,1,4]){
    const whole=Math.floor(seconds*10),fraction=seconds*10-whole,relative=[];let rolling=0,elapsed=0;
    for(let i=0;i<n;i++){elapsed+=dt[i];rolling+=sum(count[i])-(i>=whole?sum(count[i-whole]):0);const partial=fraction>1e-12&&i>=whole?fraction*sum(count[i-whole]):0;relative.push((rolling+partial)/Math.min(elapsed,seconds)/Math.max(reference,1e-12));}
    out[`finger_density${seconds}_mean`]=sum(relative.map((x,i)=>x*workweight[i]))/Math.max(effective,1e-12);out[`finger_density${seconds}_p90`]=wq(relative,workweight.map(x=>Math.max(x,1e-12)),.9);
  }
  let dose=0,jointRest=0,localRest=0,lightRest=0,handBlock=0,restspan=0,before=null;
  const halves=[1.575,8,60,120],state=halves.map(()=>[0,0]),peaks=halves.map(()=>[0,0]),series=halves.map(()=>[]),differences=halves.map(()=>[]),blocks=[],restlength=[],recoveries=[],reacc=[],load=[];
  for(let i=0;i<n;i++){
    const seconds=dt[i],f=[finger[0][i],finger[1][i]],drive=f.map((x,c)=>x*q[i][c]),coupled=drive.map((x,c)=>x+.15*drive[1-c]*f[c]),recovery=f.map((x,c)=>1-busy[i]+.55*(1-x)*busy[i]+.35*x*Math.max(0,1-q[i][c])**2);
    if(busy[i]<1e-8&&restspan===0)before=state.map(s=>[...s]);
    else if(busy[i]>=1e-8&&restspan){restlength.push(restspan);recoveries.push(sum(state.flatMap((s,j)=>s.map((x,c)=>Math.max(0,before[j][c]-x))))/8);reacc.push(sum(state.flat())/8);}
    load.push(sum(coupled));dose+=sum(coupled)*seconds;jointRest+=(1-busy[i])*seconds;localRest+=(2-sum(f))*busy[i]*seconds;lightRest+=sum(f.map((x,c)=>x*Math.max(0,1-q[i][c])**2))*seconds;
    for(let j=0;j<halves.length;j++){for(let c=0;c<2;c++){const loss=1+2*recovery[c],a=Math.exp(-Math.log(2)/halves[j]*seconds*loss);state[j][c]=state[j][c]*a+coupled[c]/loss*(1-a);peaks[j][c]=Math.max(peaks[j][c],state[j][c]);}series[j].push(sum(state[j]));differences[j].push(Math.abs(state[j][0]-state[j][1]));}
    if(busy[i]<1e-8){restspan+=seconds;if(restspan>=1&&handBlock){blocks.push(handBlock);handBlock=0;}}
    else{restspan=0;handBlock+=body[i]*seconds;}
  }
  if(handBlock)blocks.push(handBlock);if(restspan)restlength.push(restspan);
  Object.assign(out,{finger_work:bounded(effective)/180,finger_dose:bounded(dose)/180,finger_joint_rest:jointRest/duration,finger_local_rest:localRest/duration,finger_light_rest:lightRest/duration});
  for(let j=0;j<halves.length;j++){const tag=`finger_state${halves[j]}`;out[tag+'_peak']=sum(peaks[j]);out[tag+'_mean']=sum(series[j].map((x,i)=>x*workweight[i]))/Math.max(effective,1e-12);out[tag+'_p90']=wq(series[j],workweight.map(x=>Math.max(x,1e-12)),.9);out[tag+'_difference']=sum(differences[j].map((x,i)=>x*workweight[i]))/Math.max(effective,1e-12);}
  let maxBlock=0;for(const b of blocks)maxBlock=Math.max(maxBlock,b);out.finger_block_peak=bounded(maxBlock)/180;out.finger_block90=blocks.length?bounded(wq(blocks,blocks,.9))/180:0;
  out.finger_recovered_mean=recoveries.length?sum(recoveries)/recoveries.length:0;out.finger_reentry_state=reacc.length?sum(reacc)/reacc.length:0;
  for(const threshold of [.5,2,5,10])out[`finger_rest_ge${threshold}`]=sum(restlength.filter(x=>x>=threshold))/duration;
  const weights=workweight.map(x=>Math.max(x,1e-12)),q90=wq(load,weights,.9),q50=wq(load,weights,.5);out.finger_peak_sustain_gap=Math.max(0,q90-q50)/Math.max(q90,1e-12);
  return {features:out,weight:Math.max(effective,1e-12)};
}

export function extractAqua01Features(heads){
  const hands=extractAquaV2Features(heads,{profile:'original'});
  for(const h of hands){const pattern=patternFeatures(heads.filter(n=>Math.floor(n[1]/2)===h.hand)),endurance=fingerEndurance(pattern.events);h.borrowedF=pattern.F;h.patternE=pattern.E;h.fingerE=endurance.features;h.fingerWeight=endurance.weight;}
  const total=sum(hands.map(h=>h.fingerWeight));for(const h of hands)h.fingerWeight/=total;return hands;
}
export function featureView(hand,model){
  const set=model.featureSet;if(model.label==='F')return {features:{...hand.F,...hand.segments,...(set==='all'?hand.borrowedF:{})},weight:hand.weightF};
  return {features:{...hand.profiles.original.features,...(['pattern','all'].includes(set)?hand.patternE:{}),...(['recovery','all'].includes(set)?hand.fingerE:{})},weight:hand.fingerWeight};
}
