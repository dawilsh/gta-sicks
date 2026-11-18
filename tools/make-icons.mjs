/* Generates the extension icons: a "no entry" sign on a dark disc.
 * Hand-rolled PNG encoder so the project stays dependency-free.
 * Run: node tools/make-icons.mjs */

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');

/* ---------- minimal PNG writer ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type: RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;   // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- the drawing ---------- */
const DISC = [0x1c, 0x1f, 0x26];   // dark slate
const RED  = [0xff, 0x44, 0x38];   // warning red
const SS = 4;                       // supersampling factor, for smooth edges

function shapeAt(x, y, size) {
  // Normalised coordinates, centred on the icon.
  const cx = size / 2, cy = size / 2;
  const dx = x - cx, dy = y - cy;
  const r = Math.hypot(dx, dy) / size;

  const inDisc = r <= 0.48;
  if (!inDisc) return null;

  const ringOuter = 0.42, ringInner = 0.30;
  const inRing = r <= ringOuter && r >= ringInner;

  // The diagonal bar: rotate the point -45 degrees and take a vertical slab.
  const a = -Math.PI / 4;
  const rx = dx * Math.cos(a) - dy * Math.sin(a);
  const inBar = Math.abs(rx / size) <= 0.055 && r <= ringOuter;

  return (inRing || inBar) ? RED : DISC;
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const c = shapeAt(px, py, size);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      const cov = a / n;
      // Premultiplied averaging, then un-premultiply so edges don't darken.
      rgba[i]     = cov ? Math.round(r / n / (cov / 255)) : 0;
      rgba[i + 1] = cov ? Math.round(g / n / (cov / 255)) : 0;
      rgba[i + 2] = cov ? Math.round(b / n / (cov / 255)) : 0;
      rgba[i + 3] = Math.round(cov);
    }
  }
  return encodePng(size, size, rgba);
}

fs.mkdirSync(OUT, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const file = path.join(OUT, `icon${size}.png`);
  fs.writeFileSync(file, render(size));
  console.log('wrote', path.relative(process.cwd(), file), fs.statSync(file).size + ' bytes');
}
