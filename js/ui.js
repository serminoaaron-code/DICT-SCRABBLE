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

  function renderRack(el, rack, { selectedIndex = null, usedIndices = [], onTile = null } = {}) {
    el.innerHTML = rack.map((letter, i) => {
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

  root.UI = { escapeHtml, formatClock, toast, renderStandings, renderBoard, renderRack };
})(window);
