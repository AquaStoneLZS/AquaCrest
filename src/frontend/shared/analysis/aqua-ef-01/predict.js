import {readAquaHeads} from './base-features.js';
import {extractAqua01Features,featureView,FEATURE_VERSION} from './features.js';
export const indexFromScore=(score,label)=>(label==='E'?75:60)*(label==='E'?2:4)**(score/5);
export function predictHand(features,model){
  if(model.featureVersion!==FEATURE_VERSION)throw Error('AquaTide / AquaReef 模型与特征版本不匹配');
  const x=model.featureNames.map((name,i)=>(features[name]-model.mean[i])/model.scale[i]);
  if(!x.every(Number.isFinite))throw Error('AquaTide / AquaReef 缺少有效特征');
  let score=model.intercept;
  if(model.kind==='tree'){
    const z=x.map(Math.fround);
    for(const tree of model.trees){let node=0;while(tree.nodes[node][0]>=0){const n=tree.nodes[node];node=z[n[0]]<=n[1]?n[2]:n[3];}score+=tree.step*tree.nodes[node][4];}
  }else if(model.kernel==='linear'){for(let i=0;i<x.length;i++)score+=model.coefficients[i]*x[i];}
  else for(let h=0;h<model.vectors.length;h++){let d=0;for(let i=0;i<x.length;i++)d+=(x[i]-model.vectors[h][i])**2;score+=model.coefficients[h]*Math.exp(-model.gamma*d);}
  return score;
}
export function predictFeatureHands(hands,model){
  const perHand=hands.map(h=>{const {features,weight}=featureView(h,model),score=predictHand(features,model);return {hand:h.hand,features,weight,score,index:indexFromScore(score,model.label)};});
  const score=perHand.reduce((s,h)=>s+h.weight*h.score,0);
  return {model:model.name,version:model.version,featureVersion:model.featureVersion,score,index:indexFromScore(score,model.label),hands:perHand};
}
export async function analyzeAqua1Indices(text,{rate=1,E=true,F=true}={}){
  const output={},heads=readAquaHeads(text,rate),metadata=(await import('./metadata.js')).default;
  const e=E?(await import('./e-model.js')).default:null,f=F?(await import('./f-model.js')).default:null;
  const hands=extractAqua01Features(heads);
  for(const model of [e,f])if(model)output[model.label]={...predictFeatureHands(hands,model),provenance:metadata[model.label]};
  return output;
}
// Preserve the original inference entry point for frozen 0.1 tooling.
export const analyzeAqua01Indices=analyzeAqua1Indices;

export async function analyzeAqua1Report(text,{rate=1}={}){
  const indices={available:false,version:'AquaTide@1.0.0+AquaReef@1.0.0',source:'chart',input:'head-only',EModel:'AquaTide',FModel:'AquaReef',EVersion:'1.0.0',FVersion:'1.0.0',E:null,F:null,EGrade:null,FGrade:null};
  try{
    const models=await analyzeAqua1Indices(text,{rate});
    for(const label of ['E','F']){
      const result=models[label];
      indices[label]=result.index;indices[label+'Score']=result.score;
    }
    indices.models=models;indices.available=true;
    indices.diagnosticOnly=!Object.values(models).every(m=>m.provenance.acceptedForReview);
  }catch(error){indices.reason=error.message;}
  return indices;
}
