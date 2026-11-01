// Boot, routing and the shared clock ticker.
// Routes: ?view=scoreboard | #host | #room=CODE | (default) join page.
(function (root) {
  'use strict';

  let cleanup = null;
  const ticks = new Set();

  setInterval(() => {
    for (const fn of Array.from(ticks)) {
      try { fn(); } catch (e) { console.error(e); }
    }
  }, 250);

  // Registers fn on the shared 250 ms ticker; cleared automatically on route change.
  function onTick(fn) {
    ticks.add(fn);
    return () => ticks.delete(fn);
  }

  function isHost() { return Store.local.get('scrabble.host') === '1'; }
  function setHost(on) { if (on) Store.local.set('scrabble.host', '1'); else Store.local.remove('scrabble.host'); }

  // ---------- header switches ----------
  function updateThemeIcon() {
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = Theme.current() === 'dark' ? '🌙' : '☀️';
  }

  function updateSoundIcon() {
    const btn = document.getElementById('soundToggle');
    if (btn) btn.textContent = Sound.enabled() ? '🔊' : '🔇';
  }

  function wireHeaderToggles() {
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) themeBtn.onclick = () => { Theme.toggle(); updateThemeIcon(); };
    const soundBtn = document.getElementById('soundToggle');
    if (soundBtn) soundBtn.onclick = () => { Sound.toggle(); updateSoundIcon(); };
    updateThemeIcon();
    updateSoundIcon();
  }

  function go(route) { location.hash = route; }

  function el() { return document.getElementById('app'); }

  function route() {
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } }
    cleanup = null;
    ticks.clear();
    window.scrollTo(0, 0);

    const params = new URLSearchParams(location.search);
    const hash = location.hash.replace(/^#/, '');
    if (params.get('view') === 'scoreboard' && root.ScoreboardView) {
      document.body.classList.add('bigscreen');
      cleanup = root.ScoreboardView.show(el());
      return;
    }
    document.body.classList.remove('bigscreen');
    if (hash === 'host') {
      cleanup = HostView.show(el());
    } else if (hash.startsWith('room=')) {
      let raw = hash.slice(5);
      try { raw = decodeURIComponent(raw); } catch (e) { /* malformed escape: use as-is */ }
      const code = Match.normalizeCode(raw);
      cleanup = code.length === 6 ? RoomView.show(el(), code) : RoomView.showJoin(el());
    } else {
      cleanup = RoomView.showJoin(el());
    }
  }

  root.App = { go, isHost, setHost, onTick, route };

  function playgroundBanner() {
    if (!Store.playground) return;
    const bar = document.createElement('div');
    bar.className = 'playground-bar';
    // Full text on wide screens, one short line on phones (CSS picks one; see .pg-long/.pg-short).
    bar.innerHTML = '<span class="pg-long">🧪 <b>PLAYGROUND</b>: local test data only, separate from the real tournament.</span>' +
      '<span class="pg-short">🧪 <b>PLAYGROUND</b> · test data</span> ' +
      '<button class="small secondary" id="resetPlayground">Reset playground</button>';
    document.body.prepend(bar);
    bar.querySelector('#resetPlayground').onclick = async () => {
      if (!confirm('Delete ALL playground teams, rooms and results? (Real tournament data is not affected.)')) return;
      await Store.resetTournament();
      UI.toast('Playground reset.', 'ok');
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    Theme.init();
    Store.init();
    playgroundBanner();
    wireHeaderToggles();
    window.addEventListener('hashchange', route);
    route();
  });
})(window);
