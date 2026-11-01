// Host login and dashboard: teams, fixture rooms, standings, reset.
(function (root) {
  'use strict';

  const HOST_ADMIN_PASSWORD = '1101';
  const esc = s => UI.escapeHtml(s);

  function showLogin(el) {
    el.innerHTML = `
      <div class="panel narrow">
        <h2>⚙ Host login</h2>
        <form id="hostLogin" class="stack">
          <label for="hostPw">Host password</label>
          <input id="hostPw" type="password" autocomplete="current-password" placeholder="Enter host password">
          <button type="submit">Unlock host dashboard</button>
        </form>
      </div>`;
    el.querySelector('#hostLogin').onsubmit = ev => {
      ev.preventDefault();
      const input = el.querySelector('#hostPw');
      if (input.value !== HOST_ADMIN_PASSWORD) {
        input.value = '';
        UI.toast('Incorrect host password.', 'error');
        return;
      }
      App.setHost(true);
      App.route();
    };
    return null;
  }

  function cleanName(name) { return String(name || '').trim().replace(/\s+/g, ' ').slice(0, 40); }

  // ---------- Rooms panel ----------

  const PHASE_LABEL = {
    waiting: 'Waiting', live: 'Live', paused: 'Paused', appeal: 'Appeal pending',
    suddenDeath: 'Sudden death', hostDecision: 'Host decision', final: 'Final', void: 'Void'
  };
  const PHASE_ORDER = { live: 0, appeal: 0, paused: 0, suddenDeath: 0, hostDecision: 0, waiting: 1, final: 2, void: 3 };
  const REASON_TEXT = {
    time: 'time', suddenDeath: 'sudden death', bagOut: 'tiles out', resign: 'resigned',
    awarded: 'awarded by host', walkover: 'walkover', corrected: 'corrected by host'
  };

  function teamName(state, room, seat) {
    const id = seat === 'A' ? room.teamA : room.teamB;
    return (state.teams[id] && state.teams[id].name) || (seat === 'A' ? room.teamAName : room.teamBName) || '?';
  }

  function clockText(room) {
    const phase = Match.roomPhase(room);
    if (!room.clock) return '';
    if (phase === 'suddenDeath') return 'SD';
    if (phase === 'hostDecision') return '';
    const ms = room.clock.paused ? room.clock.paused.matchRemainingMs : room.clock.endsAt - Store.serverNow();
    return UI.formatClock(ms);
  }

  const HostRooms = {
    mount({ el, state }) {
      const panel = el.querySelector('#roomsPanel');
      panel.innerHTML = `
        <details id="newRoomBox" open>
          <summary style="cursor:pointer;font-weight:700;">+ New room</summary>
          <form id="newRoom" class="stack" style="margin-top:6px;">
            <div class="row">
              <div style="flex:1;min-width:120px;"><label for="nrA">Team A</label><select id="nrA"></select></div>
              <div style="flex:1;min-width:120px;"><label for="nrB">Team B</label><select id="nrB"></select></div>
            </div>
            <div class="row">
              <div style="flex:1;min-width:120px;"><label for="nrLen">Match length</label>
                <select id="nrLen"><option value="5">5 min</option><option value="10" selected>10 min</option><option value="15">15 min</option><option value="custom">Custom…</option></select></div>
              <div style="flex:1;min-width:120px;" id="nrCustomBox" class="hidden"><label for="nrCustom">Minutes (1–60)</label><input id="nrCustom" type="number" min="1" max="60" value="10"></div>
            </div>
            <div><label for="nrLabel">Label (optional)</label><input id="nrLabel" maxlength="40" placeholder="e.g. Tonight 7 PM"></div>
            <div id="nrError" class="warn-line hidden"></div>
            <button type="submit">Create room</button>
          </form>
          <div id="nrCreated" class="hidden stack" style="margin-top:8px;"></div>
        </details>
        <div id="roomList" style="margin-top:10px;"></div>`;

      const $ = s => panel.querySelector(s);
      $('#nrLen').onchange = () => $('#nrCustomBox').classList.toggle('hidden', $('#nrLen').value !== 'custom');

      function fillSelects() {
        const ids = Object.keys(state.teams).sort((a, b) => state.teams[a].name.localeCompare(state.teams[b].name));
        for (const sel of [$('#nrA'), $('#nrB')]) {
          const keep = sel.value;
          sel.innerHTML = '<option value="">— choose —</option>' + ids.map(id => `<option value="${esc(id)}">${esc(state.teams[id].name)}</option>`).join('');
          if (ids.includes(keep)) sel.value = keep;
        }
      }

      $('#newRoom').onsubmit = async ev => {
        ev.preventDefault();
        const err = $('#nrError');
        const a = $('#nrA').value, b = $('#nrB').value;
        const minutes = $('#nrLen').value === 'custom' ? Math.round(Number($('#nrCustom').value)) : Number($('#nrLen').value);
        let msg = '';
        if (!a || !b) msg = 'Choose both teams.';
        else if (a === b) msg = 'Team A and Team B must be different.';
        else if (!(minutes >= 1 && minutes <= 60)) msg = 'Match length must be 1–60 minutes.';
        err.textContent = msg;
        err.classList.toggle('hidden', !msg);
        if (msg) return;
        try {
          const code = await Store.createRoom({
            teamA: a, teamB: b, teamAName: state.teams[a].name, teamBName: state.teams[b].name,
            label: cleanName($('#nrLabel').value), matchLengthSec: minutes * 60
          });
          const pretty = Match.formatCode(code);
          const box = $('#nrCreated');
          box.innerHTML = `<div class="small-text muted">Room created for <b>${esc(state.teams[a].name)}</b> vs <b>${esc(state.teams[b].name)}</b>. Share this code:</div>
            <div class="code-big" id="nrCode">${esc(pretty)}</div>
            <div class="row"><button type="button" class="secondary small" id="nrCopy">Copy code</button><a href="#room=${esc(code)}">Open room →</a></div>`;
          box.classList.remove('hidden');
          $('#nrCopy').onclick = async () => {
            try { await navigator.clipboard.writeText(pretty); UI.toast('Code copied.', 'ok'); }
            catch (e) {
              const range = document.createRange(); range.selectNodeContents($('#nrCode'));
              const selObj = window.getSelection(); selObj.removeAllRanges(); selObj.addRange(range);
              UI.toast('Press Ctrl+C to copy.');
            }
          };
          $('#nrLabel').value = '';
          UI.toast(`Room ${pretty} created.`, 'ok');
        } catch (e) {
          UI.toast(e.message || 'Could not create room.', 'error');
        }
      };

      function cardHtml(room) {
        const phase = Match.roomPhase(room);
        const nameA = teamName(state, room, 'A'), nameB = teamName(state, room, 'B');
        const seatsTaken = ['A', 'B'].filter(s => room.seats[s]).length;
        const warnings = ['A', 'B']
          .filter(s => room.fairPlay[s].screenLeaves > 0 && room.seats[s])
          .map(s => `<div class="warn-line">⚠️ ${esc(room.seats[s].name)} left the screen ${room.fairPlay[s].screenLeaves}×</div>`).join('');
        let status = '';
        if (room.status === 'final' && room.result) {
          const winName = room.result.winner === 'A' ? nameA : nameB;
          const why = room.result.reason !== 'time' ? ` <span class="muted">(${esc(REASON_TEXT[room.result.reason] || room.result.reason)})</span>` : '';
          status = `<div class="ok-line">+1 ${esc(winName)} · ${room.result.scoreA}–${room.result.scoreB}${why}</div>`;
        }
        const live = ['live', 'paused', 'appeal', 'suddenDeath', 'hostDecision'].includes(phase);
        const actions = [`<a class="small-text" href="#room=${esc(room.code)}">Open room →</a>`];
        if (room.status === 'waiting') {
          actions.push(`<button class="secondary small" data-walkover="A" data-code="${esc(room.code)}">Walkover → ${esc(nameA)}</button>`);
          actions.push(`<button class="secondary small" data-walkover="B" data-code="${esc(room.code)}">Walkover → ${esc(nameB)}</button>`);
          actions.push(`<button class="secondary small" data-void="${esc(room.code)}">Void</button>`);
        }
        return `<div class="room-card" data-room="${esc(room.code)}">
          <div class="spread">
            <span class="teams">${esc(nameA)} <span class="muted">vs</span> ${esc(nameB)}</span>
            <span class="badge ${esc(phase)}">${live ? '● ' : ''}${esc(PHASE_LABEL[phase] || phase)}${live ? ` <span data-clock="${esc(room.code)}">${esc(clockText(room))}</span>` : ''}</span>
          </div>
          <div class="meta"><span class="code">${esc(Match.formatCode(room.code))}</span> · ${Math.round(room.matchLengthSec / 60)} min · seats ${seatsTaken}/2${room.label ? ' · ' + esc(room.label) : ''}</div>
          ${phase === 'appeal' ? '<div class="warn-line">⚖️ Appeal pending: open the room to decide</div>' : ''}
          ${phase === 'hostDecision' ? '<div class="warn-line">Still tied: open the room to award the win</div>' : ''}
          ${warnings}${status}
          <div class="actions">${actions.join('')}</div>
        </div>`;
      }

      function renderList() {
        const rooms = Object.values(state.rooms).sort((x, y) =>
          (PHASE_ORDER[Match.roomPhase(x)] ?? 9) - (PHASE_ORDER[Match.roomPhase(y)] ?? 9) || (y.createdAt || 0) - (x.createdAt || 0));
        $('#roomList').innerHTML = rooms.length ? rooms.map(cardHtml).join('') : '<p class="muted small-text">No rooms yet.</p>';
      }

      $('#roomList').onclick = async ev => {
        const btn = ev.target.closest('button');
        if (!btn) return;
        const code = btn.dataset.code || btn.dataset.void;
        const room = state.rooms[code];
        if (!room) return;
        if (btn.dataset.walkover) {
          const seat = btn.dataset.walkover;
          const name = teamName(state, room, seat);
          if (!confirm(`Give ${name} a walkover win (+1)?`)) return;
          const res = await Store.mutateRoom(code, r => Match.walkover(r, seat, Store.serverNow()));
          UI.toast(res.committed ? `Walkover recorded: +1 ${name}.` : 'Could not record walkover (room changed).', res.committed ? 'ok' : 'error');
        } else if (btn.dataset.void) {
          if (!confirm(`Void room ${Match.formatCode(code)}? It will count for no one.`)) return;
          const res = await Store.mutateRoom(code, r => Match.voidRoom(r, Store.serverNow()));
          UI.toast(res.committed ? 'Room voided.' : 'Could not void room.', res.committed ? 'ok' : 'error');
        }
      };

      App.onTick(() => {
        panel.querySelectorAll('[data-clock]').forEach(span => {
          const room = state.rooms[span.dataset.clock];
          if (room) span.textContent = clockText(room);
        });
      });

      return { render() { fillSelects(); renderList(); } };
    }
  };
  root.HostRooms = HostRooms;

  function show(el) {
    if (!App.isHost()) return showLogin(el);

    el.innerHTML = `
      <div class="spread" style="margin-bottom:12px;">
        <h2 style="color:#fef3c7;margin:0;">⚙ Host dashboard</h2>
        <div class="row">
          <button class="secondary small" id="lockBtn">🔒 Lock host</button>
          <button class="danger small" id="resetBtn">Reset tournament</button>
        </div>
      </div>
      <div class="dash">
        <section class="panel">
          <h3>1 · Teams</h3>
          <div id="teamList"></div>
          <form id="addTeam" class="row" style="margin-top:8px;">
            <input id="teamName" maxlength="40" placeholder="Add team name…" style="flex:1;min-width:0;">
            <button type="submit">Add</button>
          </form>
        </section>
        <section class="panel">
          <h3>2 · Fixture rooms</h3>
          <div id="roomsPanel"></div>
        </section>
        <section class="panel">
          <h3>3 · Standings</h3>
          <div id="standings"></div>
          <button class="secondary small" id="bigScreenBtn" style="margin-top:10px;width:100%;">📺 Open big-screen view</button>
        </section>
      </div>`;

    const state = { teams: {}, rooms: {} };
    const ctx = { el, state };

    function renderTeams() {
      const list = el.querySelector('#teamList');
      const ids = Object.keys(state.teams).sort((a, b) => state.teams[a].name.localeCompare(state.teams[b].name));
      if (!ids.length) { list.innerHTML = '<p class="muted small-text">Add the teams taking part.</p>'; return; }
      const used = new Set();
      for (const r of Object.values(state.rooms)) { used.add(r.teamA); used.add(r.teamB); }
      list.innerHTML = ids.map(id => `
        <div class="list-item">
          <span class="name">${esc(state.teams[id].name)}</span>
          <span class="row">
            <button class="secondary small" data-rename="${esc(id)}">Rename</button>
            ${used.has(id) ? '' : `<button class="secondary small" data-delete="${esc(id)}" title="Delete">✕</button>`}
          </span>
        </div>`).join('');
    }

    function isDuplicate(name, exceptId) {
      const n = name.toLowerCase();
      return Object.keys(state.teams).some(id => id !== exceptId && state.teams[id].name.toLowerCase() === n);
    }

    el.querySelector('#teamList').onclick = async ev => {
      const renameId = ev.target.dataset.rename;
      const deleteId = ev.target.dataset.delete;
      if (renameId) {
        const name = cleanName(prompt('New team name:', state.teams[renameId].name));
        if (!name) return;
        if (isDuplicate(name, renameId)) return UI.toast('A team with that name already exists.', 'error');
        await Store.renameTeam(renameId, name);
      } else if (deleteId) {
        if (!confirm(`Delete team "${state.teams[deleteId].name}"?`)) return;
        await Store.deleteTeam(deleteId);
      }
    };

    el.querySelector('#addTeam').onsubmit = async ev => {
      ev.preventDefault();
      const input = el.querySelector('#teamName');
      const name = cleanName(input.value);
      if (!name) return;
      if (isDuplicate(name)) return UI.toast('A team with that name already exists.', 'error');
      input.value = '';
      await Store.addTeam(name);
    };

    function renderStandings() {
      UI.renderStandings(el.querySelector('#standings'), Match.computeStandings(state.teams, state.rooms));
    }

    el.querySelector('#lockBtn').onclick = () => { App.setHost(false); App.route(); };
    el.querySelector('#bigScreenBtn').onclick = () => window.open(location.pathname + '?view=scoreboard', '_blank');
    el.querySelector('#resetBtn').onclick = async () => {
      const typed = prompt('This deletes ALL teams, rooms and results.\nType RESET to confirm.');
      if (typed !== 'RESET') return UI.toast('Reset cancelled.');
      await Store.resetTournament();
      UI.toast('Tournament reset.', 'ok');
    };

    const roomsPanel = HostRooms.mount(ctx);

    const unsubTeams = Store.watchTeams(t => {
      state.teams = t;
      renderTeams(); renderStandings();
      if (roomsPanel) roomsPanel.render();
    });
    const unsubRooms = Store.watchRooms(r => {
      state.rooms = r;
      renderTeams(); renderStandings();
      if (roomsPanel) roomsPanel.render();
    });

    return () => { unsubTeams(); unsubRooms(); };
  }

  root.HostView = { show };
})(window);
