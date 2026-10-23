import metadata from './model.js';
import {extractCrest,FEATURE_VERSION} from './features.js';
import {predictCrestFeatures} from './predict.js';
import {extractFeatures} from '../pattern-difficulty/features.js';
import {rateMap} from '../azusa/rate-map.js';
import {assertLnScope} from '../difficulty-scope.js';

export const CREST_METADATA=metadata;
export function createCrestEvaluator(input) {
  const bytes=input instanceof ArrayBuffer?new Uint8Array(input):new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
  if(bytes.byteLength!==metadata.binaryBytes)throw Error('AquaCrest 模型文件不完整');
  if(metadata.featureVersion!==FEATURE_VERSION)throw Error('AquaCrest 模型与特征版本不匹配');
  // A Buffer can be a view with a nonzero offset. Copy only that exact view.
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),d=metadata.dimension;
  let offset=0;
  const take=count=>{const result=new Float64Array(buffer,offset,count);offset+=count*8;return result;};
  const model={...metadata,mean:take(d),scale:take(d),factors:take(d),coefficients:take(metadata.supportCount)};
  model.supportVectors=Array.from({length:metadata.supportCount},()=>take(d));
  if(offset!==bytes.byteLength||!model.scale.every(v=>v>0))throw Error('AquaCrest 模型布局无效');
  return features=>predictCrestFeatures(features,model);
}

let cached;
export async function loadCrestEvaluator() {
  if(!cached)cached=(async()=>{
    const url=new URL('./model.bin',import.meta.url);url.searchParams.set('v',metadata.binarySha256.slice(0,16));
    const response=await fetch(url);
    if(!response.ok)throw Error('AquaCrest 权重读取失败，请重试');
    const buffer=await response.arrayBuffer();
    const digest=await crypto.subtle.digest('SHA-256',buffer);
    const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    if(hash!==metadata.binarySha256)throw Error('AquaCrest 权重校验失败，请刷新重试');
    return createCrestEvaluator(buffer);
  })().catch(error=>{cached=undefined;throw error;});
  return cached;
}

export async function analyzeCrestForPage(text,{rate=1,includeTimeline=false,model=null}={}) {
  if(!Number.isFinite(rate)||rate<.25||rate>3)throw Error('播放倍速必须在 0.25–3 之间');
  assertLnScope(globalThis.BeatmapParser.parse(text), 'AquaCrest');
  const playbackText=rate===1?text:rateMap(text,rate);
  const data=await extractCrest(playbackText,{withCurve:includeTimeline});
  const evaluator=model??await loadCrestEvaluator();
  const difficulty=evaluator(data.features);
  const structural=extractFeatures(data.parsed,{includeTimeline});
  const warnings=[...data.warnings,...(!data.curveAvailable?[data.curveReason]:[])];
  if(difficulty<metadata.trainingRange.labelMin||difficulty>metadata.trainingRange.labelMax)warnings.push('预测超出 AquaCrest 训练标签范围');
  return {...structural,features:data.features,algorithm:metadata.name,version:metadata.version,scale:metadata.scale,input:metadata.input,
    modelSha256:metadata.binarySha256,difficulty,rate,warnings,groupWeights:metadata.groupWeights,
    difficultyInputs:{indices:data.indices,curveAvailable:data.curveAvailable,curveReason:data.curveReason,curvePoints:data.curvePoints},
    ...(includeTimeline?{difficultyCurve:{...data.curve,timeline:'playback',speedRate:rate}}:{})};
}
