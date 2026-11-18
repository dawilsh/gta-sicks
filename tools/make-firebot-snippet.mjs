/* Generates the Firebot "Chat Feed Alert" snippet from the extension's phrase list,
 * so the two can't drift apart. Run: node tools/make-firebot-snippet.mjs
 *
 * Output: firebot/chat-feed-alert.txt — paste that whole file into the Chat Feed
 * Alert effect's message field. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BT = '`';                      // Firebot delimits $evalJs code with double backticks
const FENCE = BT + BT;

/* Pull the phrase list out of the extension rather than keeping a second copy. */
const defaultsSrc = fs.readFileSync(path.join(ROOT, 'src/lib/defaults.js'), 'utf8');
const mod = { exports: {} };
new Function('module', defaultsSrc + '\nmodule.exports = { SOS_DEFAULT_PHRASES };')(mod);
const phrases = mod.exports.SOS_DEFAULT_PHRASES;

/* Pipe-separated so the JS needs no array literal — Firebot parses square brackets
 * to find the end of a variable, and a list of 50 bracketed strings is asking for
 * trouble. Any phrase containing these characters would break that, so refuse. */
const unsafe = phrases.filter(p => /[|`[\]$\\"]/.test(p));
if (unsafe.length) {
  console.error('These phrases can\'t go in the Firebot snippet unescaped:', unsafe);
  process.exit(1);
}

/* Wrap to a sane width so the pasted field stays readable in Firebot's textarea. */
function wrapJoined(items, width) {
  const lines = [];
  let cur = '';
  for (const item of items) {
    if (cur && (cur.length + item.length + 1) > width) { lines.push(cur); cur = ''; }
    cur += (cur ? '|' : '') + item;
  }
  if (cur) lines.push(cur);
  return lines;
}

const listLines = wrapJoined(phrases, 78);
const listLiteral = listLines
  .map((line, i) => '  ' + (i ? '+ ' : '  ') + JSON.stringify((i ? '|' : '') + line))
  .join('\n');

/* Lines to read out. {name} is swapped for whichever phrase the message got.
 * Kept long deliberately: with only a handful, the same one lands every few
 * messages and the bit dies. */
const REPLIES = [
  'Ah yes, {name}. My favourite.',
  'Out now. Still not interested.',
  'I built a browser extension so I would never have to read that. Genuinely.',
  'That one is banned from my eyeballs, sorry.',
  'Cannot hear you, you said the number.',
  '{name}, yes. Tremendous. Moving on.',
  'I have no notes on {name}. None at all.',
  'You will have to take that up with my extension.',
  'New rule: we call it {name} now.',
  'I am contractually required to say {name} instead.',
  'Sorry, my chat has a filter and you tripped it.',
  'Ten out of ten for {name}. Next.',
  'That word costs a pound. Add it to the tab.',
  'I have been hearing about that since I had a different face.',
  'Do you know what else came out this year? Plenty.',
  '{name} looks great. I have not played it. I will not be playing it.',
  'Ah, the November thing. Sure.',
  'Rockstar are doing fine, they do not need our help.',
  'You can hold it now. I still will not.',
  'That is a press release wearing a game as a hat.',
  'Every time someone says it, the download gets bigger.',
  'You have activated my one piece of software.',
  'Yes. {name}. Astonishing. Truly.',
  'I have muted that phrase in every application I own.',
  'Say it again and it gets another day one patch.',
  'The map is big, the puddles are wet, we are done here.',
  'Genuinely cannot get excited about a press release.',
  'That is a lovely thing to say about {name}.',
  'Six is just five with ambition.',
  'I refuse. Politely, but I refuse.',
  'You are describing a video I have not watched.',
  'Give me one fact about it that is not from a review.',
  'Consider instead: any game that exists today.',
  '{name} is the only name I recognise.',
  'This household says {name} now.',
  'That is between you and Rockstar.',
  'Absolutely no thoughts. Head empty.',
  'I have made peace with never knowing.',
  'Hard to be hyped about a server queue.',
  'I ran out of opinions about that in 2023.'
];

const unsafeReplies = REPLIES.filter(r => /[|`[\]$\\"]/.test(r));
if (unsafeReplies.length) {
  console.error('These replies contain characters the snippet can\'t carry:', unsafeReplies);
  process.exit(1);
}

const repliesLiteral = wrapJoined(REPLIES, 74)
  .map((line, i) => '  ' + (i ? '+ ' : '  ') + JSON.stringify((i ? '|' : '') + line))
  .join('\n');

const snippet = `$evalJs[${FENCE}
const md = metadata || {};
const ev = md.eventData || {};
const who = ev.userDisplayName || ev.username || md.username || "someone";
const msg = String(ev.messageText || md.messageText || "");

const names = (
${listLiteral}
).split("|");
const pick = names[Math.floor(Math.random() * names.length)];

const re = /\\bgta\\s*(?:6|vi)\\b|\\bgrand\\s+theft\\s+auto\\s*(?:6|vi|six)\\b/gi;
// No dollar signs anywhere below, deliberately: Firebot reads one as the start
// of a replace-variable even inside this code block, so an end-anchored regex
// would break the whole field. Hence string comparisons, not anchored regexes.
const clean = msg.replace(re, function (hit, offset, whole) {
  const before = whole.slice(Math.max(0, offset - 5), offset);
  const low = before.toLowerCase();
  const prev = low.charAt(low.length - 5);
  let p = pick;
  if (before.charAt(before.length - 1) === "#") {
    // "#GTA6" reads better as one word, same as the extension does it.
    p = p.replace(/[^A-Za-z0-9]/g, "");
  } else if (low.slice(-4) === "the " && (prev === "" || !/[a-z]/i.test(prev))
             && p.slice(0, 4).toLowerCase() === "the ") {
    // "the GTA 6 trailer" must not become "the The Trailer trailer".
    p = p.slice(4);
  }
  return "\\u00ab" + p + "\\u00bb";
});

// If the filter let something through that never named it, don't invent a retort.
if (clean === msg) { return who + ": " + msg; }

const replies = (
${repliesLiteral}
).split("|");
// split/join rather than replace: a replacement string containing a dollar sign
// would be treated as a capture-group reference.
const reply = replies[Math.floor(Math.random() * replies.length)].split("{name}").join(pick);

return who + ": " + clean + "   -> SAY: " + reply;
${FENCE}]`;

/* Firebot parses $ as the start of a replace-variable anywhere in the field,
 * including inside the $evalJs code block. One stray $ (a regex anchored with $,
 * typically) silently breaks the whole effect. Refuse to ship one. */
const codeBody = snippet.slice(snippet.indexOf(FENCE) + FENCE.length, snippet.lastIndexOf(FENCE));
if (codeBody.includes('$')) {
  const line = codeBody.split('\n').find(l => l.includes('$'));
  console.error('Refusing to write: the JS body contains a "$", which Firebot will');
  console.error('try to parse as a variable. Offending line:\n  ' + line.trim());
  process.exit(1);
}

fs.mkdirSync(path.join(ROOT, 'firebot'), { recursive: true });
const out = path.join(ROOT, 'firebot', 'chat-feed-alert.txt');
fs.writeFileSync(out, snippet + '\n');

console.log(`wrote firebot/chat-feed-alert.txt — ${phrases.length} phrases, ${snippet.length} chars`);
