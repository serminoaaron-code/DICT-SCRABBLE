// Host login and dashboard: tournament time, access codes, live games & players, standings.
// The host only sets things up and watches: pairing is automatic (Find opponent), the dictionary
// decides words, and the players' devices handle turn time, match time, disconnects and ties.
(function (root) {
  'use strict';

  const HOST_ADMIN_PASSWORD = '1101';
  const esc = s => UI.escapeHtml(s);
  const short = s => Names.short(s);

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

  const PLAYING = ['live', 'suddenDeath', 'hostDecision'];
  const REASON_TEXT = {
    time: 'time up', suddenDeath: 'sudden death', bagOut: 'tiles out', resign: 'left the game', disconnect: 'disconnect forfeit',
    awarded: 'awarded by host', walkover: 'walkover', corrected: 'corrected by host', draw: 'tied after sudden death'
  };
  const DURATION_CHIPS = [30, 60, 90, 120, 180];

  const hms = ms => {
    const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  };
  const clockOf = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const agencyKey = a => String(a || '').trim().replace(/\s+/g, ' ').toLowerCase();

  function ensureHostStyles() {
    if (document.getElementById('hostDashStyle')) return;
    const st = document.createElement('style');
    st.id = 'hostDashStyle';
    st.textContent = `
      .hd-dash{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:14px;align-items:start}
      .hd-dash .card{margin:0}
      .hd-status{padding:10px 12px;border-radius:12px;background:color-mix(in srgb,currentColor 6%,transparent);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
      .hd-status b.big{font-size:1.6rem;font-variant-numeric:tabular-nums}
      .hd-chips{display:flex;flex-wrap:wrap;gap:6px}
      .hd-chips button{padding:4px 10px;border-radius:99px}
      .hd-chips button.on{outline:2px solid var(--accent,#2563eb)}
      .hd-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .hd-switch{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.92rem}
      .hd-switch input{width:auto;margin:0}
      .hd-counts{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center}
      .hd-counts div{padding:6px;border-radius:10px;background:color-mix(in srgb,currentColor 5%,transparent)}
      .hd-counts b{display:block;font-size:1.2rem}.hd-counts span{font-size:.72rem;opacity:.7;text-transform:uppercase}
      .hd-table-wrap{max-height:420px;overflow:auto;border-radius:10px;border:1px solid color-mix(in srgb,currentColor 12%,transparent)}
      .hd-table{width:100%;border-collapse:collapse;font-size:.88rem}
      .hd-table th,.hd-table td{padding:6px 8px;text-align:left;border-bottom:1px solid color-mix(in srgb,currentColor 8%,transparent);vertical-align:middle}
      .hd-table th{position:sticky;top:0;background:var(--card,#fff);font-size:.75rem;text-transform:uppercase;letter-spacing:.04em;opacity:.85;z-index:1}
      .hd-table td.num,.hd-table th.num{text-align:right;font-variant-numeric:tabular-nums}
      .hd-table .code{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;letter-spacing:.06em;white-space:nowrap}
      .hd-table tr.off td{opacity:.5}
      .hd-act{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
      .hd-act button{padding:3px 8px}
      .hd-new{padding:10px;border-radius:10px;border:2px dashed var(--accent,#2563eb)}
      .hd-new .code-list{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;letter-spacing:.06em;display:flex;flex-wrap:wrap;gap:6px 14px;max-height:160px;overflow:auto}
      .hd-game{padding:10px;border-radius:12px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);display:flex;flex-direction:column;gap:6px}
      .hd-game + .hd-game{margin-top:8px}
      .hd-vs{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center}
      .hd-vs .p{min-width:0}.hd-vs .p b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .hd-vs .p small{display:block;opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .hd-vs .p.r{text-align:right}
      .hd-vs .sc{font-size:1.3rem;font-weight:800;font-variant-numeric:tabular-nums;text-align:center;white-space:nowrap}
      .hd-meta{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:.82rem;opacity:.85}
      .hd-empty{opacity:.7;font-size:.9rem;padding:8px 0}
      .hd-tag{display:inline-block;padding:1px 7px;border-radius:99px;font-size:.72rem;font-weight:700;background:color-mix(in srgb,currentColor 10%,transparent)}
      .hd-tag.live{background:#16a34a;color:#fff}.hd-tag.q{background:#2563eb;color:#fff}.hd-tag.k{background:#c81e1e;color:#fff}.hd-tag.on{background:color-mix(in srgb,#16a34a 25%,transparent)}
      .hd-tag.w{background:#f59e0b;color:#111}
      .hd-search{margin-bottom:8px}`;
    document.head.appendChild(st);
  }

  function show(el) {
    if (!App.isHost()) return showLogin(el);
    ensureHostStyles();

    el.innerHTML = `
      <div class="spread" style="margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <h2 style="margin:0;">⚙ Host dashboard</h2>
        <div class="row">
          <button class="btn-secondary small" id="bigScreenBtn">📺 Big screen</button>
          <button class="btn-secondary small" id="lockBtn">🔒 Lock host</button>
          <button class="danger small" id="resetBtn">Reset tournament</button>
        </div>
      </div>
      <div class="hd-dash">
        <section class="card stack" id="secTour">
          <h3 style="margin:0;">1 · Tournament</h3>
          <div class="hd-status" id="tourStatus"></div>
          <div class="hd-grid2">
            <div><label for="tourDur">Tournament length (minutes)</label><input id="tourDur" type="number" min="5" max="720" value="120"></div>
            <div><label for="matchLen">Each game</label>
              <select id="matchLen"><option value="5">5 min</option><option value="10">10 min</option><option value="15">15 min</option><option value="20">20 min</option><option value="custom">Custom…</option></select>
              <input id="matchCustom" class="hidden" type="number" min="1" max="60" value="10" style="margin-top:6px;" aria-label="Minutes per game (1–60)"></div>
          </div>
          <div class="hd-chips" id="durChips">${DURATION_CHIPS.map(m => `<button type="button" class="btn-secondary small" data-dur="${m}">${m < 60 ? m + ' min' : (m / 60) + ' h'}</button>`).join('')}</div>
          <div class="row" id="tourBtns"></div>
          <label class="hd-switch"><input type="checkbox" id="reqCode"> Require an access code to join</label>
          <label class="hd-switch"><input type="checkbox" id="lockReg"> Lock registration (only players who already joined can sign in)</label>
          <div class="hd-counts" id="tourCounts"></div>
          <p class="small-text muted" style="margin:0;">When the time runs out, no new games start. Games in progress finish normally.</p>
        </section>

        <section class="card stack" id="secCodes">
          <h3 style="margin:0;">2 · Access codes</h3>
          <form id="genForm" class="stack">
            <div class="tabs" id="codeType" role="radiogroup" aria-label="Code type">
              <button type="button" class="tab on" role="radio" aria-checked="true" data-type="individual">👤 Individual</button>
              <button type="button" class="tab" role="radio" aria-checked="false" data-type="shared">👥 Shared</button>
            </div>
            <p class="small-text muted" style="margin:0;" id="codeTypeHelp"></p>
            <div class="hd-grid2">
              <div id="countBox"><label for="codeCount">How many</label><input id="codeCount" type="number" min="1" max="300" value="10"></div>
              <div><label for="codeBatch">Batch label (optional)</label><input id="codeBatch" maxlength="30" placeholder="e.g. Region III"></div>
            </div>
            <button type="submit" class="btn-primary">Generate codes</button>
          </form>
          <div id="newCodes"></div>
          <div class="row" style="justify-content:space-between;">
            <div class="tabs" id="codeFilter" role="tablist" aria-label="Show codes"></div>
            <span class="row"><button class="btn-secondary small" id="copyUnused">⧉ Copy unused</button><button class="btn-secondary small" id="csvCodes">⬇ CSV</button></span>
          </div>
          <div class="hd-table-wrap"><table class="hd-table"><thead><tr><th>Code</th><th>Type</th><th>Used by</th><th></th></tr></thead><tbody id="codeRows"></tbody></table></div>
        </section>

        <section class="card stack" id="secGames">
          <h3 style="margin:0;">3 · Live games &amp; players</h3>
          <div class="tabs" id="gameTabs" role="tablist" aria-label="Games and players"></div>
          <input id="playerSearch" class="hd-search hidden" placeholder="Search name or agency…" aria-label="Search players">
          <div id="gameList"></div>
        </section>

        <section class="card stack" id="secStand">
          <h3 style="margin:0;">4 · Standings</h3>
          <div class="tabs" id="standTabs" role="tablist" aria-label="Standings">
            <button type="button" class="tab on" data-stand="player">By player</button>
            <button type="button" class="tab" data-stand="agency">By agency</button>
          </div>
          <div class="hd-table-wrap" id="standBox"></div>
          <p class="small-text muted" style="margin:0;">Win 1 · Draw ½ · Loss 0. Ties: more wins first. Agencies are grouped by name as typed (capitals and extra spaces ignored).</p>
        </section>
      </div>`;

    const $ = s => el.querySelector(s);
    const state = { rooms: {}, players: {}, codes: {}, tour: null, settings: {}, lobby: {}, pinned: null };
    const sel = { codeType: 'individual', codeFilter: 'all', gameTab: 'live', stand: 'player', search: '', lastBatch: [] };

    // ---------- 1 · Tournament ----------
    function matchMinutes() {
      const v = $('#matchLen').value;
      return v === 'custom' ? Math.round(Number($('#matchCustom').value)) : Number(v);
    }
    let settingsSynced = false;
    function syncSettingsInputs() {
      const s = state.settings;
      $('#reqCode').checked = !!s.requireCode;
      $('#lockReg').checked = !!s.lockRegistration;
      if (!settingsSynced || document.activeElement !== $('#matchCustom')) {
        const m = Number(s.matchMin) || 10;
        if ([5, 10, 15, 20].includes(m)) { $('#matchLen').value = String(m); $('#matchCustom').classList.add('hidden'); }
        else { $('#matchLen').value = 'custom'; $('#matchCustom').value = m; $('#matchCustom').classList.remove('hidden'); }
      }
      settingsSynced = true;
    }
    $('#matchLen').onchange = () => {
      $('#matchCustom').classList.toggle('hidden', $('#matchLen').value !== 'custom');
      saveMatchLen();
    };
    $('#matchCustom').onchange = saveMatchLen;
    function saveMatchLen() {
      const m = matchMinutes();
      if (!(m >= 1 && m <= 60)) return UI.toast('Each game must be 1–60 minutes.', 'error');
      Store.updateSettings({ matchMin: m }).then(() => UI.toast(`New games will be ${m} minutes.`, 'ok'));
    }
    $('#reqCode').onchange = () => Store.updateSettings({ requireCode: $('#reqCode').checked });
    $('#lockReg').onchange = () => Store.updateSettings({ lockRegistration: $('#lockReg').checked });
    $('#durChips').onclick = ev => {
      const b = ev.target.closest('[data-dur]');
      if (!b) return;
      $('#tourDur').value = b.dataset.dur;
      markChips();
    };
    $('#tourDur').oninput = markChips;
    function markChips() {
      const v = Number($('#tourDur').value);
      el.querySelectorAll('#durChips [data-dur]').forEach(b => b.classList.toggle('on', Number(b.dataset.dur) === v));
    }
    markChips();

    function tourPhase(now) {
      const t = state.tour;
      if (!t || !t.status) return 'idle';
      if (t.status === 'ended' || now >= (t.endsAt || 0)) return 'ended';
      return 'running';
    }

    function renderTour() {
      const now = Store.serverNow();
      const t = state.tour;
      const phase = tourPhase(now);
      const status = $('#tourStatus');
      let html;
      if (phase === 'running') html = `<span>🟢 <b>Running</b> · ends at ${esc(clockOf(t.endsAt))}</span><b class="big" id="tourLeft">${hms(t.endsAt - now)}</b>`;
      else if (phase === 'ended') html = `<span>🏁 <b>Ended</b>${t && t.endsAt ? ' at ' + esc(clockOf(Math.min(t.endsAt, t.endedAt || t.endsAt))) : ''}. No new games start.</span>`;
      else html = '<span>⏳ <b>Not started.</b> Players can sign in, but Find opponent opens when you start.</span>';
      if (status.dataset.html !== html) { status.innerHTML = html; status.dataset.html = html; }
      const btns = phase === 'running'
        ? `<button class="btn-secondary" data-tour="extend">＋15 min</button><button class="danger" data-tour="end">■ End now</button>`
        : `<button class="btn-go" data-tour="start">▶ ${phase === 'ended' ? 'Start again' : 'Start tournament'}</button>`;
      const box = $('#tourBtns');
      if (box.dataset.html !== btns) { box.innerHTML = btns; box.dataset.html = btns; }
    }
    $('#tourBtns').onclick = async ev => {
      const b = ev.target.closest('[data-tour]');
      if (!b) return;
      const now = Store.serverNow();
      const act = b.dataset.tour;
      if (act === 'start') {
        const dur = Math.round(Number($('#tourDur').value));
        if (!(dur >= 5 && dur <= 720)) return UI.toast('Tournament length must be 5–720 minutes.', 'error');
        const m = matchMinutes();
        if (!(m >= 1 && m <= 60)) return UI.toast('Each game must be 1–60 minutes.', 'error');
        if (!confirm(`Start the tournament for ${dur} minutes (${m}-minute games)? Results so far are kept.`)) return;
        await Store.updateSettings({ matchMin: m });
        await Store.setTournament({ status: 'running', startedAt: now, endsAt: now + dur * 60000, durationMin: dur, matchMin: m });
        UI.toast('Tournament started. Players can now Find opponent.', 'ok');
      } else if (act === 'extend') {
        await Store.updateTournament({ endsAt: (state.tour.endsAt || now) + 15 * 60000, durationMin: (state.tour.durationMin || 0) + 15 });
        UI.toast('Added 15 minutes.', 'ok');
      } else if (act === 'end') {
        if (!confirm('End the tournament now? No new games will start; games in progress finish.')) return;
        await Store.updateTournament({ status: 'ended', endedAt: now, endsAt: Math.min(state.tour.endsAt || now, now) });
        UI.toast('Tournament ended.', 'ok');
      }
    };

    function renderCounts() {
      const players = Object.values(state.players).filter(p => p && p.name);
      const online = players.filter(p => p.online && !p.kicked).length;
      const queue = Object.keys((state.lobby && state.lobby.queue) || {}).length;
      const live = Object.values(state.rooms).filter(r => PLAYING.includes(r.status)).length;
      const html = `<div><b>${online}/${players.length}</b><span>Online</span></div><div><b>${queue}</b><span>Searching</span></div><div><b>${live}</b><span>Live games</span></div>`;
      const box = $('#tourCounts');
      if (box.innerHTML !== html) box.innerHTML = html;
    }

    // ---------- 2 · Access codes ----------
    const TYPE_HELP = {
      individual: 'One code per player. The first person to sign in with it owns it; the same code signs them in again on any device.',
      shared: 'One code for everyone: hand it out once. Players are told apart by name + agency.'
    };
    function syncCodeType() {
      el.querySelectorAll('#codeType [data-type]').forEach(b => {
        const on = b.dataset.type === sel.codeType;
        b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on));
      });
      $('#codeTypeHelp').textContent = TYPE_HELP[sel.codeType];
      $('#countBox').classList.toggle('hidden', sel.codeType === 'shared');
    }
    $('#codeType').onclick = ev => {
      const b = ev.target.closest('[data-type]');
      if (!b) return;
      sel.codeType = b.dataset.type;
      syncCodeType();
    };
    syncCodeType();

    $('#genForm').onsubmit = async ev => {
      ev.preventDefault();
      const type = sel.codeType;
      const n = type === 'shared' ? 1 : Math.round(Number($('#codeCount').value));
      if (!(n >= 1 && n <= 300)) return UI.toast('Generate 1–300 codes at a time.', 'error');
      const batch = String($('#codeBatch').value || '').trim().slice(0, 30);
      const now = Store.serverNow();
      const map = {};
      const made = [];
      let guard = 0;
      while (made.length < n && guard++ < n * 20) {
        const c = Match.generateAccessCode();
        if (state.codes[c] || map[c]) continue;
        map[c] = { type, batch: batch || null, createdAt: now };
        made.push(c);
      }
      try {
        await Store.addAccessCodes(map);
      } catch (e) {
        return UI.toast('Could not save the codes.', 'error');
      }
      sel.lastBatch = made;
      renderNewCodes(type);
      UI.toast(`${made.length} ${type} code${made.length > 1 ? 's' : ''} created.`, 'ok');
    };

    function renderNewCodes(type) {
      const box = $('#newCodes');
      if (!sel.lastBatch.length) { box.innerHTML = ''; return; }
      const pretty = sel.lastBatch.map(Match.formatAccessCode);
      box.innerHTML = `<div class="hd-new stack">
        <div class="small-text"><b>New ${type} code${pretty.length > 1 ? 's' : ''}</b>${type === 'shared' ? ': give this one code to everyone.' : ': one per player.'}</div>
        ${type === 'shared' ? `<div class="code-big">${esc(pretty[0])}</div>` : `<div class="code-list">${pretty.map(c => `<span>${esc(c)}</span>`).join('')}</div>`}
        <div class="row"><button class="btn-secondary small" id="copyNew">⧉ Copy</button><button class="btn-secondary small" id="hideNew">Done</button></div></div>`;
      box.querySelector('#copyNew').onclick = () => copyText(pretty.join('\n'));
      box.querySelector('#hideNew').onclick = () => { sel.lastBatch = []; box.innerHTML = ''; };
    }

    async function copyText(text) {
      try { await navigator.clipboard.writeText(text); UI.toast('Copied.', 'ok'); }
      catch (e) { prompt('Copy these:', text); }
    }

    // players per code (shared codes: everyone who signed in with it)
    function usersOf(code) { return Object.entries(state.players).filter(([, p]) => p && p.code === code); }
    function codeStatus(code, c) {
      if (c.revoked) return 'disabled';
      if (c.type === 'individual') return c.pid ? 'used' : 'unused';
      return usersOf(code).length ? 'used' : 'unused';
    }
    function codeList() {
      return Object.entries(state.codes).filter(([, c]) => c && c.type)
        .sort(([a, x], [b, y]) => (y.createdAt || 0) - (x.createdAt || 0) || a.localeCompare(b));
    }
    function renderCodes() {
      const list = codeList();
      const counts = { all: list.length, unused: 0, used: 0, disabled: 0 };
      for (const [code, c] of list) counts[codeStatus(code, c)] += 1;
      const tabs = ['all', 'unused', 'used', 'disabled'].map(f => `<button type="button" class="tab${sel.codeFilter === f ? ' on' : ''}" data-filter="${f}">${f[0].toUpperCase() + f.slice(1)} (${counts[f]})</button>`).join('');
      if ($('#codeFilter').innerHTML !== tabs) $('#codeFilter').innerHTML = tabs;
      const shown = list.filter(([code, c]) => sel.codeFilter === 'all' || codeStatus(code, c) === sel.codeFilter);
      const rows = shown.length ? shown.map(([code, c]) => {
        const st = codeStatus(code, c);
        let who = '<span class="muted">—</span>';
        if (c.type === 'individual' && c.pid) who = `<b>${esc(short(c.name || ''))}</b><br><small class="muted">${esc(c.agency || '')}</small>`;
        if (c.type === 'shared') { const n = usersOf(code).length; who = n ? `${n} player${n > 1 ? 's' : ''}` : who; }
        return `<tr class="${st === 'disabled' ? 'off' : ''}">
          <td><span class="code">${esc(Match.formatAccessCode(code))}</span>${c.batch ? `<br><small class="muted">${esc(c.batch)}</small>` : ''}</td>
          <td>${c.type === 'shared' ? '👥 Shared' : '👤 Individual'}${st === 'disabled' ? ' <span class="hd-tag k">Disabled</span>' : ''}</td>
          <td>${who}</td>
          <td><div class="hd-act">
            <button class="btn-secondary small" data-copy="${code}" title="Copy">⧉</button>
            <button class="btn-secondary small" data-revoke="${code}">${c.revoked ? 'Enable' : 'Disable'}</button>
            ${st === 'unused' ? `<button class="danger small" data-del="${code}" title="Delete">✕</button>` : ''}
          </div></td></tr>`;
      }).join('') : `<tr><td colspan="4" class="hd-empty">${list.length ? 'No codes here.' : 'No codes yet. Generate some above.'}</td></tr>`;
      const body = $('#codeRows');
      if (body.dataset.html !== rows) { body.innerHTML = rows; body.dataset.html = rows; }
    }
    $('#codeFilter').onclick = ev => {
      const b = ev.target.closest('[data-filter]');
      if (!b) return;
      sel.codeFilter = b.dataset.filter;
      renderCodes();
    };
    $('#codeRows').onclick = async ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.copy) return copyText(Match.formatAccessCode(b.dataset.copy));
      if (b.dataset.revoke) {
        const code = b.dataset.revoke, c = state.codes[code];
        if (!c) return;
        if (!c.revoked && !confirm(`Disable ${Match.formatAccessCode(code)}? Nobody new can sign in with it. Players already signed in stay.`)) return;
        await Store.setCodeRevoked(code, !c.revoked);
      }
      if (b.dataset.del) {
        if (!confirm(`Delete unused code ${Match.formatAccessCode(b.dataset.del)}?`)) return;
        await Store.deleteAccessCode(b.dataset.del);
      }
    };
    $('#copyUnused').onclick = () => {
      const unused = codeList().filter(([code, c]) => codeStatus(code, c) === 'unused').map(([code]) => Match.formatAccessCode(code));
      if (!unused.length) return UI.toast('No unused codes.', 'error');
      copyText(unused.join('\n'));
    };
    $('#csvCodes').onclick = () => {
      const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const lines = [['Code', 'Type', 'Batch', 'Status', 'Player', 'Agency', 'Players using it'].map(q).join(',')];
      for (const [code, c] of codeList()) {
        lines.push([Match.formatAccessCode(code), c.type, c.batch || '', codeStatus(code, c), c.name || '', c.agency || '', c.type === 'shared' ? usersOf(code).length : ''].map(q).join(','));
      }
      const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'scrabble-access-codes.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };

    // ---------- 3 · Live games & players ----------
    const seatName = (r, s) => (r.seats[s] ? r.seats[s].name : Match.teamNameOf(r, s));
    const seatAgency = (r, s) => r['agency' + s] || (r.seats[s] && r.seats[s].agency) || '';
    function standingsList() { return Match.computeStandings(teamsMap(), state.rooms); }
    function teamsMap() {
      const out = {};
      for (const [pid, p] of Object.entries(state.players)) if (p && p.name) out[pid] = { name: p.name };
      return out;
    }
    function liveRoomOf(pid) {
      return Object.values(state.rooms).find(r => PLAYING.includes(r.status) && Match.seatOfPid(r, pid)) || null;
    }

    function gameClock(r) {
      if (r.status === 'suddenDeath') return 'Sudden death';
      if (!r.clock) return '';
      const ms = r.clock.paused ? r.clock.paused.matchRemainingMs : r.clock.endsAt - Store.serverNow();
      return UI.formatClock(ms);
    }

    function gameCard(r) {
      const seats = Match.seatsOf(r);
      const live = PLAYING.includes(r.status);
      const sc = (r.status === 'final' && r.result) ? s => Number(r.result['score' + s]) || 0 : s => (r.game && r.game.scores[s]) || 0;
      const side = (s, right) => {
        const tags = [];
        if (live && r.seats[s] && !Match.isSeatOnline(r, s)) tags.push('<span class="hd-tag w">📴 offline</span>');
        if (r.fairPlay[s] && r.fairPlay[s].screenLeaves) tags.push(`<span class="hd-tag w">⚠️ left screen ${r.fairPlay[s].screenLeaves}×</span>`);
        if (r.status === 'final' && r.result && r.result.winner === s) tags.push('<span class="hd-tag live">🏆 Win</span>');
        return `<div class="p${right ? ' r' : ''}"><b title="${esc(seatName(r, s))}">${esc(short(seatName(r, s)))}</b><small title="${esc(seatAgency(r, s))}">${esc(seatAgency(r, s))}</small>${tags.join(' ')}</div>`;
      };
      const vs = seats.length === 2
        ? `<div class="hd-vs">${side('A')}<div class="sc">${sc('A')}–${sc('B')}</div>${side('B', true)}</div>`
        : seats.map(s => `<div class="hd-vs">${side(s)}<div class="sc">${sc(s)}</div><div></div></div>`).join('');
      let meta = '';
      if (live) meta = `<span>⏱ <b data-gclock="${esc(r.code)}">${esc(gameClock(r))}</b></span><span>Move ${(r.game && r.game.moveCount) || 0}${r.game ? ' · bag ' + r.game.bag.length : ''}</span>`;
      else if (r.status === 'final' && r.result) {
        const why = REASON_TEXT[r.result.reason] || r.result.reason;
        meta = `<span>${r.result.winner ? '🏆 ' + esc(short(seatName(r, r.result.winner))) : '🤝 Draw'} · ${esc(why)}${r.result.note ? ': ' + esc(r.result.note) : ''}</span><span>${r.result.decidedAt ? esc(clockOf(r.result.decidedAt)) : ''}</span>`;
      } else if (r.status === 'void') meta = `<span>🗑 Void${r.voidNote ? ': ' + esc(r.voidNote) : ''}</span>`;
      const pinned = state.pinned === r.code;
      const acts = [`<a class="rc-btn" href="#room=${esc(r.code)}" target="_blank" rel="noopener">👁️ Watch ↗</a>`];
      if (live) acts.push(`<button class="btn-secondary small" data-pin="${esc(r.code)}">${pinned ? '📌 Unpin' : '📌 Pin'}</button>`);
      if (r.status === 'final') acts.push(`<button class="btn-secondary small" data-correct="${esc(r.code)}">✎ Correct result</button>`);
      if (r.status !== 'void') acts.push(`<button class="danger small" data-void="${esc(r.code)}">🗑 Void</button>`);
      return `<div class="hd-game">${vs}<div class="hd-meta">${meta}</div><div class="hd-act" style="justify-content:flex-start;">${acts.join('')}</div></div>`;
    }

    function playerRows() {
      const st = {};
      for (const row of standingsList()) st[row.teamId] = row;
      const q = sel.search.trim().toLowerCase();
      const queue = (state.lobby && state.lobby.queue) || {};
      const list = Object.entries(state.players).filter(([, p]) => p && p.name)
        .filter(([, p]) => !q || p.name.toLowerCase().includes(q) || String(p.agency || '').toLowerCase().includes(q))
        .sort(([, a], [, b]) => (!!a.kicked - !!b.kicked) || a.name.localeCompare(b.name));
      if (!list.length) return `<p class="hd-empty">${Object.keys(state.players).length ? 'No player matches.' : 'No players yet. They appear here when they sign in.'}</p>`;
      return `<div class="hd-table-wrap"><table class="hd-table"><thead><tr><th>Player</th><th>Status</th><th class="num">W-D-L</th><th class="num">Pts</th><th></th></tr></thead><tbody>${list.map(([pid, p]) => {
        const s = st[pid] || { wins: 0, draws: 0, losses: 0, points: 0 };
        const live = liveRoomOf(pid);
        let tag;
        if (p.kicked) tag = '<span class="hd-tag k">Kicked</span>';
        else if (live) tag = `<a class="hd-tag live" href="#room=${esc(live.code)}" target="_blank" rel="noopener" style="text-decoration:none;">In game ↗</a>`;
        else if (queue[pid]) tag = '<span class="hd-tag q">Searching</span>';
        else if (p.online) tag = '<span class="hd-tag on">Online</span>';
        else tag = '<span class="hd-tag">Offline</span>';
        const code = p.code ? `<small class="muted code">${esc(Match.formatAccessCode(p.code))}</small>` : '';
        return `<tr class="${p.kicked ? 'off' : ''}"><td><b title="${esc(p.name)}">${esc(short(p.name))}</b><br><small class="muted">${esc(p.agency || '')}</small> ${code}</td>
          <td>${tag}</td><td class="num">${s.wins}-${s.draws}-${s.losses}</td><td class="num"><b>${s.points}</b></td>
          <td><div class="hd-act">${p.kicked ? `<button class="btn-secondary small" data-allow="${esc(pid)}">Allow back</button>` : `<button class="danger small" data-kick="${esc(pid)}">Kick</button>`}</div></td></tr>`;
      }).join('')}</tbody></table></div>`;
    }

    function renderGames() {
      const rooms = Object.values(state.rooms);
      const live = rooms.filter(r => PLAYING.includes(r.status)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const done = rooms.filter(r => r.status === 'final' || r.status === 'void')
        .sort((a, b) => ((b.result && b.result.decidedAt) || b.voidedAt || b.createdAt || 0) - ((a.result && a.result.decidedAt) || a.voidedAt || a.createdAt || 0));
      const nPlayers = Object.values(state.players).filter(p => p && p.name).length;
      const tabs = [['live', `● Live (${live.length})`], ['finished', `✓ Finished (${done.length})`], ['players', `👥 Players (${nPlayers})`]]
        .map(([k, t]) => `<button type="button" class="tab${sel.gameTab === k ? ' on' : ''}" role="tab" aria-selected="${sel.gameTab === k}" data-gtab="${k}">${t}</button>`).join('');
      if ($('#gameTabs').innerHTML !== tabs) $('#gameTabs').innerHTML = tabs;
      $('#playerSearch').classList.toggle('hidden', sel.gameTab !== 'players');
      let html;
      if (sel.gameTab === 'live') html = live.length ? live.map(gameCard).join('') : '<p class="hd-empty">No games right now. Games start by themselves when two players accept a match.</p>';
      else if (sel.gameTab === 'finished') html = done.length ? done.slice(0, 100).map(gameCard).join('') : '<p class="hd-empty">No finished games yet.</p>';
      else html = playerRows();
      const box = $('#gameList');
      if (box.dataset.html !== html) {
        const scroll = box.querySelector('.hd-table-wrap') ? box.querySelector('.hd-table-wrap').scrollTop : 0;
        box.innerHTML = html; box.dataset.html = html;
        const wrap = box.querySelector('.hd-table-wrap');
        if (wrap) wrap.scrollTop = scroll;
      }
    }
    $('#gameTabs').onclick = ev => {
      const b = ev.target.closest('[data-gtab]');
      if (!b) return;
      sel.gameTab = b.dataset.gtab;
      renderGames();
    };
    $('#playerSearch').oninput = () => { sel.search = $('#playerSearch').value; renderGames(); };

    $('#gameList').onclick = async ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.pin) {
        b.disabled = true;
        try { await Store.setPinned(state.pinned === b.dataset.pin ? null : b.dataset.pin); }
        catch (e) { UI.toast('Could not update the big-screen pin.', 'error'); }
        finally { b.disabled = false; }
        return;
      }
      if (b.dataset.void) {
        const code = b.dataset.void;
        const note = prompt('Reason for voiding (kept in the record):', '');
        if (note === null || !confirm('Void this game? It will count for no one.')) return;
        const res = await Store.mutateRoom(code, r => Match.voidRoom(r, Store.serverNow(), note));
        UI.toast(res.committed ? 'Game voided.' : 'Could not void the game.', res.committed ? 'ok' : 'error');
        return;
      }
      if (b.dataset.correct) {
        const code = b.dataset.correct;
        const r = state.rooms[code];
        if (!r || !r.result) return;
        const seats = Match.seatsOf(r).filter(s => s !== r.result.winner);
        let to = seats[0];
        if (seats.length > 1) {
          const pick = prompt(`Give the win to which player?\n${seats.map((s, i) => `${i + 1} = ${seatName(r, s)}`).join('\n')}`, '1');
          if (pick === null) return;
          to = seats[Number(pick) - 1];
          if (!to) return UI.toast('No such player.', 'error');
        }
        const note = prompt('Reason for the correction (kept in the record):', '');
        if (note === null || !confirm(`Give the win to ${seatName(r, to)} instead?`)) return;
        const res = await Store.mutateRoom(code, x => Match.correctResult(x, Store.serverNow(), note, to));
        UI.toast(res.committed ? `Result corrected: +1 ${seatName(r, to)}.` : 'Could not correct the result.', res.committed ? 'ok' : 'error');
        return;
      }
      if (b.dataset.kick) {
        const pid = b.dataset.kick, p = state.players[pid];
        if (!p) return;
        const reason = prompt(`Kick ${p.name}? They are signed out and cannot sign in again until you allow them back.\nReason (shown to them, optional):`, '');
        if (reason === null) return;
        await Store.setKicked(pid, true, reason);
        await Store.mutateLobby(raw => Match.lobbyLeave(raw, pid));
        const live = liveRoomOf(pid);
        if (live && confirm(`${p.name} is in a game. End it now as a loss for them?`)) {
          const seat = Match.seatOfPid(live, pid);
          await Store.mutateRoom(live.code, r => Match.resign(r, seat, Store.serverNow()));
        }
        UI.toast(`${p.name} was kicked.`, 'ok');
        return;
      }
      if (b.dataset.allow) {
        const p = state.players[b.dataset.allow];
        await Store.setKicked(b.dataset.allow, false);
        UI.toast(`${p ? p.name : 'Player'} can sign in again.`, 'ok');
      }
    };

    // ---------- 4 · Standings ----------
    function renderStandings() {
      const list = standingsList().filter(r => r.played > 0 || state.players[r.teamId]);
      let html;
      if (sel.stand === 'player') {
        html = list.length ? `<table class="hd-table"><thead><tr><th class="num">#</th><th>Player</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">Pts</th></tr></thead><tbody>${list.map(r => {
          const p = state.players[r.teamId] || {};
          return `<tr><td class="num">${r.rank}</td><td><b title="${esc(r.name)}">${esc(short(r.name))}</b><br><small class="muted">${esc(p.agency || '')}</small></td>
            <td class="num">${r.played}</td><td class="num">${r.wins}</td><td class="num">${r.draws}</td><td class="num">${r.losses}</td><td class="num"><b>${r.points}</b></td></tr>`;
        }).join('')}</tbody></table>` : '<p class="hd-empty" style="padding:10px;">No players yet.</p>';
      } else {
        const groups = {};
        for (const r of list) {
          const p = state.players[r.teamId] || {};
          const k = agencyKey(p.agency) || '(no agency)';
          const g = groups[k] || (groups[k] = { names: {}, players: 0, wins: 0, draws: 0, losses: 0, points: 0 });
          const label = String(p.agency || '(no agency)').trim().replace(/\s+/g, ' ');
          g.names[label] = (g.names[label] || 0) + 1;
          g.players += 1; g.wins += r.wins; g.draws += r.draws; g.losses += r.losses; g.points += r.points;
        }
        const rows = Object.values(groups).map(g => Object.assign(g, { name: Object.entries(g.names).sort((a, b) => b[1] - a[1])[0][0] }))
          .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
        rows.forEach((g, i) => { g.rank = i > 0 && rows[i - 1].points === g.points && rows[i - 1].wins === g.wins ? rows[i - 1].rank : i + 1; });
        html = rows.length ? `<table class="hd-table"><thead><tr><th class="num">#</th><th>Agency</th><th class="num">Players</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">Pts</th></tr></thead><tbody>${rows.map(g =>
          `<tr><td class="num">${g.rank}</td><td><b>${esc(g.name)}</b></td><td class="num">${g.players}</td><td class="num">${g.wins}</td><td class="num">${g.draws}</td><td class="num">${g.losses}</td><td class="num"><b>${g.points}</b></td></tr>`).join('')}</tbody></table>`
          : '<p class="hd-empty" style="padding:10px;">No players yet.</p>';
      }
      const box = $('#standBox');
      if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; }
    }
    $('#standTabs').onclick = ev => {
      const b = ev.target.closest('[data-stand]');
      if (!b) return;
      sel.stand = b.dataset.stand;
      el.querySelectorAll('#standTabs [data-stand]').forEach(x => x.classList.toggle('on', x.dataset.stand === sel.stand));
      renderStandings();
    };

    // ---------- header buttons ----------
    $('#lockBtn').onclick = () => { App.setHost(false); App.route(); };
    $('#bigScreenBtn').onclick = () => window.open(location.pathname + '?view=scoreboard', '_blank');
    $('#resetBtn').onclick = async () => {
      const typed = prompt('This deletes EVERYTHING: games, results, players, access codes and the tournament timer.\nType RESET to confirm.');
      if (typed !== 'RESET') return UI.toast('Reset cancelled.');
      await Store.resetTournament();
      UI.toast('Tournament reset.', 'ok');
    };

    // ---------- data ----------
    const renderAll = () => { renderTour(); renderCounts(); renderCodes(); renderGames(); renderStandings(); };
    const subs = [
      Store.watchRooms(r => { state.rooms = r; renderCounts(); renderGames(); renderStandings(); renderCodes(); }),
      Store.watchPlayers(p => { state.players = p || {}; renderCounts(); renderGames(); renderStandings(); renderCodes(); }),
      Store.watchAccessCodes(c => { state.codes = c || {}; renderCodes(); }),
      Store.watchTournament(t => { state.tour = t; renderTour(); }),
      Store.watchSettings(s => { state.settings = s || {}; syncSettingsInputs(); }),
      Store.watchLobby(l => { state.lobby = l || {}; renderCounts(); if (sel.gameTab === 'players') renderGames(); }),
      Store.watchPinned(p => { state.pinned = p; if (sel.gameTab === 'live') renderGames(); })
    ];
    renderAll();

    const tried = {};
    App.onTick(() => {
      const now = Store.serverNow();
      const left = el.querySelector('#tourLeft');
      if (left && state.tour) { if (tourPhase(now) === 'running') left.textContent = hms(state.tour.endsAt - now); else renderTour(); }
      el.querySelectorAll('[data-gclock]').forEach(span => {
        const r = state.rooms[span.dataset.gclock];
        if (r) { const t = gameClock(r); if (span.textContent !== t) span.textContent = t; }
      });
      // The players' devices record time-up results; an open host dashboard is a backup recorder.
      for (const room of Object.values(state.rooms)) {
        if (room.status !== 'live' || !room.clock || room.clock.paused || (room.game && room.game.pending)) continue;
        if (now < room.clock.endsAt) continue;
        if (RoomRetry.due(tried, room.code + ':' + room.clock.endsAt)) {
          Store.mutateRoom(room.code, r => Match.resolveTimeUp(r, Store.serverNow()));
        }
      }
    });

    return () => { subs.forEach(f => f()); };
  }

  root.HostView = { show };
})(window);
