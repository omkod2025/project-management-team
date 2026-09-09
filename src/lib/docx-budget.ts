type ZipEntry={offset:number;compressed:number;expanded:number;method:number};
/** Validate the actual central-directory span, not just its untrusted entry count. */
export function checkDocxBudget(buffer:ArrayBuffer):ZipEntry[]{
  const v=new DataView(buffer);let end=-1;
  for(let i=v.byteLength-22;i>=Math.max(0,v.byteLength-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===v.byteLength){end=i;break;}
  if(end<0)throw new Error('This is not a valid DOCX archive.');
  const count=v.getUint16(end+10,true),start=v.getUint32(end+16,true),size=v.getUint32(end+12,true);
  if(v.getUint16(end+4,true)||v.getUint16(end+6,true)||v.getUint16(end+8,true)!==count||start+size!==end||!count||count>2000)throw new Error('Invalid or unsupported DOCX archive directory.');
  let offset=start,expanded=0;const entries:ZipEntry[]=[];
  while(offset<end){
    if(offset+46>end||v.getUint32(offset,true)!==0x02014b50||entries.length>=2000)throw new Error('Invalid DOCX archive directory.');
    if(v.getUint16(offset+8,true)&1)throw new Error('Password-protected documents are not supported.');
    const compressed=v.getUint32(offset+20,true),length=v.getUint32(offset+24,true),method=v.getUint16(offset+10,true),local=v.getUint32(offset+42,true);
    expanded+=length;if(expanded>25*1024*1024)throw new Error('Expanded DOCX must be no larger than 25 MB.');
    if(![0,8].includes(method)||local+30>start||v.getUint32(local,true)!==0x04034b50)throw new Error('Unsupported DOCX compression.');
    const payload=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
    if(payload+compressed>start)throw new Error('Invalid DOCX entry bounds.');
    entries.push({offset:payload,compressed,expanded:length,method});
    offset+=46+v.getUint16(offset+28,true)+v.getUint16(offset+30,true)+v.getUint16(offset+32,true);
  }
  if(offset!==end||entries.length!==count)throw new Error('DOCX directory count does not match its entries.');
  return entries;
}
/** Stream-check actual inflated bytes, so forged size fields cannot hide ZIP bombs. */
export async function validateDocxExpansion(buffer:ArrayBuffer){
  const entries=checkDocxBudget(buffer);let total=0;
  for(const entry of entries){
    const blob=new Blob([buffer.slice(entry.offset,entry.offset+entry.compressed)]);
    const stream=entry.method===0?blob.stream():blob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const reader=stream.getReader();let length=0;
    try{while(true){const result=await reader.read();if(result.done)break;length+=result.value.byteLength;total+=result.value.byteLength;if(length>entry.expanded||total>25*1024*1024){await reader.cancel();throw new Error('DOCX expanded size exceeds its declared budget.');}}}finally{reader.releaseLock();}
    if(length!==entry.expanded)throw new Error('DOCX expanded size does not match its directory.');
  }
}
