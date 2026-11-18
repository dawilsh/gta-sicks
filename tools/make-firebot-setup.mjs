/* Builds firebot/gta-sicks.firebotsetup — a one-file import for Firebot.
 * Run: node tools/make-firebot-setup.mjs  (run make-firebot-snippet.mjs first)
 *
 * The structure mirrors a working event exported from a real install, and the
 * schema comes from FirebotSetup in src/types/setups.ts. Ids are fixed rather
 * than random so rebuilding produces an identical file. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const snippetPath = path.join(ROOT, 'firebot', 'chat-feed-alert.txt');
if (!fs.existsSync(snippetPath)) {
  console.error('Missing firebot/chat-feed-alert.txt — run tools/make-firebot-snippet.mjs first.');
  process.exit(1);
}
const alertMessage = fs.readFileSync(snippetPath, 'utf8').trimEnd();

/* Both regex options exist in Firebot and the plainly-named one is case SENSITIVE,
 * so this pins the case-insensitive comparison *and* spells out every letter as a
 * character class. Either alone would do; together it can't be got wrong. */
const MESSAGE_REGEX =
  '\\b[Gg][Tt][Aa]\\s*(6|[Vv][Ii])\\b' +
  '|\\b[Gg][Rr][Aa][Nn][Dd]\\s+[Tt][Hh][Ee][Ff][Tt]\\s+[Aa][Uu][Tt][Oo]\\s*(6|[Vv][Ii]|[Ss][Ii][Xx])\\b';

const setup = {
  name: 'GTA Sicks',
  description:
    "Hides chat messages mentioning GTA 6 from your Firebot chat feed and replaces " +
    "them with the same message, renamed to something stupid and marked with " +
    "guillemets, plus a line you can read out. Nothing is sent to Twitch and nothing " +
    "is automated — chat sees exactly what was typed, only your feed changes.",
  author: 'nb-Shafty',
  version: 1,
  importQuestions: [],
  requireCurrency: false,
  components: {
    commands: [],
    counters: [],
    currencies: [],
    effectQueues: [],
    events: [
      {
        id: '7b3f1c40-6a21-4d55-9f2e-1c0a5d8e4b71',
        name: 'GTA Sicks - rewrite mentions in the chat feed',
        active: true,
        cached: true,
        sortTags: [],
        eventId: 'chat-message',
        sourceId: 'twitch',
        filterData: {
          mode: 'exclusive',
          filters: [
            {
              type: 'firebot:message-text',
              comparisonType: 'matches regex (case insensitive)',
              value: MESSAGE_REGEX
            }
          ]
        },
        effects: {
          id: 'c1d8a94e-2f77-4a63-b0d5-9e6c3a1f8027',
          runMode: 'all',
          list: [
            {
              id: 'f2a6b103-58cd-4e19-8a74-6b2d9c0e5314',
              type: 'firebot:chat-feed-message-hide',
              active: true,
              percentWeight: null
            },
            {
              id: 'a9c47e26-31bf-4d80-95e3-7f1a2b6c8d40',
              type: 'firebot:chat-feed-alert',
              active: true,
              icon: 'fad fa-exclamation-circle',
              message: alertMessage,
              percentWeight: null
            }
          ]
        }
      }
    ],
    eventGroups: [],
    hotkeys: [],
    presetEffectLists: [],
    timers: [],
    scheduledTasks: [],
    variableMacros: [],
    viewerRoles: [],
    viewerRankLadders: [],
    quickActions: [],
    overlayWidgetConfigs: [],
    globalValues: []
  }
};

const out = path.join(ROOT, 'firebot', 'gta-sicks.firebotsetup');
fs.writeFileSync(out, JSON.stringify(setup, null, 2) + '\n');

const kb = (fs.statSync(out).size / 1024).toFixed(1);
console.log(`wrote firebot/gta-sicks.firebotsetup (${kb} kB)`);
