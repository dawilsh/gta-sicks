/* GTA Sicks — options page. */
(function () {
  'use strict';

  var api = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;

  var SAMPLES = [
    'Rockstar confirms GTA 6 has slipped to next year',
    'Everything we know about Grand Theft Auto VI so far',
    'The GTA VI trailer broke every record on the internet',
    'Analysts say GTA 6 could sell 40 million copies',
    'Fans dissect a single frame of the gta6 footage'
  ];

  var el = {};
  ['enabled', 'collapse', 'markAltered', 'aggressive', 'pageTitle', 'attributes', 'customText', 'customWrap',
   'listWrap', 'phrases', 'phraseCount', 'preview', 'reroll', 'restore',
   'sites', 'newSite', 'addSite', 'save', 'status'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  var settings = sosNormalise(null);

  function collect() {
    var lines = el.phrases.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var same = lines.length === SOS_DEFAULT_PHRASES.length &&
      lines.every(function (p, i) { return p === SOS_DEFAULT_PHRASES[i]; });
    return sosNormalise({
      enabled: el.enabled.checked,
      collapse: el.collapse.checked,
      markAltered: el.markAltered.checked,
      aggressive: el.aggressive.checked,
      pageTitle: el.pageTitle.checked,
      attributes: el.attributes.checked,
      mode: settings.mode,
      variety: settings.variety,
      customText: el.customText.value,
      phrases: same ? [] : lines,          // empty means "track the built-in list"
      disabledSites: settings.disabledSites
    });
  }

  function renderPreview() {
    var live = collect();
    var rewriter = new SosRewriter(live);
    var re = sosPattern(live);
    el.preview.textContent = '';
    SAMPLES.forEach(function (line) {
      var div = document.createElement('div');
      var last = 0, m;
      re.lastIndex = 0;
      while ((m = re.exec(line))) {
        if (!m[0]) { re.lastIndex++; continue; }
        var phrase = rewriter.pick(m[0]);
        if (!phrase) continue;
        div.appendChild(document.createTextNode(line.slice(last, m.index)));
        var del = document.createElement('del');
        del.textContent = m[0];
        var ins = document.createElement('ins');
        ins.textContent = sosMatchCase(m[0], phrase);
        div.appendChild(del);
        div.appendChild(document.createTextNode(' → '));
        div.appendChild(ins);
        last = m.index + m[0].length;
      }
      div.appendChild(document.createTextNode(line.slice(last)));
      el.preview.appendChild(div);
    });
  }

  function renderSites() {
    el.sites.textContent = '';
    if (!settings.disabledSites.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.style.background = 'none';
      li.style.border = '0';
      li.textContent = 'None — it runs everywhere.';
      el.sites.appendChild(li);
      return;
    }
    settings.disabledSites.forEach(function (host) {
      var li = document.createElement('li');
      var span = document.createElement('span');
      span.textContent = host;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '×';
      btn.title = 'Remove ' + host;
      btn.addEventListener('click', function () {
        settings.disabledSites = settings.disabledSites.filter(function (h) { return h !== host; });
        renderSites();
        persist();
      });
      li.appendChild(span);
      li.appendChild(btn);
      el.sites.appendChild(li);
    });
  }

  function render() {
    el.enabled.checked = settings.enabled;
    el.collapse.checked = settings.collapse;
    el.markAltered.checked = settings.markAltered;
    el.aggressive.checked = settings.aggressive;
    el.pageTitle.checked = settings.pageTitle;
    el.attributes.checked = settings.attributes;
    el.customText.value = settings.customText;
    el.phrases.value = sosPhrasesFor(settings).join('\n');

    document.querySelectorAll('[data-mode]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === settings.mode));
    });
    document.querySelectorAll('[data-variety]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.variety === settings.variety));
    });

    var custom = settings.mode === 'custom';
    el.customWrap.classList.toggle('hidden', !custom);
    el.listWrap.classList.toggle('hidden', custom);

    el.phraseCount.textContent = sosPhrasesFor(settings).length + ' phrases';
    renderSites();
    renderPreview();
  }

  function flash() {
    el.status.classList.add('show');
    setTimeout(function () { el.status.classList.remove('show'); }, 1400);
  }

  function persist(showStatus) {
    settings = collect();
    try {
      var p = api.storage.sync.set(settings, function () {
        if (api.runtime.lastError) api.storage.local.set(settings);
      });
      if (p && typeof p.then === 'function') p.catch(function () { api.storage.local.set(settings); });
    } catch (e) {
      api.storage.local.set(settings);
    }
    el.phraseCount.textContent = sosPhrasesFor(settings).length + ' phrases';
    if (showStatus) flash();
  }

  function load(cb) {
    try {
      var got = api.storage.sync.get(SOS_DEFAULTS, function (stored) {
        if (api.runtime.lastError) {
          api.storage.local.get(SOS_DEFAULTS, function (l) { cb(sosNormalise(l)); });
          return;
        }
        cb(sosNormalise(stored));
      });
      if (got && typeof got.then === 'function') got.then(function (s) { cb(sosNormalise(s)); }, function () { cb(sosNormalise(null)); });
    } catch (e) { cb(sosNormalise(null)); }
  }

  ['enabled', 'collapse', 'markAltered', 'aggressive', 'pageTitle', 'attributes'].forEach(function (id) {
    el[id].addEventListener('change', function () { persist(true); renderPreview(); });
  });

  document.querySelectorAll('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () { settings.mode = b.dataset.mode; render(); persist(true); });
  });
  document.querySelectorAll('[data-variety]').forEach(function (b) {
    b.addEventListener('click', function () { settings.variety = b.dataset.variety; render(); persist(true); });
  });

  var typing = null;
  [el.customText, el.phrases].forEach(function (node) {
    node.addEventListener('input', function () {
      clearTimeout(typing);
      typing = setTimeout(function () { persist(false); renderPreview(); }, 350);
    });
  });

  el.restore.addEventListener('click', function () {
    el.phrases.value = SOS_DEFAULT_PHRASES.join('\n');
    persist(true);
    renderPreview();
  });

  el.reroll.addEventListener('click', renderPreview);

  function addSite() {
    var raw = el.newSite.value.trim().toLowerCase();
    if (!raw) return;
    raw = raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split(':')[0];
    if (!raw || settings.disabledSites.indexOf(raw) !== -1) { el.newSite.value = ''; return; }
    settings.disabledSites = settings.disabledSites.concat(raw);
    el.newSite.value = '';
    renderSites();
    persist(true);
  }

  el.addSite.addEventListener('click', addSite);
  el.newSite.addEventListener('keydown', function (e) { if (e.key === 'Enter') addSite(); });
  el.save.addEventListener('click', function () { persist(true); renderPreview(); });

  load(function (s) { settings = s; render(); });
})();
