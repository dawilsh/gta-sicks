/* GTA Sicks — popup. */
(function () {
  'use strict';

  var api = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;

  var el = {
    enabled: document.getElementById('enabled'),
    collapse: document.getElementById('collapse'),
    siteOn: document.getElementById('siteOn'),
    host: document.getElementById('host'),
    customText: document.getElementById('customText'),
    tally: document.getElementById('tally'),
    tagline: document.getElementById('tagline'),
    hint: document.getElementById('hint'),
    openOptions: document.getElementById('openOptions')
  };

  var settings = sosNormalise(null);
  var currentHost = '';

  function store(patch) {
    var next = Object.assign({}, settings, patch);
    settings = sosNormalise(next);
    try {
      var p = api.storage.sync.set(settings, function () {
        if (api.runtime.lastError) api.storage.local.set(settings);
      });
      if (p && typeof p.then === 'function') p.catch(function () { api.storage.local.set(settings); });
    } catch (e) {
      api.storage.local.set(settings);
    }
    render();
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

  function isSiteDisabled() {
    if (!currentHost) return false;
    return settings.disabledSites.some(function (h) {
      return h === currentHost || currentHost.endsWith('.' + h);
    });
  }

  function toggleSite(on) {
    if (!currentHost) return;
    var list = settings.disabledSites.filter(function (h) {
      return h !== currentHost && !currentHost.endsWith('.' + h);
    });
    if (!on) list.push(currentHost);
    store({ disabledSites: list });
    el.hint.textContent = 'Reload the page';
  }

  function render() {
    el.enabled.checked = settings.enabled;
    el.collapse.checked = settings.collapse;
    el.siteOn.checked = settings.enabled && !isSiteDisabled();
    el.host.textContent = currentHost || 'this site';
    el.siteOn.closest('.switch').classList.toggle('muted', !settings.enabled || !currentHost);

    document.querySelectorAll('[data-mode]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === settings.mode));
    });
    document.querySelectorAll('[data-variety]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.variety === settings.variety));
    });
    el.customText.classList.toggle('hidden', settings.mode !== 'custom');
    if (document.activeElement !== el.customText) el.customText.value = settings.customText;

    var count = sosPhrasesFor(settings).length;
    var what = settings.mode === 'custom'
      ? 'One phrase, applied without mercy'
      : count + ' phrases loaded';
    // Shown so you can tell at a glance whether a reload actually took.
    var version = '';
    try { version = api.runtime.getManifest().version; } catch (e) {}
    el.tagline.textContent = version ? what + ' · v' + version : what;
  }

  /* Ask the active tab how many replacements it has made. */
  function loadTally() {
    if (!api.tabs) return;
    api.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || !tab.url) { el.tally.textContent = 'No page here'; return; }
      try {
        var u = new URL(tab.url);
        if (!/^https?:$/.test(u.protocol)) {
          currentHost = '';
          el.tally.textContent = 'Browsers block extensions on this page';
          render();
          return;
        }
        currentHost = u.hostname.replace(/^www\./, '');
      } catch (e) { currentHost = ''; }
      render();

      api.tabs.sendMessage(tab.id, { type: 'sos:stats' }, function (res) {
        if (api.runtime.lastError || !res) {
          el.tally.textContent = 'Reload the page to start';
          return;
        }
        if (!res.running) { el.tally.textContent = 'Quiet on this page'; return; }
        if (!res.hits) { el.tally.textContent = 'Nothing to fix on this page. Yet.'; return; }
        el.tally.textContent = '';
        var addCount = function (n, word, tail) {
          var b = document.createElement('b');
          b.textContent = n;
          el.tally.appendChild(b);
          el.tally.appendChild(document.createTextNode(' ' + word + (n === 1 ? '' : 's') + tail));
        };
        addCount(res.hits, 'mention', '');
        if (res.collapsed) {
          el.tally.appendChild(document.createTextNode(' · '));
          addCount(res.collapsed, 'post', ' folded');
        }
        el.tally.appendChild(document.createTextNode(' here'));
      });
    });
  }

  el.enabled.addEventListener('change', function () {
    store({ enabled: el.enabled.checked });
    el.hint.textContent = 'Reload the page';
  });

  el.siteOn.addEventListener('change', function () { toggleSite(el.siteOn.checked); });

  el.collapse.addEventListener('change', function () {
    store({ collapse: el.collapse.checked });
    el.hint.textContent = 'Reload the page';
  });

  document.querySelectorAll('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () { store({ mode: b.dataset.mode }); });
  });
  document.querySelectorAll('[data-variety]').forEach(function (b) {
    b.addEventListener('click', function () { store({ variety: b.dataset.variety }); });
  });

  var typingTimer = null;
  el.customText.addEventListener('input', function () {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(function () { store({ customText: el.customText.value }); }, 250);
  });

  el.openOptions.addEventListener('click', function () {
    if (api.runtime.openOptionsPage) api.runtime.openOptionsPage();
    else window.open(api.runtime.getURL('src/options.html'));
  });

  load(function (s) { settings = s; render(); loadTally(); });
})();
