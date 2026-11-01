// Join page and room view (lobby, live game, final) for players, spectators and the host.
(function (root) {
  'use strict';

  const esc = s => UI.escapeHtml(s);
  const seatKey = code => 'scrabble.seat.' + code;
  const SEATS = ['A', 'B'];

  // ---------- join page ----------

  function showJoin(el) {
    el.innerHTML = `
      <div class="panel narrow">
        <h2>🔤 Join a room</h2>
        <p class="muted small-text">Enter the room code from your host and your name.</p>
        <form id="joinForm" class="stack">
          <div><label for="joinCode">Room code</label><input id="joinCode" placeholder="e.g. K7Q-42M" autocomplete="off" autocapitalize="characters"></div>
          <div><label for="joinName">Your name</label><input id="joinName" maxlength="40" autocomplete="name" placeholder="Your name"></div>
          <button type="submit">Find room</button>
        </form>
      </div>
      <div class="panel narrow">
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
      prevStatus: null,
      tossUntil: 0,
      ui: {} // live-view working state (Task 10)
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
      if (room && state.prevStatus === 'waiting' && room.status === 'live') state.tossUntil = Date.now() + 3000;
      if (room && first && room.status === 'live' && room.game && room.game.moveCount === 0 &&
          Store.serverNow() - room.clock.startedAt < 3000) state.tossUntil = Date.now() + 3000;
      state.prevStatus = room ? room.status : null;
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
      if (room === null) {
        el.innerHTML = `<div class="panel narrow"><h2>Room not found</h2>
          <p class="muted">No room with code <span class="code">${esc(Match.formatCode(code))}</span>. Check the code with your host.</p>
          <a href="#">← Back to start</a></div>`;
        return;
      }
      if (!room) { el.innerHTML = '<div class="panel narrow"><p class="muted">Loading room…</p></div>'; return; }

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
        <div class="panel narrow stack">
          <div class="versus">${esc(room.teamAName)} <span class="muted">vs</span> ${esc(room.teamBName)}</div>
          <div class="center muted small-text">Room <span class="code">${esc(Match.formatCode(code))}</span>${room.label ? ' · ' + esc(room.label) : ''}</div>
          <div><label for="choiceName">Your name</label><input id="choiceName" maxlength="40" placeholder="Your name"></div>
          ${!inPlay ? btn('A') + btn('B')
            : (anyFree ? '<p class="muted small-text center">This match is in progress. If you are a player switching devices, take your seat:</p>' +
                SEATS.filter(s => !room.seats[s]).map(btn).join('')
              : '<p class="muted small-text center">This match has already started. You can watch it. (Switching devices? Ask the host to free your seat.)</p>')}
          <button class="secondary" data-watch="1">👁️ Just watch</button>
          <a href="#" class="small-text">← Back to start</a>
        </div>`;
      const nameInput = el.querySelector('#choiceName');
      nameInput.value = Store.local.get('scrabble.name') || '';
      el.querySelector('.panel').onclick = async ev => {
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
        const team = esc(nameOf(room, seat));
        if (!s) return `<div class="seat empty"><span>${team}</span><span class="small-text">Waiting for player…</span></div>`;
        const online = Match.isSeatOnline(room, seat);
        return `<div class="seat ${s.ready ? 'ready' : ''}" data-seat-row="${seat}">
          <span><span class="dot ${online ? 'on' : ''}"></span>${team} · <b>${esc(s.name)}</b>${state.mySeat === seat ? ' (you)' : ''}</span>
          <span class="row">
            <span class="badge ${s.ready ? 'live' : ''}">${s.ready ? 'Ready' : 'Not ready'}</span>
            ${host ? `<button class="secondary small" data-remove="${seat}">Remove</button>` : ''}
          </span></div>`;
      };
      const mine = (state.mySeat === 'A' || state.mySeat === 'B') ? room.seats[state.mySeat] : null;
      const bothReady = SEATS.every(s => room.seats[s] && room.seats[s].ready);
      el.innerHTML = `
        <div class="panel narrow stack">
          <div class="versus">${esc(room.teamAName)} <span class="muted">vs</span> ${esc(room.teamBName)}</div>
          <div class="center muted small-text">Room <span class="code">${esc(Match.formatCode(code))}</span> · ${Math.round(room.matchLengthSec / 60)} min${room.label ? ' · ' + esc(room.label) : ''}</div>
          ${seatRow('A')}${seatRow('B')}
          <div class="seat"><span><span class="dot ${hostOnline ? 'on' : ''}"></span>⚙ Host</span><span class="small-text muted" id="watchCount">👁️ ${Match.watcherCount(room)} watching</span></div>
          ${mine ? `<button id="readyBtn" class="${mine.ready ? 'secondary' : ''}">${mine.ready ? 'Not ready' : "I'm ready"}</button>` : ''}
          ${host ? `<button id="startBtn" ${bothReady ? '' : 'disabled'}>▶ Start match</button>
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
        const res = await Store.mutateRoom(code, r => Match.startMatch(r, Store.serverNow(), Math.random));
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
    return () => {
      unsubTeams();
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
  const REASON_LINE = {
    time: "Time's up", suddenDeath: 'Won in sudden death', bagOut: 'Tiles ran out',
    resign: 'Opponent resigned', awarded: 'Awarded by the host', walkover: 'Walkover', corrected: 'Result corrected by the host'
  };

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

  function buildLive(el, ctx) {
    el.innerHTML = `
      <div class="panel"><div class="arena" id="liveRoot">
        <div class="status-line" id="tossLine"></div>
        <div class="scorebar">
          <div class="side" id="sideA"></div>
          <div><div class="clock" id="matchClock">0:00</div><div class="turnclock" id="turnClock"></div></div>
          <div class="side right" id="sideB"></div>
        </div>
        <div class="status-line" id="statusLine"></div>
        <div id="noticeBox" style="width:100%;max-width:520px;"></div>
        <div id="hostBar" style="width:100%;max-width:520px;"></div>
        <div id="board-container"></div>
        <div class="rack hidden" id="rack"></div>
        <div id="rejectBox" style="width:100%;max-width:520px;"></div>
        <div class="actions-row hidden" id="actions">
          <button id="playBtn">✅ Play</button>
          <button id="recallBtn" class="secondary">↩ Recall</button>
          <button id="passBtn" class="secondary">⏭ Pass</button>
          <button id="resignBtn" class="danger">Resign</button>
        </div>
        <div class="status-line" id="lastMove"></div>
        <div class="row"><a href="#" class="small-text">← Back to start</a>
          <button class="link small-text hidden" id="stopWatching">Stop watching / take a seat</button></div>
      </div></div>`;
    el.querySelector('#stopWatching').onclick = () => ctx.stopWatching();
    const ui = ctx.state.ui;
    Object.assign(ui, { temp: [], selected: null, busy: false, rejected: null, seenMove: -1, tried: {} });
    const $ = s => el.querySelector(s);

    $('#recallBtn').onclick = () => { ui.temp = []; ui.selected = null; ui.rejected = null; update(el, ctx.state.room, ctx); };

    $('#passBtn').onclick = async () => {
      const room = ctx.state.room;
      if (!myTurn(room, ctx) || !confirm('Pass your turn?')) return;
      const seat = ctx.state.mySeat;
      const res = await Store.mutateRoom(ctx.code, r => Match.applyPass(r, seat, { now: Store.serverNow(), expectedMoveCount: room.game.moveCount }));
      if (!res.committed) UI.toast('Could not pass (the game state changed).', 'error');
    };

    $('#resignBtn').onclick = async () => {
      const seat = ctx.state.mySeat;
      if (!isSeat(seat) || !confirm('Resign this match? The other team gets the win.')) return;
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
        if (res.committed) { ui.temp = []; ui.selected = null; }
        else { UI.toast('Move not accepted (time up or the game changed).', 'error'); ui.temp = []; }
      } finally {
        ui.busy = false; $('#playBtn').textContent = '✅ Play';
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
    update(el, room, ctx);
  }

  function update(el, room, ctx) {
    const ui = ctx.state.ui;
    // Timers and async handlers can fire after the view switched to the final screen.
    if (!el.querySelector('#liveRoot') || !room || !room.game || !PLAYING.concat('hostDecision').includes(room.status)) return;
    const $ = s => el.querySelector(s);
    const g = room.game;
    const seat = ctx.state.mySeat;
    const phase = Match.roomPhase(room);

    // A new move happened (or my rack changed): clear any half-built placement.
    if (g.moveCount !== ui.seenMove) {
      if (ui.seenMove !== -1) { ui.temp = []; ui.selected = null; ui.rejected = null; }
      ui.seenMove = g.moveCount;
    }

    const toss = Date.now() < ctx.state.tossUntil;
    $('#tossLine').innerHTML = toss ? `🪙 Coin toss: <b>${esc(teamOf(room, g.firstSeat))}</b> goes first` : '';
    if (toss && !ui.tossTimer) ui.tossTimer = setTimeout(() => { ui.tossTimer = null; update(el, ctx.state.room, ctx); }, ctx.state.tossUntil - Date.now() + 50);

    for (const s of SEATS) {
      const side = $('#side' + s);
      side.classList.toggle('turn', g.turn === s && PLAYING.includes(room.status));
      side.innerHTML = `<div class="team">${esc(teamOf(room, s))}</div>
        <div class="player">${esc(playerOf(room, s))}${seat === s ? ' (you)' : ''}</div>
        <div class="score">${g.scores[s]}</div>`;
    }

    let status = '';
    if (phase === 'paused') status = '⏸ Paused by the host';
    else if (phase === 'appeal') status = `⚖️ Waiting for the host to decide on ${esc(playerOf(room, g.pending.seat))}'s word…`;
    else if (phase === 'hostDecision') status = 'Still tied after 3 sudden-death rounds. Waiting for host decision.';
    else {
      const turnTxt = myTurn(room, ctx) ? '<b>Your turn</b>' : `${esc(playerOf(room, g.turn))}'s turn`;
      status = phase === 'suddenDeath' ? `⚡ Sudden death: round ${g.suddenDeath.rounds + 1} of ${Match.SUDDEN_DEATH_MAX_ROUNDS} · ${turnTxt}` : turnTxt;
    }
    $('#statusLine').innerHTML = status;

    const mine = myTurn(room, ctx);
    UI.renderBoard($('#board-container'), g.board, {
      temp: mine ? ui.temp : [],
      pending: g.pending ? g.pending.placements : null,
      onSquare: (r, c) => onSquare(el, ctx, r, c)
    });

    const rackEl = $('#rack');
    rackEl.classList.toggle('hidden', !isSeat(seat));
    if (isSeat(seat)) {
      UI.renderRack(rackEl, g.racks[seat], {
        selectedIndex: ui.selected,
        usedIndices: mine ? ui.temp.map(t => t.rackIndex) : [],
        onTile: i => { if (!myTurn(ctx.state.room, ctx) || ui.busy) return; ui.selected = ui.selected === i ? null : i; update(el, ctx.state.room, ctx); }
      });
    }

    $('#actions').classList.toggle('hidden', !isSeat(seat));
    for (const id of ['#playBtn', '#recallBtn', '#passBtn']) $(id).disabled = !mine || ui.busy || !!ui.rejected;
    $('#resignBtn').disabled = !isSeat(seat) || !['live', 'suddenDeath', 'hostDecision'].includes(room.status);

    $('#rejectBox').innerHTML = ui.rejected ? `<div class="warn-line stack">
        <div>❌ ${ui.rejected.rejectedWords.map(esc).join(', ')} not found in the dictionary.</div>
        <div class="row"><button class="secondary small" data-act="recall">↩ Recall</button><button class="small" data-act="appeal">⚖️ Ask host</button></div>
      </div>` : '';

    if (isSeat(seat) && g.pending && g.pending.seat === seat) {
      $('#rejectBox').innerHTML = '<div class="warn-line">⚖️ Waiting for the host to approve your word…</div>';
    }

    $('#lastMove').innerHTML = lastMoveText(room);
    $('#stopWatching').classList.toggle('hidden', seat !== 'watch');
    if (RoomLive.updateHost) RoomLive.updateHost(el, room, ctx);
    tick(el, ctx);
  }

  function tick(el, ctx) {
    const room = ctx.state.room;
    if (!room || !room.clock || !el.querySelector('#liveRoot')) return;
    const now = Store.serverNow();
    const c = room.clock;
    const phase = Match.roomPhase(room);
    const matchMs = c.paused ? c.paused.matchRemainingMs : c.endsAt - now;
    const turnMs = c.paused ? c.paused.turnRemainingMs : Match.TURN_MS - (now - c.turnStartedAt);
    const mc = el.querySelector('#matchClock');
    if (room.status === 'suddenDeath') mc.textContent = 'SD';
    else if (room.status === 'hostDecision') mc.textContent = '—';
    else mc.textContent = UI.formatClock(matchMs);
    mc.classList.toggle('low', room.status === 'live' && matchMs <= 60000);
    el.querySelector('#turnClock').textContent = PLAYING.includes(room.status) ? `turn ${UI.formatClock(turnMs)}` : '';

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

  const RoomLive = {
    renderLive(el, room, ctx) {
      if (!el.querySelector('#liveRoot')) buildLive(el, ctx);
      update(el, room, ctx);
    },

    renderFinal(el, room, ctx) {
      if (ctx.state.ui.tossTimer) { clearTimeout(ctx.state.ui.tossTimer); ctx.state.ui.tossTimer = null; }
      let body;
      if (room.status === 'void' || !room.result) {
        body = '<div class="final-banner"><div class="win" style="color:var(--text-muted)">This room was voided</div><p class="muted">It does not count for either team.' +
          (room.voidNote ? `<br>Reason: ${esc(room.voidNote)}` : '') + '</p></div>';
      } else {
        const res = room.result;
        const winTeam = teamOf(room, res.winner);
        let reason = REASON_LINE[res.reason] || '';
        if (res.reason === 'resign') reason = `${playerOf(room, res.winner === 'A' ? 'B' : 'A')} resigned`;
        body = `<div class="final-banner stack">
          <div class="win">🏆 ${esc(winTeam)} wins</div>
          <div>${esc(playerOf(room, 'A'))} <b>${res.scoreA}</b> – <b>${res.scoreB}</b> ${esc(playerOf(room, 'B'))}</div>
          <div><span class="badge live">+1 ${esc(winTeam)}</span></div>
          <div class="muted small-text">${esc(reason)}${res.note ? ': ' + esc(res.note) : ''}</div>
        </div>`;
      }
      el.innerHTML = `<div class="panel narrow stack">
        <div class="versus">${esc(room.teamAName)} <span class="muted">vs</span> ${esc(room.teamBName)}</div>
        ${body}
        <div id="finalHost"></div>
        ${room.game ? '<div id="board-container"></div>' : ''}
        <h3 style="margin-bottom:0;">🏆 Team standings</h3>
        <div id="finalStandings"></div>
        <button class="secondary" id="backBtn">← Back to start</button>
      </div>`;
      if (room.game) UI.renderBoard(el.querySelector('#board-container'), room.game.board, {});
      const ui = ctx.state.ui;
      if (!ui.standings) ui.standings = UI.mountStandings(() => el.querySelector('#finalStandings'));
      else ui.standings.render();
      el.querySelector('#backBtn').onclick = () => App.go('');
      if (RoomLive.updateFinalHost) RoomLive.updateFinalHost(el, room, ctx);
    },

    // Host control bar + notices shown to everyone (disconnects).
    updateHost(el, room, ctx) {
      const g = room.game;
      const phase = Match.roomPhase(room);
      const inPlay = ['live', 'suddenDeath', 'hostDecision'].includes(room.status);

      const offline = SEATS.filter(s => room.seats[s] && !Match.isSeatOnline(room, s));
      el.querySelector('#noticeBox').innerHTML = inPlay && offline.length
        ? `<div class="warn-line">📴 ${offline.map(s => esc(room.seats[s].name)).join(' and ')} disconnected${App.isHost() ? ' · Pause to wait, or Award win' : ''}</div>`
        : '';

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
      bar.innerHTML = `<div class="hostbar">
        <h4>⚙ Host controls</h4>
        ${warnings}${decision}
        <div class="row">
          ${phase === 'paused' ? '<button class="small" data-host="resume">▶ Resume</button>' : `<button class="small secondary" data-host="pause" ${canPause ? '' : 'disabled'}>⏸ Pause</button>`}
          ${SEATS.map(s => `<button class="small secondary" data-host="award" data-seat="${s}">Award win → ${esc(teamOf(room, s))}</button>`).join('')}
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
      if (ctx.state.ui.tossTimer) clearTimeout(ctx.state.ui.tossTimer);
      if (ctx.state.ui.standings) ctx.state.ui.standings.off();
    }
  };
  root.RoomLive = RoomLive;

  root.RoomView = { showJoin, show };
})(window);
