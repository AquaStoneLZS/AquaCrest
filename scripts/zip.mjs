// 生成观景台本地模型 API v1 可读取的 Deflate ZIP（无 ZIP64、无加密、无分卷）。
import {deflateRawSync,crc32} from 'node:zlib';

export function makeZip(files) {
  const locals=[],centrals=[];let offset=0;
  for(const [name,content] of Object.entries(files)){
    const filename=Buffer.from(name),bytes=Buffer.from(content),compressed=deflateRawSync(bytes);
    const local=Buffer.alloc(30),central=Buffer.alloc(46),crc=crc32(bytes);
    local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);
    local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(filename.length,26);
    central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);
    central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);
    const record=Buffer.concat([local,filename,compressed]);locals.push(record);centrals.push(central,filename);offset+=record.length;
  }
  const cd=Buffer.concat(centrals),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(locals.length,8);end.writeUInt16LE(locals.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,cd,end]);
}

// 只读取本仓库 makeZip 生成的结构：本地文件头中带有正确的大小。
export function readZip(zip,inflate) {
  const entries={};
  for(let p=0;zip.readUInt32LE(p)===0x04034b50;){
    const method=zip.readUInt16LE(p+8),size=zip.readUInt32LE(p+18),nameLength=zip.readUInt16LE(p+26),extra=zip.readUInt16LE(p+28);
    const start=p+30+nameLength+extra,name=zip.subarray(p+30,p+30+nameLength).toString(),data=zip.subarray(start,start+size);
    entries[name]=method===8?inflate(data):data;p=start+size;
  }
  return entries;
}
