/* Validates firebot/gta-sicks.firebotsetup against what Firebot's importer expects,
 * and checks the embedded snippet is the current one and actually runs.
 * Run: node tools/test-firebot-setup.mjs */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const fail = (msg) => { console.error('FAIL: ' + msg); failures++; };
const pass = (msg) => console.log('PASS: ' + msg);

const raw = fs.readFileSync(path.join(ROOT, 'firebot', 'gta-sicks.firebotsetup'), 'utf8');

let setup;
try {
  setup = JSON.parse(raw);
  pass('file is valid JSON (setup-manager parses it with JSON.parse)');
} catch (e) {
  fail('not valid JSON: ' + e.message);
  process.exit(1);
}

// loadSetup rejects anything without components.
if (setup.components == null) fail('no components key — Firebot reports "file is invalid"');
else pass('has a components object');

for (const key of ['name', 'description', 'author', 'version', 'importQuestions', 'requireCurrency']) {
  if (setup[key] === undefined) fail(`missing top-level "${key}"`);
}
if (!failures) pass('all FirebotSetup top-level fields present');

const events = setup.components.events;
if (!Array.isArray(events) || events.length !== 1) {
  fail('expected exactly one event');
} else {
  const ev = events[0];
  const checks = [
    [ev.sourceId === 'twitch', 'sourceId is twitch'],
    [ev.eventId === 'chat-message', 'eventId is chat-message'],
    [ev.active === true, 'event is active'],
    [ev.filterData?.filters?.[0]?.type === 'firebot:message-text', 'uses the Message Text filter'],
    [ev.filterData?.filters?.[0]?.comparisonType === 'matches regex (case insensitive)',
      'uses the CASE-INSENSITIVE regex comparison, not the plainly-named case-sensitive one'],
    [ev.effects?.list?.[0]?.type === 'firebot:chat-feed-message-hide', 'first effect hides the message'],
    [ev.effects?.list?.[1]?.type === 'firebot:chat-feed-alert', 'second effect is the chat feed alert'],
    [ev.effects?.runMode === 'all', 'run mode runs both effects']
  ];
  for (const [ok, label] of checks) (ok ? pass : fail)(label);

  // The filter must actually match, under BOTH comparison types.
  const pattern = ev.filterData.filters[0].value;
  const should = ['gta 6', 'Gta 6', 'GTA 6', 'gta vi', 'Grand Theft Auto VI', 'Gta 6 crap'];
  const shouldNot = ['words!', 'GTA V is fine', 'gta 60 cars', 'GTA IV'];
  for (const flags of ['gi', 'g']) {
    const label = flags === 'g' ? 'case-sensitive comparison' : 'case-insensitive comparison';
    const missed = should.filter(m => !new RegExp(pattern, flags).test(m));
    const wrong = shouldNot.filter(m => new RegExp(pattern, flags).test(m));
    if (missed.length) fail(`${label}: failed to match ${JSON.stringify(missed)}`);
    else if (wrong.length) fail(`${label}: wrongly matched ${JSON.stringify(wrong)}`);
    else pass(`filter regex behaves under the ${label}`);
  }

  // The embedded alert must be the current snippet, and must run.
  const onDisk = fs.readFileSync(path.join(ROOT, 'firebot', 'chat-feed-alert.txt'), 'utf8').trimEnd();
  if (ev.effects.list[1].message !== onDisk) {
    fail('embedded alert message is stale — re-run make-firebot-snippet then make-firebot-setup');
  } else {
    pass('embedded alert matches firebot/chat-feed-alert.txt');
  }

  const msg = ev.effects.list[1].message;
  const OPEN = '$evalJs[' + '``' + '\n';
  const CLOSE = '\n' + '``' + ']';
  if (!msg.startsWith(OPEN) || !msg.endsWith(CLOSE)) {
    fail('alert message is not a well-formed $evalJs block');
  } else {
    const body = msg.slice(OPEN.length, -CLOSE.length);
    if (body.includes('$')) {
      fail('alert JS contains a $ — Firebot will parse it as a variable and the effect breaks');
    } else {
      pass('alert JS contains no $');
    }
    try {
      const out = new Function('metadata', '"use strict";' + body)(
        { eventData: { userDisplayName: 'Dave', messageText: 'new trailer for gta 6 looks awesome!' } }
      );
      if (/\bgta\s*6\b/i.test(out.split('-> SAY:')[0])) fail('the game name survived: ' + out);
      else pass('alert JS runs and rewrites: ' + out);
    } catch (e) {
      fail('alert JS threw: ' + e.message);
    }
  }
}

console.log(failures ? `\n${failures} failing` : '\nall checks passed');
process.exit(failures ? 1 : 0);
