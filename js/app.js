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
      cleanup = RoomView.show(el(), Match.normalizeCode(decodeURIComponent(hash.slice(5))));
    } else {
      cleanup = RoomView.showJoin(el());
    }
  }

  root.App = { go, isHost, setHost, onTick, route };

  document.addEventListener('DOMContentLoaded', () => {
    Store.init();
    window.addEventListener('hashchange', route);
    route();
  });
})(window);
