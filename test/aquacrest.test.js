import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import '../src/frontend/shared/beatmap-parser.js';
import {createCrestEvaluator,loadCrestEvaluator,analyzeCrestForPage,CREST_METADATA} from '../src/frontend/shared/analysis/aqua-1-crest/browser.js';
import {rateMap} from '../src/frontend/shared/analysis/azusa/rate-map.js';
import {makeSyntheticChart} from './fixtures/synthetic-charts.mjs';

const bytes=fs.readFileSync(new URL('../src/frontend/shared/analysis/aqua-1-crest/model.bin',import.meta.url));
const snapshots=JSON.parse(fs.readFileSync(new URL('./fixtures/synthetic.json',import.meta.url),'utf8'));
const records=snapshots.cases;
const evaluate=createCrestEvaluator(bytes);
const text=makeSyntheticChart(records[0].chart);
const lnText=text.split('\n').map(line=>{
  const p=line.split(',');
  return p.length>=5&&Number(p[2])%300===0&&Number(p[3])===1?`${p[0]},192,${p[2]},128,0,${Number(p[2])+150}:0:0:0:0:`:line;
}).join('\n');

test('Float64 RBF-SVR 权重与合成谱面输出快照保持一致',async()=>{
  assert.equal(CREST_METADATA.version,'1.0.0');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),CREST_METADATA.binarySha256);
  assert.deepEqual(CREST_METADATA.groupWeights,{indices:.20,curve:.35,structure:.45});
  assert.equal(snapshots.modelSha256,CREST_METADATA.binarySha256);
  assert.equal(records.length,10);
  for(const record of records){
    const actual=await analyzeCrestForPage(makeSyntheticChart(record.chart),{rate:record.rate,model:evaluate});
    assert.equal(Object.keys(actual.features).length,CREST_METADATA.dimension,record.id);
    assert.ok(Math.abs(actual.difficulty-record.expected.difficulty)<1e-8,record.id);
    for(const key of ['E','F'])assert.ok(Math.abs(actual.difficultyInputs.indices[key]-record.expected[key])<1e-8,`${record.id} ${key}`);
    assert.equal(actual.difficultyInputs.curvePoints,record.expected.curvePoints,record.id);
  }
  assert.throws(()=>createCrestEvaluator(bytes.subarray(1)),/不完整/);
  assert.throws(()=>evaluate({}),/non-finite/);
});

test('单谱推理保留曲线点、结构压力与倍速；长条超过 18% 时在推理前拒绝',async()=>{
  const a=await analyzeCrestForPage(text,{rate:1.25,model:evaluate,includeTimeline:true});
  const b=await analyzeCrestForPage(rateMap(text,1.25),{model:evaluate});
  assert.equal(a.difficulty,b.difficulty);assert.equal(a.algorithm,'AquaCrest');assert.equal(a.version,'1.0.0');
  assert.equal(a.modelSha256,CREST_METADATA.binarySha256);
  assert.equal(a.groupWeights.indices,.2);assert.ok(a.difficultyInputs.indices.E>0);assert.ok(a.difficultyInputs.indices.F>0);
  assert.equal(a.difficultyInputs.curvePoints,a.difficultyCurve.values.length);
  assert.ok(a.timeline.skills.jack.length>0);assert.ok(Number.isFinite(a.skillPressure.jack));
  let evaluated=false;
  await assert.rejects(()=>analyzeCrestForPage(lnText,{model:()=>{evaluated=true;return 12;}}),/UnsupportedLN.*18%/);
  assert.equal(evaluated,false);
  await assert.rejects(()=>analyzeCrestForPage(text,{rate:4,model:evaluate}),/倍速/);
  await assert.rejects(()=>analyzeCrestForPage(text.replace('CircleSize:4','CircleSize:7'),{model:evaluate}),/4K/);
});

test('浏览器加载校验权重哈希并缓存评估器',async()=>{
  const previousFetch=globalThis.fetch;let fetches=0;
  globalThis.fetch=async url=>{assert.match(String(url),/aqua-1-crest\/model\.bin/);fetches++;return new Response(bytes);};
  try {
    const loaded=await loadCrestEvaluator();
    const sample=await analyzeCrestForPage(text,{model:evaluate});
    assert.equal(loaded(sample.features),evaluate(sample.features));
    assert.equal(await loadCrestEvaluator(),loaded);assert.equal(fetches,1);
  } finally {globalThis.fetch=previousFetch;}
});

test('本地模型 ZIP 入口与站内推理结果一致',async()=>{
  const {readZip}=await import('../scripts/zip.mjs');
  const {inflateRawSync}=await import('node:zlib');
  const entries=readZip(fs.readFileSync(new URL(`../release/AquaCrest-${CREST_METADATA.version}.zip`,import.meta.url)),inflateRawSync);
  assert.deepEqual(Object.keys(entries).sort(),['LICENSE','THIRD_PARTY_NOTICES.md','UPSTREAM-AZUSA-LICENSE','manifest.json','model-metadata.json','model.js','weights.bin']);
  assert.equal(JSON.parse(entries['manifest.json']).version,'1.0.0');
  assert.deepEqual(JSON.parse(entries['model-metadata.json']),CREST_METADATA);
  const pkg=await import('data:text/javascript;base64,'+entries['model.js'].toString('base64'));
  pkg.init({readBytes:path=>new Uint8Array(entries[path])});
  const expected=(await analyzeCrestForPage(text,{rate:1.25,model:evaluate})).difficulty;
  assert.ok(Math.abs(await pkg.predict({osuText:text,rate:1.25})-expected)<1e-9);
  await assert.rejects(async()=>pkg.predict({osuText:lnText,rate:1}),/UnsupportedLN.*18%/);
});
