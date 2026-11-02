// Pure tabs + pages for the host's room list (feature #8).
//   tabOf(phase)                    -> 'active' | 'finished' | 'void'
//   view(sortedRooms, {tab, page}, phaseOf)
//     -> { tab, counts: {active, finished, void, attention}, items, page, pages }
//        Active is never paged (those rooms need the host's attention); Finished and Void
//        show PER_PAGE rooms per page, in the order given, and the page is clamped.
//   pageList(page, pages)           -> page buttons: 1, the last page and page±1, '…' for gaps
// Loads as a browser global (RoomList) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoomList = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PER_PAGE = 5;
  const TABS = ['active', 'finished', 'void'];
  const ATTENTION = ['appeal', 'hostDecision'];

  function tabOf(phase) {
    if (phase === 'final') return 'finished';
    if (phase === 'void') return 'void';
    return 'active';
  }

  function view(sortedRooms, sel, phaseOf) {
    const tab = TABS.includes(sel && sel.tab) ? sel.tab : 'active';
    const groups = { active: [], finished: [], void: [] };
    for (const r of sortedRooms) groups[tabOf(phaseOf(r))].push(r);
    // attention: active rooms waiting on the host (an appeal or a tie to award), shown on every tab.
    const attention = groups.active.filter(r => ATTENTION.includes(phaseOf(r))).length;
    const counts = { active: groups.active.length, finished: groups.finished.length, void: groups.void.length, attention };
    const list = groups[tab];
    if (tab === 'active') return { tab, counts, items: list, page: 1, pages: 1 };
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    const page = Math.min(pages, Math.max(1, Math.floor(Number(sel && sel.page)) || 1));
    return { tab, counts, items: list.slice((page - 1) * PER_PAGE, page * PER_PAGE), page, pages };
  }

  function pageList(page, pages) {
    const keep = new Set([1, pages, page - 1, page, page + 1].filter(p => p >= 1 && p <= pages));
    const out = [];
    let last = 0;
    for (const p of [...keep].sort((a, b) => a - b)) {
      if (p - last > 1) out.push('…');
      out.push(p);
      last = p;
    }
    return out;
  }

  return { PER_PAGE, tabOf, view, pageList };
});
