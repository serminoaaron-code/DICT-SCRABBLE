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
      </div>`;
    el.querySelector('#joinName').value = Store.local.get('scrabble.name') || '';
    el.querySelector('#joinForm').onsubmit = ev => {
      ev.preventDefault();
      const code = Match.normalizeCode(el.querySelector('#joinCode').value);
      const name = el.querySelector('#joinName').value.trim().slice(0, 40);
      if (code.length !== 6) return UI.toast('Room codes have 6 characters, like K7Q-42M.', 'error');
      if (name) Store.local.set('scrabble.name', name);
      App.go('room=' + code);
    };
    return null;
  }

  // ---------- room view ----------

  function show(el, code) {
    const me = Store.clientId();
    const state = {
      code,
      room: undefined,
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
        const existing = room.seats[s];
        const name = (existing && existing.name) || Store.local.get('scrabble.name') || 'Player';
        if (!(await claim(s, name))) forgetSeat('Your seat is no longer available.');
      } else if (s === 'watch') {
        setRole('watch');
      } else if (App.isHost()) {
        setRole('host');
      }
    }

    function onRoom(room) {
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

    function renderChoices(room) {
      const btn = seat => {
        const s = room.seats[seat];
        const team = nameOf(room, seat);
        return s
          ? `<button disabled>${esc(team)}: taken by ${esc(s.name)}</button>`
          : `<button data-claim="${seat}">Play for ${esc(team)}</button>`;
      };
      el.innerHTML = `
        <div class="panel narrow stack">
          <div class="versus">${esc(room.teamAName)} <span class="muted">vs</span> ${esc(room.teamBName)}</div>
          <div class="center muted small-text">Room <span class="code">${esc(Match.formatCode(code))}</span>${room.label ? ' · ' + esc(room.label) : ''}</div>
          <div><label for="choiceName">Your name</label><input id="choiceName" maxlength="40" placeholder="Your name"></div>
          ${room.status === 'waiting' ? btn('A') + btn('B') : '<p class="muted small-text center">This match has already started. You can watch it.</p>'}
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
      if ($('#leaveSeat')) $('#leaveSeat').onclick = async () => {
        const seat = state.mySeat;
        forgetSeat();
        await Store.mutateRoom(code, r => (r.seats[seat] && r.seats[seat].clientId === me ? Match.removePlayer(r, seat) : null));
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

    const ctx = { code, me, state, setRole, render };

    const unsub = Store.watchRoom(code, onRoom);
    return () => {
      unsub();
      if (presenceOff) presenceOff();
      if (root.RoomLive && RoomLive.teardown) RoomLive.teardown(ctx);
    };
  }

  // ---------- live & final (Task 10 fills these in) ----------

  const RoomLive = {
    renderLive(el, room, ctx) {
      const toss = Date.now() < ctx.state.tossUntil;
      const first = room.game.firstSeat === 'A' ? room.teamAName : room.teamBName;
      el.innerHTML = `<div class="panel narrow stack">
        <div class="versus">${esc(room.teamAName)} <span class="muted">vs</span> ${esc(room.teamBName)}</div>
        <div class="center" id="tossLine">${toss ? `🪙 Coin toss: <b>${esc(first)}</b> goes first` : 'Live'}</div>
      </div>`;
      if (toss) setTimeout(() => ctx.render(), ctx.state.tossUntil - Date.now() + 50);
    },
    renderFinal(el, room) {
      el.innerHTML = `<div class="panel narrow"><div class="final-banner">${room.status === 'void' ? 'This room was voided.' : 'Final'}</div></div>`;
    },
    teardown() {}
  };
  root.RoomLive = RoomLive;

  root.RoomView = { showJoin, show };
})(window);
