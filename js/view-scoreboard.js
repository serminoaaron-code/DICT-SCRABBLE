// Projector broadcast view: ?view=scoreboard. Read-only, no password, never writes to Firebase.
// An esports-style 16:9 broadcast (spec §5.7, mockup projector-broadcast.html): top score bar,
// the featured room's board with the newest tiles glowing, standings + last move on the right,
// a lower-third, the AUTO / PINNED badge and a ticker of every live room. The pure Director
// (js/director.js) picks the featured room and the scene; this file only renders what it says.
(function (root) {
  'use strict';

  const esc = s => UI.escapeHtml(s);
  const LIVE = ['live', 'suddenDeath', 'hostDecision'];
  const SWAP_MS = 320;      // the wipe covers the screen here; the new room is swapped in underneath
  const WIPE_MS = 700;
  const TICKER_PX_PER_S = 70;

  const reducedMotion = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const pretty = code => (code && code.length === 6 ? Match.formatCode(code) : String(code || ''));

  const TEMPLATE = `
    <div class="bp" id="bigRoot">
      <div class="bp-shape bp-shape-y" aria-hidden="true"></div>
      <div class="bp-shape bp-shape-r" aria-hidden="true"></div>
      <div class="bp-idlehead" aria-hidden="true"><span class="disp">🏆 TEAM STANDINGS</span><small>DICT Digital Scrabble · Sportsfest 2026</small></div>
      <div class="bp-top" id="bigTop">
        <div class="bp-side bp-a" data-side="A"><div class="bp-team"></div><div class="bp-player"></div></div>
        <div class="bp-mid">
          <div class="bp-scoreline"><span class="bp-score disp" data-seat="A"></span><span class="bp-vs disp">VS</span><span class="bp-score disp" data-seat="B"></span></div>
          <div class="bp-meta"><span class="bp-clock"></span><span class="bp-pill"></span></div>
        </div>
        <div class="bp-side bp-b" data-side="B"><div class="bp-team"></div><div class="bp-player"></div></div>
      </div>
      <div class="bp-feature">
        <div class="bp-board" id="bigBoard"></div>
        <div class="bp-lobby hidden" id="bigLobby"></div>
      </div>
      <div class="bp-right">
        <div class="bp-card bp-stand"><h4 class="disp">🏆 TEAM STANDINGS</h4>
          <table class="bp-table"><tbody id="bigStand"></tbody></table></div>
        <div class="bp-card bp-last"><h4 class="disp">LAST MOVE</h4><div id="bigLastMove" class="bp-lastmove"></div></div>
      </div>
      <div class="bp-card bp-recent"><h4 class="disp">LATEST RESULTS</h4><div id="bigRecent"></div></div>
      <div class="bp-card bp-next" id="bigNext"></div>
      <div class="bp-corner hidden" id="bigCorner" role="status"></div>
      <div class="bp-lower" id="bigLower"></div>
      <div class="bp-badges">
        <button type="button" class="bp-theme" id="bigTheme" aria-label="Switch light/dark theme" title="Switch theme">☀️</button>
        <div class="bp-mode" id="bigMode">🔁 AUTO</div>
      </div>
      <div class="bp-ticker"><div class="bp-lbl disp">LIVE</div><div class="bp-items-wrap"><div class="bp-items" id="bigLive"></div></div></div>
      <div class="bp-winner hidden" id="bigWinner"></div>
      <div class="bp-wipe" id="bigWipe" aria-hidden="true"></div>
    </div>`;

  function show(el) {
    el.innerHTML = TEMPLATE;
    const $ = sel => el.querySelector(sel);
    const stage = $('#bigRoot');
    const st = {
      teams: {}, rooms: {}, pinned: null, got: { teams: false, rooms: false, pinned: false },
      dir: Director.init(), sceneId: -1, target: null, shown: null,
      swapTimer: null, wipeTimer: null, roundKey: '', hlCode: null,
      keys: {}, scores: {}
    };

    // ---------- data helpers ----------
    const named = room => Match.withTeamNames(room, st.teams);
    const teamName = (room, seat) => {
      const id = seat === 'A' ? room.teamA : room.teamB;
      return (st.teams[id] && st.teams[id].name) || (seat === 'A' ? room.teamAName : room.teamBName) || (seat === 'A' ? 'Team A' : 'Team B');
    };
    const playerName = (room, seat) => (room.seats && room.seats[seat] && room.seats[seat].name) || '';
    const isLive = room => !!room && LIVE.includes(room.status) && !!room.game;

    function clockOf(room) {
      const phase = Match.roomPhase(room);
      if (phase === 'suddenDeath') return 'SUDDEN DEATH';
      if (phase === 'hostDecision') return 'HOST DECISION';
      if (phase === 'paused') return 'PAUSED';
      if (!room.clock) return UI.formatClock((Number(room.matchLengthSec) || 0) * 1000);
      const ms = room.clock.paused ? room.clock.paused.matchRemainingMs : room.clock.endsAt - Store.serverNow();
      return UI.formatClock(ms); // same as the players' #matchClock (it already counts during the intro)
    }
    function clockLow(room) {
      if (!room.clock || room.status !== 'live' || room.clock.paused) return false;
      const left = room.clock.endsAt - Store.serverNow();
      return left <= 60000;
    }

    // Writes only when the value changed, so a running animation or a held score is never reset.
    function setHtml(node, key, html) {
      if (st.keys[key] === html) return false;
      st.keys[key] = html;
      node.innerHTML = html;
      return true;
    }
    function setText(node, text) { if (node.textContent !== text) node.textContent = text; }

    // ---------- right column, idle panel, ticker ----------
    // Every team must be visible on the projector (DICT may field 20-30 teams): up to 18 rows in
    // one column, then two columns of up to 18; past 36 teams the last row reads "+N more".
    const STAND_COL_ROWS = 18;
    function renderStandings() {
      const list = Match.computeStandings(st.teams, st.rooms);
      const max = STAND_COL_ROWS * 2;
      const shown = list.length > max ? list.slice(0, max - 1) : list;
      const more = list.length - shown.length;
      const rows = (shown.map(t => `<tr class="${t.rank <= 3 ? 'r' + t.rank : ''}">
        <td class="rk"><span>${t.rank}</span></td><td class="nm">${esc(t.name)}</td><td class="wl">${t.wins}-${t.losses}</td><td class="pts">${t.points}</td></tr>`).join('')
        + (more ? `<tr class="bp-more"><td colspan="4" class="bp-empty">+${more} more</td></tr>` : ''))
        || '<tr><td colspan="4" class="bp-empty">No teams yet</td></tr>';
      const tbody = $('#bigStand');
      setHtml(tbody, 'stand', rows);
      const cols = list.length > STAND_COL_ROWS;
      const perCol = cols ? Math.ceil((shown.length + (more ? 1 : 0)) / 2) : list.length;
      tbody.style.setProperty('--stand-rows', String(perCol));
      stage.classList.toggle('bp-cols', cols);
      stage.classList.toggle('bp-many', perCol > 8);
      stage.classList.toggle('bp-lots', perCol > 13);
      stage.classList.toggle('bp-max', perCol > 15);
    }

    function renderRecent() {
      const recent = Object.values(st.rooms).filter(r => r.status === 'final' && r.result)
        .sort((a, b) => (b.result.decidedAt || 0) - (a.result.decidedAt || 0)).slice(0, 5);
      setHtml($('#bigRecent'), 'recent', recent.length
        ? recent.map(r => `<div class="bp-res"><b>+1 ${esc(teamName(r, r.result.winner))}</b> (${Number(r.result.scoreA) || 0}–${Number(r.result.scoreB) || 0})</div>`).join('')
        : '<div class="bp-empty">No results yet</div>');
    }

    function renderNext() {
      const waiting = Object.values(st.rooms).filter(r => r.status === 'waiting')
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const rows = waiting.slice(0, 6).map(r => `<div class="bp-nx"><div class="bp-nx-teams"><span>${esc(teamName(r, 'A'))}</span>
          <span class="bp-nx-vs disp">VS</span><span>${esc(teamName(r, 'B'))}</span></div>
          <div class="bp-nx-code">ROOM ${esc(pretty(r.code))}${r.label ? ' · ' + esc(r.label) : ''}</div></div>`).join('');
      const more = waiting.length > 6 ? `<div class="bp-empty">+${waiting.length - 6} more</div>` : '';
      setHtml($('#bigNext'), 'next', `<h4 class="disp">⏭ Next up</h4>` +
        (rows ? rows + more : '<div class="bp-empty">No matches scheduled yet</div>'));
    }

    function renderTicker() {
      const live = Object.values(st.rooms).filter(isLive).sort((a, b) => (a.code < b.code ? -1 : 1));
      const item = r => `<span class="bp-tk${r.code === st.shown ? ' feat' : ''}">${esc(teamName(r, 'A'))} <b>${r.game.scores.A}</b> – <b>${r.game.scores.B}</b> ${esc(teamName(r, 'B'))} · <span data-bigclock="${esc(r.code)}">${esc(clockOf(r))}</span></span>`;
      const one = live.map(item).join('');
      const box = $('#bigLive');
      // The clocks tick in place; rebuild only when rooms, names, scores or the featured room change.
      const key = live.map(r => [r.code, teamName(r, 'A'), r.game.scores.A, r.game.scores.B, teamName(r, 'B'), r.code === st.shown].join('|')).join('/');
      if (st.keys.ticker === key) return;
      st.keys.ticker = key;
      if (!live.length) {
        box.innerHTML = '<span class="bp-tk bp-none">No games in progress</span>';
        box.classList.remove('scroll');
        return;
      }
      box.innerHTML = one;
      const wrap = box.parentElement;
      const overflow = box.scrollWidth > wrap.clientWidth;
      if (overflow && !reducedMotion()) {
        // Two copies scroll by one copy's width, so the loop is seamless; the copy is hidden from screen readers.
        box.innerHTML = one + `<span class="bp-copy" aria-hidden="true">${one}</span>`;
        const dist = box.scrollWidth / 2;
        box.style.setProperty('--tk-dur', Math.max(12, Math.round(dist / TICKER_PX_PER_S)) + 's');
        box.classList.add('scroll');
      } else {
        box.classList.remove('scroll');
      }
    }

    // ---------- featured room ----------
    function renderTop(room) {
      const top = $('#bigTop');
      for (const s of ['A', 'B']) {
        const side = top.querySelector(`[data-side="${s}"]`);
        setText(side.querySelector('.bp-team'), room ? teamName(room, s) : '');
        setText(side.querySelector('.bp-player'), room ? playerName(room, s) : '');
        const turn = !!room && isLive(room) && room.game.turn === s && room.status !== 'hostDecision';
        side.classList.toggle('turn', turn);
        const score = room && room.game ? String(room.game.scores[s]) : '0';
        const sc = top.querySelector(`.bp-score[data-seat="${s}"]`);
        // Only on a real change: a word celebration may be holding the old score until its points land.
        if (st.scores[s] !== score || st.scores.code !== (room && room.code)) sc.textContent = score;
        st.scores[s] = score;
      }
      st.scores.code = room && room.code;
      const clock = top.querySelector('.bp-clock');
      if (room) clock.setAttribute('data-bigclock', room.code); else clock.removeAttribute('data-bigclock');
      tickTop(room);
    }

    function tickTop(room) {
      const top = $('#bigTop');
      const clock = top.querySelector('.bp-clock');
      const pill = top.querySelector('.bp-pill');
      if (!room) { setText(clock, ''); setText(pill, ''); return; }
      setText(clock, clockOf(room));
      clock.classList.toggle('low', clockLow(room));
      let text = '', kind = 'ready';
      if (room.status === 'waiting') {
        text = 'Starting soon';
      } else if (room.status === 'final') {
        text = 'Final'; kind = 'final';
      } else {
        const p = Pill.state(room, 'watch', Store.serverNow());
        if (p) { text = p.text + (p.ms !== null && p.kind !== 'ready' ? ' · ' + UI.formatClock(p.ms) : ''); kind = p.kind; }
      }
      setText(pill, text);
      const cls = 'bp-pill pk-' + kind;
      if (pill.className !== cls) pill.className = cls;
    }

    function newCells(room) {
      const lm = room.game && room.game.lastMove;
      const set = {};
      if (lm && lm.type === 'play') {
        for (const w of lm.words || []) for (const c of w.cells || []) if (c && c.isNew) set[c.r + '_' + c.c] = true;
      }
      return set;
    }

    function renderBoard(room) {
      const board = $('#bigBoard'), lobby = $('#bigLobby');
      const waiting = !!room && room.status === 'waiting';
      board.classList.toggle('hidden', waiting);
      lobby.classList.toggle('hidden', !waiting);
      if (waiting) {
        const seat = s => {
          const p = room.seats && room.seats[s];
          return `<div class="bp-lb-side bp-lb-${s.toLowerCase()}"><div class="bp-lb-team disp">${esc(teamName(room, s))}</div>
            <div class="bp-lb-player">${p ? esc(p.name) + (p.ready ? ' · ✓ Ready' : '') : 'Waiting for player…'}</div></div>`;
        };
        setHtml(lobby, 'lobby', `<div class="bp-lb-title disp">STARTING SOON</div>${seat('A')}<div class="bp-lb-vs disp">VS</div>${seat('B')}
          <div class="bp-lb-code">ROOM ${esc(pretty(room.code))}</div>`);
        st.keys.board = '';
        return;
      }
      const g = room && room.game;
      const pending = g && g.pending ? g.pending.placements || null : null;
      const key = room ? [room.code, g ? g.moveCount : -1, g ? Object.keys(g.board || {}).length : 0, pending ? JSON.stringify(pending) : ''].join('|') : 'none';
      if (st.keys.board === key) return;
      st.keys.board = key;
      UI.renderBoard(board, (g && g.board) || {}, { pending });
      // Like the mockup, the premium squares speak by colour alone (tiny labels are unreadable on a projector).
      board.querySelectorAll('.sq').forEach(sq => { if (!sq.firstElementChild) sq.textContent = ''; });
      if (!room) return;
      const fresh = newCells(room);
      for (const k of Object.keys(fresh)) {
        const [r, c] = k.split('_');
        const t = board.querySelector(`.sq[data-r="${r}"][data-c="${c}"] .tile`);
        if (t) t.classList.add('bp-new');
      }
    }

    function renderLastMove(room) {
      let html = '';
      const lm = room && room.game && room.game.lastMove;
      if (!room) html = '';
      else if (room.status === 'waiting') html = '<span class="bp-empty">The match has not started yet.</span>';
      else if (!lm) html = '<span class="bp-empty">First move coming up…</span>';
      else {
        const who = `<b>${esc(playerName(room, lm.seat) || teamName(room, lm.seat))}</b>`;
        if (lm.type === 'pass') html = `${who} passed`;
        else if (lm.type === 'timeout') html = `${who} ran out of time`;
        else {
          const words = (lm.words || []).map(w => `<b>${esc(w.word)}</b>`).join(', ');
          const tier = Celebrate.tierFor({ total: lm.total, bingo: lm.bingo });
          const title = tier > 0 ? ` · <span class="bp-tier t${tier}">${esc(Celebrate.TITLES[tier])}</span>` : '';
          html = `${who} played ${words} (${Number(lm.total) || 0})${lm.bingo ? ' · BINGO' : ''}${title}`;
        }
      }
      setHtml($('#bigLastMove'), 'last', html);
    }

    function renderLower(room) {
      let html = '';
      if (room) {
        const tag = room.status === 'waiting' ? 'STARTING SOON' : room.status === 'final' ? 'FINAL' : room.status === 'void' ? 'VOID' : 'LIVE';
        html = `<span class="bp-dot">● ${tag}</span> · ROOM ${esc(pretty(room.code))} · ${esc(teamName(room, 'A'))} vs ${esc(teamName(room, 'B'))}`;
      }
      setHtml($('#bigLower'), 'lower', html);
      $('#bigLower').classList.toggle('hidden', !room);
    }

    function render() {
      renderStandings();
      renderRecent();
      renderNext();
      renderTicker();
      const room = st.shown ? st.rooms[st.shown] || null : null;
      stage.classList.toggle('bp-noroom', !room);
      renderTop(room);
      renderBoard(room);
      renderLastMove(room);
      renderLower(room);
    }

    // Mode badge and the corner card follow the director's state on every step.
    function renderChrome() {
      const pinned = Director.pinActive(st.dir, st.rooms, st.pinned);
      setText($('#bigMode'), pinned ? '📌 PINNED BY HOST' : '🔁 AUTO');
      $('#bigMode').classList.toggle('pinned', pinned);
      const c = st.dir.corner;
      const box = $('#bigCorner');
      const room = c && st.rooms[c.code];
      if (!c || !room) {
        box.classList.add('hidden');
        st.keys.corner = '';
        return;
      }
      const mv = c.move;
      const word = (mv.words && mv.words[0] && mv.words[0].word) || '';
      const html = `<div class="bp-cn-head">🔥 ${esc(Celebrate.TITLES[mv.tier] || '')} in <span class="bp-nw">ROOM ${esc(pretty(c.code))}</span></div>
        <div class="bp-cn-line">${esc(mv.teamName || teamName(room, mv.seat))} · <b>${esc(word)}</b> +${Number(mv.total) || 0}</div>`;
      const key = c.code + '|' + mv.moveCount + '|' + html;
      if (st.keys.corner !== key) {
        st.keys.corner = key;
        box.innerHTML = html;
        box.classList.remove('hidden', 'in');
        void box.offsetWidth;
        box.classList.add('in');
      }
    }

    // ---------- scenes ----------
    function wipe() {
      const w = $('#bigWipe');
      w.classList.remove('go');
      void w.offsetWidth;
      w.classList.add('go');
      clearTimeout(st.wipeTimer);
      st.wipeTimer = setTimeout(() => w.classList.remove('go'), WIPE_MS + 50);
    }

    function hideWinner() {
      Scenes.clearResult();
      const w = $('#bigWinner');
      if (!w.classList.contains('hidden')) { w.classList.add('hidden'); w.textContent = ''; }
    }

    function mountScene() {
      const d = st.dir;
      const room = d.featured ? st.rooms[d.featured] : null;
      if (d.scene === 'highlight' && d.move && room) {
        const seat = d.move.seat;
        st.hlCode = d.featured;
        Celebrate.show(d.move, { container: stage, scoreEl: () => stage.querySelector(`.bp-score[data-seat="${seat}"]`), mine: false });
      } else if (d.scene === 'winner' && room) {
        const w = $('#bigWinner');
        w.classList.remove('hidden');
        Scenes.renderResult(w, named(room), 'neutral');
      } else if (d.scene === 'intro' && room) {
        Scenes.playIntro(stage, named(room), Store.serverNow());
      } else if (d.scene === 'roundStart') {
        st.roundKey = d.roundCodes.join(',');
        Scenes.roundStart(stage, d.roundCodes.map(c => st.rooms[c]).filter(Boolean).map(named));
      }
    }

    function applyScene() {
      const d = st.dir;
      if (d.scene !== 'intro') Scenes.clearIntro();
      if (d.scene !== 'roundStart') { Scenes.clearRound(); st.roundKey = ''; }
      // Leaving a highlight: a celebration whose room is gone (host Reset) or that a scene with its own
      // backdrop replaces is cleared at once. Back to a live room (or on to its winner card) it may
      // finish its last few hundred ms of fade-out by itself.
      if (d.scene !== 'highlight' && st.hlCode !== null) {
        if (!st.rooms[st.hlCode] || ['idle', 'intro', 'roundStart'].includes(d.scene)) Celebrate.clear();
        st.hlCode = null;
      }
      stage.classList.toggle('is-idle', d.scene === 'idle');
      const target = d.featured;
      const changed = target !== st.target;
      st.target = target;
      clearTimeout(st.swapTimer);
      st.swapTimer = null;
      const cut = changed && st.shown && target && ['room', 'highlight', 'winner'].includes(d.scene);
      if (cut) {
        // A winner card being left stays up until the wipe covers it.
        wipe();
        st.swapTimer = setTimeout(() => {
          st.swapTimer = null;
          hideWinner();
          st.shown = target;
          render();
          mountScene();
        }, SWAP_MS);
      } else {
        hideWinner();
        st.shown = target;
        render();
        mountScene();
      }
    }

    function step() {
      if (!st.got.rooms || !st.got.pinned || !st.got.teams) return;
      st.dir = Director.step(st.dir, st.rooms, st.pinned, Store.serverNow());
      if (st.dir.sceneId !== st.sceneId) {
        st.sceneId = st.dir.sceneId;
        applyScene();
      } else if (st.dir.scene === 'roundStart' && st.dir.roundCodes.join(',') !== st.roundKey) {
        mountScene(); // a late start joined the round: show the full list
      }
      renderChrome();
    }

    function onData() {
      if (!st.got.rooms || !st.got.pinned || !st.got.teams) return;
      render();
      step();
    }

    const themeBtn = $('#bigTheme');
    const themeIcon = () => { themeBtn.textContent = Theme.current() === 'dark' ? '🌙' : '☀️'; };
    themeBtn.onclick = () => { Theme.toggle(); themeIcon(); };
    themeIcon();

    const u1 = Store.watchTeams(t => { st.teams = t || {}; st.got.teams = true; onData(); });
    const u2 = Store.watchRooms(r => { st.rooms = r || {}; st.got.rooms = true; onData(); });
    const u3 = Store.watchPinned(p => { st.pinned = p || null; st.got.pinned = true; onData(); });
    App.onTick(() => {
      step();
      const room = st.shown ? st.rooms[st.shown] : null;
      el.querySelectorAll('.bp-ticker [data-bigclock]').forEach(n => {
        const r = st.rooms[n.dataset.bigclock];
        if (r && r.clock) setText(n, clockOf(r));
      });
      if (room) tickTop(room);
    });

    return () => {
      u1(); u2(); u3();
      clearTimeout(st.swapTimer);
      clearTimeout(st.wipeTimer);
      Celebrate.clear();
      Scenes.clearIntro();
      Scenes.clearRound();
      Scenes.clearResult();
    };
  }

  root.ScoreboardView = { show };
})(window);
