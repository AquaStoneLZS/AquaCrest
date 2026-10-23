import {extractCrest,FEATURE_VERSION} from './features.js';

export function predictCrestFeatures(features,model) {
  if(model.name!=='AquaCrest'||model.featureVersion!==FEATURE_VERSION)throw Error('Crest model/feature version mismatch');
  const x=model.featureNames.map((n,i)=>Math.max(-model.clip,Math.min(model.clip,(features[n]-model.mean[i])/model.scale[i]))*model.factors[i]);
  if(!x.every(Number.isFinite))throw Error('Missing/non-finite Crest feature');
  let prediction=model.intercept;
  for(let j=0;j<model.supportVectors.length;j++){
    const vector=model.supportVectors[j];let distance=0;
    for(let i=0;i<x.length;i++)distance+=(x[i]-vector[i])**2;
    prediction+=model.coefficients[j]*Math.exp(-model.gamma*distance);
  }
  if(!Number.isFinite(prediction))throw Error('Non-finite Crest prediction');
  return prediction;
}

export async function analyzeAquaCrest(text,model,{withCurve=false}={}) {
  const {parsed,...data}=await extractCrest(text,{withCurve});
  const difficulty=predictCrestFeatures(data.features,model);
  return {name:'AquaCrest',version:model.version,difficulty,indices:data.indices,
    curveAvailable:data.curveAvailable,curveReason:data.curveReason,curvePoints:data.curvePoints,
    noteCount:data.noteCount,durationMs:data.durationMs,
    warnings:[...data.warnings,...(!data.curveAvailable?[data.curveReason]:[]),
      ...(difficulty<model.trainingRange.labelMin||difficulty>model.trainingRange.labelMax?['Prediction outside labelled training range']:[])],
    groupWeights:model.groupWeights,...(withCurve?{curve:data.curve}:{})};
}
