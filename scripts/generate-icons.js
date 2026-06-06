/**
 * Generates tray PNG icons (no dependencies).
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

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function inShield(x, y, size) {
  const cx = size / 2;
  const top = size * 0.12;
  const bottom = size * 0.9;
  const halfW = size * 0.34;

  if (y < top || y > bottom) return false;

  const t = (y - top) / (bottom - top);
  const width = halfW * (0.55 + 0.45 * t);
  return Math.abs(x - cx) <= width;
}

function shieldEdge(x, y, size) {
  if (!inShield(x, y, size)) return false;
  const neighbors = [
    [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
  ];
  return neighbors.some(([nx, ny]) => !inShield(nx, ny, size));
}

function drawShieldPixel(x, y, size, fill, stroke, highlight) {
  if (!inShield(x, y, size)) return [0, 0, 0, 0];

  if (shieldEdge(x, y, size)) return [...stroke, 255];

  const cx = size / 2;
  const relY = (y - size * 0.12) / (size * 0.78);
  const shade = 1 - relY * 0.22;
  const hx = cx - size * 0.12;
  const hy = size * 0.22;
  const highlightMix = Math.max(0, 1 - dist(x, y, hx, hy) / (size * 0.28));
  const r = Math.round(fill[0] * shade + highlight[0] * highlightMix * 0.35);
  const g = Math.round(fill[1] * shade + highlight[1] * highlightMix * 0.35);
  const b = Math.round(fill[2] * shade + highlight[2] * highlightMix * 0.35);
  return [r, g, b, 255];
}

function drawCircle(x, y, cx, cy, radius, color, thickness = 1.2) {
  const d = dist(x, y, cx, cy);
  if (d > radius + thickness || d < radius - thickness) return null;
  return [...color, 255];
}

function drawLine(x, y, x1, y1, x2, y2, color, thickness = 1.3) {
  const len = dist(x1, y1, x2, y2);
  if (len === 0) return null;
  const t = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / (len * len);
  if (t < 0 || t > 1) return null;
  const px = x1 + t * (x2 - x1);
  const py = y1 + t * (y2 - y1);
  if (dist(x, y, px, py) <= thickness) return [...color, 255];
  return null;
}

function compose(layers) {
  return (x, y, size) => {
    for (const layer of layers) {
      const pixel = layer(x, y, size);
      if (pixel && pixel[3] > 0) return pixel;
    }
    return [0, 0, 0, 0];
  };
}

const PALETTE = {
  normalFill: [31, 111, 235],
  normalStroke: [15, 56, 120],
  normalHighlight: [121, 192, 255],
  readyDot: [63, 185, 80],

  runningFill: [210, 153, 34],
  runningStroke: [120, 82, 14],
  runningHighlight: [255, 214, 120],
  clock: [255, 248, 220],

  blockedFill: [218, 54, 51],
  blockedStroke: [120, 24, 22],
  blockedHighlight: [255, 140, 130],
  slash: [255, 255, 255],
};

function shieldLayer(fill, stroke, highlight) {
  return (x, y, size) => drawShieldPixel(x, y, size, fill, stroke, highlight);
}

function readyDotLayer() {
  return (x, y, size) => {
    const cx = size * 0.72;
    const cy = size * 0.72;
    const d = dist(x, y, cx, cy);
    if (d <= size * 0.1) return [...PALETTE.readyDot, 255];
    if (d <= size * 0.12) return [20, 80, 30, 255];
    return [0, 0, 0, 0];
  };
}

function clockLayer() {
  return (x, y, size) => {
    const cx = size / 2;
    const cy = size * 0.5;
    const r = size * 0.17;
    return drawCircle(x, y, cx, cy, r, PALETTE.clock, 1.1)
      || drawLine(x, y, cx, cy, cx, cy - r * 0.65, PALETTE.clock, 1.2)
      || drawLine(x, y, cx, cy, cx + r * 0.55, cy + r * 0.15, PALETTE.clock, 1.1)
      || [0, 0, 0, 0];
  };
}

function slashLayer() {
  return (x, y, size) => {
    const pad = size * 0.22;
    return drawLine(x, y, pad, size - pad, size - pad, pad, PALETTE.slash, 2.2) || [0, 0, 0, 0];
  };
}

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

const icons = {
  'tray-normal.png': compose([
    shieldLayer(PALETTE.normalFill, PALETTE.normalStroke, PALETTE.normalHighlight),
    readyDotLayer(),
  ]),
  'tray-running.png': compose([
    shieldLayer(PALETTE.runningFill, PALETTE.runningStroke, PALETTE.runningHighlight),
    clockLayer(),
  ]),
  'tray-blocked.png': compose([
    shieldLayer(PALETTE.blockedFill, PALETTE.blockedStroke, PALETTE.blockedHighlight),
    slashLayer(),
  ]),
};

for (const [filename, painter] of Object.entries(icons)) {
  fs.writeFileSync(path.join(outDir, filename), createPng(32, painter));
}

console.log('Generated tray icons in assets/');
