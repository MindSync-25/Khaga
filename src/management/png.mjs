import {inflateSync,deflateSync} from 'node:zlib';
import {HttpError,requireThat} from './errors.mjs';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
export const MAX_IMAGE_BYTES=5*1024*1024;
export function crc32(bytes){let c=0xffffffff;for(const byte of bytes){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type);const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);t.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([t,data])),data.length+8);return out;}
// The browser converts JPEG/PNG/WebP to a bounded, non-interlaced PNG. Verify it
// again on the server, bound decompression, verify CRCs, strip every metadata chunk.
// Never accept uploaded SVG/HTML or trust extensions/client MIME alone.
export function normalizePNG(bytes){
 requireThat(Buffer.isBuffer(bytes)&&bytes.length<=MAX_IMAGE_BYTES&&bytes.subarray(0,8).equals(signature),422,'INVALID_IMAGE','Upload a PNG produced by the image uploader.');
 let pos=8,width=0,height=0,channels=0,header,ended=false,seenData=false,dataEnded=false;
 const data=[];
 while(pos<bytes.length){
  requireThat(pos+12<=bytes.length,422,'INVALID_IMAGE','Truncated PNG.');
  const len=bytes.readUInt32BE(pos),end=pos+12+len;
  requireThat(end<=bytes.length,422,'INVALID_IMAGE','Invalid PNG chunk length.');
  const type=bytes.toString('ascii',pos+4,pos+8),payload=bytes.subarray(pos+8,pos+8+len);
  requireThat(/^[A-Za-z]{4}$/.test(type)&&crc32(bytes.subarray(pos+4,pos+8+len))===bytes.readUInt32BE(pos+8+len),422,'INVALID_IMAGE','Invalid PNG checksum.');
  if(!header)requireThat(type==='IHDR',422,'INVALID_IMAGE','Missing PNG header.');
  if(type==='IHDR'){
   requireThat(!header&&len===13,422,'INVALID_IMAGE','Invalid PNG header.');
   header=Buffer.from(payload);width=header.readUInt32BE(0);height=header.readUInt32BE(4);
   requireThat(width>=1&&height>=1&&width<=2000&&height<=2400&&width*height<=4000000,422,'IMAGE_DIMENSIONS','Image must be at most 2000 × 2400 and 4 megapixels.');
   requireThat(header[8]===8&&[2,6].includes(header[9])&&header[10]===0&&header[11]===0&&header[12]===0,422,'INVALID_IMAGE','Use a non-interlaced RGB/RGBA PNG.');channels=header[9]===2?3:4;
  }else if(type==='IDAT'){requireThat(!dataEnded,422,'INVALID_IMAGE','PNG data must be contiguous.');seenData=true;data.push(payload);}
  else if(type==='IEND'){requireThat(len===0&&seenData&&end===bytes.length,422,'INVALID_IMAGE','Invalid PNG ending.');ended=true;pos=end;break;}
  else {if(seenData)dataEnded=true;requireThat(type[0]===type[0].toLowerCase()&&!['acTL','fcTL','fdAT'].includes(type),422,'INVALID_IMAGE','Unsupported or animated PNG.');}
  pos=end;
 }
 requireThat(ended,422,'INVALID_IMAGE','Incomplete PNG.');
 const row=width*channels+1,expected=row*height;
 let decoded;try{decoded=inflateSync(Buffer.concat(data),{maxOutputLength:expected});}catch{throw new HttpError(422,'INVALID_IMAGE','Invalid or oversized compressed image.');}
 requireThat(decoded.length===expected,422,'INVALID_IMAGE','Image data does not match its dimensions.');
 for(let i=0;i<height;i++)requireThat(decoded[i*row]<=4,422,'INVALID_IMAGE','Invalid PNG filter.');
 return {bytes:Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',deflateSync(decoded)),chunk('IEND',Buffer.alloc(0))]),width,height};
}
