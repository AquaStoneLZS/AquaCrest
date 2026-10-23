// 校验权重、合成谱面回归快照与发布 ZIP。
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {MODEL_BIN,CREST_METADATA,loadEvaluator,analyze} from './model.mjs';
import {readZip} from './zip.mjs';
import {makeSyntheticChart} from '../test/fixtures/synthetic-charts.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let failed=0,count=0;
const check=(name,ok,detail='')=>{count++;if(!ok)failed++;console.log(`${ok?'✓':'✗'} ${name}${detail?' · '+detail:''}`);};

const bytes=fs.readFileSync(MODEL_BIN);
check('model.bin 大小',bytes.length===CREST_METADATA.binaryBytes,`${bytes.length} B`);
check('model.bin SHA-256',sha(bytes)===CREST_METADATA.binarySha256,sha(bytes).slice(0,16));

const snapshots=JSON.parse(fs.readFileSync(new URL('../test/fixtures/synthetic.json',import.meta.url),'utf8'));
const evaluate=loadEvaluator();
check('合成快照对应当前权重',snapshots.modelSha256===CREST_METADATA.binarySha256);
let diff=0;
for(const record of snapshots.cases){
  const actual=await analyze(makeSyntheticChart(record.chart),{rate:record.rate,model:evaluate});
  diff=Math.max(diff,Math.abs(actual.difficulty-record.expected.difficulty),
    ...['E','F'].map(key=>Math.abs(actual.difficultyInputs.indices[key]-record.expected[key])));
}
check(`合成谱面回归（${snapshots.cases.length} 条）`,snapshots.cases.length>0&&diff<1e-8,`最大差 ${diff.toExponential(2)}`);

const publishedMetadata=JSON.parse(fs.readFileSync(new URL('../release/model-metadata.json',import.meta.url),'utf8'));
check('发布元数据与运行时一致',JSON.stringify(publishedMetadata)===JSON.stringify(CREST_METADATA));

const name=`AquaCrest-${CREST_METADATA.version}.zip`;
const zip=fs.readFileSync(new URL(`../release/${name}`,import.meta.url));
const expected=fs.readFileSync(new URL(`../release/${name}.sha256`,import.meta.url),'utf8').split(/\s+/)[0];
check(`${name} SHA-256`,sha(zip)===expected,sha(zip).slice(0,16));
const entries=readZip(zip,inflateRawSync),manifest=JSON.parse(entries['manifest.json']);
check('ZIP manifest 为本地模型 API v1',manifest.format==='guanjing-benchmark'&&manifest.apiVersion===1&&manifest.entry==='model.js');
check('ZIP 版本与元数据一致',manifest.version===CREST_METADATA.version);
check('ZIP weights.bin 与 model.bin 相同',Buffer.compare(entries['weights.bin'],bytes)===0);
check('ZIP model.js 与 entrySha256 一致',sha(entries['model.js'])===manifest.entrySha256);
check('ZIP 元数据与运行时一致',JSON.stringify(JSON.parse(entries['model-metadata.json']))===JSON.stringify(CREST_METADATA));

if(failed){console.error(`${failed} 项校验失败`);process.exit(1);}
console.log(`全部 ${count} 项通过`);
