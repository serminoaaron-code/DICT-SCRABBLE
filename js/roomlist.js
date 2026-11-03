// Pure tabs + pages for the host's room list (feature #8).
//   tabOf(phase)                    -> 'active' | 'finished' | 'void'
//   view(sortedRooms, {tab, page}, phaseOf)
//     -> { tab, counts: {active, finished, void, attention}, items, page, pages }
//        Active is never paged (those rooms need the host's attention); Finished and Void
//        show PER_PAGE rooms per page, in the order given, and the page is clamped.
//   pageList(page, pages)           -> page buttons: 1, the last page and page±1, '…' for gaps
//   seatRows(room), seatTags(row, phase) -> a room card's Player List / Seat Overview (see below)
// Loads as a browser global (RoomList) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoomList = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
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

  // ---- the host room card's Player List / Seat Overview (host room cards redesign, 2026-11-03) ----
  // seatRows(room) -> one row per seat of the room (2, 3 or 4), in seat order:
  //   { seat, num, name|null, taken, ready, online, turn, score|null, out: 'left'|'sd'|null, leaves }
  // seatTags(row, phase) -> the small per-player tags: [{ kind: 'bad'|'turn'|'ok'|'off'|'warn', text }]
  const Mx = () => root.Match || (typeof require === 'function' ? require('./match.js') : null);
  const PLAYING = ['live', 'paused', 'appeal', 'suddenDeath', 'hostDecision'];

  function seatRows(room) {
    const M = Mx();
    const g = room.game || null;
    return M.seatsOf(room).map((seat, i) => {
      const s = room.seats && room.seats[seat];
      const out = (g && g.out && g.out[seat]) || null;
      return {
        seat, num: i + 1,
        name: s ? s.name : null,
        taken: !!s,
        ready: !!(s && s.ready),
        online: M.isSeatOnline(room, seat),
        turn: !!(g && g.turn === seat && !out),
        score: g && g.scores ? (Number(g.scores[seat]) || 0) : null,
        out: out === 'left' || out === 'sd' ? out : null,
        leaves: Number(room.fairPlay && room.fairPlay[seat] && room.fairPlay[seat].screenLeaves) || 0
      };
    });
  }

  function seatTags(row, phase) {
    if (!row.taken || phase === 'final' || phase === 'void') return [];
    const tags = [];
    const playing = PLAYING.includes(phase);
    if (playing && row.out) tags.push({ kind: 'bad', text: row.out === 'left' ? 'LEFT' : 'OUT' });
    if (playing && row.turn) tags.push({ kind: 'turn', text: '▶ Turn' });
    if (phase === 'waiting') tags.push(row.ready ? { kind: 'ok', text: '✓ Ready' } : { kind: 'off', text: 'Not ready' });
    if (!row.online && row.out !== 'left') tags.push({ kind: 'off', text: '📴 Offline' });
    if (row.leaves > 0) tags.push({ kind: 'warn', text: `⚠️ Left the screen · ${row.leaves}×` });
    return tags;
  }

  return { PER_PAGE, tabOf, view, pageList, seatRows, seatTags };
});
