// Node 入口：从磁盘读取权重，复用浏览器推理代码。
import fs from 'node:fs';
import '../src/frontend/shared/beatmap-parser.js';
import {createCrestEvaluator,analyzeCrestForPage,CREST_METADATA} from '../src/frontend/shared/analysis/aqua-1-crest/browser.js';

export const MODEL_BIN=new URL('../src/frontend/shared/analysis/aqua-1-crest/model.bin',import.meta.url);
export {CREST_METADATA};

export function loadEvaluator() {
  return createCrestEvaluator(fs.readFileSync(MODEL_BIN));
}

export function analyze(text,{rate=1,includeTimeline=false,model}={}) {
  return analyzeCrestForPage(text,{rate,includeTimeline,model:model??loadEvaluator()});
}
