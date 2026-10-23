// 打包观景台「本地模型 ZIP · API v1」到 build/AquaCrest-<version>.zip，需要先 npm install。
// 输出不含时间戳，同一源码与 esbuild 版本下与 release/ 中的发布包逐字节相同。
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {makeZip} from './zip.mjs';
import {CREST_METADATA} from './model.mjs';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'build'),pkg=path.join(out,'package');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(pkg,{recursive:true});
const entry=`import {createCrestEvaluator} from './src/frontend/shared/analysis/aqua-1-crest/browser.js';
import {extractCrest} from './src/frontend/shared/analysis/aqua-1-crest/features.js';
import {rateMap} from './src/frontend/shared/analysis/azusa/rate-map.js';
let evaluate;
export function init(context){evaluate=createCrestEvaluator(context.readBytes('weights.bin'));}
export async function predict({osuText,rate=1}){
  if(!evaluate)throw Error('Model is not initialized');
  if(!Number.isFinite(rate)||rate<.25||rate>3)throw Error('Playback rate outside .25–3');
  const data=await extractCrest(rate===1?osuText:rateMap(osuText,rate));
  return evaluate(data.features);
}`;
await build({stdin:{contents:entry,resolveDir:root,sourcefile:'aquacrest-entry.mjs'},bundle:true,
  outfile:path.join(pkg,'model.js'),format:'esm',platform:'browser',target:'es2022',legalComments:'inline'});
const weights=await fs.readFile(path.join(root,'src/frontend/shared/analysis/aqua-1-crest/model.bin'));
const code=await fs.readFile(path.join(pkg,'model.js'));
const version=CREST_METADATA.version;
const manifest={format:'guanjing-benchmark',apiVersion:1,name:'AquaCrest',version,entry:'model.js',
  scale:CREST_METADATA.scale,modelSha256:sha(weights),entrySha256:sha(code),
  description:'AquaCrest 924-feature RBF SVR; local 4K difficulty inference.'};
const files={'manifest.json':Buffer.from(JSON.stringify(manifest,null,2)),'model.js':code,'weights.bin':weights,
  'model-metadata.json':await fs.readFile(path.join(root,'release/model-metadata.json')),
  'LICENSE':await fs.readFile(path.join(root,'LICENSE')),
  'THIRD_PARTY_NOTICES.md':await fs.readFile(path.join(root,'THIRD_PARTY_NOTICES.md')),
  'UPSTREAM-AZUSA-LICENSE':await fs.readFile(path.join(root,'src/public/vendor/mania-analyser/LICENSE'))};
for(const [name,bytes] of Object.entries(files))await fs.writeFile(path.join(pkg,name),bytes);
const zip=makeZip(files),zipPath=path.join(out,`AquaCrest-${version}.zip`);
await fs.writeFile(zipPath,zip);await fs.writeFile(zipPath+'.sha256',`${sha(zip)}  AquaCrest-${version}.zip\n`);
console.log(JSON.stringify({zip:path.relative(root,zipPath),bytes:zip.length,sha256:sha(zip),manifest},null,2));
