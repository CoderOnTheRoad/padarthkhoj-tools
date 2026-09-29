import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { exportDimensions, withPngDpi } from '../src/lib/pngExport.js';

test('high DPI preserves requested pixel dimensions and rejects excessive images',()=>{
  assert.deepEqual(exportDimensions(6,6,1200),{width:7200,height:7200});
  assert.deepEqual(exportDimensions(12,2,1200),{width:14400,height:2400});
  assert.throws(()=>exportDimensions(20,20,1200),/64-megapixel/);
  assert.throws(()=>exportDimensions(0,6,1200),/positive/);
});

test('PNG DPI metadata can be replaced without altering image pixels',async()=>{
  const original=new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')]);
  const chunks=async blob=>{
    const bytes=new Uint8Array(await blob.arrayBuffer()),result=[];
    for(let offset=8;offset<bytes.length;){const size=new DataView(bytes.buffer).getUint32(offset);result.push({type:String.fromCharCode(...bytes.slice(offset+4,offset+8)),bytes:bytes.slice(offset,offset+12+size)});offset+=size+12;}
    return result;
  };
  const high=await withPngDpi(original,1200);
  const updated=await chunks(high),physical=updated.find(chunk=>chunk.type==='pHYs');
  assert.equal(new DataView(physical.bytes.buffer).getUint32(8),Math.round(1200/.0254));
  assert.equal(physical.bytes[16],1);
  assert.deepEqual(updated.filter(chunk=>chunk.type!=='pHYs'),await chunks(original));
  assert.equal((await chunks(await withPngDpi(high,900))).filter(chunk=>chunk.type==='pHYs').length,1);
});
