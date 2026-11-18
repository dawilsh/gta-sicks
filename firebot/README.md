# GTA Sicks for Firebot

Same joke as the browser extension, but for your Firebot chat feed. When a viewer
mentions the game, the original message is hidden from *your dashboard only* and
replaced with an alert: their message with the name swapped out and marked, plus a
line you can read out if you feel like it.

Nothing is sent to Twitch. Nothing is automated. Chat sees exactly what they typed —
this only changes what's in front of you.

```
Dave: new trailer for «Whatever, Honestly» looks awesome!   -> SAY: Still not out. Anyway.
```

This needs no fork and no custom scripts. It's three stock Firebot features wired
together, so it survives Firebot updates.

## Installing

Firebot scans its own command line for a path ending in `.firebotsetup`, on cold
start and when a second instance is launched while it's already running. Handing it
the path is all that's needed — **no file association, no registry entries, no menu**.

**The reliable way, on any machine:**

> **Drag `gta-sicks.firebotsetup` onto your Firebot desktop shortcut** (or onto
> `Firebot v5.exe`). The import dialog opens. If Firebot is already running it comes
> to the front with the dialog up.

**Or double-click [`import-into-firebot.cmd`](import-into-firebot.cmd)**, kept in the
same folder as the setup file. It finds Firebot and does the drag for you. You can
also drag a `.firebotsetup` onto the `.cmd` itself. Run it with `/dry` to see what it
would do without launching anything.

Two things that look like they should work but don't, at least on Windows:

- **Double-clicking the `.firebotsetup`.** Firebot's installer registers itself as an
  *option* for the type (`OpenWithProgids`) but never claims the default handler, so
  Windows has nothing to launch and silently does nothing.
- **The in-app menu.** *File → Import Firebot Setup...* exists, but Firebot's window
  is created with `frame: false`, so on Windows there's no menu bar to click. It's
  effectively macOS-only. There is no other button anywhere in the UI — the string
  "Import Firebot Setup" appears exactly once in the whole app bundle.

*Right-click → Open with → Firebot* usually works too, but it depends on that
`OpenWithProgids` entry existing, which you can't count on for other people.

That's the whole install. It adds one event — nothing else is touched, no commands,
no currencies, no overlays. Delete the event to uninstall.

Then send `gta 6` in your own chat to check it: your message should vanish from the
Firebot feed and be replaced with an alert.

## Setting it up by hand

Only needed if you'd rather build it yourself, or the import fails.

**Events → New Event**

- **Event:** Twitch → *Chat Message*
- **Filter:** add *Message Text* → **matches regex (case insensitive)** →
  ```
  \b[Gg][Tt][Aa]\s*(6|[Vv][Ii])\b|\b[Gg][Rr][Aa][Nn][Dd]\s+[Tt][Hh][Ee][Ff][Tt]\s+[Aa][Uu][Tt][Oo]\s*(6|[Vv][Ii]|[Ss][Ii][Xx])\b
  ```

  > **Pick the right dropdown option.** Firebot offers both *"matches regex"* and
  > *"matches regex (case insensitive)"*. The plainly-named one is the **case
  > sensitive** variant — internally `MATCHES_REGEX_CS`, compiled without the `i`
  > flag. Choose that with a normally-written pattern and `gta 6` never matches,
  > with no error to tell you why. The pattern above spells each letter as a
  > character class so it works under either option; pick the case-insensitive
  > one regardless.

**Effects, in this order:**

1. **Hide Message In Chat Feed** — no options. Removes the original from your
   dashboard feed. Firebot's own wording: this does *not* hide or delete it in
   Twitch chat, browser overlays, or any other client.

2. **Chat Feed Alert** — pick any icon, then paste the entire contents of
   [`chat-feed-alert.txt`](chat-feed-alert.txt) into the **Alert Message** field.
   All 50 phrases are embedded in it.

Save. Done.

## Variations

**Keep the original visible instead of hiding it.** Swap effect 1 for *Highlight
Message In Chat Feed*, tick the banner and give it text like "rewritten below".
You'll see both the real message and the rewrite.

**Add a plug command.** Commands → new custom command, trigger `!six`, effect
*Chat*, message pointing at the extension. Give it a 30s cooldown. Better than an
automated reply — viewers who know you hate the topic will bait an autoresponder,
but they can't bait a command you only fire when it's actually funny.

## Editing the phrases

Don't edit `chat-feed-alert.txt` or the `.firebotsetup` by hand — both are generated.
Change the list in [`../src/lib/defaults.js`](../src/lib/defaults.js) so the extension
and Firebot stay in step, then rebuild and check:

```bash
node tools/make-firebot-snippet.mjs
node tools/test-firebot-snippet.mjs
node tools/make-firebot-setup.mjs
node tools/test-firebot-setup.mjs
```

`test-firebot-snippet.mjs` runs the snippet's JavaScript the way `$evalJs` would and
checks the rewriting, the hashtag handling, the article fix, and that all 50 phrases
are reachable.

`test-firebot-setup.mjs` parses the setup file exactly as Firebot's `setup-manager`
does, asserts the event wiring, runs the filter regex under **both** comparison types,
and executes the embedded JS. Run it before re-sharing the file.

The generator refuses any phrase containing `` ` ``, `|`, `[`, `]`, `$`, `\` or `"` —
those would break out of the `$evalJs` block or confuse Firebot's variable parser.

It also refuses to emit a snippet whose JavaScript body contains a `$` at all.
Firebot reads a `$` as the start of a replace-variable **even inside the code
block**, so something as ordinary as an end-anchored regex (`/#$/`) silently
breaks the whole effect — no error in the UI, it just stops working. That's a
mistake worth making impossible rather than remembering.

## If it isn't working

The effect fails quietly, so work through it in this order:

1. **Is the alert appearing at all?** Temporarily replace the whole Alert Message
   with plain text like `test`. If that shows up, the event and filter are fine and
   the problem is in the snippet. If it doesn't, the event isn't firing.
2. **Does the alert say `[$evalJs Error]`?** That's the JS itself failing. The logs
   aren't in Settings — they're on disk at
   `%APPDATA%/Firebot/v5/logs/<date>.log`. Effects that get skipped are logged
   there by id, e.g. `firebot:chat-feed-message-hide cannot be triggered by: manual`.
3. **Nothing at all in the feed?** Check the comparison type first — see the
   warning above about the two regex options, which is the likeliest cause and
   gives no error. Then confirm the event is enabled and that the regex went into
   the *Message Text* filter.
   Firebot stores events at
   `%APPDATA%/Firebot/v5/profiles/<profile>/events/events.json` — reading that is
   the fastest way to see exactly what was saved, `comparisonType` included.
4. **Message vanishes but no alert follows?** The hide worked and the alert didn't —
   almost certainly the snippet. Re-paste it in full; a truncated paste will do this.

## How it works

- `$evalJs` runs sandboxed JS with the event metadata in scope, so the rewriting
  happens inside Firebot with no external script file.
- The message text comes from `metadata.eventData.messageText`, which is what
  Firebot's `twitch:chat-message` event carries.
- One phrase is drawn per message, so a message mentioning it twice reads
  consistently.
- `«guillemets»` mark the swap. They render in any font and already read as
  quotation, so you'll never mistake a rewrite for something a viewer actually said —
  which matters when you're reading their words out loud.
