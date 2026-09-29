export function exportDimensions(widthIn, heightIn, dpi) {
  if (![widthIn, heightIn, dpi].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Enter positive, finite width, height and DPI values.');
  }
  const width = Math.round(widthIn * dpi), height = Math.round(heightIn * dpi);
  if (width < 1 || height < 1 || width * height > 64000000) {
    throw new Error('Export exceeds the 64-megapixel memory limit. Reduce the size in inches or DPI; no automatic downscaling is applied.');
  }
  return { width, height };
}

// PNG pHYs stores pixels per metre. Replace the browser's usual 96-DPI
// metadata without decoding/re-encoding pixels or losing alpha transparency.
export async function withPngDpi(blob, dpi) {
  const ppm = Math.round(dpi / .0254);
  if (!Number.isFinite(ppm) || ppm < 1 || ppm > 0xffffffff) throw new Error('Invalid PNG resolution.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const signature = [137,80,78,71,13,10,26,10];
  if (!signature.every((v,i) => bytes[i] === v)) throw new Error('Could not encode PNG export.');
  const chunk = new Uint8Array(21), view = new DataView(chunk.buffer);
  view.setUint32(0,9); chunk.set([112,72,89,115],4);
  view.setUint32(8,ppm); view.setUint32(12,ppm); chunk[16]=1;
  let crc=0xffffffff;
  for (const byte of chunk.subarray(4,17)) {
    crc ^= byte;
    for(let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  view.setUint32(17,(crc^0xffffffff)>>>0);
  const pieces=[bytes.slice(0,8)];
  let inserted=false;
  for(let offset=8;offset<bytes.length;) {
    if(offset+12>bytes.length) throw new Error('Incomplete PNG data.');
    const length=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0);
    const end=offset+12+length;
    if(end>bytes.length) throw new Error('Incomplete PNG chunk.');
    const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
    if(type!=='pHYs') pieces.push(bytes.slice(offset,end));
    if(type==='IHDR'&&!inserted){pieces.push(chunk);inserted=true;}
    offset=end;
  }
  if(!inserted) throw new Error('PNG header missing.');
  return new Blob(pieces,{type:'image/png'});
}
