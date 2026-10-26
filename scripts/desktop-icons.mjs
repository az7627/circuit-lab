import { Resvg } from '@resvg/resvg-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../build/', import.meta.url));
const svg = await readFile(new URL('../dist/favicon.svg', import.meta.url));
await mkdir(output, { recursive: true });
for (const size of [1024, 256]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  if (size === 1024) await writeFile(new URL('../build/icon.png', import.meta.url), png);
  else {
    const header = Buffer.alloc(22);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);
    header.writeUInt16LE(1, 10);
    header.writeUInt16LE(32, 12);
    header.writeUInt32LE(png.length, 14);
    header.writeUInt32LE(22, 18);
    await writeFile(new URL('../build/icon.ico', import.meta.url), Buffer.concat([header, png]));
  }
}

// NSIS needs uncompressed, bottom-up 24-bit BMPs. Render the existing vector
// identity so the installer matches the application without another image asset.
function bitmap(source,width,height){
  const image=new Resvg(source).render(),pixels=image.pixels,stride=Math.ceil(width*3/4)*4;
  const bmp=Buffer.alloc(54+stride*height);
  bmp.write('BM');bmp.writeUInt32LE(bmp.length,2);bmp.writeUInt32LE(54,10);bmp.writeUInt32LE(40,14);
  bmp.writeInt32LE(width,18);bmp.writeInt32LE(height,22);bmp.writeUInt16LE(1,26);bmp.writeUInt16LE(24,28);bmp.writeUInt32LE(stride*height,34);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const from=(y*width+x)*4,to=54+(height-1-y)*stride+x*3;
    bmp[to]=pixels[from+2];bmp[to+1]=pixels[from+1];bmp[to+2]=pixels[from];
  }
  return bmp;
}
// Preserve the favicon's viewBox when embedding it at installer sizes.
const embedded=(x,y,size)=>`<image x="${x}" y="${y}" width="${size}" height="${size}" href="data:image/svg+xml;base64,${svg.toString('base64')}"/>`;
await writeFile(new URL('../build/installer-header.bmp',import.meta.url),bitmap(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57"><rect width="150" height="57" fill="white"/>${embedded(99,6,44)}</svg>`,150,57));
await writeFile(new URL('../build/installer-sidebar.bmp',import.meta.url),bitmap(`<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#7357ec"/><stop offset="1" stop-color="#4835a1"/></linearGradient></defs><rect width="164" height="314" fill="url(#bg)"/><g fill="none" stroke="#ffffff" stroke-opacity=".13" stroke-width="2"><path d="M-20 245h65v-55h75v-60h70M-20 275h95v-55h75v-60h40"/><circle cx="45" cy="245" r="5"/><circle cx="120" cy="190" r="5"/></g>${embedded(50,57,64)}<text x="82" y="155" text-anchor="middle" fill="white" font-family="Microsoft YaHei,Noto Sans CJK SC,sans-serif" font-size="19">电路实验室</text><text x="82" y="177" text-anchor="middle" fill="#ded7ff" font-family="sans-serif" font-size="10" letter-spacing="2">CIRCUIT LAB</text></svg>`,164,314));
console.log('已生成桌面图标与中文安装向导配图（仅写入已忽略的 build/）。');
