// Deterministic artificial charts for inference regression checks.
// These patterns are generated here and carry no human difficulty labels.
export function makeSyntheticChart({pattern, rows, gaps, holdCount=0, holdMs=50, restEvery=0, restMs=0}) {
  let time=1000, head=0;
  const objects=[];
  for(let row=0;row<rows;row++) {
    if(row)time+=gaps[(row-1)%gaps.length]+(restEvery&&row%restEvery===0?restMs:0);
    for(const col of pattern[row%pattern.length]) {
      const x=64+col*128;
      objects.push(head++<holdCount
        ?`${x},192,${time},128,0,${time+holdMs}:0:0:0:0:`
        :`${x},192,${time},1,0,0:0:0:0:`);
    }
  }
  return 'osu file format v14\n[General]\nMode:3\n[Difficulty]\nCircleSize:4\n[Metadata]\nTitle:Synthetic regression\n[TimingPoints]\n0,500,4,2,0,100,1,0\n[HitObjects]\n'+objects.join('\n');
}
