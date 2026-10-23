// AquaCrest: fixed all-point Azusa curve encoding plus structural features.
// Labels, titles, mapper identity and source directory never enter the features.
import {extractFeatures} from '../pattern-difficulty/features.js';
import {analyzeAqua1Indices} from '../aqua-ef-01/predict.js';
import {calculateAzusaCurve} from '../azusa/difficulty-curve-data.js';
import {OsuFileParser} from '../../../../public/vendor/mania-analyser/parser/osuFileParser.js';
import '../../beatmap-parser.js';
import {assertLnScope} from '../difficulty-scope.js';

export const FEATURE_VERSION='aqua-1-crest-features-1';
export const GROUP_WEIGHTS=Object.freeze({indices:.20,curve:.35,structure:.45});
const sum=a=>a.reduce((s,x)=>s+x,0);
const mean=a=>a.length?sum(a)/a.length:0;
const quantile=(a,q)=>{const p=(a.length-1)*q,i=Math.floor(p);return a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*(p-i);};

export function encodeCurve(curve) {
  const out={curve_available:curve.available?1:0};
  const bins=32, levels=Array.from({length:17},(_,i)=>i*.375);
  const keys=['logMean','logRms','logStd','logPeak','duration','variation','rise','fall',
    ...[.1,.25,.5,.75,.9,.95,.99].map(q=>'q'+Math.round(100*q)),
    ...levels.map((_,i)=>'level'+i),
    ...Array.from({length:bins},(_,i)=>['mean'+i,'rms'+i,'peak'+i]).flat(),
    ...[1,2,5,10,20].flatMap(s=>['window'+s,'run'+s])];
  for(const key of keys)out['curve_'+key]=0;
  if(!curve.available)return out; // Explicit missing mask; no invented curve points.
  const {times,values}=curve,n=values.length,start=times[0],duration=times.at(-1)-start;
  if(n<2||duration<=0||!values.every(v=>Number.isFinite(v)&&v>=0))throw Error('Invalid Azusa curve');
  const z=values.map(Math.log1p),sorted=[...z].sort((a,b)=>a-b);
  // Trapezoid vertex weights: EVERY original graph point has positive weight.
  // Preserve irregular point times; no downsampling or selection of peak points.
  const w=times.map((t,i)=>((i? t-times[i-1]:0)+(i<n-1?times[i+1]-t:0))/2);
  const weight=sum(w), m=sum(z.map((v,i)=>v*w[i]))/weight;
  out.curve_logMean=m;out.curve_logRms=Math.sqrt(sum(z.map((v,i)=>v*v*w[i]))/weight);
  out.curve_logStd=Math.sqrt(sum(z.map((v,i)=>(v-m)**2*w[i]))/weight);
  out.curve_logPeak=sorted.at(-1);out.curve_duration=Math.log1p(duration/1000);
  for(const q of [.1,.25,.5,.75,.9,.95,.99])out['curve_q'+Math.round(q*100)]=quantile(sorted,q);
  const bw=Array(bins).fill(0),bs=Array(bins).fill(0),bss=Array(bins).fill(0),bp=Array(bins).fill(0);
  let variation=0,rise=0,fall=0;
  for(let i=0;i<n;i++){
    for(let k=0;k<levels.length;k++)out['curve_level'+k]+=w[i]*Math.exp(-.5*((z[i]-levels[k])/.375)**2)/weight;
    const b=Math.min(bins-1,Math.floor((times[i]-start)/duration*bins));
    bw[b]+=w[i];bs[b]+=w[i]*z[i];bss[b]+=w[i]*z[i]**2;bp[b]=Math.max(bp[b],z[i]);
    if(i){const d=z[i]-z[i-1];variation+=Math.abs(d);rise+=Math.max(0,d);fall+=Math.max(0,-d);}
  }
  out.curve_variation=variation/(duration/1000);out.curve_rise=rise/(duration/1000);out.curve_fall=fall/(duration/1000);
  for(let b=0;b<bins;b++){
    out['curve_mean'+b]=bw[b]?bs[b]/bw[b]:0;out['curve_rms'+b]=bw[b]?Math.sqrt(bss[b]/bw[b]):0;out['curve_peak'+b]=bp[b];
  }
  for(const seconds of [1,2,5,10,20]){
    let left=0,area=0,best=0,run=0,longest=0;
    const threshold=quantile(sorted,.75);
    for(let i=0;i<n;i++){
      area+=w[i]*z[i];
      while(times[i]-times[left]>seconds*1000){area-=w[left]*z[left];left++;}
      best=Math.max(best,area/(seconds*1000));
      run=z[i]>=threshold?run+w[i]/1000:0;longest=Math.max(longest,run);
    }
    out['curve_window'+seconds]=best;out['curve_run'+seconds]=Math.min(longest,seconds)/seconds;
  }
  return out;
}

function timingFeatures(parsed) {
  const out={};const red=parsed.timing.filter(t=>t.uninherited&&t.beatLength>0);
  const green=parsed.timing.filter(t=>!t.uninherited&&t.beatLength<0);
  const bpms=red.map(t=>60000/t.beatLength),sv=green.map(t=>Math.max(.1,Math.min(10,-100/t.beatLength)));
  out.timing_bpmMin=bpms.length?Math.min(...bpms):0;out.timing_bpmMax=bpms.length?Math.max(...bpms):0;
  out.timing_bpmChanges=red.filter((t,i)=>i&&Math.abs(t.beatLength-red[i-1].beatLength)>.001).length;
  out.timing_svChanges=sv.filter((v,i)=>!i||Math.abs(v-sv[i-1])>.001).length;
  out.timing_svMin=sv.length?Math.min(...sv):1;out.timing_svMax=sv.length?Math.max(...sv):1;
  out.timing_svLogVariation=sum(sv.slice(1).map((v,i)=>Math.abs(Math.log(v/sv[i]))));
  return out;
}

export async function extractCrest(text,{withCurve=false}={}) {
  const parsed=globalThis.BeatmapParser.parse(text);
  if(parsed.general.mode!==3||parsed.keys!==4)throw Error('AquaCrest requires native mania 4K');
  assertLnScope(parsed, 'AquaCrest');
  if(parsed.warnings.some(w=>/格式|无效|malformed/i.test(w)))throw Error('Malformed chart: '+parsed.warnings.join('; '));
  if(parsed.notes.length<80)throw Error('AquaCrest requires at least 80 heads');
  const base=extractFeatures(parsed),indices=await analyzeAqua1Indices(text);
  const nativeParser=new OsuFileParser(text);nativeParser.process();
  const curve=calculateAzusaCurve(nativeParser.getParsedData(),1);
  const features={...base.features,...timingFeatures(parsed),...encodeCurve(curve),
    aqua_E1_log:Math.log(indices.E.index/75),aqua_F1_log:Math.log(indices.F.index/60)};
  if(!Object.values(features).every(Number.isFinite))throw Error('Non-finite Crest features');
  return {version:FEATURE_VERSION,features,indices:{E:indices.E.index,F:indices.F.index,EModel:'AquaTide',FModel:'AquaReef'},
    curveAvailable:curve.available,curveReason:curve.reason??null,curvePoints:curve.available?curve.values.length:0,
    durationMs:base.durationMs,noteCount:base.noteCount,warnings:base.warnings,
    ...(withCurve?{curve}:{}),parsed};
}

export function featureGroup(name) {
  return name.startsWith('aqua_')?'indices':name.startsWith('curve_')?'curve':'structure';
}
