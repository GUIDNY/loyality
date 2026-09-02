// ══════════════════════════════════════════════════════
// MINIMAL PNG ENCODER — no image dependency, used by the OG image and
// by the Apple Wallet strip/logo art. Extracted verbatim.
// ══════════════════════════════════════════════════════
function rgbToPNG(rgb, W, H) {
  const zlib = require('zlib');
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; table[i]=c; }
  function crc(buf){ let c=0xFFFFFFFF; for(const b of buf) c=table[(c^b)&0xFF]^(c>>>8); return(~c)>>>0; }
  function chunk(type,data){ const t=Buffer.from(type),l=Buffer.allocUnsafe(4),cv=Buffer.allocUnsafe(4); l.writeUInt32BE(data.length); cv.writeUInt32BE(crc(Buffer.concat([t,data]))); return Buffer.concat([l,t,data,cv]); }
  const raw = Buffer.allocUnsafe(H*(1+W*3));
  for(let y=0;y<H;y++){ raw[y*(1+W*3)]=0; rgb.copy(raw,y*(1+W*3)+1,y*W*3,(y+1)*W*3); }
  const ihdr=Buffer.allocUnsafe(13); ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4); ihdr[8]=8; ihdr[9]=2; ihdr[10]=ihdr[11]=ihdr[12]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}

function solidPNG(size, r, g, b) {
  const zlib=require('zlib'), table=new Uint32Array(256);
  for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;table[i]=c;}
  function crc(buf){let c=0xFFFFFFFF;for(const b of buf)c=table[(c^b)&0xFF]^(c>>>8);return(~c)>>>0;}
  function chunk(type,data){const t=Buffer.from(type),l=Buffer.allocUnsafe(4),cv=Buffer.allocUnsafe(4);l.writeUInt32BE(data.length);cv.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([l,t,data,cv]);}
  const raw=Buffer.allocUnsafe(size*(3*size+1));
  for(let y=0;y<size;y++){raw[y*(3*size+1)]=0;for(let x=0;x<size;x++){const i=y*(3*size+1)+1+x*3;raw[i]=r;raw[i+1]=g;raw[i+2]=b;}}
  const ihdr=Buffer.allocUnsafe(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=2;ihdr[10]=ihdr[11]=ihdr[12]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}

module.exports = { rgbToPNG, solidPNG };
