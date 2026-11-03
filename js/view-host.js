// Host login and dashboard: teams, fixture rooms, standings, reset.
(function (root) {
  'use strict';

  const HOST_ADMIN_PASSWORD = '1101';
  const esc = s => UI.escapeHtml(s);

  function showLogin(el) {
    el.innerHTML = `
      <div class="card narrow">
        <h2>⚙ Host login</h2>
        <form id="hostLogin" class="stack">
          <label for="hostPw">Host password</label>
          <input id="hostPw" type="password" autocomplete="current-password" placeholder="Enter host password">
          <button type="submit" class="btn-primary">Unlock host dashboard</button>
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
    time: 'time', suddenDeath: 'sudden death', bagOut: 'tiles out', resign: 'left the game',
    awarded: 'awarded by host', walkover: 'walkover', corrected: 'corrected by host'
  };

  function teamName(state, room, seat) {
    const id = Match.teamOf(room, seat);
    // As shown: at most Names.MAX characters + "…" (QA pass).
    return Names.short((state.teams[id] && state.teams[id].name) || room['team' + seat + 'Name'] || '?');
  }

  const SEAT_CHIP = s => 'chip-' + s.toLowerCase();

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
            <div><label id="nrPlayersLbl">Players</label>
              <div class="tabs nr-players" id="nrPlayers" role="radiogroup" aria-labelledby="nrPlayersLbl">
                ${[2, 3, 4].map(n => `<button type="button" class="tab${n === 2 ? ' on' : ''}" role="radio" aria-checked="${n === 2}" data-players="${n}">${n}</button>`).join('')}
              </div></div>
            <div class="row nr-teams">
              ${Match.ALL_SEATS.map(s => `<div class="nr-seat${s > 'B' ? ' hidden' : ''}" data-seat-box="${s}" style="flex:1;min-width:120px;"><label for="nr${s}">Team ${s}</label><select id="nr${s}" data-seat="${s}"></select></div>`).join('')}
            </div>
            <div class="row">
              <div style="flex:1;min-width:120px;"><label for="nrLen">Match length</label>
                <select id="nrLen"><option value="5">5 min</option><option value="10" selected>10 min</option><option value="15">15 min</option><option value="custom">Custom…</option></select></div>
              <div style="flex:1;min-width:120px;" id="nrCustomBox" class="hidden"><label for="nrCustom">Minutes (1–60)</label><input id="nrCustom" type="number" min="1" max="60" value="10"></div>
            </div>
            <div><label for="nrLabel">Label (optional)</label><input id="nrLabel" maxlength="40" placeholder="e.g. Tonight 7 PM"></div>
            <div id="nrError" class="warn-line hidden"></div>
            <button type="submit" class="btn-primary">Create room</button>
          </form>
          <div id="nrCreated" class="hidden stack" style="margin-top:8px;"></div>
        </details>
        <div class="tabs" id="roomTabs" role="tablist" aria-label="Rooms"></div>
        <div id="roomList" role="tabpanel"></div>
        <nav class="pager hidden" id="roomPager" aria-label="Pages"></nav>`;

      const $ = s => panel.querySelector(s);
      // Room list tabs (feature #8): Active is never paged; Finished and Void remember their page.
      const sel = { tab: 'active', page: { finished: 1, void: 1 } };
      $('#nrLen').onchange = () => $('#nrCustomBox').classList.toggle('hidden', $('#nrLen').value !== 'custom');

      // Players 2 · 3 · 4 (3-4 player rooms, 2026-11-03): one team select per seat; a team chosen in one
      // seat is disabled in the others, and Match.createRoom refuses duplicates too.
      let players = 2;
      const visibleSeats = () => Match.ALL_SEATS.slice(0, players);
      const seatSel = s => $('#nr' + s);

      function syncTeamOptions() {
        const chosen = visibleSeats().map(s => seatSel(s).value).filter(Boolean);
        for (const s of Match.ALL_SEATS) {
          const sel = seatSel(s);
          for (const o of sel.options) o.disabled = !!o.value && o.value !== sel.value && chosen.includes(o.value);
        }
      }

      function fillSelects() {
        const ids = Object.keys(state.teams).sort((a, b) => state.teams[a].name.localeCompare(state.teams[b].name));
        for (const s of Match.ALL_SEATS) {
          const sel = seatSel(s);
          const keep = sel.value;
          sel.innerHTML = '<option value="">— choose —</option>' + ids.map(id => `<option value="${esc(id)}" title="${esc(state.teams[id].name)}">${esc(Names.short(state.teams[id].name))}</option>`).join('');
          if (ids.includes(keep)) sel.value = keep;
        }
        syncTeamOptions();
      }

      $('#nrPlayers').onclick = ev => {
        const b = ev.target.closest('[data-players]');
        if (!b) return;
        players = Number(b.dataset.players);
        for (const x of panel.querySelectorAll('#nrPlayers [data-players]')) {
          const on = Number(x.dataset.players) === players;
          x.classList.toggle('on', on);
          x.setAttribute('aria-checked', String(on));
        }
        for (const s of Match.ALL_SEATS) {
          const show = visibleSeats().includes(s);
          panel.querySelector(`[data-seat-box="${s}"]`).classList.toggle('hidden', !show);
          if (!show) seatSel(s).value = '';
        }
        syncTeamOptions();
      };
      panel.querySelector('.nr-teams').onchange = syncTeamOptions;

      $('#newRoom').onsubmit = async ev => {
        ev.preventDefault();
        const err = $('#nrError');
        const seats = visibleSeats();
        const ids = seats.map(s => seatSel(s).value);
        const minutes = $('#nrLen').value === 'custom' ? Math.round(Number($('#nrCustom').value)) : Number($('#nrLen').value);
        let msg = '';
        if (ids.some(id => !id || !state.teams[id])) msg = players === 2 ? 'Choose both teams.' : 'Choose a team for every seat.';
        else if (new Set(ids).size !== ids.length) msg = players === 2 ? 'Team A and Team B must be different.' : 'Each seat needs a different team.';
        else if (!(minutes >= 1 && minutes <= 60)) msg = 'Match length must be 1–60 minutes.';
        err.textContent = msg;
        err.classList.toggle('hidden', !msg);
        if (msg) return;
        const opts = { label: cleanName($('#nrLabel').value), matchLengthSec: minutes * 60 };
        if (players > 2) opts.players = players;
        seats.forEach((s, i) => { opts['team' + s] = ids[i]; opts['team' + s + 'Name'] = state.teams[ids[i]].name; });
        try {
          const code = await Store.createRoom(opts);
          const pretty = Match.formatCode(code);
          const box = $('#nrCreated');
          const names = ids.map(id => `<b class="nm">${esc(Names.short(state.teams[id].name))}</b>`).join(' vs ');
          box.innerHTML = `<div class="small-text muted">Room created for ${names}. Share this code:</div>
            <div class="code-big" id="nrCode">${esc(pretty)}</div>
            <div class="row"><button type="button" class="btn-secondary small" id="nrCopy">Copy code</button><a href="#room=${esc(code)}">Open room →</a></div>`;
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
          sel.tab = 'active'; // the new room is waiting: show it
          renderList();
          UI.toast(`Room ${pretty} created.`, 'ok');
        } catch (e) {
          UI.toast(e.message || 'Could not create room.', 'error');
        }
      };

      // A 3-4 player room's Walkover… / Correct result… picker stays open across the list's rebuilds.
      let openPick = null; // '<code>:walkover' | '<code>:correct'
      function picker(room, kind, label, seats) {
        const key = room.code + ':' + kind;
        const btns = seats.map(s => {
          const n = teamName(state, room, s);
          return `<button class="btn-secondary small nm-btn" data-${kind === 'walkover' ? 'walkover' : 'correct-to'}="${s}" data-code="${esc(room.code)}" title="+1 ${esc(n)}">+1 ${esc(n)}</button>`;
        }).join('');
        return `<details class="pick" data-pick="${esc(key)}"${openPick === key ? ' open' : ''}><summary class="btn-secondary small">${esc(label)}</summary><div class="pick-list">${btns}</div></details>`;
      }

      function cardHtml(room) {
        const phase = Match.roomPhase(room);
        const seats = Match.seatsOf(room);
        const multi = seats.length > 2;
        const nameA = teamName(state, room, 'A'), nameB = teamName(state, room, 'B');
        const seatsTaken = seats.filter(s => room.seats[s]).length;
        const warnings = seats
          .filter(s => room.fairPlay[s].screenLeaves > 0 && room.seats[s])
          .map(s => `<div class="warn-line">⚠️ ${esc(room.seats[s].name)} left the screen ${room.fairPlay[s].screenLeaves}×</div>`).join('');
        let status = '';
        if (room.status === 'final' && room.result) {
          const winName = teamName(state, room, room.result.winner);
          const note = room.result.note ? ': ' + esc(room.result.note) : '';
          const why = room.result.reason !== 'time' ? ` <span class="muted">(${esc(REASON_TEXT[room.result.reason] || room.result.reason)}${note})</span>` : '';
          const scores = seats.map(s => Number(room.result['score' + s]) || 0).join('–');
          status = `<div class="ok-line">+1 <span class="nm" title="${esc(winName)}">${esc(winName)}</span> · ${scores}${why}</div>`;
        }
        const live = ['live', 'paused', 'appeal', 'suddenDeath', 'hostDecision'].includes(phase);
        const actions = [`<a class="small-text" href="#room=${esc(room.code)}">Open room →</a>`];
        if (room.status === 'waiting' || live) {
          const pinned = state.pinned === room.code;
          actions.push(`<button class="btn-secondary small" data-pin="${esc(room.code)}">${pinned ? 'Unpin' : '📌 Pin to big screen'}</button>`);
        }
        if (room.status === 'waiting') {
          if (multi) actions.push(picker(room, 'walkover', 'Walkover…', seats));
          else {
            actions.push(`<button class="btn-secondary small nm-btn" data-walkover="A" data-code="${esc(room.code)}" title="Walkover → ${esc(nameA)}">Walkover → ${esc(nameA)}</button>`);
            actions.push(`<button class="btn-secondary small nm-btn" data-walkover="B" data-code="${esc(room.code)}" title="Walkover → ${esc(nameB)}">Walkover → ${esc(nameB)}</button>`);
          }
          actions.push(`<button class="danger small" data-void="${esc(room.code)}">Void</button>`);
        } else if (room.status === 'final') {
          if (multi && room.result) actions.push(picker(room, 'correct', 'Correct result…', seats.filter(s => s !== room.result.winner)));
          else actions.push(`<button class="btn-secondary small" data-correct="${esc(room.code)}">Correct result</button>`);
          actions.push(`<button class="danger small" data-void="${esc(room.code)}">Void</button>`);
        }
        const chips = seats.map(s => {
          const n = teamName(state, room, s);
          return `<span class="chip ${SEAT_CHIP(s)}" title="${esc(n)}">${esc(n)}</span>`;
        }).join(' <span class="vs-sep muted small-text">vs</span> ');
        return `<div class="room-card" data-room="${esc(room.code)}">
          <div class="spread">
            <span class="teams">${chips}</span>
            <span class="badge ${esc(phase)}">${live ? '● ' : ''}${esc(PHASE_LABEL[phase] || phase)}${live ? ` <span data-clock="${esc(room.code)}">${esc(clockText(room))}</span>` : ''}</span>
          </div>
          <div class="meta"><span class="code">${esc(Match.formatCode(room.code))}</span> · ${Math.round(room.matchLengthSec / 60)} min · seats ${seatsTaken}/${seats.length}${room.label ? ' · ' + esc(room.label) : ''}</div>
          ${phase === 'appeal' ? '<div class="warn-line">⚖️ Appeal pending: open the room to decide</div>' : ''}
          ${phase === 'hostDecision' ? '<div class="warn-line">Still tied: open the room to award the win</div>' : ''}
          ${warnings}${status}${room.status === 'void' && room.voidNote ? `<div class="meta">Void: ${esc(room.voidNote)}</div>` : ''}
          <div class="actions">${actions.join('')}</div>
        </div>`;
      }

      const TAB_LABEL = { active: 'Active', finished: 'Finished', void: 'Void' };
      const TAB_EMPTY = { active: 'No active rooms. Create one above.', finished: 'No finished rooms yet.', void: 'No void rooms.' };

      // Keyboard focus on a tab or a page button survives the rebuild that every room update causes.
      function focusKey() {
        const a = document.activeElement;
        if (!a || !a.closest) return null;
        if (a.closest('#roomTabs') && a.dataset.tab) return `[data-tab="${a.dataset.tab}"]`;
        if (a.closest('#roomPager') && a.dataset.page) return a.getAttribute('aria-label') ? `[aria-label="${a.getAttribute('aria-label')}"]` : `[data-page="${a.dataset.page}"]:not([aria-label])`;
        return null;
      }

      function renderList() {
        const keep = focusKey();
        const rooms = Object.values(state.rooms).sort((x, y) =>
          (PHASE_ORDER[Match.roomPhase(x)] ?? 9) - (PHASE_ORDER[Match.roomPhase(y)] ?? 9) || (y.createdAt || 0) - (x.createdAt || 0));
        const v = RoomList.view(rooms, { tab: sel.tab, page: sel.page[sel.tab] || 1 }, Match.roomPhase);
        if (v.tab !== 'active') sel.page[v.tab] = v.page; // a page that emptied steps back
        $('#roomTabs').innerHTML = Object.keys(TAB_LABEL).map(t =>
          `<button type="button" class="tab${t === v.tab ? ' on' : ''}" role="tab" aria-selected="${t === v.tab}" aria-controls="roomList" tabindex="${t === v.tab ? 0 : -1}" data-tab="${t}">${TAB_LABEL[t]} (${v.counts[t]})${t === 'active' && v.counts.attention
            ? ` <span class="tab-attn" title="Waiting for your decision">⚖️ ${v.counts.attention}</span>` : ''}</button>`).join('');
        $('#roomList').innerHTML = v.items.length ? v.items.map(cardHtml).join('') : `<p class="muted small-text">${TAB_EMPTY[v.tab]}</p>`;
        const pager = $('#roomPager');
        pager.classList.toggle('hidden', v.pages <= 1);
        pager.innerHTML = v.pages <= 1 ? '' : [
          `<button type="button" data-page="${v.page - 1}" aria-label="Previous page" ${v.page === 1 ? 'disabled' : ''}>‹</button>`,
          ...RoomList.pageList(v.page, v.pages).map(p => p === '…' ? '<span class="gap">…</span>'
            : `<button type="button" data-page="${p}"${p === v.page ? ' class="on" aria-current="page"' : ''}>${p}</button>`),
          `<button type="button" data-page="${v.page + 1}" aria-label="Next page" ${v.page === v.pages ? 'disabled' : ''}>›</button>`
        ].join('');
        if (keep) {
          let el = document.querySelector('#roomTabs ' + keep) || document.querySelector('#roomPager ' + keep);
          // Next / Previous at the last / first page is disabled now: focus the current page's button instead
          if ((!el || el.disabled) && !keep.startsWith('[data-tab')) el = document.querySelector('#roomPager [aria-current="page"]');
          if (el && !el.disabled) el.focus({ preventScroll: true });
        }
      }

      // Arrow keys / Home / End move focus between the tabs; Enter or Space switches (manual activation).
      $('#roomTabs').onkeydown = ev => {
        const tabs = [...document.querySelectorAll('#roomTabs [role=tab]')];
        const i = tabs.indexOf(document.activeElement);
        if (i === -1) return;
        const to = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[ev.key];
        if (to === undefined) return;
        ev.preventDefault();
        tabs[to].focus();
      };

      $('#roomTabs').onclick = ev => {
        const b = ev.target.closest('[data-tab]');
        if (!b) return;
        sel.tab = b.dataset.tab;
        renderList();
      };
      $('#roomPager').onclick = ev => {
        const b = ev.target.closest('[data-page]');
        if (!b || b.disabled || sel.tab === 'active') return;
        sel.page[sel.tab] = Number(b.dataset.page);
        renderList();
      };

      $('#roomList').onclick = async ev => {
        const sum = ev.target.closest('.pick > summary');
        if (sum) { // remember which picker is open (the card list is rebuilt on every room update)
          const key = sum.parentElement.dataset.pick;
          openPick = sum.parentElement.open ? null : key;
          return;
        }
        const btn = ev.target.closest('button');
        if (!btn) return;
        const code = btn.dataset.code || btn.dataset.void || btn.dataset.correct || btn.dataset.pin;
        const room = state.rooms[code];
        if (!room) return;
        if (btn.dataset.correctTo) {
          const to = btn.dataset.correctTo;
          const name = teamName(state, room, to);
          const note = prompt('Reason for the correction (kept in the record):', '');
          if (note === null || !confirm(`Give the win to ${name} instead?`)) return;
          openPick = null;
          const res = await Store.mutateRoom(code, r => Match.correctResult(r, Store.serverNow(), note, to));
          UI.toast(res.committed ? `Result corrected: +1 ${name}.` : 'Could not correct the result.', res.committed ? 'ok' : 'error');
        } else if (btn.dataset.pin) {
          btn.disabled = true;
          try {
            await Store.setPinned(state.pinned === code ? null : code);
          } catch (e) {
            UI.toast('Could not update the big-screen pin.', 'error');
          } finally {
            btn.disabled = false;
          }
        } else if (btn.dataset.correct) {
          const other = teamName(state, room, room.result.winner === 'A' ? 'B' : 'A');
          const note = prompt('Reason for the correction (kept in the record):', '');
          if (note === null || !confirm(`Give the win to ${other} instead?`)) return;
          const res = await Store.mutateRoom(code, r => Match.correctResult(r, Store.serverNow(), note));
          UI.toast(res.committed ? `Result corrected: +1 ${other}.` : 'Could not correct the result.', res.committed ? 'ok' : 'error');
        } else if (btn.dataset.walkover) {
          const seat = btn.dataset.walkover;
          const name = teamName(state, room, seat);
          if (!confirm(`Give ${name} a walkover win (+1)?`)) return;
          openPick = null;
          const res = await Store.mutateRoom(code, r => Match.walkover(r, seat, Store.serverNow()));
          UI.toast(res.committed ? `Walkover recorded: +1 ${name}.` : 'Could not record walkover (room changed).', res.committed ? 'ok' : 'error');
        } else if (btn.dataset.void) {
          const note = prompt('Reason for voiding (kept in the record):', '');
          if (note === null || !confirm(`Void room ${Match.formatCode(code)}? It will count for no one.`)) return;
          const res = await Store.mutateRoom(code, r => Match.voidRoom(r, Store.serverNow(), note));
          UI.toast(res.committed ? 'Room voided.' : 'Could not void room.', res.committed ? 'ok' : 'error');
        }
      };

      const tried = {};
      App.onTick(() => {
        panel.querySelectorAll('[data-clock]').forEach(span => {
          const room = state.rooms[span.dataset.clock];
          if (room) span.textContent = clockText(room);
        });
        // The host's browser is the primary recorder of time-up results (spec §7).
        const now = Store.serverNow();
        for (const room of Object.values(state.rooms)) {
          if (room.status !== 'live' || !room.clock || room.clock.paused || (room.game && room.game.pending)) continue;
          if (now < room.clock.endsAt) continue;
          if (RoomRetry.due(tried, room.code + ':' + room.clock.endsAt)) {
            Store.mutateRoom(room.code, r => Match.resolveTimeUp(r, Store.serverNow()));
          }
        }
      });

      return { render() { fillSelects(); renderList(); } };
    }
  };
  root.HostRooms = HostRooms;

  function show(el) {
    if (!App.isHost()) return showLogin(el);

    el.innerHTML = `
      <div class="spread" style="margin-bottom:12px;">
        <h2 style="margin:0;">⚙ Host dashboard</h2>
        <div class="row">
          <button class="btn-secondary small" id="lockBtn">🔒 Lock host</button>
          <button class="danger small" id="resetBtn">Reset tournament</button>
        </div>
      </div>
      <div class="dash">
        <section class="card">
          <h3>1 · Teams</h3>
          <div id="teamList"></div>
          <form id="addTeam" class="row" style="margin-top:8px;">
            <input id="teamName" maxlength="40" placeholder="Add team name…" style="flex:1;min-width:0;">
            <button type="submit" class="btn-primary">Add</button>
          </form>
        </section>
        <section class="card">
          <h3>2 · Fixture rooms</h3>
          <div id="roomsPanel"></div>
        </section>
        <section class="card">
          <h3>3 · Standings</h3>
          <div id="standings"></div>
          <button class="btn-secondary small" id="bigScreenBtn" style="margin-top:10px;width:100%;">📺 Open big-screen view</button>
        </section>
      </div>`;

    const state = { teams: {}, rooms: {}, pinned: null };
    const ctx = { el, state };

    function renderTeams() {
      const list = el.querySelector('#teamList');
      const ids = Object.keys(state.teams).sort((a, b) => state.teams[a].name.localeCompare(state.teams[b].name));
      if (!ids.length) { list.innerHTML = '<p class="muted small-text">Add the teams taking part.</p>'; return; }
      const used = new Set();
      for (const r of Object.values(state.rooms)) for (const s of Match.seatsOf(r)) used.add(Match.teamOf(r, s));
      list.innerHTML = ids.map(id => `
        <div class="list-item">
          <span class="name" title="${esc(state.teams[id].name)}">${esc(Names.short(state.teams[id].name))}</span>
          <span class="row">
            <button class="btn-secondary small" data-rename="${esc(id)}">Rename</button>
            ${used.has(id) ? '' : `<button class="danger small" data-delete="${esc(id)}" title="Delete">✕</button>`}
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
    const unsubPinned = Store.watchPinned(p => {
      state.pinned = p;
      if (roomsPanel) roomsPanel.render();
    });

    return () => { unsubTeams(); unsubRooms(); unsubPinned(); };
  }

  root.HostView = { show };
})(window);
