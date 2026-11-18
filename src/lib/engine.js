/* GTA Sicks — matching + rewriting engine.
 * Pure DOM/string work, no extension APIs, so the options page can reuse it for previews. */

/* Core patterns. Word boundaries keep "GTA V", "GTA Vice City" and "GTA 60" out of it. */
var SOS_CORE_RE =
  /\b(?:grand\s+theft\s+auto\s*(?:[:–—-]\s*)?(?:vi|6|six)|gta\s*(?:[:–—-]\s*)?(?:vi|6))\b/gi;

/* Opt-in extras: the surrounding vocabulary people use to talk about it. */
var SOS_AGGRESSIVE_RE =
  /\b(?:leonida|vice\s+city|rockstar\s+games|take[-\s]?two\s+interactive)\b/gi;

function sosPattern(settings) {
  var src = SOS_CORE_RE.source;
  if (settings.aggressive) src += '|' + SOS_AGGRESSIVE_RE.source;
  return new RegExp(src, 'gi');
}

/* A text node ending like the *start* of a match. Wikipedia writes titles as
 * "Grand Theft Auto<span>&nbsp;</span>VI", so the phrase is spread over three
 * text nodes and per-node matching alone would miss it. This flags the nodes
 * worth joining with what follows. */
var SOS_PARTIAL_TAIL =
  /(?:\bgta|\bgrand(?:\s+theft(?:\s+auto)?)?)[\s:–—-]*$/i;

/* Match the capitalisation of the original, except for bare acronym hits:
 * "GTA 6" is all-caps only because GTA is an acronym, and SHOUTING the
 * replacement everywhere stops being funny by the third headline. */
function sosMatchCase(source, replacement) {
  if (/^gta/i.test(source.trim())) return replacement;
  var letters = source.replace(/[^A-Za-z]/g, '');
  if (!letters) return replacement;
  if (letters === letters.toUpperCase()) return replacement.toUpperCase();
  if (letters === letters.toLowerCase()) return replacement.toLowerCase();
  return replacement;
}

/* Every spelling of the thing ("GTA 6", "GTA VI", "Grand Theft Auto Six") collapses to
 * one key, so a page that mentions it twenty times gets one consistent joke name. */
function sosCanonical(matched) {
  var t = matched.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/^(gta|grand theft auto)/.test(t)) return 'core';
  return t.replace(/[^a-z]/g, '');
}

/* A shuffled deck so you get variety without the same phrase twice in a row. */
function SosDeck(phrases) {
  this.phrases = phrases.slice();
  this.pile = [];
  this.last = null;
}
SosDeck.prototype.draw = function () {
  if (!this.phrases.length) return '';
  if (!this.pile.length) {
    this.pile = this.phrases.slice();
    for (var i = this.pile.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = this.pile[i]; this.pile[i] = this.pile[j]; this.pile[j] = t;
    }
    if (this.pile.length > 1 && this.pile[this.pile.length - 1] === this.last) {
      var swap = this.pile.pop();
      this.pile.unshift(swap);
    }
  }
  this.last = this.pile.pop();
  return this.last;
};

/* The rewriter. Holds the per-page phrase memo so a given string stays stable
 * across re-renders (React et al. rewrite the same node constantly). */
function SosRewriter(settings) {
  this.settings = settings;
  this.re = sosPattern(settings);
  this.deck = new SosDeck(sosPhrasesFor(settings));
  this.spanRe = sosPattern(settings);   // used by the cross-node pass, kept separate from this.re
  this.memo = new Map();
  this.hits = 0;
}

/* Turn one matched string into its replacement, given the few characters that
 * precede it. Shared by the in-node and cross-node paths. */
SosRewriter.prototype.replacementFor = function (matched, before) {
  var phrase = this.pick(matched);
  if (!phrase) return null;

  // "#GTA6" should become "#OneWordHashtag", not "#Two Words".
  if (/#$/.test(before)) return this.mark(phrase.replace(/[^A-Za-z0-9]/g, ''));

  // "the GTA 6 trailer" must not turn into "the The Discourse trailer".
  if (/(^|[^A-Za-z])the\s$/i.test(before) && /^the\s/i.test(phrase)) {
    phrase = phrase.slice(4);
  }
  return this.mark(sosMatchCase(matched, phrase));
};

/* Guillemets rather than a fancier glyph or an emoji: they render in every font
 * a chat client is likely to use, and they read as a quotation marker, which is
 * exactly what this is. Reading someone else's words, altered, without knowing
 * they were altered is the thing to avoid. */
SosRewriter.prototype.mark = function (text) {
  if (!this.settings.markAltered || !text) return text;
  return '«' + text + '»';
};

SosRewriter.prototype.pick = function (matched) {
  var custom = (this.settings.customText || '').trim();
  if (this.settings.mode === 'custom' && custom) return custom;
  if (this.settings.variety === 'chaos') return this.deck.draw();
  var key = sosCanonical(matched);
  if (!this.memo.has(key)) this.memo.set(key, this.deck.draw());
  return this.memo.get(key);
};

SosRewriter.prototype.test = function (text) {
  this.re.lastIndex = 0;
  return this.re.test(text);
};

/* Returns the rewritten string, or null if nothing matched. */
SosRewriter.prototype.rewrite = function (text) {
  if (!text || !this.test(text)) return null;
  var self = this;
  var count = 0;
  this.re.lastIndex = 0;
  var out = text.replace(this.re, function (m, offset, whole) {
    var replacement = self.replacementFor(m, whole.slice(Math.max(0, offset - 5), offset));
    if (replacement === null) return m;
    count++;
    return replacement;
  });
  if (!count) return null;
  this.hits += count;
  return out;
};
