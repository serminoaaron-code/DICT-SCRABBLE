// The one team line (host room cards redesign + lobby, 2026-11-03), used everywhere a room's teams are listed
// above its details: the host room cards, the players' waiting screen (lobby) and the seat picker.
//   html(teams) -> markup for [{ seat: 'A'..'D', name }] in seat order:
//     2 teams: TEAM  VS  TEAM (one row, equal halves)
//     3-4 teams: a "3-WAY / 4-WAY MATCH" label over equal chips numbered like the seats (1-4);
//                css/style.css lays 4 teams 2 x 2 and 3 teams 2 + 1 when the line is narrow.
// Names are shown with Names.short (full name in the title) and always escaped. Seats outside A-D are dropped.
// Loads as a browser global (TeamLine) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TeamLine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const SEATS = ['A', 'B', 'C', 'D'];
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const short = s => (root.Names ? root.Names.short(s) : String(s == null ? '' : s));

  function html(teams) {
    const list = (teams || []).filter(t => t && SEATS.includes(t.seat));
    const n = list.length;
    const chip = (t, i) => `<span class="chip chip-${t.seat.toLowerCase()} tl-chip" title="${esc(t.name)}">${n > 2 ? `<span class="tl-num" aria-hidden="true">${i + 1}</span>` : ''}${esc(short(t.name))}</span>`;
    if (n <= 2) return `<div class="teamline n${n}"><div class="tl-grid">${list.map(chip).join('<span class="tl-vs">VS</span>')}</div></div>`;
    return `<div class="teamline n${n}"><span class="tl-lab">${n}-WAY MATCH</span><div class="tl-grid">${list.map(chip).join('')}</div></div>`;
  }

  return { html };
});
