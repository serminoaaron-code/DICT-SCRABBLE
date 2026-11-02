// Join page and room view (lobby, live game, final) for players, spectators and the host.
(function (root) {
  'use strict';

  const esc = s => UI.escapeHtml(s);
  const seatKey = code => 'scrabble.seat.' + code;
  const SEATS = ['A', 'B'];

  // Team colour chip: Team A is always blue, Team B is always red, everywhere.
  const chip = (seat, name) => `<span class="chip chip-${seat.toLowerCase()}">${esc(name)}</span>`;
  const versusHtml = room => `<div class="versus">${chip('A', room.teamAName)}<span class="vs-sep">vs</span>${chip('B', room.teamBName)}</div>`;

  // ---------- join page ----------

  function showJoin(el) {
    el.innerHTML = `
      <div class="card narrow">
        <h2>🔤 Join a room</h2>
        <p class="muted small-text">Enter the room code from your host and your name.</p>
        <form id="joinForm" class="stack">
          <div><label for="joinCode">Room code</label><input id="joinCode" placeholder="e.g. K7Q-42M" autocomplete="off" autocapitalize="characters"></div>
          <div><label for="joinName">Your name</label><input id="joinName" maxlength="40" autocomplete="name" placeholder="Your name"></div>
          <button type="submit" class="btn-primary">Find room</button>
        </form>
      </div>
      <div class="card narrow">
        <h3>🏆 Team standings</h3>
        <div id="joinStandings"><p class="muted small-text">Loading…</p></div>
      </div>`;
    const standings = UI.mountStandings(() => el.querySelector('#joinStandings'));
    el.querySelector('#joinName').value = Store.local.get('scrabble.name') || '';
    el.querySelector('#joinForm').onsubmit = ev => {
      ev.preventDefault();
      const code = Match.normalizeCode(el.querySelector('#joinCode').value);
      const name = el.querySelector('#joinName').value.trim().slice(0, 40);
      if (code.length !== 6) return UI.toast('Room codes have 6 characters, like K7Q-42M.', 'error');
      if (name) Store.local.set('scrabble.name', name);
      App.go('room=' + code);
    };
    return () => standings.off();
  }

  // ---------- room view ----------

  function show(el, code) {
    const me = Store.clientId();
    const state = {
      code,
      room: undefined,
      rawRoom: undefined,
      teams: {},
      mySeat: Store.local.get(seatKey(code)), // 'A' | 'B' | 'watch' | null
      loaded: false,
      pinned: null, // room code pinned to the big screen, or null
      ui: { lastSeenMove: null } // live-view working state (Task 10); lastSeenMove: null until the first live render
    };
    let presenceOff = null;
    let presenceRole = null;

    function setRole(role) {
      if (role === presenceRole) return;
      if (presenceOff) presenceOff();
      presenceOff = role ? Store.setPresence(code, role) : null;
      presenceRole = role;
    }

    function forgetSeat(msg) {
      Store.local.remove(seatKey(code));
      state.mySeat = null;
      setRole(App.isHost() ? 'host' : null);
      if (msg) UI.toast(msg, 'error');
    }

    const nameOf = (room, seat) => {
      // Rooms keep a name snapshot; live team names are not needed here.
      return seat === 'A' ? room.teamAName : room.teamBName;
    };

    async function claim(seat, name) {
      const res = await Store.mutateRoom(code, r => Match.claimSeat(r, seat, { name, clientId: me }));
      if (res.committed) {
        Store.local.set(seatKey(code), seat);
        state.mySeat = seat;
        setRole(seat);
        return true;
      }
      return false;
    }

    async function firstLoad(room) {
      if (!room) return;
      const s = state.mySeat;
      if (s === 'A' || s === 'B') {
        if (room.status === 'final' || room.status === 'void') return; // read-only result
        const res = await Store.mutateRoom(code, r => Match.rejoinSeat(r, s, me));
        if (res.committed) setRole(s);
        else { forgetSeat(); UI.toast('Your seat was freed. If you are still playing, take it again below.'); }
      } else if (s === 'watch') {
        setRole('watch');
      } else if (App.isHost()) {
        setRole('host');
      }
    }

    function onRoom(raw) {
      state.rawRoom = raw;
      const room = raw ? Match.withTeamNames(raw, state.teams) : raw;
      const first = !state.loaded;
      state.loaded = true;
      state.room = room;

      // Seat taken away by the host?
      const s = state.mySeat;
      if (!first && room && (s === 'A' || s === 'B') && room.status !== 'final' && room.status !== 'void') {
        const seat = room.seats[s];
        if (!seat || seat.clientId !== me) forgetSeat('You were removed from your seat by the host.');
      }
      if (first) firstLoad(room).then(render); else render();
    }

    // ----- renderers -----

    function render() {
      const room = state.room;
      document.body.classList.remove('in-game'); // RoomLive.renderLive / renderFinal put it back

      if (room === null) {
        el.innerHTML = `<div class="card narrow"><h2>Room not found</h2>
          <p class="muted">No room with code <span class="code">${esc(Match.formatCode(code))}</span>. Check the code with your host.</p>
          <a href="#">← Back to start</a></div>`;
        return;
      }
      if (!room) { el.innerHTML = '<div class="card narrow"><p class="muted">Loading room…</p></div>'; return; }

      const seated = state.mySeat === 'A' || state.mySeat === 'B';
      const host = App.isHost();
      if (!seated && state.mySeat !== 'watch' && !host && room.status !== 'final' && room.status !== 'void') {
        return renderChoices(room);
      }
      if (room.status === 'waiting') return renderLobby(room);
      if (room.status === 'final' || room.status === 'void') return RoomLive.renderFinal(el, room, ctx);
      return RoomLive.renderLive(el, room, ctx);
    }

    function stopWatching() {
      Store.local.remove(seatKey(code));
      state.mySeat = null;
      setRole(App.isHost() ? 'host' : null);
      render();
    }

    function renderChoices(room) {
      const inPlay = room.status !== 'waiting';
      const btn = seat => {
        const s = room.seats[seat];
        const team = nameOf(room, seat);
        if (s) return `<button disabled>${esc(team)}: taken by ${esc(s.name)}</button>`;
        // An empty seat in a running game: the player is continuing on a new device (host freed the seat).
        return `<button data-claim="${seat}">${inPlay ? `Take ${esc(team)}'s seat` : `Play for ${esc(team)}`}</button>`;
      };
      const anyFree = SEATS.some(s => !room.seats[s]);
      el.innerHTML = `
        <div class="card narrow stack">
          ${versusHtml(room)}
          <div class="center muted small-text">Room <span class="code">${esc(Match.formatCode(code))}</span>${room.label ? ' · ' + esc(room.label) : ''}</div>
          <div><label for="choiceName">Your name</label><input id="choiceName" maxlength="40" placeholder="Your name"></div>
          ${!inPlay ? btn('A') + btn('B')
            : (anyFree ? '<p class="muted small-text center">This match is in progress. If you are a player switching devices, take your seat:</p>' +
                SEATS.filter(s => !room.seats[s]).map(btn).join('')
              : '<p class="muted small-text center">This match has already started. You can watch it. (Switching devices? Ask the host to free your seat.)</p>')}
          <button class="btn-secondary" data-watch="1">👁️ Just watch</button>
          <a href="#" class="small-text">← Back to start</a>
        </div>`;
      const nameInput = el.querySelector('#choiceName');
      nameInput.value = Store.local.get('scrabble.name') || '';
      el.querySelector('.card').onclick = async ev => {
        const b = ev.target.closest('button');
        if (!b || b.disabled) return;
        if (b.dataset.watch) {
          Store.local.set(seatKey(code), 'watch');
          state.mySeat = 'watch';
          setRole('watch');
          return render();
        }
        const name = nameInput.value.trim().slice(0, 40);
        if (!name) { UI.toast('Enter your name first.', 'error'); nameInput.focus(); return; }
        Store.local.set('scrabble.name', name);
        b.disabled = true;
        if (!(await claim(b.dataset.claim, name))) {
          UI.toast('That seat was just taken.', 'error');
        }
        render();
      };
    }

    function renderLobby(room) {
      const host = App.isHost();
      const hostOnline = Object.values(room.presence).includes('host');
      const seatRow = seat => {
        const s = room.seats[seat];
        const team = chip(seat, nameOf(room, seat));
        if (!s) return `<div class="seat empty"><span class="seat-who">${team}</span><span class="small-text seat-side">Waiting for player…</span></div>`;
        const online = Match.isSeatOnline(room, seat);
        // One line: a long team or player name ends in "…" (full name on hover) instead of wrapping the row.
        return `<div class="seat ${s.ready ? 'ready' : ''}" data-seat-row="${seat}">
          <span class="seat-who"><span class="dot ${online ? 'on' : ''}"></span>${team}<span class="seat-sep">·</span><b class="seat-name" title="${esc(s.name)}">${esc(s.name)}</b>${state.mySeat === seat ? '<span class="seat-you">(you)</span>' : ''}</span>
          <span class="row seat-side">
            <span class="badge ${s.ready ? 'live' : ''}">${s.ready ? 'Ready' : 'Not ready'}</span>
            ${host ? `<button class="btn-secondary small" data-remove="${seat}">Remove</button>` : ''}
          </span></div>`;
      };
      const mine = (state.mySeat === 'A' || state.mySeat === 'B') ? room.seats[state.mySeat] : null;
      const bothReady = SEATS.every(s => room.seats[s] && room.seats[s].ready);
      el.innerHTML = `
        <div class="card narrow stack">
          ${versusHtml(room)}
          <div class="center muted small-text">Room <span class="code">${esc(Match.formatCode(code))}</span> · ${Math.round(room.matchLengthSec / 60)} min${room.label ? ' · ' + esc(room.label) : ''}</div>
          ${seatRow('A')}${seatRow('B')}
          <div class="seat"><span><span class="dot ${hostOnline ? 'on' : ''}"></span>⚙ Host</span><span class="small-text muted" id="watchCount">👁️ ${Match.watcherCount(room)} watching</span></div>
          ${mine ? `<button id="readyBtn" class="${mine.ready ? 'btn-secondary' : 'btn-primary'}">${mine.ready ? 'Not ready' : "I'm ready"}</button>` : ''}
          ${host ? `<button id="startBtn" class="btn-primary" ${bothReady ? '' : 'disabled'}>▶ Start match</button>
                    <div class="small-text muted center">${bothReady ? 'Both players are ready.' : 'Start unlocks when both players are ready.'}</div>` : ''}
          ${!mine && !host ? '<p class="muted small-text center">Waiting for the host to start the match…</p>' : ''}
          <div class="row" style="justify-content:space-between;">
            <a href="#" class="small-text">← Back to start</a>
            ${mine ? '<button class="link small-text" id="leaveSeat">Leave seat</button>' : ''}
            ${state.mySeat === 'watch' ? '<button class="link small-text" id="stopWatching">Stop watching / take a seat</button>' : ''}
          </div>
        </div>`;

      const $ = s => el.querySelector(s);
      if ($('#readyBtn')) $('#readyBtn').onclick = () =>
        Store.mutateRoom(code, r => Match.setReady(r, state.mySeat, me, !mine.ready));
      if ($('#startBtn')) $('#startBtn').onclick = async () => {
        $('#startBtn').disabled = true;
        const res = await Store.mutateRoom(code, r => Match.startMatch(r, Store.serverNow(), Math.random, Match.INTRO_MS));
        if (!res.committed) UI.toast('Could not start: both players must be ready.', 'error');
      };
      if ($('#stopWatching')) $('#stopWatching').onclick = stopWatching;
      if ($('#leaveSeat')) $('#leaveSeat').onclick = async () => {
        const seat = state.mySeat;
        forgetSeat();
        await Store.mutateRoom(code, r => Match.leaveSeat(r, seat, me));
        render();
      };
      el.querySelectorAll('[data-remove]').forEach(b => {
        b.onclick = async () => {
          const seat = b.dataset.remove;
          const s = room.seats[seat];
          if (!s || !confirm(`Remove ${s.name} from the ${nameOf(room, seat)} seat?`)) return;
          await Store.mutateRoom(code, r => Match.removePlayer(r, seat));
        };
      });
    }

    const ctx = { code, me, state, setRole, render, stopWatching };

    // Fair play: a seated player leaving the screen during play is reported to the host (no penalty).
    const onVisibility = () => {
      const room = state.room;
      const seat = state.mySeat;
      if (!document.hidden || !room || (seat !== 'A' && seat !== 'B')) return;
      if (room.status !== 'live' && room.status !== 'suddenDeath') return;
      Store.mutateRoom(code, r => Match.recordScreenLeave(r, seat));
    };
    document.addEventListener('visibilitychange', onVisibility);

    render(); // "Loading room…" right away instead of the previous view
    const unsubTeams = Store.watchTeams(t => {
      state.teams = t;
      if (state.rawRoom) { state.room = Match.withTeamNames(state.rawRoom, t); render(); }
    });
    const unsub = Store.watchRoom(code, onRoom);
    const unsubPinned = Store.watchPinned(p => { state.pinned = p; render(); });
    return () => {
      unsubTeams();
      unsubPinned();
      document.removeEventListener('visibilitychange', onVisibility);
      unsub();
      if (presenceOff) presenceOff();
      if (root.RoomLive && RoomLive.teardown) RoomLive.teardown(ctx);
    };
  }

  // ---------- live & final ----------

  // Automatic writes (timeout, time-up) are idempotent; retry every 3 s while the
  // condition still holds, in case a transaction was aborted (e.g. by a reconnect).
  const Retry = {
    due(tried, key) {
      const last = tried[key];
      if (last && Date.now() - last < 3000) return false;
      tried[key] = Date.now();
      return true;
    }
  };
  root.RoomRetry = Retry;

  const PLAYING = ['live', 'suddenDeath'];

  const teamOf = (room, seat) => (seat === 'A' ? room.teamAName : room.teamBName);
  const playerOf = (room, seat) => (room.seats[seat] ? room.seats[seat].name : teamOf(room, seat));
  const isSeat = s => s === 'A' || s === 'B';

  function myTurn(room, ctx) {
    const s = ctx.state.mySeat;
    return isSeat(s) && room.game && room.game.turn === s && PLAYING.includes(room.status) &&
      !room.clock.paused && !room.game.pending;
  }

  function lastMoveText(room) {
    const lm = room.game && room.game.lastMove;
    if (!lm) return '';
    const who = esc(playerOf(room, lm.seat));
    if (lm.type === 'pass') return `${who} passed`;
    if (lm.type === 'timeout') return `${who} ran out of time`;
    const words = lm.words.map(w => esc(w.word)).join(', ');
    return `${who} played ${words} (${lm.total})${lm.unverified ? ' · <span class="muted">unverified</span>' : ''}`;
  }

  // Removes the document/window listeners added by buildLive (⋯ menu, board fit).
  function detachLive(ui) {
    if (ui.onDocClick) document.removeEventListener('click', ui.onDocClick);
    if (ui.onResize) window.removeEventListener('resize', ui.onResize);
    if (ui.onKey) document.removeEventListener('keydown', ui.onKey);
    ui.onDocClick = null;
    ui.onResize = null;
    ui.onKey = null;
  }

  function buildLive(el, ctx) {
    detachLive(ctx.state.ui);
    // Phone-first order: score bar, turn pill, one-line caption, board, rack, actions.
    // The board comes first in the markup and the rest sits in .live-panel: on phones the panel is
    // display: contents and CSS order restores the phone column; in the desktop landscape layout
    // (Layout.QUERY) the board is a square on the left and the panel a column on the right.
    // Temporary boxes (#noticeBox, #rejectBox) are fixed bottom sheets so they never push the board.
    el.innerHTML = `
      <div class="card live-card"><div class="arena" id="liveRoot">
        <div id="board-container"></div>
        <div class="live-panel" id="livePanel">
        <div class="scorebar">
          <div class="side" id="sideA"></div>
          <div class="clock" id="matchClock">0:00</div>
          <div class="side right" id="sideB"></div>
        </div>
        <div class="pill-row"><div class="pill pill-them" id="statusLine" role="status" aria-live="polite"><span class="pill-text"></span><span class="pill-clock" id="turnClock"></span></div></div>
        <div class="caption-row"><span class="caption-text"><span id="tossLine"></span><span id="lastMove"></span></span><button type="button" id="bonusBtn" class="caption-btn" aria-expanded="false" aria-controls="bonusCard">? Bonuses</button></div>
        <div class="rack-row"><div class="rack hidden" id="rack"></div><button type="button" id="shuffleBtn" class="rack-shuffle hidden" aria-label="Shuffle tiles" title="Shuffle tiles">🔀</button></div>
        <div class="actions-row hidden" id="actions">
          <button id="playBtn" class="btn-primary">✅ Play word</button>
          <button id="recallBtn" class="secondary">↩ Recall</button>
          <button id="passBtn" class="secondary">⏭ Pass</button>
          <div class="more-wrap">
            <button id="moreBtn" class="secondary" aria-label="More options" aria-haspopup="true" aria-expanded="false">⋯</button>
            <div class="more-menu hidden" id="moreMenu">
              <a href="#" class="more-item">← Back to start</a>
              <button id="resignBtn" class="danger more-item">Leave</button>
            </div>
          </div>
        </div>
        <div id="hostBar"></div>
        <div class="row live-foot" id="liveFoot"><a href="#" class="small-text">← Back to start</a>
          <button class="link small-text hidden" id="stopWatching">Stop watching / take a seat</button></div>
        </div>
        <div id="noticeBox" class="sheet sheet-notice"></div>
        <div id="rejectBox" class="sheet sheet-reject"></div>
        <div class="bonus-backdrop hidden" id="bonusBackdrop"><div class="card bonus-card" id="bonusCard" role="dialog" aria-label="Bonus squares">
          <div class="bonus-head"><b>Bonus squares</b><button type="button" class="bonus-close" aria-label="Close">✕</button></div>
          ${UI.bonusHelpHtml()}</div></div>
      </div></div>`;
    el.querySelector('#stopWatching').onclick = () => ctx.stopWatching();
    const ui = ctx.state.ui;
    Object.assign(ui, { temp: [], selected: null, busy: false, rejected: null, seenMove: -1, tried: {}, pillKind: null, noticeHidden: null, sideHtml: {}, lastSeenMove: null, rackOrder: null });
    const $ = s => el.querySelector(s);

    // ⋯ menu: Leave lives here so it can't be tapped by accident.
    // Element references, not lookups: Leave can swap in the final screen before this click bubbles.
    const menu = $('#moreMenu');
    const moreBtn = $('#moreBtn');
    const setMenu = open => { menu.classList.toggle('hidden', !open); moreBtn.setAttribute('aria-expanded', String(open)); };
    moreBtn.onclick = ev => { ev.stopPropagation(); setMenu(menu.classList.contains('hidden')); };
    menu.onclick = () => setMenu(false);
    ui.onDocClick = ev => { if (!ev.target.closest || !ev.target.closest('.more-wrap')) setMenu(false); };
    document.addEventListener('click', ui.onDocClick);

    // Seated players: shrink the board so the whole game screen fits the visible window.
    ui.onResize = () => fitBoard(el, ctx);
    window.addEventListener('resize', ui.onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitBoard(el, ctx));

    $('#recallBtn').onclick = () => { ui.temp = []; ui.selected = null; ui.rejected = null; update(el, ctx.state.room, ctx); };

    // Shuffle (feature #6): re-orders this device's view of the rack only (nothing is written);
    // each tile slides from where it was to its new place.
    $('#shuffleBtn').onclick = () => {
      const rackEl = $('#rack');
      if (!ui.rackOrder || ui.rackOrder.order.length < 2) return;
      const before = {};
      rackEl.querySelectorAll('.tile').forEach(t => { before[t.dataset.i] = t.getBoundingClientRect().left; });
      ui.rackOrder = { key: ui.rackOrder.key, order: Rack.shuffle(ui.rackOrder.order) };
      update(el, ctx.state.room, ctx);
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      rackEl.querySelectorAll('.tile').forEach(t => {
        const dx = (before[t.dataset.i] ?? 0) - t.getBoundingClientRect().left;
        if (dx && t.animate) t.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    };

    // "? Bonuses" help card (feature #7). update() never touches it, so it stays open while the game moves on.
    const bonus = $('#bonusBackdrop');
    const bonusBtn = $('#bonusBtn');
    const setBonus = open => { bonus.classList.toggle('hidden', !open); bonusBtn.setAttribute('aria-expanded', String(open)); };
    bonusBtn.onclick = () => setBonus(bonus.classList.contains('hidden'));
    bonus.onclick = ev => { if (!ev.target.closest('.bonus-card') || ev.target.closest('.bonus-close')) setBonus(false); };
    ui.onKey = ev => { if (ev.key === 'Escape') setBonus(false); };
    document.addEventListener('keydown', ui.onKey);

    $('#passBtn').onclick = async () => {
      const room = ctx.state.room;
      if (!myTurn(room, ctx) || !confirm('Pass your turn?')) return;
      const seat = ctx.state.mySeat;
      const res = await Store.mutateRoom(ctx.code, r => Match.applyPass(r, seat, { now: Store.serverNow(), expectedMoveCount: room.game.moveCount }));
      if (!res.committed) UI.toast('Could not pass (the game state changed).', 'error');
    };

    $('#resignBtn').onclick = async () => {
      const seat = ctx.state.mySeat;
      if (!isSeat(seat) || !confirm(`Leave the game? Your team (${teamOf(ctx.state.room, seat)}) loses this match.`)) return;
      await Store.mutateRoom(ctx.code, r => Match.resign(r, seat, Store.serverNow()));
    };

    $('#playBtn').onclick = async () => {
      const room = ctx.state.room;
      const seat = ctx.state.mySeat;
      if (!myTurn(room, ctx) || ui.busy) return;
      const placements = ui.temp.map(t => ({ r: t.r, c: t.c, letter: t.letter }));
      const m = Match.prepareMove(room, seat, placements);
      if (!m.ok) return UI.toast(ScrabbleEngine.ERROR_TEXT[m.error] || 'Invalid move.', 'error');
      const expectedMoveCount = room.game.moveCount;
      ui.busy = true; $('#playBtn').textContent = '🔍 Checking…'; update(el, room, ctx);
      try {
        const check = await Dictionary.checkWords(m.words.map(w => w.word));
        if (check.rejected.length) {
          ui.rejected = { placements, words: m.words, rejectedWords: check.rejected, total: m.total, expectedMoveCount };
          return;
        }
        const res = await Store.mutateRoom(ctx.code, r => Match.applyPlay(r, seat, placements, { now: Store.serverNow(), expectedMoveCount, unverified: check.unverified }));
        if (res.committed) { ui.temp = []; ui.selected = null; Sound.play('accept'); }
        else { UI.toast('Move not accepted (time up or the game changed).', 'error'); ui.temp = []; }
      } finally {
        ui.busy = false;
        if ($('#playBtn')) $('#playBtn').textContent = '✅ Play word'; // gone if the play ended the game
        update(el, ctx.state.room, ctx);
      }
    };

    $('#rejectBox').onclick = async ev => {
      const b = ev.target.closest('button');
      if (!b || !ui.rejected) return;
      if (b.dataset.act === 'recall') { ui.rejected = null; ui.temp = []; ui.selected = null; return update(el, ctx.state.room, ctx); }
      if (b.dataset.act === 'appeal') {
        const rej = ui.rejected;
        const seat = ctx.state.mySeat;
        b.disabled = true;
        const res = await Store.mutateRoom(ctx.code, r => Match.requestAppeal(r, seat, rej.placements, {
          now: Store.serverNow(), expectedMoveCount: rej.expectedMoveCount, words: rej.words, rejectedWords: rej.rejectedWords, total: rej.total
        }));
        ui.rejected = null;
        if (res.committed) { ui.temp = []; ui.selected = null; UI.toast('Sent to the host for a decision.', 'ok'); }
        else UI.toast('Could not send the appeal (time up or the game changed).', 'error');
        update(el, ctx.state.room, ctx);
      }
    };

    // Clocks + automatic timeout / time-up writes.
    App.onTick(() => tick(el, ctx));
  }

  function onSquare(el, ctx, r, c) {
    const room = ctx.state.room;
    const ui = ctx.state.ui;
    if (!myTurn(room, ctx) || ui.busy || ui.rejected) return;
    const i = ui.temp.findIndex(t => t.r === r && t.c === c);
    if (i !== -1) { ui.temp.splice(i, 1); return update(el, room, ctx); }
    if (room.game.board[ScrabbleEngine.key(r, c)] || ui.selected === null) return;
    const rack = room.game.racks[ctx.state.mySeat];
    ui.temp.push({ r, c, letter: rack[ui.selected], rackIndex: ui.selected });
    ui.selected = null;
    Sound.play('place');
    update(el, room, ctx);
  }

  function update(el, room, ctx) {
    const ui = ctx.state.ui;
    // Timers and async handlers can fire after the view switched to the final screen.
    if (!el.querySelector('#liveRoot') || !room || !room.game || !PLAYING.concat('hostDecision').includes(room.status)) return;
    const $ = s => el.querySelector(s);
    const g = room.game;
    const seat = ctx.state.mySeat;

    // A new move happened (or my rack changed): clear any half-built placement.
    if (g.moveCount !== ui.seenMove) {
      if (ui.seenMove !== -1) { ui.temp = []; ui.selected = null; ui.rejected = null; }
      ui.seenMove = g.moveCount;
    }

    for (const s of SEATS) {
      const side = $('#side' + s);
      side.classList.toggle('turn', g.turn === s && PLAYING.includes(room.status));
      const html = `<span class="chip chip-${s.toLowerCase()} team">${esc(teamOf(room, s))}</span>
        <div class="who"><span class="player">${esc(playerOf(room, s))}${seat === s ? ' (you)' : ''}</span><span class="score disp">${g.scores[s]}</span></div>`;
      // Rewrite only on change: a celebration holds the old score in this element until its points land.
      if (ui.sideHtml[s] !== html) { side.innerHTML = html; ui.sideHtml[s] = html; }
    }

    const mine = myTurn(room, ctx);
    UI.renderBoard($('#board-container'), g.board, {
      temp: mine ? ui.temp : [],
      pending: g.pending ? g.pending.placements : null,
      onSquare: (r, c) => onSquare(el, ctx, r, c)
    });

    const rackEl = $('#rack');
    const shuffleBtn = $('#shuffleBtn');
    rackEl.classList.toggle('hidden', !isSeat(seat));
    shuffleBtn.classList.toggle('hidden', !isSeat(seat));
    if (isSeat(seat)) {
      // This device's tile order (Shuffle); back to normal when the rack's letters change.
      ui.rackOrder = Rack.sync(ui.rackOrder, g.racks[seat]);
      const used = mine ? ui.temp.map(t => t.rackIndex) : [];
      UI.renderRack(rackEl, g.racks[seat], {
        selectedIndex: ui.selected,
        usedIndices: used,
        order: ui.rackOrder.order,
        onTile: i => { if (!myTurn(ctx.state.room, ctx) || ui.busy) return; ui.selected = ui.selected === i ? null : i; update(el, ctx.state.room, ctx); }
      });
      shuffleBtn.disabled = g.racks[seat].length - used.length < 2;
    }

    $('#actions').classList.toggle('hidden', !isSeat(seat));
    for (const id of ['#playBtn', '#recallBtn', '#passBtn']) $(id).disabled = !mine || ui.busy || !!ui.rejected;
    $('#resignBtn').disabled = !isSeat(seat) || !['live', 'suddenDeath', 'hostDecision'].includes(room.status);

    // Bottom sheet (empty = hidden): the recall / ask-host choice, or my appeal waiting for the host.
    let sheet = ui.rejected ? `<div class="sheet-msg">❌ <b>${ui.rejected.rejectedWords.map(esc).join(', ')}</b> not found in the dictionary.</div>
        <div class="sheet-actions"><button class="secondary" data-act="recall">↩ Recall</button><button class="btn-primary" data-act="appeal">⚖️ Ask host</button></div>` : '';
    if (isSeat(seat) && g.pending && g.pending.seat === seat) {
      sheet = '<div class="sheet-msg">⚖️ Waiting for the host to approve your word…</div>';
    }
    $('#rejectBox').innerHTML = sheet;

    $('#lastMove').innerHTML = lastMoveText(room);
    $('#stopWatching').classList.toggle('hidden', seat !== 'watch');
    // Seated players reach "Back to start" through the ⋯ menu, so nothing sits below the actions.
    $('#liveFoot').classList.toggle('hidden', isSeat(seat));
    $('#liveRoot').classList.toggle('seated', isSeat(seat));
    if (RoomLive.updateHost) RoomLive.updateHost(el, room, ctx);
    tick(el, ctx);
    fitBoard(el, ctx);
  }

  // Seated players see the whole game screen without scrolling: if the action row would end
  // below the visible window, shrink the (square) board by the overflow. Others keep the full
  // board and may scroll (the host bar sits below the actions).
  const BOARD_MIN_PX = 220;
  function fitBoard(el, ctx) {
    const board = el.querySelector('#board-container');
    const actions = el.querySelector('#actions');
    const live = el.querySelector('#liveRoot');
    if (!board || !actions || !live) return;
    board.style.width = '';
    // Desktop landscape (feature #9): for every viewer the board is the largest square that fits
    // below its own top edge and left of the panel; letters scale with it (--cell), and the panel
    // is capped at the board's height (--board-px) so it scrolls by itself instead of the page.
    if (root.Layout && Layout.landscapeNow()) {
      const px = Layout.boardPx({ vh: window.innerHeight, top: board.getBoundingClientRect().top, width: live.clientWidth });
      board.style.width = px + 'px';
      board.style.setProperty('--cell', (px / 15) + 'px');
      live.style.setProperty('--board-px', px + 'px');
      return;
    }
    board.style.removeProperty('--cell');
    live.style.removeProperty('--board-px');
    if (!isSeat(ctx.state.mySeat)) return;
    const gap = 8; // breathing room under the action row
    const over = actions.getBoundingClientRect().bottom + gap - window.innerHeight;
    if (over > 0) board.style.width = Math.max(BOARD_MIN_PX, Math.floor(board.getBoundingClientRect().width - over)) + 'px';
  }

  // Turn pill (#statusLine) with the turn clock (#turnClock) inside it.
  function renderPill(el, room, ctx) {
    const pill = el.querySelector('#statusLine');
    if (!pill) return;
    const p = Pill.state(room, ctx.state.mySeat, Store.serverNow());
    const ui = ctx.state.ui;
    const kind = p ? p.kind : 'none';
    if (kind !== ui.pillKind) {
      pill.className = 'pill pill-' + kind;
      // Pop once when it becomes this player's turn.
      if (kind === 'you' && ui.pillKind !== null) {
        void pill.offsetWidth; pill.classList.add('pill-pop');
        Sound.play('turn'); Sound.buzz();
      }
      ui.pillKind = kind;
    }
    const text = p ? p.text : '';
    const txtEl = pill.querySelector('.pill-text');
    if (txtEl.textContent !== text) txtEl.textContent = text;
    const clock = p && p.ms !== null ? UI.formatClock(p.ms) : '';
    const clockEl = pill.querySelector('#turnClock');
    if (clockEl.textContent !== clock) clockEl.textContent = clock;
  }

  function tick(el, ctx) {
    const room = ctx.state.room;
    if (!room || !room.clock || !el.querySelector('#liveRoot')) return;
    const now = Store.serverNow();
    const c = room.clock;
    const phase = Match.roomPhase(room);
    const matchMs = c.paused ? c.paused.matchRemainingMs : c.endsAt - now;
    const mc = el.querySelector('#matchClock');
    if (room.status === 'suddenDeath') mc.textContent = 'SD';
    else if (room.status === 'hostDecision') mc.textContent = '—';
    else mc.textContent = UI.formatClock(matchMs);
    mc.classList.toggle('low', room.status === 'live' && matchMs <= 60000);
    renderPill(el, room, ctx);

    // Only seated players and the host write automatic transitions; spectators never write.
    const writer = isSeat(ctx.state.mySeat) || App.isHost();
    if (!writer || !PLAYING.includes(room.status) || c.paused || (room.game && room.game.pending)) return;
    const tried = ctx.state.ui.tried;
    if (room.status === 'live' && now >= c.endsAt) {
      if (Retry.due(tried, 'end:' + c.endsAt)) Store.mutateRoom(ctx.code, r => Match.resolveTimeUp(r, Store.serverNow()));
      return;
    }
    if (now >= c.turnStartedAt + Match.TURN_MS) {
      const key = 'turn:' + c.turnStartedAt + ':' + room.game.moveCount;
      if (Retry.due(tried, key)) {
        const expectedMoveCount = room.game.moveCount, expectedTurnStartedAt = c.turnStartedAt, seat = room.game.turn;
        Store.mutateRoom(ctx.code, r => Match.applyPass(r, seat, { now: Store.serverNow(), expectedMoveCount, timeout: true, expectedTurnStartedAt }));
      }
    }
  }

  // Word celebration when moveCount goes up with a play. The first live render (page load,
  // refresh, joining mid-game) only sets the baseline, so nothing ever replays.
  function celebrateNewMove(el, room, ctx) {
    const ui = ctx.state.ui;
    if (!room.game) return;
    const c = Celebrate.detect(ui.lastSeenMove, room);
    if (c) {
      const seat = c.seat;
      Celebrate.show(c, {
        container: el.querySelector('#liveRoot'),
        scoreEl: el.querySelector('#side' + seat + ' .score'),
        areaEl: el.querySelector('#board-container'),
        mine: seat === ctx.state.mySeat
      });
    }
    ui.lastSeenMove = room.game.moveCount;
  }

  // VS intro + coin toss. The first live render (page load, refresh, or the waiting -> live
  // transition) plays it for whatever is left before clock.startedAt (nothing once it passed).
  // The scene owns #tossLine ("🪙 Coin toss: <TEAM> goes first") until the clocks start.
  // A host pause during the intro freezes the scene; the resume shifts startedAt, so the scene
  // is re-mounted at the matching point for the new schedule. ui.introKey names the schedule the
  // mounted scene follows (null = no intro mounted on this view).
  function syncIntro(el, room, ctx, fresh) {
    const ui = ctx.state.ui;
    const c = room.clock;
    if (fresh) ui.introKey = null;
    if (!c || !room.game) return;
    const frozen = c.paused && c.paused.introRemainingMs > 0 ? c.paused.introRemainingMs : 0;
    const key = frozen ? 'paused:' + frozen : 'at:' + c.startedAt;
    if (!fresh && (ui.introKey === null || ui.introKey === key || Scenes.introSkipped())) return;
    const now = Store.serverNow();
    // While paused, play as if the clocks start after the frozen intro time, then hold it there.
    const sched = frozen ? Object.assign({}, room, { clock: Object.assign({}, c, { startedAt: now + frozen }) }) : room;
    const played = Scenes.playIntro(el.querySelector('#liveRoot'), sched, now, { areaEl: el.querySelector('#board-container') });
    if (played && frozen) Scenes.holdIntro();
    ui.introKey = played ? key : null;
  }

  const RoomLive = {
    renderLive(el, room, ctx) {
      document.body.classList.add('in-game'); // collapsed header during a live game
      const fresh = !el.querySelector('#liveRoot');
      if (fresh) buildLive(el, ctx);
      update(el, room, ctx);
      syncIntro(el, room, ctx, fresh);
      celebrateNewMove(el, room, ctx);
    },

    // Result screen (Scenes.renderResult): winner / other player / neutral (spectators, host) / void.
    // Rebuilt only when the result itself changes (presence updates keep the scene as it is), so the
    // entrance plays once. A play that ended the game (bag out, last sudden-death move) never got its
    // word celebration on the live screen: it plays here over the result, whose entrance waits for it.
    renderFinal(el, room, ctx) {
      document.body.classList.add('in-game'); // collapsed header, so the result scene fills a phone like the mockup
      const ui = ctx.state.ui;
      const viewer = Scenes.resultViewer(room, ctx.state.mySeat);
      const res = room.result;
      const key = [room.status, viewer, App.isHost() ? 'host' : '',
        res ? [res.winner, res.scoreA, res.scoreB, res.reason, res.decidedAt, res.note || ''].join('/') : '',
        room.voidedAt || '', room.voidNote || ''].join('|');
      if (ui.finalKey === key && el.querySelector('.res-final')) {
        RoomLive.updateFinalHost(el, room, ctx);
        return;
      }
      ui.finalKey = key;
      Celebrate.clear();
      Scenes.clearIntro();
      detachLive(ui);
      const ending = Scenes.endingCelebration(ui.lastSeenMove, room);
      if (room.game) ui.lastSeenMove = room.game.moveCount; // nothing replays on a later rebuild
      const delayMs = ending ? (Match.CELEBRATE_MS[ending.tier] || 0) : 0;
      Scenes.renderResult(el, room, viewer, { animate: Scenes.resultFresh(room, Store.serverNow()), delayMs });
      if (room.game) UI.renderBoard(el.querySelector('#board-container'), room.game.board, {});
      if (!ui.standings) ui.standings = UI.mountStandings(() => el.querySelector('#finalStandings'));
      else ui.standings.render();
      el.querySelector('#backBtn').onclick = () => App.go('');
      RoomLive.updateFinalHost(el, room, ctx);
      if (ending) Celebrate.show(ending, { container: el, scoreEl: null, mine: ending.seat === ctx.state.mySeat });
    },

    // Host control bar + notices shown to everyone (disconnects).
    updateHost(el, room, ctx) {
      const g = room.game;
      const phase = Match.roomPhase(room);
      const inPlay = ['live', 'suddenDeath', 'hostDecision'].includes(room.status);

      // Disconnect notice: a bottom sheet that can be hidden (✕) until the set of offline players changes.
      const offline = SEATS.filter(s => room.seats[s] && !Match.isSeatOnline(room, s));
      const ui = ctx.state.ui;
      const noticeKey = offline.map(s => s + ':' + room.seats[s].clientId).join('|');
      if (!offline.length) ui.noticeHidden = null; // a new disconnect shows again
      const notice = el.querySelector('#noticeBox');
      notice.innerHTML = inPlay && offline.length && ui.noticeHidden !== noticeKey
        ? `<div class="sheet-row"><div class="sheet-msg">📴 ${offline.map(s => esc(room.seats[s].name)).join(' and ')} disconnected${App.isHost() ? ' · Pause to wait, or Award win' : ''}</div>
            <button class="btn-ghost sheet-close" data-act="hideNotice" aria-label="Hide this notice">✕</button></div>`
        : '';
      notice.onclick = ev => {
        if (!ev.target.closest('[data-act=hideNotice]')) return;
        ui.noticeHidden = noticeKey;
        notice.innerHTML = '';
      };

      const bar = el.querySelector('#hostBar');
      if (!App.isHost()) { bar.innerHTML = ''; return; }
      const warnings = SEATS
        .filter(s => room.seats[s] && room.fairPlay[s].screenLeaves > 0)
        .map(s => `<div class="warn-line">⚠️ ${esc(room.seats[s].name)} left the screen ${room.fairPlay[s].screenLeaves}×</div>`).join('');
      let decision = '';
      if (phase === 'appeal') {
        const p = g.pending;
        decision = `<div class="warn-line stack">
          <div>⚖️ <b>${esc(playerOf(room, p.seat))}</b> played ${p.words.map(w => `${esc(w.word)} (${w.score})`).join(', ')}: <b>${p.total} pts</b>.
          Not found: ${p.rejectedWords.map(esc).join(', ')}</div>
          <div class="row"><button class="small" data-host="approve">✅ Approve</button><button class="small danger" data-host="deny">✖ Deny</button></div>
        </div>`;
      } else if (phase === 'hostDecision') {
        decision = `<div class="warn-line stack"><div>Still tied after 3 sudden-death rounds. Award the win:</div>
          <div class="row">${SEATS.map(s => `<button class="small" data-host="award" data-seat="${s}">🏆 ${esc(teamOf(room, s))}</button>`).join('')}</div></div>`;
      }
      const canPause = PLAYING.includes(room.status) && !room.clock.paused;
      const pinned = ctx.state.pinned === ctx.code;
      bar.innerHTML = `<div class="hostbar">
        <h4>⚙ Host controls</h4>
        ${warnings}${decision}
        <div class="row">
          ${phase === 'paused' ? '<button class="small" data-host="resume">▶ Resume</button>' : `<button class="small secondary" data-host="pause" ${canPause ? '' : 'disabled'}>⏸ Pause</button>`}
          ${SEATS.map(s => `<button class="small secondary" data-host="award" data-seat="${s}">Award win → ${esc(teamOf(room, s))}</button>`).join('')}
          <button class="small secondary" data-host="pin">${pinned ? 'Unpin' : '📌 Pin to big screen'}</button>
          <button class="small danger" data-host="void">Void</button>
        </div>
        <div class="row small-text">
          <span class="muted">Player switching devices?</span>
          ${SEATS.filter(s => room.seats[s]).map(s => `<button class="small secondary" data-host="remove" data-seat="${s}">Free ${esc(room.seats[s].name)}'s seat</button>`).join('')}
        </div>
      </div>`;
      bar.onclick = async ev => {
        const b = ev.target.closest('button[data-host]');
        if (!b || b.disabled) return;
        const act = b.dataset.host;
        if (act === 'pin') {
          b.disabled = true;
          try {
            await Store.setPinned(ctx.state.pinned === ctx.code ? null : ctx.code);
          } catch (e) {
            UI.toast('Could not update the big-screen pin.', 'error');
          } finally {
            b.disabled = false;
          }
          return;
        }
        const now = () => Store.serverNow();
        let fn = null;
        if (act === 'pause') fn = r => Match.pauseClocks(r, now(), 'host');
        else if (act === 'resume') fn = r => Match.resumeClocks(r, now());
        else if (act === 'approve') fn = r => Match.resolveAppeal(r, true, { now: now() });
        else if (act === 'deny') fn = r => Match.resolveAppeal(r, false, { now: now() });
        else if (act === 'award') {
          const seat = b.dataset.seat;
          if (!confirm(`Award the win to ${teamOf(ctx.state.room, seat)}?`)) return;
          fn = r => Match.awardWin(r, seat, now());
        } else if (act === 'void') {
          const note = prompt('Reason for voiding (kept in the record):', '');
          if (note === null || !confirm('Void this room? It will count for no one.')) return;
          fn = r => Match.voidRoom(r, now(), note);
        } else if (act === 'remove') {
          const seat = b.dataset.seat;
          const s = ctx.state.room.seats[seat];
          if (!s || !confirm(`Free ${s.name}'s seat? They (or their new device) can take it again with the room code. Their tiles and score stay.`)) return;
          fn = r => Match.removePlayer(r, seat);
        }
        if (!fn) return;
        b.disabled = true;
        const res = await Store.mutateRoom(ctx.code, fn);
        if (!res.committed) UI.toast('That action is no longer possible (the room changed).', 'error');
      };
    },

    // Host-only: correct or void a final result.
    updateFinalHost(el, room, ctx) {
      const box = el.querySelector('#finalHost');
      if (!box || !App.isHost() || room.status !== 'final' || !room.result) return;
      const otherSeat = room.result.winner === 'A' ? 'B' : 'A';
      box.innerHTML = `<div class="hostbar"><h4>⚙ Host</h4><div class="row">
        <button class="small secondary" id="correctBtn">Give the win to ${esc(teamOf(room, otherSeat))}</button>
        <button class="small danger" id="voidFinalBtn">Void</button></div></div>`;
      box.querySelector('#correctBtn').onclick = async () => {
        const note = prompt('Reason for the correction (kept in the record):', '');
        if (note === null || !confirm(`Give the win to ${teamOf(room, otherSeat)} instead?`)) return;
        await Store.mutateRoom(ctx.code, r => Match.correctResult(r, Store.serverNow(), note));
      };
      box.querySelector('#voidFinalBtn').onclick = async () => {
        const note = prompt('Reason for voiding (kept in the record):', '');
        if (note === null || !confirm('Void this result? It will count for no one.')) return;
        await Store.mutateRoom(ctx.code, r => Match.voidRoom(r, Store.serverNow(), note));
      };
    },

    teardown(ctx) {
      Celebrate.clear();
      document.body.classList.remove('in-game');
      detachLive(ctx.state.ui);
      Scenes.clearIntro();
      Scenes.clearResult();
      if (ctx.state.ui.standings) ctx.state.ui.standings.off();
    }
  };
  root.RoomLive = RoomLive;

  root.RoomView = { showJoin, show };
})(window);
