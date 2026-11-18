/* Packages the extension for each browser family.
 * Run: node tools/build.mjs
 *
 * Chromium (Chrome, Edge, Brave, Opera, Vivaldi, Arc) and Firefox both take
 * the same code; only a couple of manifest keys differ. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip } from './zip.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const FILES = [
  'src/lib/defaults.js',
  'src/lib/engine.js',
  'src/content.js',
  'src/popup.html',
  'src/popup.js',
  'src/options.html',
  'src/options.js',
  'src/ui.css',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

/* Every build gets a fresh fourth version component.
 *
 * manifest.json holds the semantic version; this appends an incrementing build
 * number so the version on chrome://extensions changes on every single build.
 * Without it there is no way to tell whether a reload actually picked up the new
 * code — a trap I walked into repeatedly. Chrome allows up to four dot-separated
 * integers, and so does Firefox. */
const BUILD_FILE = path.join(ROOT, 'tools', '.buildno');
let buildNo = 0;
try { buildNo = parseInt(fs.readFileSync(BUILD_FILE, 'utf8').trim(), 10) || 0; } catch (e) { buildNo = 0; }
buildNo += 1;
fs.writeFileSync(BUILD_FILE, String(buildNo) + '\n');
const STAMPED = base.version + '.' + buildNo;
base.version = STAMPED;

const TARGETS = {
  chrome: (m) => {
    // Chromium warns about unknown keys; Gecko's id belongs only in the Firefox build.
    delete m.browser_specific_settings;
    m.minimum_chrome_version = '96';
    return m;
  },
  firefox: (m) => m
};

function copyInto(dir) {
  for (const rel of FILES) {
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), dest);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });

for (const [name, tweak] of Object.entries(TARGETS)) {
  const dir = path.join(DIST, name);
  fs.mkdirSync(dir, { recursive: true });
  copyInto(dir);

  const manifest = tweak(JSON.parse(JSON.stringify(base)));
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';
  fs.writeFileSync(path.join(dir, 'manifest.json'), manifestText);

  const zipPath = path.join(DIST, `gta-sicks-${name}-v${base.version}.zip`);
  writeZip(zipPath, [
    { name: 'manifest.json', data: Buffer.from(manifestText, 'utf8') },
    ...FILES.map((rel) => ({ name: rel, data: fs.readFileSync(path.join(ROOT, rel)) }))
  ]);

  const kb = (fs.statSync(zipPath).size / 1024).toFixed(1);
  console.log(`${name.padEnd(8)} -> dist/${name}  +  ${path.basename(zipPath)} (${kb} kB)`);
}

console.log(`\nBuild ${STAMPED} — that exact number should show on chrome://extensions after a reload.`);
console.log('Load unpacked from dist/chrome, or load dist/firefox/manifest.json as a temporary add-on.');
