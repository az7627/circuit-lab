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
console.log('已从 SVG 生成桌面 PNG/ICO 图标（仅写入已忽略的 build/）。');
