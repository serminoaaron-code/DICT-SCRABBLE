// Shared rendering helpers.
(function (root) {
  'use strict';

  const E = root.ScrabbleEngine;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  function formatClock(ms) {
    const total = Math.max(0, Math.ceil((ms || 0) / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function toast(msg, kind = '') {
    const box = document.getElementById('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), kind === 'error' ? 5000 : 3500);
  }

  function renderStandings(el, standings) {
    if (!standings.length) {
      el.innerHTML = '<p class="muted small-text">No teams yet.</p>';
      return;
    }
    const medal = r => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : '#' + r);
    el.innerHTML = `<table class="standings">
      <thead><tr><th>Rank</th><th>Team</th><th>W-L</th><th>Pts</th></tr></thead>
      <tbody>${standings.map(t => `<tr>
        <td>${medal(t.rank)}</td><td>${escapeHtml(t.name)}</td><td>${t.wins}-${t.losses}</td><td class="pts">${t.points}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  const LABELS = { tw: '3W', dw: '2W', tl: '3L', dl: '2L', center: '★' };

  function tileHtml(letter, cls = '') {
    return `<div class="tile ${cls}">${escapeHtml(letter)}<span class="sub">${E.LETTER_VALUES[letter] || 0}</span></div>`;
  }

  // temp: [{r,c,letter}] tiles being placed; pending: [{r,c,letter}] awaiting host.
  function renderBoard(el, board, { temp = [], pending = null, onSquare = null } = {}) {
    const tempMap = {}; for (const p of temp) tempMap[E.key(p.r, p.c)] = p.letter;
    const pendMap = {}; for (const p of (pending || [])) pendMap[E.key(p.r, p.c)] = p.letter;
    let html = '';
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        const type = E.PREMIUM_GRID[r][c] || 'normal';
        const k = E.key(r, c);
        let inner = LABELS[type] || '';
        if (board[k]) inner = tileHtml(board[k]);
        else if (pendMap[k]) inner = tileHtml(pendMap[k], 'pending');
        else if (tempMap[k]) inner = tileHtml(tempMap[k], 'temp');
        html += `<div class="sq ${type}" data-r="${r}" data-c="${c}">${inner}</div>`;
      }
    }
    el.innerHTML = `<div class="scrabble-grid">${html}</div>`;
    if (onSquare) {
      el.firstChild.onclick = ev => {
        const sq = ev.target.closest('.sq');
        if (sq) onSquare(Number(sq.dataset.r), Number(sq.dataset.c));
      };
    }
  }

  // order: rack indices in display order (Rack.shuffle); data-i stays the rack index, so
  // selectedIndex, usedIndices and onTile all keep using rack indices.
  function renderRack(el, rack, { selectedIndex = null, usedIndices = [], onTile = null, order = null } = {}) {
    const show = order && order.length === rack.length ? order : rack.map((_, i) => i);
    el.innerHTML = show.map(i => {
      const letter = rack[i];
      const used = usedIndices.includes(i);
      const cls = used ? 'used' : (selectedIndex === i ? 'selected' : '');
      return `<div class="tile ${cls}" data-i="${i}">${used ? '' : escapeHtml(letter)}<span class="sub">${used ? '' : (E.LETTER_VALUES[letter] || 0)}</span></div>`;
    }).join('') || '<span class="small-text" style="color:#fef3c7">No tiles left</span>';
    if (onTile) {
      el.onclick = ev => {
        const t = ev.target.closest('.tile');
        if (t && !t.classList.contains('used')) onTile(Number(t.dataset.i));
      };
    }
  }

  // Live team standings into whatever element getEl() returns (it may be re-created by re-renders).
  function mountStandings(getEl) {
    const state = { teams: {}, rooms: {} };
    const render = () => {
      const target = getEl();
      if (target) renderStandings(target, Match.computeStandings(state.teams, state.rooms));
    };
    const u1 = Store.watchTeams(t => { state.teams = t; render(); });
    const u2 = Store.watchRooms(r => { state.rooms = r; render(); });
    return { render, off() { u1(); u2(); } };
  }

  // Body of the "? Bonuses" help card (feature #7). Static copy; the swatches reuse the board's square classes.
  function bonusHelpHtml() {
    const row = (cls, label, text) => `<div class="bonus-sw sq ${cls}">${label}</div><div>${text}</div>`;
    return `<div class="bonus-legend">
      ${row('tw', LABELS.tw, '<b>Triple word</b>: the whole word scores ×3')}
      ${row('dw', LABELS.dw, '<b>Double word</b>: the whole word scores ×2')}
      ${row('tl', LABELS.tl, '<b>Triple letter</b>: that tile scores ×3')}
      ${row('dl', LABELS.dl, '<b>Double letter</b>: that tile scores ×2')}
      ${row('center', LABELS.center, '<b>Centre</b>: the first word must cover it (counts as 2W)')}
      ${row('bingo', '+' + E.BINGO_BONUS, '<b>Bingo</b>: use all 7 tiles in one play')}
    </div>
    <p class="bonus-foot">Bonuses count only on the turn a tile first covers them.</p>`;
  }

  root.UI = { escapeHtml, formatClock, toast, renderStandings, renderBoard, renderRack, mountStandings, bonusHelpHtml };
})(window);
