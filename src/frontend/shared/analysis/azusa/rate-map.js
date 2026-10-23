// Materialize a rate change before invoking estimators at speedRate=1.
export function rateMap(text,rate){
  if(!Number.isFinite(rate)||rate<=0)throw Error('无效的谱面转换倍速。');
  let section='';const time=v=>String(Math.round(Number(v)/rate));
  return text.split(/\r?\n/).map(line=>{
    const header=line.trim().match(/^\[([^\]]+)\]$/);if(header){section=header[1];return line;}
    if(!line.trim()||line.trim().startsWith('//'))return line;
    const p=line.split(',');
    if(section==='TimingPoints'&&p.length>=2){p[0]=time(p[0]);if(Number(p[1])>0&&(p.length<=6||!p[6].trim()||Number(p[6])===1))p[1]=String(Number((Number(p[1])/rate).toPrecision(15)));return p.join(',');}
    if(section==='HitObjects'&&p.length>=5){p[2]=time(p[2]);if((Number(p[3])&128)&&p[5]){const tail=p[5].split(':');tail[0]=time(tail[0]);p[5]=tail.join(':');}return p.join(',');}
    if(section==='Events'&&(p[0].trim()==='2'||p[0].trim()==='Break')&&p.length>=3){p[1]=time(p[1]);p[2]=time(p[2]);return p.join(',');}
    if(section==='General'&&/^\s*(AudioLeadIn|PreviewTime)\s*:/.test(line)){const i=line.indexOf(':');const v=Number(line.slice(i+1));return v<0?line:line.slice(0,i+1)+' '+time(v);}
    return line;
  }).join('\n');
}
