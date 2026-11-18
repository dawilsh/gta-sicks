/* Minimal ZIP writer.
 *
 * PowerShell's Compress-Archive writes entry names with backslashes, which both
 * the Chrome Web Store and addons.mozilla.org reject. Sixty lines of spec is
 * cheaper than a dependency. */

import zlib from 'node:zlib';
import fs from 'node:fs';
import { crc32 } from './crc32.mjs';

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;

function dosTime(date) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f);
  const day = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { time, day };
}

/* entries: [{ name: 'src/content.js', data: Buffer }] — names always use "/". */
export function writeZip(zipPath, entries, when = new Date()) {
  const { time, day } = dosTime(when);
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const deflated = zlib.deflateRawSync(entry.data, { level: 9 });
    // Only compress if it actually helps; otherwise store.
    const useDeflate = deflated.length < entry.data.length;
    const body = useDeflate ? deflated : entry.data;
    const method = useDeflate ? 8 : 0;
    const sum = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);          // extra field length

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(CENTRAL_SIG, 0);
    dir.writeUInt16LE(20, 4);            // version made by
    dir.writeUInt16LE(20, 6);            // version needed
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(day, 14);
    dir.writeUInt32LE(sum, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(entry.data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(0, 38);            // external attributes
    dir.writeUInt32LE(offset, 42);       // offset of local header

    chunks.push(local, name, body);
    central.push(Buffer.concat([dir, name]));
    offset += local.length + name.length + body.length;
  }

  const dirBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_SIG, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dirBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  fs.writeFileSync(zipPath, Buffer.concat([...chunks, dirBuf, end]));
}
