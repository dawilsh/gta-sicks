/* GTA Sicks — content script.
 * Runs at document_start so text is rewritten before it ever paints. */
(function () {
  'use strict';

  var api = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;

  var ATTRS = ['title', 'alt', 'placeholder', 'aria-label'];
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, TEMPLATE: 1, IFRAME: 1, OBJECT: 1, SVG: 1 };

  var settings = sosNormalise(null);   // optimistic: assume "on" so there is no flash of the original
  var rewriter = new SosRewriter(settings);
  var settled = false;
  var running = true;
  var observer = null;

  /* Undo log. WeakRefs so a long-lived SPA does not pin detached nodes in memory. */
  var undoLog = [];
  var canWeakRef = typeof WeakRef === 'function';

  function remember(node, kind, attr, original) {
    undoLog.push({
      ref: canWeakRef ? new WeakRef(node) : null,
      node: canWeakRef ? null : node,
      kind: kind, attr: attr, original: original
    });
    if (undoLog.length > 20000) pruneUndo();
  }

  function pruneUndo() {
    undoLog = undoLog.filter(function (e) {
      if (e.kind === 'collapse') return e.card && e.card.isConnected;
      var n = e.node || (e.ref && e.ref.deref());
      return n && n.isConnected;
    });
  }

  /* Editable regions are off-limits: never rewrite what someone is typing. */
  function inEditable(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    while (el) {
      if (el.isContentEditable) return true;
      if (el.hasAttribute && el.hasAttribute('data-sos-skip')) return true;
      if (el.parentElement) { el = el.parentElement; continue; }
      // Climb out of a shadow root to keep checking the host's ancestors.
      var root = el.getRootNode && el.getRootNode();
      el = (root && root.host) ? root.host : null;
    }
    return false;
  }

  function skippable(el) {
    return !el || SKIP_TAGS[el.nodeName] === 1;
  }

  /* Elements that don't interrupt a run of text. A match may span these; anything
   * else (a paragraph, a list item) is a hard boundary. */
  var INLINE_TAGS = {
    SPAN: 1, A: 1, B: 1, I: 1, EM: 1, STRONG: 1, SMALL: 1, U: 1, ABBR: 1, CITE: 1,
    CODE: 1, S: 1, SUP: 1, SUB: 1, WBR: 1, FONT: 1, MARK: 1, Q: 1, TIME: 1, BDI: 1,
    BDO: 1, DFN: 1, VAR: 1, KBD: 1, SAMP: 1, BIG: 1, TT: 1, NOBR: 1, INS: 1, DEL: 1
  };

  /* Next node in document order. */
  function forward(n) {
    if (n.firstChild) return n.firstChild;
    while (n) {
      if (n.nextSibling) return n.nextSibling;
      n = n.parentNode;
    }
    return null;
  }

  /* The text nodes following `start` that a single match could reach. */
  function gatherRun(start, maxChars) {
    var nodes = [start];
    var total = start.nodeValue.length;
    var n = start;
    while (total < maxChars) {
      n = forward(n);
      if (!n) break;
      if (n.nodeType === 1) {
        if (SKIP_TAGS[n.nodeName] || !INLINE_TAGS[n.nodeName]) break;
        continue;
      }
      if (n.nodeType !== 3) continue;
      nodes.push(n);
      total += n.nodeValue.length;
    }
    return nodes;
  }

  /* Handles "Grand Theft Auto<span>&nbsp;</span>VI": a match that begins in one
   * text node and finishes in a later one. Writes the replacement into the first
   * node and removes the consumed characters from the rest. */
  function patchAcross(start) {
    var nodes = gatherRun(start, 80);
    if (nodes.length < 2) return;

    var offsets = [];
    var joined = '';
    for (var i = 0; i < nodes.length; i++) {
      offsets.push(joined.length);
      joined += nodes[i].nodeValue;
    }

    var firstLen = nodes[0].nodeValue.length;
    var re = rewriter.spanRe;
    re.lastIndex = 0;
    var m;
    while ((m = re.exec(joined)) !== null) {
      var s = m.index;
      var e = s + m[0].length;
      if (s >= firstLen) return;      // starts later; that node gets its own turn
      if (e <= firstLen) continue;    // wholly inside the first node; already handled

      var out = rewriter.replacementFor(m[0], joined.slice(Math.max(0, s - 5), s));
      if (out === null) return;
      // A replacement that itself looks like the start of a match would re-trigger
      // this pass forever. Leave those alone.
      if (SOS_PARTIAL_TAIL.test(out)) return;

      remember(nodes[0], 'text', null, nodes[0].nodeValue);
      nodes[0].nodeValue = nodes[0].nodeValue.slice(0, s) + out;

      for (var k = 1; k < nodes.length; k++) {
        var nodeStart = offsets[k];
        if (nodeStart >= e) break;
        var nodeEnd = nodeStart + nodes[k].nodeValue.length;
        remember(nodes[k], 'text', null, nodes[k].nodeValue);
        nodes[k].nodeValue = e >= nodeEnd ? '' : nodes[k].nodeValue.slice(e - nodeStart);
      }
      rewriter.hits++;
      maybeCollapse(nodes[0]);
      return;
    }
  }

  function tailLooksPartial(value) {
    // Only inspect the tail, so this stays cheap on long text nodes.
    return SOS_PARTIAL_TAIL.test(value.length > 32 ? value.slice(-32) : value);
  }

  /* ---------------------------------------------------------------
   * Collapsing whole items.
   *
   * Renaming alone leaves a perfectly readable article about the thing you're
   * sick of — it just removes the keyword you'd have used to skip it. So when a
   * match sits inside a repeated item (a search result, a post, a feed card),
   * fold the whole item down to a one-line stub instead.
   *
   * Picking the right ancestor is the dangerous part: too greedy and the page
   * disappears. Hence the bounds below, and the deliberate decision to give up
   * rather than guess.
   * --------------------------------------------------------------- */

  var CARD_SELECTORS = [
    'article', '[role="article"]', '[role="listitem"]',
    'shreddit-post', 'shreddit-comment',                       // Reddit
    'ytd-video-renderer', 'ytd-rich-item-renderer',            // YouTube
    'ytd-compact-video-renderer', 'ytd-grid-video-renderer',
    'ytd-playlist-video-renderer',
    '[data-testid="tweet"]', '[data-testid="cellInnerDiv"]',   // X
    '[data-hveid]', '[data-news-cluster-id]', 'g-card',        // Google results
    'li'
  ].join(',');

  /* Never collapse chrome — a stub in the navbar is worse than the mention.
   * Wikipedia's sticky header is a plain div at the end of <body> holding the
   * article title, so it reads as one of body's repeated items: it got folded,
   * leaving a stub along the bottom of the article. */
  var CHROME_SELECTORS = 'nav,header,footer,[role="navigation"],[role="banner"],[role="search"],' +
                         '.vector-sticky-header-container';

  var collapsedCount = 0;

  /* Holding several substantial items means this is the feed, not an item in it.
   * This is what stops "outermost match wins" from folding a whole page away.
   *
   * The test is deliberately "similar substantial SIBLINGS" rather than "contains
   * N cards": Google nests data-hveid several deep inside a single result, so
   * counting descendants rejected perfectly good cards and left the page folded
   * into fragments with the images still showing. */
  function isFeedContainer(el) {
    return containsRepeatedItems(el, 3);
  }

  function containsRepeatedItems(el, maxDepth) {
    var level = [el];
    var depth = 0;
    var budget = 500;
    while (level.length && depth < maxDepth && budget > 0) {
      var next = [];
      for (var i = 0; i < level.length && budget > 0; i++) {
        var kids = level[i].children;
        budget -= kids.length;
        if (kids.length >= 3) {
          var counts = {};
          for (var j = 0; j < kids.length; j++) {
            if ((kids[j].textContent || '').length <= 100) continue;
            var tag = kids[j].tagName;
            counts[tag] = (counts[tag] || 0) + 1;
            if (counts[tag] >= 3) return true;
          }
        }
        for (var k = 0; k < kids.length; k++) next.push(kids[k]);
      }
      level = next;
      depth++;
    }
    return false;
  }

  /* Running text is never an "item", however repetitive it looks. Consecutive
   * <p>s in an article body are similar substantial siblings by every structural
   * measure, which folded the lead paragraph of a Wikipedia article someone had
   * deliberately opened. */
  var TEXT_FLOW_TAGS = {
    P: 1, SPAN: 1, SECTION: 1, MAIN: 1, BLOCKQUOTE: 1, FIGCAPTION: 1,
    H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, DD: 1, DT: 1, TD: 1, TH: 1,
    PRE: 1, CODE: 1, LABEL: 1, FORM: 1
  };

  /* Reference lists, infoboxes and navboxes: folding a hundred citations one by
   * one wrecks the page and protects nobody from anything. */
  var NEVER_WITHIN = [
    '.references', '.reflist', '.navbox', '.infobox', '.catlinks',
    '[role="doc-endnotes"]', '[role="doc-bibliography"]',
    // Live chat: messages are textbook repeated siblings, so they'd fold one by
    // one and leave a column of stubs where the conversation was. In a chat you
    // want to see that someone said the thing, just not have to read it.
    '[role="log"]', '.chat-line__message', '[data-a-target="chat-line-message"]',
    '.chat-scrollable-area__message-container', '.seventv-message'
  ].join(',');

  /* One item among several siblings of the same kind: the classic list signal. */
  function looksLikeListItem(el) {
    if (TEXT_FLOW_TAGS[el.tagName]) return false;
    var p = el.parentElement;
    if (!p) return false;
    var kids = p.children;
    if (kids.length < 3) return false;
    var same = 0;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].tagName === el.tagName) same++;
    }
    if (same < 3 || (el.textContent || '').length <= 40) return false;
    // Evidence it's a card rather than a chunk of prose: its own heading or media.
    return !!el.querySelector('h1,h2,h3,h4,h5,h6,img,video,picture,a[href]');
  }

  /* Two tiers, because one generic rule can't serve both cases.
   *
   * A site selector (a Reddit post, a Google result, a <li>) names the whole item,
   * and these nest — Google hangs data-hveid off several levels of the same result
   * — so the OUTERMOST match is the real card. Taking the innermost gave a stub
   * where the headline was while the card's image and byline stayed on screen.
   *
   * Without a site selector all we have is "one of several similar siblings",
   * which is far weaker: the outermost such element is usually a whole section
   * of the page, so there we take the INNERMOST and accept a smaller bite. */
  function findCard(start) {
    var el = start.nodeType === 1 ? start : start.parentElement;
    var docLen = (document.body && document.body.textContent || '').length || 1;
    var cap = docLen * 0.25;
    var depth = 0;
    var outerKnown = null;   // outermost site-selector match
    var innerGeneric = null; // innermost repeated-sibling match

    while (el && depth < 15) {
      if (el === document.body || el === document.documentElement) break;
      if (el.closest && el.closest(CHROME_SELECTORS)) return null;
      if (el.closest && el.closest(NEVER_WITHIN)) return null;

      // Nothing inside a paragraph is an item. Wikipedia sets album and game
      // titles as <i><a>…</a></i>, several to a paragraph, and a long enough
      // replacement made one pass as a card: a stub mid-sentence.
      var fits = !TEXT_FLOW_TAGS[el.tagName] &&
                 !(el.parentElement && el.parentElement.closest('p')) &&
                 (el.textContent || '').length <= cap &&
                 !isFeedContainer(el);
      if (fits) {
        if (el.matches && el.matches(CARD_SELECTORS)) outerKnown = el;
        else if (!innerGeneric && !outerKnown && looksLikeListItem(el)) innerGeneric = el;
      }
      el = el.parentElement || (el.getRootNode && el.getRootNode().host) || null;
      depth++;
    }
    // No repeated item at all means prose on a page opened deliberately: rename only.
    return outerKnown || innerGeneric;
  }

  function styleStub(stub) {
    // Inline styles, so the host page's CSS can't reach in and break it.
    stub.style.cssText = [
      'display:flex', 'align-items:center', 'gap:10px',
      'margin:6px 0', 'padding:8px 12px',
      'border:1px dashed rgba(128,128,128,.55)', 'border-radius:8px',
      'background:rgba(128,128,128,.08)',
      'font:500 13px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
      'color:inherit', 'opacity:.75'
    ].join(';');
  }

  function collapseCard(card) {
    if (!card || card.__sosCollapsed || card.__sosExpanded) return;
    if (!card.parentNode) return;
    card.__sosCollapsed = true;

    // If anything inside this card was stubbed earlier (the DOM can arrive in
    // pieces), the outer fold supersedes it — drop those inner stubs.
    var inner = card.querySelectorAll ? card.querySelectorAll('[data-sos-skip]') : [];
    for (var q = 0; q < inner.length; q++) {
      var innerStub = inner[q];
      // data-sos-skip is also the page's own opt-out marker; leave those alone.
      if (!Array.isArray(innerStub.__sosCards)) continue;
      var innerCards = innerStub.__sosCards;
      for (var ic = 0; ic < innerCards.length; ic++) {
        var innerCard = innerCards[ic];
        if (innerCard && innerCard.__sosCollapsed) {
          innerCard.__sosCollapsed = false;
          innerCard.style.display = innerCard.__sosPrevDisplay || '';
          collapsedCount = Math.max(0, collapsedCount - 1);
        }
      }
      if (innerStub.parentNode) innerStub.parentNode.removeChild(innerStub);
    }

    // If the item immediately before this one is already folded, fold this one in
    // under the same stub. A dense page otherwise ends up as a stack of identical
    // "skipped" bars, which is its own kind of noise.
    // Array.isArray, not just the attribute: data-sos-skip is also the opt-out
    // marker anyone can put on their own markup, and treating one of those as a
    // stub threw, which aborted the whole tree walk mid-page.
    // The stub sits before the first card of its run, so the sibling before a later
    // card is the previous (hidden) card, not the stub: follow the card to its stub.
    var prev = card.previousElementSibling;
    var prevStub = prev && Array.isArray(prev.__sosCards) ? prev
                 : prev && prev.__sosCollapsed && prev.__sosStub ? prev.__sosStub : null;
    if (prevStub && prevStub.parentNode && Array.isArray(prevStub.__sosCards)) {
      card.__sosPrevDisplay = card.style.display;
      card.style.display = 'none';
      card.__sosStub = prevStub;
      prevStub.__sosCards.push(card);
      undoLog.push({ ref: null, node: null, kind: 'collapse', card: card, stub: null });
      collapsedCount++;
      return;
    }

    var stub = document.createElement('div');
    stub.setAttribute('data-sos-skip', '');   // never rewrite our own furniture
    stub.__sosCards = [card];
    styleStub(stub);

    var label = document.createElement('span');
    label.textContent = '🚫 skipped — you’re sick of this';
    label.style.cssText = 'flex:1;min-width:0';

    var show = document.createElement('button');
    show.type = 'button';
    show.textContent = 'show';
    show.style.cssText = [
      'flex:none', 'font:inherit', 'font-size:12px', 'cursor:pointer',
      'padding:2px 10px', 'border-radius:6px',
      'border:1px solid rgba(128,128,128,.55)', 'background:transparent', 'color:inherit'
    ].join(';');

    show.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var group = stub.__sosCards || [card];
      for (var i = 0; i < group.length; i++) {
        var c = group[i];
        c.__sosExpanded = true;          // don't fold it again behind their back
        c.__sosCollapsed = false;
        c.style.display = c.__sosPrevDisplay || '';
        collapsedCount = Math.max(0, collapsedCount - 1);
      }
      if (stub.parentNode) stub.parentNode.removeChild(stub);
    });

    stub.appendChild(label);
    stub.appendChild(show);

    card.__sosPrevDisplay = card.style.display;
    card.__sosStub = stub;
    card.parentNode.insertBefore(stub, card);
    card.style.display = 'none';

    undoLog.push({ ref: null, node: null, kind: 'collapse', card: card, stub: stub });
    collapsedCount++;
  }

  /* Collapsing has to wait for the page to actually exist.
   *
   * Renaming runs at document_start deliberately, so nothing flashes. But the
   * size cap is measured against document.body, and at document_start the body
   * is nearly empty — a container passes the "under 25% of the page" test and
   * then gets filled with the entire feed, which is how one stub swallowed the
   * whole of r/GTA6. So matches found early are queued and judged once there is
   * a page to measure against. */
  var pendingCollapse = [];
  var collapseReady = false;

  function docHasSubstance() {
    return !!document.body && (document.body.textContent || '').length > 500;
  }

  function maybeCollapse(node) {
    if (!settings.collapse) return;
    if (!collapseReady) {
      if (pendingCollapse.length < 3000) pendingCollapse.push(node);
      return;
    }
    // Collapsing is the cosmetic half of the job. If it ever throws it must not
    // take the renaming down with it — a thrown error here aborts the caller's
    // tree walk and silently leaves the rest of the page unprocessed.
    try {
      var card = findCard(node);
      if (card) collapseCard(card);
    } catch (e) { /* leave it renamed but unfolded */ }
  }

  function flushPendingCollapse(force) {
    if (!running || !settings.collapse) return;
    if (!collapseReady) {
      if (!force && !docHasSubstance()) return;
      collapseReady = true;
    }
    var list = pendingCollapse;
    pendingCollapse = [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (!n || !n.isConnected) continue;
      try {
        var card = findCard(n);
        if (card) collapseCard(card);
      } catch (e) { /* one bad item must not stop the rest */ }
    }
  }

  function patchTextNode(node) {
    if (!running || !node.nodeValue) return;
    if (skippable(node.parentNode)) return;

    var value = node.nodeValue;
    var hasMatch = rewriter.test(value);
    var hasTail = tailLooksPartial(value);
    if (!hasMatch && !hasTail) return;
    if (inEditable(node)) return;

    if (hasMatch) {
      var out = rewriter.rewrite(value);
      if (out !== null && out !== value) {
        remember(node, 'text', null, value);
        node.nodeValue = out;
        maybeCollapse(node);
      }
    }
    if (tailLooksPartial(node.nodeValue)) patchAcross(node);
  }

  function patchAttributes(el) {
    if (!running || !settings.attributes || el.nodeType !== 1 || !el.getAttribute) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var attr = ATTRS[i];
      var val = el.getAttribute(attr);
      if (!val || !rewriter.test(val)) continue;
      var out = rewriter.rewrite(val);
      if (out === null || out === val) continue;
      remember(el, 'attr', attr, val);
      el.setAttribute(attr, out);
    }
  }

  function patchTree(root) {
    if (!running || !root) return;
    if (root.nodeType === 3) { patchTextNode(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1 && skippable(root)) return;

    if (root.nodeType === 1) patchAttributes(root);

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (n) {
        if (n.nodeType === 1) {
          return skippable(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n, budget = 200000;
    while ((n = walker.nextNode()) && budget-- > 0) {
      if (n.nodeType === 3) { patchTextNode(n); continue; }
      patchAttributes(n);
      // Neither a TreeWalker nor a MutationObserver crosses a shadow boundary,
      // so each open shadow root has to be walked and observed on its own.
      // Reddit alone puts over a thousand of them on a page.
      if (n.shadowRoot) {
        patchTree(n.shadowRoot);
        observeRoot(n.shadowRoot);
      }
    }
    if (root.nodeType === 1 && root.shadowRoot) {
      patchTree(root.shadowRoot);
      observeRoot(root.shadowRoot);
    }
  }

  var lastTitleWritten = null;
  var originalTitle = null;
  function patchTitle() {
    if (!running || !settings.pageTitle || !document.title) return;
    if (document.title === lastTitleWritten) return;
    var before = document.title;
    var out = rewriter.rewrite(before);
    if (out === null) return;
    if (originalTitle === null) originalTitle = before;
    lastTitleWritten = out;
    document.title = out;
  }

  /* A second look at anything that arrives dynamically.
   *
   * When a custom element is inserted we walk it immediately, but its shadow
   * root may not be attached yet — and attachShadow can't be observed from a
   * content script. The sweeps after load cover page startup; this covers
   * everything that arrives later, which on an infinite-scrolling feed is most
   * of the page. Without it, a post scrolled to minutes in can keep its name. */
  var pendingRewalk = [];
  var rewalkTimer = null;

  function scheduleRewalk(node) {
    if (!node || node.nodeType !== 1) return;
    if (pendingRewalk.length > 300) return;
    pendingRewalk.push(node);
    if (rewalkTimer) return;
    rewalkTimer = setTimeout(function () {
      rewalkTimer = null;
      var list = pendingRewalk;
      pendingRewalk = [];
      if (!running) return;
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].isConnected) patchTree(list[i]);
      }
      patchTitle();
      flushPendingCollapse(false);
    }, 500);
  }

  function handleMutations(records) {
    if (!running) return;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === 'characterData') {
        patchTextNode(r.target);
      } else if (r.type === 'attributes') {
        patchAttributes(r.target);
      } else {
        for (var j = 0; j < r.addedNodes.length; j++) {
          patchTree(r.addedNodes[j]);
          scheduleRewalk(r.addedNodes[j]);
        }
      }
    }
    patchTitle();
  }

  function observerOptions() {
    var opts = { childList: true, subtree: true, characterData: true };
    if (settings.attributes) {
      opts.attributes = true;
      opts.attributeFilter = ATTRS;
    }
    return opts;
  }

  /* One MutationObserver can watch many roots, so every shadow root we find
   * gets registered with the same one. */
  var observedRoots = null;
  function observeRoot(root) {
    if (!observer || !root) return;
    if (!observedRoots) observedRoots = new WeakSet();
    if (observedRoots.has(root)) return;
    observedRoots.add(root);
    try {
      observer.observe(root, observerOptions());
    } catch (e) { /* detached root; nothing to watch */ }
  }

  function startObserver() {
    if (observer) return;
    observedRoots = new WeakSet();
    observer = new MutationObserver(handleMutations);
    observer.observe(document.documentElement || document, observerOptions());
  }

  function stopObserver() {
    if (!observer) return;
    observer.disconnect();
    observer = null;
    observedRoots = null;
  }

  /* Restore, for when you switch it off mid-page. */
  function restoreAll() {
    running = false;
    stopObserver();
    for (var i = undoLog.length - 1; i >= 0; i--) {
      var e = undoLog[i];
      if (e.kind === 'collapse') {
        try {
          if (e.stub && e.stub.parentNode) e.stub.parentNode.removeChild(e.stub);
          if (e.card) {
            e.card.style.display = e.card.__sosPrevDisplay || '';
            e.card.__sosCollapsed = false;
          }
        } catch (err) { /* card is gone; nothing to restore */ }
        continue;
      }
      var n = e.node || (e.ref && e.ref.deref());
      if (!n) continue;
      try {
        if (e.kind === 'text') n.nodeValue = e.original;
        else n.setAttribute(e.attr, e.original);
      } catch (err) { /* node went away mid-restore; nothing to do */ }
    }
    undoLog = [];
    rewriter.hits = 0;
    collapsedCount = 0;
    pendingCollapse = [];
    pendingRewalk = [];
    if (originalTitle !== null && document.title === lastTitleWritten) {
      document.title = originalTitle;
    }
    originalTitle = null;
    lastTitleWritten = null;
  }

  function restart() {
    running = true;
    rewriter = new SosRewriter(settings);
    lastTitleWritten = null;
    originalTitle = null;
    undoLog = [];
    collapsedCount = 0;
    pendingCollapse = [];
    collapseReady = docHasSubstance();
    startObserver();
    patchTree(document.documentElement);
    patchTitle();
    flushPendingCollapse(true);
  }

  function siteDisabled(s) {
    var host = location.hostname.replace(/^www\./, '').toLowerCase();
    return s.disabledSites.some(function (h) {
      h = String(h).replace(/^www\./, '').toLowerCase();
      return h && (host === h || host.endsWith('.' + h));
    });
  }

  function shouldRun(s) {
    return s.enabled && !siteDisabled(s);
  }

  /* Do two settings objects produce the same replacements? Anything else (which
   * attributes to scan, which sites to skip) changes scope, not wording. */
  function samePhrasing(a, b) {
    return a.mode === b.mode &&
      a.customText === b.customText &&
      a.variety === b.variety &&
      a.aggressive === b.aggressive &&
      a.markAltered === b.markAltered &&
      a.phrases.length === b.phrases.length &&
      a.phrases.every(function (p, i) { return p === b.phrases[i]; });
  }

  function applySettings(next, isInitial) {
    var wasRunning = running;
    var previous = settings;
    settings = next;

    if (!shouldRun(settings)) {
      if (wasRunning) restoreAll();
      return;
    }
    /* We started patching optimistically with the defaults. If the stored settings
     * word things the same way, keep the rewriter — and with it the memo, so the
     * tab title and the headline agree on one name. */
    if (isInitial && samePhrasing(previous, settings)) {
      rewriter.settings = settings;
      running = true;
      stopObserver();
      startObserver();
      patchTree(document.documentElement);
      patchTitle();
      return;
    }
    if (wasRunning) restoreAll();
    restart();
  }

  function loadSettings(cb) {
    var done = false;
    function finish(s) {
      if (done) return;
      done = true;
      cb(sosNormalise(s));
    }
    try {
      var got = api.storage.sync.get(SOS_DEFAULTS, function (stored) {
        if (api.runtime.lastError) {
          api.storage.local.get(SOS_DEFAULTS, function (local) { finish(local); });
          return;
        }
        finish(stored);
      });
      if (got && typeof got.then === 'function') {
        got.then(finish, function () { finish(null); });
      }
    } catch (e) {
      finish(null);
    }
  }

  /* Boot: observe and patch immediately, reconcile with stored settings the moment they arrive. */
  startObserver();
  if (document.documentElement) patchTree(document.documentElement);

  loadSettings(function (s) {
    settled = true;
    applySettings(s, true);
  });

  document.addEventListener('DOMContentLoaded', function () {
    if (!running) return;
    patchTree(document.documentElement);
    patchTitle();
    flushPendingCollapse(false);
  }, { once: true });

  window.addEventListener('load', function () {
    if (!running) return;
    patchTree(document.documentElement);
    patchTitle();
    flushPendingCollapse(false);
    // Custom elements can attach their shadow root after we've already walked
    // past them, and attachShadow isn't observable from a content script.
    // Two late sweeps cost nothing and catch the stragglers.
    setTimeout(function () {
      if (!running) return;
      patchTree(document.documentElement);
      flushPendingCollapse(false);
    }, 1000);
    setTimeout(function () {
      if (!running) return;
      patchTree(document.documentElement);
      flushPendingCollapse(true);   // last call: judge whatever page we ended up with
    }, 4000);
  }, { once: true });

  if (api.storage && api.storage.onChanged) {
    api.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'sync' && area !== 'local') return;
      loadSettings(function (s) { applySettings(s, false); });
    });
  }

  /* The popup asks how much damage has been done on this tab. */
  if (api.runtime && api.runtime.onMessage) {
    api.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (!msg || msg.type !== 'sos:stats') return;
      sendResponse({
        hits: rewriter.hits,
        collapsed: collapsedCount,
        running: running,
        settled: settled,
        host: location.hostname.replace(/^www\./, '')
      });
      return true;
    });
  }
})();
