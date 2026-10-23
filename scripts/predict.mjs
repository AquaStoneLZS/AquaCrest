// 用法：node scripts/predict.mjs <谱面.osu|文件夹> [--rate 1] [--output result.json] [--full]
import fs from 'node:fs/promises';
import path from 'node:path';
import {analyze,loadEvaluator} from './model.mjs';

const usage='用法：node scripts/predict.mjs <谱面.osu|文件夹> [--rate 1] [--output result.json] [--full]';
const args=process.argv.slice(2),valued=['--rate','--output'];
const option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const target=args.find((arg,i)=>!arg.startsWith('--')&&!valued.includes(args[i-1]));
if(!target){console.error(usage);process.exit(1);}

const rate=Number(option('--rate')??1),full=args.includes('--full');
const input=path.resolve(target),stat=await fs.stat(input);
const files=stat.isDirectory()
  ?(await fs.readdir(input,{recursive:true})).filter(f=>f.toLowerCase().endsWith('.osu')).sort().map(f=>path.join(input,f))
  :[input];
if(!files.length)throw Error('没有找到 .osu 文件');

const model=loadEvaluator(),results=[];
for(const file of files){
  try{
    const r=await analyze(await fs.readFile(file,'utf8'),{rate,model});
    results.push(full?{file,status:'OK',...r}:{file,status:'OK',algorithm:r.algorithm,version:r.version,rate:r.rate,
      difficulty:r.difficulty,indices:{E:r.difficultyInputs.indices.E,F:r.difficultyInputs.indices.F},
      curvePoints:r.difficultyInputs.curvePoints,warnings:r.warnings});
  }catch(error){results.push({file,status:'Invalid',reason:error.message});}
}
const text=JSON.stringify(results.length===1?results[0]:results,null,2);
if(option('--output'))await fs.writeFile(option('--output'),text,'utf8');else console.log(text);
if(results.some(r=>r.status!=='OK'))process.exitCode=2;
