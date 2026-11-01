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
    el.querySelector('#resetBtn').onclick = async () => {
      const typed = prompt('This deletes ALL teams, rooms and results.\nType RESET to confirm.');
      if (typed !== 'RESET') return UI.toast('Reset cancelled.');
      await Store.resetTournament();
      UI.toast('Tournament reset.', 'ok');
    };

    const roomsPanel = root.HostRooms ? root.HostRooms.mount(ctx) : null;

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
    if (!roomsPanel) el.querySelector('#roomsPanel').innerHTML = '<p class="muted small-text">Rooms panel coming next.</p>';

    return () => { unsubTeams(); unsubRooms(); };
  }

  root.HostView = { show };
})(window);
