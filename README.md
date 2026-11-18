# GTA Sicks

A browser extension that quietly renames a certain forthcoming crime game wherever it
appears — headlines, article bodies, tooltips, image descriptions and the tab title —
so you can read the internet again.

> Rockstar confirms ~~GTA 6~~ **Perpetual Marketing Machine** has slipped to next year

## What it catches

`GTA 6` · `GTA VI` · `GTA6` · `GTAVI` · `#GTA6` · `Grand Theft Auto 6` ·
`Grand Theft Auto VI` · `Grand Theft Auto: Six` — in any capitalisation.

Optionally (off by default) it also takes on the surrounding vocabulary:
*Leonida*, *Vice City*, *Rockstar Games*, *Take-Two Interactive*.

It deliberately leaves alone `GTA V`, `GTA Vice City`, `GTA IV` and things like
"GTA 60 cars", and it never touches text you are typing — text boxes, comment fields
and anything `contenteditable` are off-limits.

## Installing

The same code runs everywhere. Build the packages first:

```bash
node tools/build.mjs
```

That writes `dist/chrome/`, `dist/firefox/` and a zip of each.

Each build stamps an incrementing fourth version component (`1.1.0.7`) and prints it.
Unpacked extensions give you no other signal that a reload actually took new code —
same version number, same everything — so check the number on the extensions page
against the one the build printed. The popup shows it too.

**Chrome, Edge, Brave, Opera, Vivaldi, Arc** — go to the extensions page
(`chrome://extensions`, `edge://extensions`, `brave://extensions`, …), turn on
**Developer mode**, click **Load unpacked**, and pick `dist/chrome`.

**Firefox** — open `about:debugging#/runtime/this-firefox`, click
**Load Temporary Add-on**, and pick `dist/firefox/manifest.json`. Temporary add-ons
are cleared when Firefox restarts; for a permanent install the zip needs signing at
[addons.mozilla.org](https://addons.mozilla.org/developers/).

You can also load the repository root directly instead of `dist/chrome`; Chromium will
just grumble about one Firefox-only manifest key.

## Renaming isn't enough on its own

Swapping the name leaves a perfectly readable article about the thing you're sick
of — it just removes the keyword your eye uses to skip past it. "Rockstar issues
statement on **The Trailer** gameplay leaks" is still, unmistakably, that article,
and you can be three paragraphs deep before you notice.

So when a mention turns up inside a *repeated item* — a search result, a feed post,
a list entry — the whole item folds down to a stub instead:

```
┌────────────────────────────────────┐
│ 🚫 skipped — you're sick of this  [show] │
└────────────────────────────────────┘
```

Prose on a page you opened deliberately is only renamed, never folded. That falls
out of the detection rather than being a special case: the extension only collapses
an ancestor it can identify as one item among several siblings, and a paragraph in
an article isn't one. It also refuses to collapse anything inside a nav, header or
footer, or any container holding more than 25% of the page's text — a "card" that
big is the page, and folding it would blank the site.

Turn it off with **Fold whole posts away** if you'd rather just have the joke.

## Using it

Click the toolbar icon for the switches you'll actually want:

| Control | What it does |
| --- | --- |
| **Enabled everywhere** | Master switch. |
| **Active on <site>** | Leave one site alone without switching the whole thing off. |
| **Fold whole posts away** | Collapse whole feed items about it, rather than just renaming them. |
| **Random / My phrase** | Draw from the phrase list, or hammer one phrase of your own. |
| **One per page / Chaos** | One consistent name per page, or a fresh one every mention. |

**One per page** is the default and reads better: every spelling on the page collapses
to the same replacement, so an article stays internally consistent instead of turning
into word soup. **Chaos** is funnier for about ninety seconds.

**Settings & phrase list** opens the full options page, where you can edit the
50 built-in phrases (one per line), see a live preview, and manage the exempt-sites
list. Settings sync across your signed-in browsers.

## How it works

A content script runs at `document_start`, so text is rewritten before it first paints —
no flash of the original. A `MutationObserver` handles everything that arrives later,
which is most of the modern web. Every edit is logged with a `WeakRef` to the node, so
switching the extension off restores the original text in place rather than demanding a
reload.

No background service worker, no network access, no analytics. The only permissions are
`storage` (for your settings) and `activeTab` (so the popup can tell you how many
mentions it dealt with on the current page).

## Layout

```
manifest.json           MV3, works in Chromium and Firefox as-is
src/lib/defaults.js     phrase list + default settings
src/lib/engine.js       the matcher and rewriter (no DOM, no extension APIs)
src/content.js          DOM walking, mutation handling, undo log
src/popup.*             toolbar popup
src/options.*           settings page
tools/build.mjs         per-browser packages
tools/make-firebot-snippet.mjs   regenerates the Firebot snippet from the phrase list
tools/test-firebot-snippet.mjs   runs that snippet's JS and checks its output
tools/zip.mjs           store-compatible zip writer (crc32.mjs is shared with the PNG encoder)
tools/make-icons.mjs    generates the icons (dependency-free PNG encoder)
tools/harness.html      41 self-checks; open it over a local server to run them
```

### Running the checks

```bash
node -e "require('http').createServer((q,s)=>require('fs').createReadStream('.'+q.url).pipe(s)).listen(8731)"
```

Then open <http://localhost:8731/tools/harness.html>. It stubs the extension APIs,
loads the real content script, and reports pass/fail for static text, dynamically
injected content, attributes, the tab title, and every exclusion rule.

## Firebot

There's a Firebot version of the same joke in [`firebot/`](firebot/) — hides the
message in your own chat feed and replaces it with a rewritten one, using stock
Firebot effects and the same 50 phrases.

Install it by opening [`firebot/gta-sicks.firebotsetup`](firebot/gta-sicks.firebotsetup)
with Firebot — on Windows that means right-click → Open with → Firebot v5, since
double-click does nothing without a default handler. See
[firebot/README.md](firebot/README.md) for the details and a manual build.

## Version history

**Unreleased** (build 9 on)
- Fix: never fold anything inside a paragraph. Wikipedia sets album titles as
  `<i><a>`, several to a paragraph, and a long replacement folded one mid-sentence
- Fix: never fold Wikipedia's sticky header, which left a stub along the bottom of the article
- Fix: a run of folded items now shares one stub, as the code always meant to. The check
  looked for a stub just before each card, but that sibling is the previous hidden card,
  so every item got its own bar (Google and YouTube stacked them)
- README said 30% for the size cap; the code has always used 25%

**1.1.0**
- Fold whole feed items about it down to a stub, rather than only renaming them
- Fix: match text split across nodes (`Grand Theft Auto<span>&nbsp;</span>VI`, as Wikipedia writes it)
- Fix: walk and observe open shadow roots — Reddit puts 500+ on a page and three held mentions
- The popup now shows the running version, and every build stamps a new build
  number, so you can tell whether a reload took

**1.0.0**
- Initial release

## Licence

MIT. Do what you like with it.
