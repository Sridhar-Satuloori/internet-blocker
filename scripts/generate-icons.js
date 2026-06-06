/**
 * Generates minimal 32x32 tray PNG icons (no dependencies).
 * Run: node scripts/generate-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createPng(size, colorFn) {
  const raw = [];
  for (let y = 0; y < size; y++) {
    raw.push(0);
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = colorFn(x, y, size);
      raw.push(r, g, b, a);
    }
  }
  const compressed = zlib.deflateSync(Buffer.from(raw));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function shieldPixel(x, y, size, fill, stroke) {
  const cx = size / 2;
  const cy = size / 2.2;
  const nx = (x - cx) / (size * 0.38);
  const ny = (y - cy) / (size * 0.42);
  const inShield = nx * nx + ny * ny <= 1 && y >= size * 0.18 && y <= size * 0.82;
  const edge = nx * nx + ny * ny <= 1.15 && nx * nx + ny * ny > 0.85;
  if (inShield) return [...fill, 255];
  if (edge && y >= size * 0.18 && y <= size * 0.82) return [...stroke, 255];
  return [0, 0, 0, 0];
}

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

const normal = createPng(32, (x, y, s) => shieldPixel(x, y, s, [63, 185, 80], [30, 120, 50]));
const blocked = createPng(32, (x, y, s) => shieldPixel(x, y, s, [229, 83, 75], [140, 40, 35]));
const running = createPng(32, (x, y, s) => shieldPixel(x, y, s, [245, 166, 35], [160, 100, 20]));

fs.writeFileSync(path.join(outDir, 'tray-normal.png'), normal);
fs.writeFileSync(path.join(outDir, 'tray-blocked.png'), blocked);
fs.writeFileSync(path.join(outDir, 'tray-running.png'), running);

console.log('Generated tray icons in assets/');
