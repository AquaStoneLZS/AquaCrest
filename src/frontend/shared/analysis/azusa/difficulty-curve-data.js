import {AZUSA_CONFIG, buildTapNotes, annotateRows, buildDifficultyCurve as nativeAzusaCurve} from '../../../../public/vendor/mania-analyser/azusa-local-core.js';
import {interpValues, applyProximityEnvelope, smoothDForGraph} from '../../../../public/vendor/mania-analyser/rework/reworkMathCore.js';

// Replace the difficulty source, keeping the original proximity envelope,
// 100ms resampling, 800ms Gaussian smoothing and break suppression.
export function calculateAzusaCurve(parsed, speedRate=1) {
  const unavailable=reason=>({available:false,algorithm:'Azusa',reason});
  if(!Number.isFinite(speedRate)||speedRate<=0)return unavailable('曲线计算需要有效倍速。');
  if(parsed.columnCount!==4)return unavailable('Azusa 局部难度曲线仅支持 4K 谱面。');
  if(parsed.lnRatio>AZUSA_CONFIG.rcLnRatioLimit)return unavailable('Azusa 面向 RC 谱面，长条占比超过 18% 时无法计算此曲线。');
  const taps=buildTapNotes(parsed).map(note=>({...note,t:note.t/speedRate}));
  if(taps.length<AZUSA_CONFIG.minNotes)return unavailable('音符少于 80 个，无法生成稳定的 Azusa 局部难度曲线。');
  annotateRows(taps,AZUSA_CONFIG.rowToleranceMs/speedRate);
  const native=nativeAzusaCurve(taps), times=[], values=[];
  // A chord updates the native state once per note. Keep its final state at
  // each timestamp, rather than discarding all but the first chord note.
  for(let i=0;i<native.times.length;i++){
    if(times.at(-1)===native.times[i])values[values.length-1]=native.local[i];
    else {times.push(native.times[i]);values.push(native.local[i]);}
  }
  let end=times.at(-1);
  const objectTimes=new Set(times);
  for(let i=0;i<parsed.noteEnds.length;i++)if((parsed.noteTypes[i]&128)!==0){
    const tail=parsed.noteEnds[i]/speedRate;
    if(Number.isFinite(tail)){objectTimes.add(tail);end=Math.max(end,tail);}
  }
  end+=1;
  const corners=new Set([0,end]);
  for(const time of objectTimes)for(const offset of [0,501,-499,1,1000,-1000]){
    const point=time+offset;if(point>=0&&point<=end)corners.add(point);
  }
  const allCorners=[...corners].sort((a,b)=>a-b);
  const local=interpValues(allCorners,times,values);
  const noteSeq=taps.map(note=>[note.c,note.t,-1]);
  const enveloped=applyProximityEnvelope(allCorners,local,noteSeq);
  const graph={times:allCorners,values:smoothDForGraph(allCorners,enveloped,noteSeq)};
  return {...buildDifficultyCurve(graph,speedRate,taps[0].t*speedRate),algorithm:'Azusa',valueKind:'local-pressure'};
}

// Restore the uploaded timeline and trim the lead-in after smoothing.
export function buildDifficultyCurve(graph, speedRate, firstObjectMs) {
  const unavailable = () => ({available:false, reason:'该谱面未产生可用的局部难度曲线。'});
  if (!Array.isArray(graph?.times) || !Array.isArray(graph?.values)
      || graph.times.length !== graph.values.length || !Number.isFinite(speedRate) || speedRate <= 0) return unavailable();
  const times=[], values=[];
  let minValue=Infinity, maxValue=-Infinity;
  for (let i=0;i<graph.times.length;i++) {
    const time=graph.times[i]*speedRate, value=graph.values[i];
    if (!Number.isFinite(time) || !Number.isFinite(value) || (times.length && time <= times.at(-1))) continue;
    times.push(time); values.push(value);
    minValue=Math.min(minValue,value); maxValue=Math.max(maxValue,value);
  }
  if (times.length < 2) return unavailable();
  if (Number.isFinite(firstObjectMs) && firstObjectMs > times[0]) {
    if (firstObjectMs >= times.at(-1)) return unavailable();
    let i=0;
    while (times[i] < firstObjectMs) i++;
    const value=values[i-1]+(values[i]-values[i-1])*(firstObjectMs-times[i-1])/(times[i]-times[i-1]);
    if (times[i] === firstObjectMs) { times.splice(0,i); values.splice(0,i); }
    else { times.splice(0,i,firstObjectMs); values.splice(0,i,value); }
  }
  return {available:true, engine:'ManiaMapAnalyser', timeline:'uploaded', timeUnit:'ms', speedRate,
    times, values, minValue, maxValue};
}
