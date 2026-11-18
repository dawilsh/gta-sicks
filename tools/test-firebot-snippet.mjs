/* Runs the generated Firebot snippet's JS the way Firebot's $evalJs would, so the
 * thing is verified before anyone pastes it into a live stream setup.
 * Run: node tools/test-firebot-snippet.mjs */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = fs.readFileSync(path.join(ROOT, 'firebot', 'chat-feed-alert.txt'), 'utf8');

const OPEN = '$evalJs[' + '``' + '\n';
const CLOSE = '\n' + '``' + ']';
if (!raw.startsWith(OPEN) || !raw.trimEnd().endsWith(CLOSE)) {
  console.error('FAIL: $evalJs delimiters are not where Firebot expects them');
  process.exit(1);
}
const body = raw.trimEnd().slice(OPEN.length, -CLOSE.length);

// Firebot exposes the trigger metadata as `metadata`; the chat-message event puts
// messageText / userDisplayName inside metadata.eventData.
const run = new Function('metadata', '"use strict";' + body);

const cases = [
  ['Dave', 'new trailer for GTA 6 looks awesome!'],
  ['Sam', 'is Grand Theft Auto VI actually coming out or what'],
  ['Kim', 'gta6 hype!! #GTAVI'],
  ['Lee', 'GTA V is still the best one'],
  ['Ash', 'the GTA VI map is enormous apparently'],
  ['Jo', 'watch the Grand Theft Auto 6 reveal tonight']
];

let failures = 0;
for (const [who, text] of cases) {
  const out = run({ eventData: { userDisplayName: who, messageText: text } });
  console.log(out);
  const mentionsGame = /\bGTA\s*(6|VI)\b|Grand Theft Auto\s*(6|VI)\b/i.test(text);
  if (mentionsGame && /\bGTA\s*(6|VI)\b/i.test(out.split('-> SAY:')[0])) {
    console.error('  ^ FAIL: the game name survived the rewrite');
    failures++;
  }
  if (!mentionsGame && out.indexOf('«') !== -1) {
    console.error('  ^ FAIL: rewrote a message that never mentioned it');
    failures++;
  }
  if (!mentionsGame && out.indexOf('-> SAY:') !== -1) {
    console.error('  ^ FAIL: offered a comeback for a message that never mentioned it');
    failures++;
  }
  if (/#«[^»]*[ ,:()][^»]*»/.test(out)) {
    console.error('  ^ FAIL: hashtag replacement kept its spaces/punctuation');
    failures++;
  }
  if (/the «The /i.test(out)) {
    console.error('  ^ FAIL: doubled article');
    failures++;
  }
}

// The phrase should vary, and every phrase should be reachable.
const seen = new Set();
for (let i = 0; i < 2000; i++) {
  const out = run({ eventData: { userDisplayName: 'x', messageText: 'GTA 6' } });
  seen.add(out.split('«')[1].split('»')[0]);
}
console.log(`\ndistinct phrases over 2000 runs: ${seen.size}`);
if (seen.size !== 50) {
  console.error(`FAIL: expected all 50 phrases to be reachable, saw ${seen.size}`);
  failures++;
}

// Same again for the read-aloud lines. These repeat far more noticeably than the
// phrases do, because you say them out loud.
const replies = new Set();
let leftoverToken = 0;
let badArticle = 0;
for (let i = 0; i < 4000; i++) {
  const out = run({ eventData: { userDisplayName: 'x', messageText: 'GTA 6' } });
  const said = out.split('-> SAY: ')[1];
  if (said === undefined) { console.error('FAIL: no SAY line produced'); failures++; break; }
  if (said.includes('{name}')) leftoverToken++;
  // "This is a An Unreleased Thing household" — an article in front of a phrase
  // that starts with a vowel. Reword the line rather than write an a/an rule.
  if (/\b(a) [AEIOU]/.test(said)) badArticle++;
  replies.add(said);
}
console.log(`distinct replies over 4000 runs: ${replies.size}`);
if (leftoverToken > 0) {
  console.error(`FAIL: ${leftoverToken} replies kept the literal {name} token`);
  failures++;
}
if (badArticle > 0) {
  console.error(`FAIL: ${badArticle} replies read "a" before a vowel-initial phrase`);
  failures++;
}
if (replies.size < 30) {
  console.error(`FAIL: only ${replies.size} distinct replies — pool is too small`);
  failures++;
}

console.log(failures ? `\n${failures} failing` : '\nall checks passed');
process.exit(failures ? 1 : 0);
