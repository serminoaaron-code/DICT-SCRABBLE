// Join page (access code sign-in + Find opponent matchmaking) and room view (live game, final)
// for players, spectators and the host. Games run without the host: the dictionary decides words,
// the players' devices write turn timeouts, time-up, disconnect forfeits and sudden-death draws.
(function (root) {
  'use strict';

  const esc = s => UI.escapeHtml(s);
  const seatKey = code => 'scrabble.seat.' + code;
  // The room's seats: A, B (2 players) or A–D (3-4 player rooms, Match.seatsOf).
  const seatsOf = room => Match.seatsOf(room);
  const isSeatCode = s => Match.ALL_SEATS.includes(s); // a stored seat (before the room is known)
  const multi = room => seatsOf(room).length > 2;

  // Names as shown: at most Names.MAX characters + "…" (QA pass); full names stay in titles.
  // Team colours (A blue, B red, C green, D yellow) come from the chip-* / s-* classes everywhere.
  const short = s => Names.short(s);
  // The lobby and the seat picker (lobby redesign "A", 2026-11-03): the room facts + a status badge, then the one
  // team line (js/teamline.js), the same as on the host room cards.
  const lobbyHead = (room, badge, roomCode) => { // roomCode: the route code (a room record may lack its own)
    const SEATS = seatsOf(room);
    const taken = SEATS.filter(s => room.seats[s]).length;
    const pill = taken === SEATS.length ? 'full' : taken ? 'part' : 'none';
    return `<div class="lb-head"><div class="meta lb-meta"><span>📍 <span class="code">${esc(Match.formatCode(roomCode))}</span></span><span>⏱ ${Math.round(room.matchLengthSec / 60)} min</span>
        <span>👥 Seats <span class="rc-pill ${pill}">${taken}/${SEATS.length}</span></span>${room.label ? `<span class="rc-label" title="${esc(room.label)}">🏷 ${esc(room.label)}</span>` : ''}</div>${badge}</div>
      ${TeamLine.html(SEATS.map(s => ({ seat: s, name: Match.teamNameOf(room, s) })))}`;
  };
  const seatTop = (room, seat, extra = '') => `<span class="lb-top"><span class="rc-num s-${seat.toLowerCase()}">${seatsOf(room).indexOf(seat) + 1}</span><span class="lb-team" title="${esc(Match.teamNameOf(room, seat))}">${esc(short(Match.teamNameOf(room, seat)))}</span>${extra}</span>`;
  // "A", "A and B", "A, B and C"
  const andList = xs => (xs.length < 3 ? xs.join(' and ') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);

  // ---------- signed-in player (access codes) ----------
  // Store.local 'scrabble.player' = { pid, name, agency, code, codeType }. pid: 'p_<CODE>' for an individual
  // code, 's_<hash>' for a shared code (code + name + agency), 'g_<hash>' when the host allows no code.
  const PLAYER_KEY = 'scrabble.player';
  function session() {
    try { const p = JSON.parse(Store.local.get(PLAYER_KEY) || 'null'); return p && p.pid ? p : null; } catch (e) { return null; }
  }
  function setSession(p) { if (p) Store.local.set(PLAYER_KEY, JSON.stringify(p)); else Store.local.remove(PLAYER_KEY); }
  // The player's "online" flag for the host's Players tab: kept across routes, stopped on sign-out.
  let presence = { pid: null, off: null };
  function keepPresence(pid) {
    if (presence.pid === pid) return;
    if (presence.off) presence.off();
    presence = { pid, off: pid ? Store.playerPresence(pid) : null };
  }
  function signOut() {
    const me = session();
    if (me) { Store.mutateLobby(raw => Match.lobbyLeave(raw, me.pid)); Store.queueOnDisconnect(me.pid, false); }
    keepPresence(null);
    setSession(null);
  }
  const cleanText = (s, n = 60) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, n);
  const PLAYING_ROOM = ['live', 'suddenDeath', 'hostDecision'];

  // Tournament time: running until endsAt; 'ended' (or past endsAt) stops new games, games in progress finish.
  function tourState(t, now) {
    if (!t || !t.status) return { open: false, kind: 'idle', text: '⏳ The tournament has not started yet. Find opponent opens when the host starts it.' };
    if (t.status === 'ended' || now >= (t.endsAt || 0)) return { open: false, kind: 'ended', text: '🏁 The tournament has ended. No new games start; games in progress finish.' };
    return { open: true, kind: 'running', left: t.endsAt - now, text: '' };
  }
  const hms = ms => {
    const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  };

  // Styles for the screens added with access codes and matchmaking (the rest come from css/).
  function ensureStyles() {
    if (document.getElementById('mmStyle')) return;
    const st = document.createElement('style');
    st.id = 'mmStyle';
    st.textContent = `
      .mm-card{border:2px solid var(--accent,#2563eb);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent,#2563eb) 15%,transparent)}
      .mm-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:1.35rem;letter-spacing:.12em;text-transform:uppercase;text-align:center;font-weight:700}
      .mm-hint{font-size:.8rem;opacity:.75;margin-top:4px}
      .mm-err{color:#c81e1e;font-weight:600;font-size:.9rem}
      .mm-me{display:flex;align-items:center;gap:10px}
      .mm-av{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#fff;background:var(--accent,#2563eb);flex:none}
      .mm-me .mm-who{flex:1;min-width:0}.mm-me b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .mm-me .mm-sub{font-size:.82rem;opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .mm-tour{padding:8px 10px;border-radius:10px;background:color-mix(in srgb,currentColor 6%,transparent);font-size:.9rem;text-align:center}
      .mm-tour b{font-variant-numeric:tabular-nums}
      .mm-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;text-align:center}
      .mm-stats div{padding:6px 2px;border-radius:10px;background:color-mix(in srgb,currentColor 5%,transparent)}
      .mm-stats b{display:block;font-size:1.25rem}.mm-stats span{font-size:.72rem;opacity:.7;text-transform:uppercase;letter-spacing:.04em}
      .mm-find{width:100%;font-size:1.15rem;padding:14px 10px}
      .mm-search{display:flex;flex-direction:column;align-items:center;gap:8px;padding:6px 0}
      .mm-radar{width:64px;height:64px;border-radius:50%;border:3px solid var(--accent,#2563eb);position:relative;display:grid;place-items:center;font-size:26px}
      .mm-radar::after{content:"";position:absolute;inset:-3px;border-radius:50%;border:3px solid var(--accent,#2563eb);animation:mmPing 1.6s ease-out infinite}
      @keyframes mmPing{from{transform:scale(1);opacity:.7}to{transform:scale(1.7);opacity:0}}
      @media (prefers-reduced-motion:reduce){.mm-radar::after{animation:none}}
      .mm-return{padding:10px;border-radius:10px;border:2px solid #16a34a;background:color-mix(in srgb,#16a34a 10%,transparent);display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
      .mm-live{display:flex;flex-direction:column;gap:6px}
      .mm-live a{display:flex;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:10px;background:color-mix(in srgb,currentColor 5%,transparent);text-decoration:none;color:inherit}
      .mm-live a span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .mm-overlay{position:fixed;inset:0;z-index:1000;background:rgba(5,15,42,.55);display:flex;align-items:flex-end;justify-content:center;padding:16px}
      @media (min-width:600px){.mm-overlay{align-items:center}}
      .mm-modal{width:100%;max-width:400px;border-radius:16px;padding:18px;background:var(--card,#fff);color:var(--ink,#0b1a3d);box-shadow:0 20px 50px rgba(0,0,0,.35);text-align:center;display:flex;flex-direction:column;gap:10px}
      .mm-vs{display:flex;align-items:center;justify-content:center;gap:10px}
      .mm-vs div{flex:1;min-width:0}.mm-vs b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mm-vs small{opacity:.7}
      .mm-vs i{font-style:normal;font-weight:900;opacity:.6}
      .mm-bar{height:8px;border-radius:99px;background:color-mix(in srgb,currentColor 12%,transparent);overflow:hidden}
      .mm-bar i{display:block;height:100%;background:var(--accent,#2563eb);transition:width .25s linear}
      .mm-btns{display:flex;gap:8px}.mm-btns button{flex:1;padding:12px 8px;font-size:1rem}
      .mm-draw{text-align:center}.mm-draw .mm-big{font-size:3rem;line-height:1}
      .mm-forfeit{font-variant-numeric:tabular-nums;font-weight:700}`;
    document.head.appendChild(st);
  }

  // ---------- join page: sign in with an access code, then Find opponent ----------

  function showJoin(el) {
    ensureStyles();
    const state = { me: session(), player: undefined, tour: null, settings: {}, lobby: {}, rooms: {},
      seenOffer: {}, offerStart: {}, queueStart: null, starting: null, handled: {}, expiring: {}, heartbeat: null, built: null };
    const subs = [];
    let standings = null;

    const offSub = () => { while (subs.length) { try { subs.pop()(); } catch (e) { /* ignore */ } } };
    subs.push(Store.watchTournament(t => { state.tour = t; refresh(); }));
    subs.push(Store.watchSettings(s => { state.settings = s || {}; refresh(); }));
    subs.push(Store.watchRooms(r => { state.rooms = r; refresh(); }));

    let meSubs = [];
    function watchMe() {
      meSubs.forEach(f => f()); meSubs = [];
      state.player = undefined;
      if (!state.me) return;
      keepPresence(state.me.pid);
      meSubs.push(Store.watchPlayer(state.me.pid, p => {
        state.player = p;
        if (p && p.kicked) {
          const why = p.kickReason ? ` (${p.kickReason})` : '';
          signOut(); state.me = null; watchMe();
          UI.toast('You were removed from the tournament by the host' + why + '.', 'error');
          return build();
        }
        if (p === null && state.me) { // the tournament was reset: sign in again
          signOut(); state.me = null; watchMe(); return build();
        }
        refresh();
      }));
      meSubs.push(Store.watchLobby(l => { state.lobby = l || {}; onLobby(); refresh(); }));
    }

    function build() {
      if (standings) { standings.off(); standings = null; }
      state.built = state.me ? 'home' : 'signin';
      el.innerHTML = (state.me ? homeHtml() : signInHtml()) + `
        <div class="card narrow"><h3>🏆 Standings</h3><div id="joinStandings"><p class="muted small-text">Loading…</p></div></div>
        <div class="card narrow"><h3>👁️ Live games</h3><div id="mmLive" class="mm-live"></div></div>
        <div id="mmOverlay"></div>`;
      standings = UI.mountStandings(() => el.querySelector('#joinStandings'));
      if (state.me) wireHome(); else wireSignIn();
      refresh();
    }

    // ----- sign in -----
    function signInHtml() {
      const last = (() => { try { return JSON.parse(Store.local.get('scrabble.lastSignIn') || '{}'); } catch (e) { return {}; } })();
      return `<div class="card narrow stack mm-card">
        <h2 style="margin:0;">🔤 Join the tournament</h2>
        <p class="muted small-text" style="margin:0;">Enter the access code from your host, your name and your agency.</p>
        <div class="mm-tour" id="mmTour"></div>
        <form id="signIn" class="stack" autocomplete="off">
          <div><label for="acCode">Access code</label>
            <input id="acCode" class="mm-code" placeholder="ABCD-EF23" maxlength="12" autocapitalize="characters" spellcheck="false" value="${esc(last.code ? Match.formatAccessCode(last.code) : '')}">
            <div class="mm-hint" id="acHint">Individual codes are for one player; a shared code is used by everyone.</div></div>
          <div><label for="acName">Name</label><input id="acName" maxlength="40" autocomplete="name" placeholder="Juan Dela Cruz" value="${esc(last.name || Store.local.get('scrabble.name') || '')}"></div>
          <div><label for="acAgency">Agency / Office / Department / Region</label><input id="acAgency" maxlength="60" placeholder="e.g. DICT Region III" value="${esc(last.agency || '')}"></div>
          <div class="mm-err hidden" id="acErr" role="alert"></div>
          <button type="submit" class="btn-primary" id="acJoin">Join</button>
        </form>
      </div>`;
    }

    function wireSignIn() {
      const $ = s => el.querySelector(s);
      const codeIn = $('#acCode');
      codeIn.oninput = () => {
        const c = Match.normalizeAccessCode(codeIn.value);
        const pretty = c.length > 4 ? Match.formatAccessCode(c) : c;
        if (codeIn.value !== pretty) codeIn.value = pretty;
      };
      $('#signIn').onsubmit = async ev => {
        ev.preventDefault();
        const err = $('#acErr');
        const fail = msg => { err.textContent = msg; err.classList.remove('hidden'); $('#acJoin').disabled = false; $('#acJoin').textContent = 'Join'; };
        err.classList.add('hidden');
        $('#acJoin').disabled = true; $('#acJoin').textContent = 'Checking…';
        try {
          const res = await registerPlayer(codeIn.value, $('#acName').value, $('#acAgency').value, state.settings);
          if (res.error) return fail(res.error);
          Store.local.set('scrabble.lastSignIn', JSON.stringify({ code: res.player.code || '', name: res.player.name, agency: res.player.agency }));
          Store.local.set('scrabble.name', res.player.name);
          state.me = res.player;
          setSession(res.player);
          if (res.note) UI.toast(res.note, 'ok');
          watchMe();
          build();
        } catch (e) {
          console.error(e);
          fail('Could not sign in. Check your connection and try again.');
        }
      };
    }

    // ----- home: Find opponent -----
    function homeHtml() {
      const me = state.me;
      const initials = me.name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
      const codeTag = me.code ? `<span class="rc-tag ok">${me.codeType === 'individual' ? 'Individual' : 'Shared'} code ${esc(Match.formatAccessCode(me.code))}</span>` : '';
      return `<div class="card narrow stack mm-card">
        <div class="mm-me"><span class="mm-av" aria-hidden="true">${esc(initials || '?')}</span>
          <span class="mm-who"><b title="${esc(me.name)}">${esc(me.name)}</b><span class="mm-sub" title="${esc(me.agency)}">${esc(me.agency)}</span></span>
          <button class="link small-text" id="mmSignOut">Sign out</button></div>
        <div>${codeTag}</div>
        <div class="mm-tour" id="mmTour"></div>
        <div class="mm-stats" id="mmStats"></div>
        <div id="mmReturn"></div>
        <div id="mmMain"></div>
      </div>`;
    }

    function wireHome() {
      el.querySelector('#mmSignOut').onclick = () => {
        if (inQueue() && !confirm('Stop looking for an opponent and sign out?')) return;
        stopHeartbeat();
        signOut(); state.me = null; watchMe(); build();
      };
      el.querySelector('#mmMain').onclick = ev => {
        const b = ev.target.closest('button');
        if (!b) return;
        if (b.dataset.act === 'find') find();
        if (b.dataset.act === 'cancel') cancel();
      };
    }

    const myRecord = () => {
      const list = Match.computeStandings({}, state.rooms);
      return (state.me && list.find(r => r.teamId === state.me.pid)) || { points: 0, wins: 0, draws: 0, losses: 0, played: 0, rank: 0 };
    };
    const inQueue = () => !!(state.me && state.lobby.queue && state.lobby.queue[state.me.pid]);
    const myOffer = () => {
      if (!state.me) return null;
      const pid = state.me.pid;
      let best = null;
      for (const [id, o] of Object.entries(state.lobby.offers || {})) {
        if (!o || (o.a !== pid && o.b !== pid)) continue;
        if (!best || (o.createdAt || 0) > (best.o.createdAt || 0)) best = { id, o };
      }
      return best;
    };
    // My game in progress, if any (players/<pid>/room, or any live room with my pid in a seat).
    const myLiveRoom = () => {
      if (!state.me) return null;
      const code = state.player && state.player.room;
      const r = code && state.rooms[code];
      if (r && PLAYING_ROOM.includes(r.status) && Match.seatOfPid(r, state.me.pid)) return r;
      return Object.values(state.rooms).find(x => PLAYING_ROOM.includes(x.status) && Match.seatOfPid(x, state.me.pid)) || null;
    };

    function canFind() {
      const t = tourState(state.tour, Store.serverNow());
      if (!t.open) return t.text;
      if (myLiveRoom()) return 'Finish your game in progress first.';
      return '';
    }

    function stopHeartbeat() { if (state.heartbeat) { clearInterval(state.heartbeat); state.heartbeat = null; } }
    function joinQueue() {
      const me = state.me;
      if (!me) return Promise.resolve();
      const rec = myRecord();
      const entry = { pid: me.pid, name: me.name, agency: me.agency, clientId: Store.clientId(), pts: rec.points, lastOpp: (state.player && state.player.lastOpp) || '' };
      const ids = { offerId: 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), roomCode: Match.generateRoomCode() };
      return Store.mutateLobby(raw => (canFind() ? null : Match.lobbyJoin(raw, entry, Store.serverNow(), ids)));
    }
    async function find() {
      const why = canFind();
      if (why) return UI.toast(why, 'error');
      Store.queueOnDisconnect(state.me.pid, true);
      state.queueStart = performance.now();
      await joinQueue();
      Sound.play && Sound.play('place');
      startHeartbeat();
    }
    function startHeartbeat() {
      stopHeartbeat();
      // Keeps my queue entry fresh and retries pairing (a recent opponent becomes allowed after a while).
      state.heartbeat = setInterval(() => { if (inQueue()) joinQueue(); }, 10000);
    }
    async function cancel() {
      stopHeartbeat();
      state.queueStart = null;
      await Store.mutateLobby(raw => Match.lobbyLeave(raw, state.me.pid));
      Store.queueOnDisconnect(state.me.pid, false);
    }

    function onLobby() {
      const mo = myOffer();
      if (!mo) return;
      const { id, o } = mo;
      const pid = state.me.pid;
      if (o.status === 'pending' && !state.offerStart[id]) {
        // a stopwatch on this device (never the device clocks), from when the offer first showed here
        state.offerStart[id] = performance.now();
        Sound.play && Sound.play('turn');
        if (Sound.buzz) Sound.buzz();
      }
      if (o.status === 'accepted') startGame(id, o);
      if ((o.status === 'declined' || o.status === 'expired') && !state.seenOffer[id]) {
        state.seenOffer[id] = true;
        const fresh = Store.serverNow() - (o.createdAt || 0) < 60000;
        if (!fresh || !state.offerStart[id]) return; // an old one from before this page opened
        const iAccepted = o.acc && o.acc[pid];
        if (o.status === 'declined') UI.toast(o.by === pid ? 'You declined. Tap Find opponent when you are ready.' : 'Your opponent declined. Looking for another opponent…', o.by === pid ? '' : 'ok');
        else UI.toast(iAccepted ? 'Your opponent did not accept in time. Looking again…' : 'You did not accept in time. Tap Find opponent when you are ready.', iAccepted ? 'ok' : 'error');
        if (inQueue()) startHeartbeat(); else stopHeartbeat();
      }
    }

    async function startGame(id, o) {
      if (state.handled[id] || state.starting === id) return;
      state.starting = id;
      try {
        const pid = state.me.pid;
        const code = o.room;
        const existing = await Store.getRoom(code);
        if (existing && (existing.status === 'final' || existing.status === 'void')) { state.handled[id] = true; return; } // an old offer
        stopHeartbeat();
        const a = o.players[o.a], b = o.players[o.b];
        const mins = Number(state.settings.matchMin || (state.tour && state.tour.matchMin)) || 10;
        if (!existing) {
          await Store.createMatchRoom(code, () => Match.createMatchRoom({ code, a, b, matchLengthSec: Math.round(mins * 60), now: Store.serverNow(), offerId: id }));
        }
        const seat = o.a === pid ? 'A' : 'B';
        Store.local.set(seatKey(code), seat);
        Store.queueOnDisconnect(pid, false);
        await Store.updatePlayer(pid, { room: code, lastOpp: seat === 'A' ? o.b : o.a });
        state.handled[id] = true;
        App.go('room=' + code);
      } catch (e) {
        console.error(e);
        UI.toast('Could not start the game. Trying again…', 'error');
      } finally {
        if (state.starting === id) state.starting = null;
      }
    }

    function respond(id, yes) {
      const pid = state.me.pid;
      if (yes) Store.mutateLobby(raw => Match.lobbyAccept(raw, id, pid));
      else { stopHeartbeat(); Store.queueOnDisconnect(pid, false); Store.mutateLobby(raw => Match.lobbyDecline(raw, id, pid, Store.serverNow())); }
    }

    // ----- refresh (watchers) and tick (countdowns) -----
    function refresh() {
      if (!state.built) return;
      const now = Store.serverNow();
      const t = tourState(state.tour, now);
      const tourEl = el.querySelector('#mmTour');
      if (tourEl) {
        tourEl.dataset.kind = t.kind;
        tourEl.innerHTML = t.open ? `🟢 Tournament ends in <b id="mmTourLeft">${hms(t.left)}</b>` : esc(t.text);
      }
      if (state.built === 'signin') {
        const hint = el.querySelector('#acHint');
        if (hint) hint.textContent = state.settings.requireCode ? 'Required. Individual codes are for one player; a shared code is used by everyone.'
          : 'Individual codes are for one player; a shared code is used by everyone.';
        const code = el.querySelector('#acCode');
        if (code) code.placeholder = state.settings.requireCode ? 'ABCD-EF23' : 'ABCD-EF23 (optional)';
      }
      renderLiveList();
      if (state.built !== 'home' || !state.me) return;

      const rec = myRecord();
      const stats = el.querySelector('#mmStats');
      const sHtml = `<div><b>${rec.points}</b><span>Points</span></div><div><b>${rec.wins}</b><span>Won</span></div><div><b>${rec.draws}</b><span>Drawn</span></div><div><b>${rec.losses}</b><span>Lost</span></div>`;
      if (stats.innerHTML !== sHtml) stats.innerHTML = sHtml;

      const live = myLiveRoom();
      const ret = el.querySelector('#mmReturn');
      const rHtml = live ? `<div class="mm-return"><span>▶ Your game is in progress.</span><a class="btn-go small" href="#room=${esc(live.code)}" style="text-decoration:none;padding:6px 12px;border-radius:8px;">Return to game</a></div>` : '';
      if (ret.innerHTML !== rHtml) ret.innerHTML = rHtml;

      const main = el.querySelector('#mmMain');
      const why = canFind();
      let mHtml;
      if (inQueue()) {
        if (state.queueStart === null) state.queueStart = performance.now();
        if (!state.heartbeat) startHeartbeat();
        mHtml = `<div class="mm-search"><div class="mm-radar" aria-hidden="true">🔍</div>
          <b>Looking for an opponent…</b><span class="muted small-text">Waiting <span id="mmWait">0:00</span> · paired by points, never the same opponent twice in a row</span>
          <button class="btn-secondary" data-act="cancel">Cancel</button></div>`;
      } else {
        state.queueStart = null;
        mHtml = `<button class="btn-go mm-find" data-act="find" ${why ? 'disabled' : ''}>🔍 Find opponent</button>
          ${why ? `<p class="muted small-text center" style="margin:0;">${esc(why)}</p>` : '<p class="muted small-text center" style="margin:0;">You will have 10 seconds to accept when an opponent is found.</p>'}`;
      }
      if (main.dataset.html !== mHtml) { main.innerHTML = mHtml; main.dataset.html = mHtml; }
      // the tournament ended (or a game started elsewhere) while queued: leave the queue
      if (inQueue() && why) cancel();
      renderOffer();
    }

    function renderLiveList() {
      const box = el.querySelector('#mmLive');
      if (!box) return;
      const live = Object.values(state.rooms).filter(r => PLAYING_ROOM.includes(r.status))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 12);
      const html = live.length ? live.map(r => {
        const sc = r.game ? r.game.scores : {};
        const names = seatsOf(r).map(s => esc(short(r.seats[s] ? r.seats[s].name : Match.teamNameOf(r, s)))).join(' vs ');
        return `<a href="#room=${esc(r.code)}"><span>${names}</span><span>${seatsOf(r).map(s => sc[s] || 0).join('–')} · 👁️ Watch</span></a>`;
      }).join('') : '<p class="muted small-text" style="margin:0;">No games being played right now.</p>';
      if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; }
    }

    function renderOffer() {
      const box = el.querySelector('#mmOverlay');
      if (!box) return;
      const mo = myOffer();
      const pid = state.me && state.me.pid;
      if (!mo || !['pending', 'accepted'].includes(mo.o.status) || state.handled[mo.id] || !state.offerStart[mo.id]) {
        if (box.innerHTML) box.innerHTML = '';
        return;
      }
      const { id, o } = mo;
      const opp = o.players[o.a === pid ? o.b : o.a] || {};
      const mine = o.players[pid] || {};
      const accepted = o.acc && o.acc[pid];
      const key = id + ':' + o.status + ':' + !!accepted;
      if (box.dataset.key === key && box.innerHTML) return;
      box.dataset.key = key;
      const body = o.status === 'accepted' ? '<b>✓ Both accepted. Starting your game…</b>'
        : accepted ? '<b>✓ Accepted. Waiting for your opponent…</b>'
          : `<div class="mm-btns"><button class="btn-secondary" data-offer="no">Decline</button><button class="btn-go" data-offer="yes">✓ Accept</button></div>`;
      box.innerHTML = `<div class="mm-overlay"><div class="mm-modal" role="dialog" aria-modal="true" aria-labelledby="mmOfferTitle">
        <h3 id="mmOfferTitle" style="margin:0;">🎯 Opponent found!</h3>
        <div class="mm-vs"><div><b title="${esc(mine.name || '')}">${esc(short(mine.name || 'You'))}</b><small>${esc(mine.agency || '')}</small></div><i>VS</i>
          <div><b title="${esc(opp.name || '')}">${esc(short(opp.name || '?'))}</b><small>${esc(opp.agency || '')}</small></div></div>
        ${o.status === 'accepted' ? '' : '<div class="mm-bar"><i id="mmOfferBar" style="width:100%"></i></div><div class="small-text muted"><span id="mmOfferLeft">10</span> s to accept</div>'}
        ${body}</div></div>`;
      box.onclick = ev => {
        const b = ev.target.closest('[data-offer]');
        if (!b) return;
        b.disabled = true;
        respond(id, b.dataset.offer === 'yes');
      };
      const yes = box.querySelector('[data-offer="yes"]');
      if (yes) yes.focus({ preventScroll: true });
    }

    function tick() {
      const now = Store.serverNow();
      const left = el.querySelector('#mmTourLeft');
      const t = tourState(state.tour, now);
      if (left) { if (t.open) left.textContent = hms(t.left); else refresh(); }
      const wait = el.querySelector('#mmWait');
      if (wait && state.queueStart !== null) wait.textContent = hms(performance.now() - state.queueStart);
      const mo = myOffer();
      if (mo && mo.o.status === 'pending' && state.offerStart[mo.id]) {
        const el2 = performance.now() - state.offerStart[mo.id];
        const ms = Math.max(0, Match.OFFER_MS - el2);
        const bar = el.querySelector('#mmOfferBar'), sec = el.querySelector('#mmOfferLeft');
        if (bar) bar.style.width = (ms / Match.OFFER_MS * 100) + '%';
        if (sec) sec.textContent = String(Math.ceil(ms / 1000));
        // after the window (+1.5 s grace for the other device), either device closes the offer
        if (el2 > Match.OFFER_MS + 1500 && RoomRetry.due(state.expiring, mo.id)) {
          const id = mo.id;
          Store.mutateLobby(raw => Match.lobbyExpire(raw, id, Store.serverNow()));
        }
      }
      if (mo && mo.o.status === 'accepted' && !state.handled[mo.id] && RoomRetry.due(state.expiring, 'start:' + mo.id)) startGame(mo.id, mo.o);
    }

    watchMe();
    build();
    App.onTick(tick);
    return () => {
      offSub();
      meSubs.forEach(f => f());
      stopHeartbeat();
      if (standings) standings.off();
      state.built = null;
    };
  }

  // Checks the access code and registers (or signs in again) the player. Returns { player, note } or { error }.
  async function registerPlayer(codeRaw, nameRaw, agencyRaw, settings) {
    let name = cleanText(nameRaw, 40), agency = cleanText(agencyRaw, 60);
    const code = Match.normalizeAccessCode(codeRaw);
    let pid, codeType, note = '';
    if (code) {
      if (code.length !== Match.ACCESS_CODE_LEN) return { error: 'Access codes have 8 characters, like ABCD-EF23.' };
      const rec = await Store.getAccessCode(code);
      if (!rec) return { error: 'That access code was not found. Check it with your host.' };
      if (rec.revoked) return { error: 'That access code has been disabled by the host.' };
      if (rec.type === 'individual') {
        if (!rec.pid && (!name || !agency)) return { error: 'Enter your name and your agency / office / department / region.' };
        const c = await Store.claimIndividualCode(code, name, agency);
        if (!c || !c.pid) return { error: 'Could not use that code. Ask your host for help.' };
        if (rec.pid && (c.name !== name || c.agency !== agency) && name) note = `Signed in as ${c.name}: this code belongs to them.`;
        pid = c.pid; name = c.name; agency = c.agency; codeType = 'individual';
      } else {
        if (!name || !agency) return { error: 'Enter your name and your agency / office / department / region.' };
        pid = 's_' + Match.playerKey(code, name, agency); codeType = 'shared';
      }
    } else {
      if (settings.requireCode) return { error: 'Enter the access code from your host.' };
      if (!name || !agency) return { error: 'Enter your name and your agency / office / department / region.' };
      pid = 'g_' + Match.playerKey('', name, agency); codeType = 'none';
    }
    const existing = await Store.getPlayer(pid);
    if (existing && existing.kicked) return { error: 'You were removed from the tournament by the host' + (existing.kickReason ? ` (${existing.kickReason})` : '') + '.' };
    if (!existing && settings.lockRegistration) return { error: 'Registration is closed. Players who already joined can still sign in.' };
    const now = Store.serverNow();
    await Store.updatePlayer(pid, { name, agency, code: code || null, codeType, joinedAt: (existing && existing.joinedAt) || now, lastSeen: now });
    return { player: { pid, name, agency, code: code || '', codeType }, note };
  }

  // ---------- room view ----------

  function show(el, code) {
    const me = Store.clientId();
    const state = {
      code,
      room: undefined,
      rawRoom: undefined,
      teams: {},
      mySeat: Store.local.get(seatKey(code)), // 'A' | 'B' | 'C' | 'D' | 'watch' | null
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
      return Match.teamNameOf(room, seat);
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
      const player = session();
      if (player) keepPresence(player.pid);
      // The signed-in player's own seat follows them to a new device (same access code).
      const pidSeat = player ? Match.seatOfPid(room, player.pid) : null;
      if (room.status === 'final' || room.status === 'void') {
        if (pidSeat && !isSeatCode(s)) { state.mySeat = pidSeat; Store.local.set(seatKey(code), pidSeat); }
        return; // read-only result
      }
      if (isSeatCode(s) || pidSeat) {
        const seat = isSeatCode(s) ? s : pidSeat;
        let res = await Store.mutateRoom(code, r => Match.rejoinSeat(r, seat, me));
        if (!res.committed && pidSeat) res = await Store.mutateRoom(code, r => Match.reclaimSeat(r, pidSeat, player.pid, me));
        if (res.committed) {
          const got = res.committed && Match.seatOfPid(res.room, player && player.pid) || seat;
          state.mySeat = got; Store.local.set(seatKey(code), got); setRole(got);
        } else { forgetSeat(); watchMode(); }
      } else if (App.isHost()) {
        setRole('host');
      } else {
        watchMode(); // everyone else watches (no seat picking: games are made by matchmaking)
      }
    }
    function watchMode() {
      if (App.isHost()) { setRole('host'); return; }
      state.mySeat = 'watch';
      setRole('watch');
    }

    function onRoom(raw) {
      state.rawRoom = raw;
      const room = raw ? Object.assign(raw, { code }) : raw;
      const first = !state.loaded;
      state.loaded = true;
      state.room = room;
      // The room is gone (deleted or reset): stop marking presence in it, which also removes a
      // presence-only ghost this device may have written from a stale copy on a reconnect.
      if (room === null) setRole(null);

      // Seat taken away by the host?
      const s = state.mySeat;
      if (!first && room && isSeatCode(s) && room.status !== 'final' && room.status !== 'void') {
        const seat = room.seats[s];
        if (!seat || seat.clientId !== me) { forgetSeat('Your game continued on another device.'); watchMode(); }
      }
      if (first) firstLoad(room).then(render); else render();
    }

    // ----- renderers -----

    function render() {
      const room = state.room;
      App.inLiveSeat = false; // set again by the live view's update() while I'm seated in a live game
      // music only on the live match screen (the lobby, choices, results and "not found" are quiet)
      const watchingLive = !!room && ['live', 'suddenDeath', 'hostDecision'].includes(room.status) &&
        (isSeatCode(state.mySeat) || state.mySeat === 'watch' || App.isHost());
      if (!watchingLive) Music.stop();
      document.body.classList.remove('in-game'); // RoomLive.renderLive / renderFinal put it back

      if (room === null) {
        el.innerHTML = `<div class="card narrow"><h2>Room not found</h2>
          <p class="muted">No room with code <span class="code">${esc(Match.formatCode(code))}</span>. Check the code with your host.</p>
          <a href="#">← Back to start</a></div>`;
        return;
      }
      if (!room) { el.innerHTML = '<div class="card narrow"><p class="muted">Loading room…</p></div>'; return; }

      const seated = Match.isSeat(room, state.mySeat);
      const host = App.isHost();
      if (!seated && state.mySeat !== 'watch' && !host && room.status !== 'final' && room.status !== 'void') watchMode();
      if (room.status === 'waiting') return renderLobby(room);
      if (room.status === 'final' || room.status === 'void') return RoomLive.renderFinal(el, room, ctx);
      return RoomLive.renderLive(el, room, ctx);
    }

    // Spectators leave by going back to the start page (there are no seats to take).
    function stopWatching() {
      Store.local.remove(seatKey(code));
      App.go('');
    }

    function renderLobby(room) {
      const host = App.isHost();
      const hostOnline = Object.values(room.presence).includes('host');
      // a seat tile: seat number + team on its own line (a player's name never squeezes it), the player or
      // "Waiting for player…", the online dot and Ready; YOU on your own seat; Remove for the host
      const seatTile = seat => {
        const s = room.seats[seat];
        const you = state.mySeat === seat ? '<span class="lb-you">YOU</span>' : '';
        if (!s) return `<div class="lb-seat empty" data-seat-row="${seat}">${seatTop(room, seat)}<span class="lb-name empty"><span class="lb-txt">Waiting for player…</span></span></div>`;
        const online = Match.isSeatOnline(room, seat);
        return `<div class="lb-seat taken${s.ready ? ' ready' : ''}${you ? ' me' : ''}" data-seat-row="${seat}">${you}${seatTop(room, seat)}
          <span class="lb-name"><span class="dot ${online ? 'on' : ''}" title="${online ? 'Connected' : 'Offline'}"></span><b class="seat-name" title="${esc(s.name)}">${esc(short(s.name))}</b></span>
          <span class="lb-tags"><span class="rc-tag ${s.ready ? 'ok' : 'off'}">${s.ready ? '✓ Ready' : 'Not ready'}</span>${online ? '' : '<span class="rc-tag off">📴 Offline</span>'}</span>
          ${host ? `<button type="button" class="lb-remove" data-remove="${seat}">Remove</button>` : ''}</div>`;
      };
      const SEATS = seatsOf(room);
      const mine = Match.isSeat(room, state.mySeat) ? room.seats[state.mySeat] : null;
      const bothReady = SEATS.every(s => room.seats[s] && room.seats[s].ready);
      const who = multi(room) ? 'all players' : 'both players';
      const nReady = SEATS.filter(s => room.seats[s] && room.seats[s].ready).length;
      const open = SEATS.filter(s => !room.seats[s]).length;
      const badge = bothReady ? '<span class="badge live">✓ All ready</span>' : '<span class="badge waiting">🕒 Waiting</span>';
      const firstPick = multi(room) ? 'The roulette picks who goes first.' : 'The coin toss picks who goes first.';
      const note = host ? (bothReady ? `${multi(room) ? 'All players are ready.' : 'Both players are ready.'} ${firstPick}` : `Start unlocks when ${who} are ready.`)
        : mine ? (bothReady ? 'Everyone is ready. Waiting for the host to start the match…' : `The host starts the match when ${who} are ready.`)
        : '👁️ Waiting for the host to start the match…';
      el.innerHTML = `
        <div class="card narrow stack lobby-card">
          ${lobbyHead(room, badge, code)}
          <div class="lb-seats">${SEATS.map(seatTile).join('')}</div>
          <div class="lb-prog"><div class="lb-prog-row"><b>${nReady} of ${SEATS.length} ready</b><span>${open ? `${open} seat${open > 1 ? 's' : ''} open` : 'all seats taken'}</span></div>
            <div class="lb-bar" role="progressbar" aria-label="Players ready" aria-valuemin="0" aria-valuemax="${SEATS.length}" aria-valuenow="${nReady}"><i style="width:${Math.round(nReady / SEATS.length * 100)}%"></i></div></div>
          ${mine ? `<button id="readyBtn" class="${mine.ready ? 'btn-secondary' : 'btn-go'}">${mine.ready ? 'Not ready' : "✓ I'm ready"}</button>` : ''}
          ${host ? `<button id="startBtn" class="btn-primary" ${bothReady ? '' : 'disabled'}>▶ Start match</button>` : ''}
          <p class="small-text muted center lb-note">${note}</p>
          <div class="lb-foot">
            <span class="small-text"><span class="dot ${hostOnline ? 'on' : ''}"></span>⚙ Host · <span id="watchCount">👁️ ${Match.watcherCount(room)} watching</span></span>
            <span class="lb-links">
              <a href="#" class="small-text">← Back to start</a>
              ${mine ? '<button class="link small-text" id="leaveSeat">Leave seat</button>' : ''}
              ${state.mySeat === 'watch' ? '<button class="link small-text" id="stopWatching">Stop watching</button>' : ''}
            </span>
          </div>
        </div>`;

      const $ = s => el.querySelector(s);
      if ($('#readyBtn')) $('#readyBtn').onclick = () =>
        Store.mutateRoom(code, r => Match.setReady(r, state.mySeat, me, !mine.ready));
      if ($('#startBtn')) $('#startBtn').onclick = async () => {
        $('#startBtn').disabled = true;
        const res = await Store.mutateRoom(code, r => Match.startMatch(r, Store.serverNow(), Math.random, Match.introMsFor(r)));
        if (!res.committed) UI.toast(`Could not start: ${multi(room) ? 'all' : 'both'} players must be ready.`, 'error');
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
      if (!document.hidden || !room || !Match.isSeat(room, seat)) return;
      if (room.status !== 'live' && room.status !== 'suddenDeath') return;
      Store.mutateRoom(code, r => Match.recordScreenLeave(r, seat));
    };
    document.addEventListener('visibilitychange', onVisibility);

    render(); // "Loading room…" right away instead of the previous view
    const unsubTeams = () => {}; // players are named in the room itself (no team renames)
    const unsub = Store.watchRoom(code, onRoom);
    const unsubPinned = Store.watchPinned(p => { state.pinned = p; render(); });
    return () => {
      App.inLiveSeat = false;
      Music.stop(); // leaving the room
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

  // As shown in the live view (score bar, last move, host bar): at most Names.MAX characters + "…".
  const teamOf = (room, seat) => short(Match.teamNameOf(room, seat));
  const playerOf = (room, seat) => short(room.seats[seat] ? room.seats[seat].name : Match.teamNameOf(room, seat));
  const isSeat = s => isSeatCode(s);
  // 3-4 player rooms: a seat that resigned ('left') or dropped out of sudden death ('sd').
  const outOf = (room, seat) => (room.game && room.game.out && room.game.out[seat]) || null;

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
    const words = lm.words.map(w => esc(ScrabbleEngine.shownWord(w))).join(', '); // "VERIFY", "STOP/POTS"
    return `${who} played ${words} (${lm.total})${lm.unverified ? ' · <span class="muted">unverified</span>' : ''}`;
  }

  // Removes the document/window listeners added by buildLive (⋯ menu, board fit).
  function detachLive(ui) {
    if (ui.onDocClick) document.removeEventListener('click', ui.onDocClick);
    if (ui.onResize) window.removeEventListener('resize', ui.onResize);
    if (ui.onKey) document.removeEventListener('keydown', ui.onKey);
    if (ui.onTauntKey) document.removeEventListener('keydown', ui.onTauntKey);
    if (ui.dragApi) ui.dragApi.detach();
    ui.onDocClick = null;
    ui.onResize = null;
    ui.onKey = null;
    ui.onTauntKey = null;
    ui.dragApi = null;
    ui.drag = null;
  }

  function buildLive(el, ctx) {
    detachLive(ctx.state.ui);
    // Phone-first order: score bar, turn pill, one-line caption, board, rack, actions.
    // The pieces around the board sit in .live-panel and the board follows it, so the page reads
    // score bar first (screen readers). On phones the panel is display: contents and CSS order gives
    // the phone column; in the desktop landscape layout (Layout.QUERY) the grid puts the board on
    // the left and the panel on the right.
    // Temporary boxes (#noticeBox, #rejectBox) are fixed bottom sheets so they never push the board.
    // 2 players: A | clock | B (as before). 3-4 players (mockup B): the clock on top, then one column
    // per seat in seat order; the turn highlight moves along the row.
    const liveRoom = ctx.state.room;
    const seats = liveRoom ? seatsOf(liveRoom) : ['A', 'B'];
    const scorebar = seats.length > 2
      ? `<div class="scorebar multi n${seats.length}">
          <div class="sb-top"><span class="sb-lbl">Match</span><div class="clock" id="matchClock">0:00</div></div>
          <div class="sb-row">${seats.map(s => `<div class="side" id="side${s}"></div>`).join('')}</div>
        </div>`
      : `<div class="scorebar">
          <div class="side" id="sideA"></div>
          <div class="clock" id="matchClock">0:00</div>
          <div class="side right" id="sideB"></div>
        </div>`;
    el.innerHTML = `
      <div class="card live-card"><div class="arena" id="liveRoot" data-seats="${seats.length}">
        <div class="live-panel" id="livePanel">
        ${scorebar}
        <div class="pill-row"><div class="pill pill-them" id="statusLine" role="status" aria-live="polite"><span class="pill-text"></span><span class="pill-clock" id="turnClock"></span></div></div>
        <div class="caption-row"><span class="caption-text"><span id="tossLine"></span><span id="lastMove"></span></span><button type="button" id="bonusBtn" class="caption-btn" aria-expanded="false" aria-controls="bonusCard">? Bonuses</button></div>
        <div class="rack-row"><span class="rack-bag" aria-hidden="true">👜</span><div class="rack hidden" id="rack"></div><button type="button" id="shuffleBtn" class="rack-shuffle hidden" aria-label="Shuffle tiles" title="Shuffle tiles">🔀</button></div>
        <div class="actions-row hidden" id="actions">
          <button id="playBtn" class="btn-primary">✅ Play word</button>
          <button id="recallBtn" class="secondary" aria-label="Recall">↩<span class="btn-label"> Recall</span></button>
          <button id="passBtn" class="secondary">⏭ Pass</button>
          <div class="taunt-wrap hidden" id="tauntWrap">
            <button id="tauntBtn" class="secondary taunt-btn" aria-label="Send a taunt" aria-haspopup="true" aria-expanded="false">😀<span class="taunt-cd hidden" id="tauntCd" aria-hidden="true"></span></button>
            <div class="taunt-pop hidden" id="tauntPop" role="menu" aria-label="Taunts"></div>
          </div>
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
          <button class="link small-text hidden" id="stopWatching">Stop watching</button></div>
        </div>
        <div id="board-container"></div>
        <div id="tauntLive" class="fx-sr" aria-live="polite"></div>
        <div id="noticeBox" class="sheet sheet-notice"></div>
        <div id="rejectBox" class="sheet sheet-reject"></div>
        <div class="bonus-backdrop hidden" id="bonusBackdrop"><div class="card bonus-card" id="bonusCard" role="dialog" aria-modal="true" aria-label="Bonus squares">
          <div class="bonus-head"><b>Bonus squares</b><button type="button" class="bonus-close" aria-label="Close">✕</button></div>
          ${UI.bonusHelpHtml()}</div></div>
      </div></div>`;
    el.querySelector('#stopWatching').onclick = () => ctx.stopWatching();
    const ui = ctx.state.ui;
    Object.assign(ui, { temp: [], selected: null, busy: false, rejected: null, seenMove: -1, tried: {}, pillKind: null, noticeHidden: null, sideHtml: {}, lastSeenMove: null, rackOrder: null, drag: null, dragMove: null, tauntSeen: null });
    const $ = s => el.querySelector(s);

    // ⋯ menu: Leave lives here so it can't be tapped by accident.
    // Element references, not lookups: Leave can swap in the final screen before this click bubbles.
    const menu = $('#moreMenu');
    const moreBtn = $('#moreBtn');
    const setMenu = open => { menu.classList.toggle('hidden', !open); moreBtn.setAttribute('aria-expanded', String(open)); };
    moreBtn.onclick = ev => { ev.stopPropagation(); if (ui.setTauntPop) ui.setTauntPop(false); setMenu(menu.classList.contains('hidden')); }; // one pop-up at a time
    menu.onclick = () => setMenu(false);
    // 😀 taunts (batch 5): the button opens the three faces; tapping one sends it (Match.taunt in a
    // transaction, which also enforces the 10 s cooldown) and closes the pop-up. Live only, no toast.
    const tauntPop = $('#tauntPop');
    const tauntBtn = $('#tauntBtn');
    for (const id of Taunt.IDS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'taunt-item';
      b.dataset.taunt = id;
      b.setAttribute('role', 'menuitem');
      b.setAttribute('aria-label', 'Send ' + Taunt.LABELS[id]);
      b.title = Taunt.LABELS[id];
      b.appendChild(Taunt.face(id));
      tauntPop.appendChild(b);
    }
    const setTaunt = open => { tauntPop.classList.toggle('hidden', !open); tauntBtn.setAttribute('aria-expanded', String(open)); };
    ui.setTauntPop = setTaunt;
    tauntBtn.onclick = ev => { ev.stopPropagation(); setMenu(false); if (!tauntBtn.disabled) setTaunt(tauntPop.classList.contains('hidden')); };
    tauntPop.onclick = ev => {
      ev.stopPropagation();
      const b = ev.target.closest && ev.target.closest('[data-taunt]');
      if (!b) return;
      setTaunt(false);
      const seat = ctx.state.mySeat, id = b.dataset.taunt;
      Store.mutateRoom(ctx.code, r => Match.taunt(r, seat, id, { now: Store.serverNow() }));
    };
    ui.onDocClick = ev => {
      if (!ev.target.closest || !ev.target.closest('.more-wrap')) setMenu(false);
      if (!ev.target.closest || !ev.target.closest('.taunt-wrap')) setTaunt(false);
    };
    document.addEventListener('click', ui.onDocClick);
    ui.onTauntKey = ev => { if (ev.key === 'Escape') setTaunt(false); };
    document.addEventListener('keydown', ui.onTauntKey);

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
        const up = t.classList.contains('selected') ? ' translateY(-5px)' : ''; // a selected tile stays lifted while it slides
        if (dx && t.animate) t.animate([{ transform: `translateX(${dx}px)${up}` }, { transform: up.trim() || 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    };

    // "? Bonuses" help card (feature #7). update() never touches it, so it stays open while the game moves on.
    const bonus = $('#bonusBackdrop');
    const bonusBtn = $('#bonusBtn');
    // A real dialog for keyboards: focus moves to ✕ on open, stays inside while open (Tab cycles),
    // and returns to "? Bonuses" on close (Escape, ✕ or the backdrop).
    const setBonus = open => {
      const wasOpen = !bonus.classList.contains('hidden');
      bonus.classList.toggle('hidden', !open); bonusBtn.setAttribute('aria-expanded', String(open));
      if (open && !wasOpen) bonus.querySelector('.bonus-close').focus({ preventScroll: true }); // never jumps the page
      if (!open && wasOpen) bonusBtn.focus({ preventScroll: true });
    };
    bonusBtn.onclick = () => setBonus(bonus.classList.contains('hidden'));
    bonus.onclick = ev => { if (!ev.target.closest('.bonus-card') || ev.target.closest('.bonus-close')) setBonus(false); };
    ui.onKey = ev => {
      if (bonus.classList.contains('hidden')) return;
      if (ev.key === 'Escape') return setBonus(false);
      if (ev.key !== 'Tab') return;
      const items = [...bonus.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')].filter(e => !e.disabled);
      if (!items.length) return;
      const i = items.indexOf(document.activeElement), last = items.length - 1;
      ev.preventDefault(); // focus never leaves the open card
      items[ev.shiftKey ? (i <= 0 ? last : i - 1) : (i === -1 || i === last ? 0 : i + 1)].focus();
    };
    document.addEventListener('keydown', ui.onKey);

    // Drag-and-drop tiles (feature #5), mouse and touch; tap-to-place keeps working.
    ui.dragApi = Drag.attach($('#liveRoot'), dragHooks(el, ctx)); // { detach, refresh }

    // Test hook for the browser checks, in the playground only (never on the real tournament data).
    if (/_playground$/.test(Store.ROOT)) root.__room = { ui };

    $('#passBtn').onclick = async () => {
      const room = ctx.state.room;
      if (!myTurn(room, ctx) || !confirm('Pass your turn?')) return;
      const seat = ctx.state.mySeat;
      const res = await Store.mutateRoom(ctx.code, r => Match.applyPass(r, seat, { now: Store.serverNow(), expectedMoveCount: room.game.moveCount }));
      if (!res.committed) UI.toast('Could not pass (the game state changed).', 'error');
    };

    $('#resignBtn').onclick = async () => {
      const seat = ctx.state.mySeat;
      const room = ctx.state.room;
      // 3-4 player rooms: not during the 3/4-WAY intro, so the roulette's "<TEAM> GOES FIRST!" stays true
      if (multi(room) && room.clock && Store.serverNow() < room.clock.startedAt) {
        UI.toast('You can leave once the game has started.', 'error');
        return;
      }
      const msg = multi(room) && Match.activeSeats(room).length > 2
        ? `Leave the game? Your team (${teamOf(room, seat)}) loses; the others play on.`
        : `Leave the game? Your team (${teamOf(room, seat)}) loses this match.`;
      if (!isSeat(seat) || !confirm(msg)) return;
      await Store.mutateRoom(ctx.code, r => Match.resign(r, seat, Store.serverNow()));
    };

    $('#playBtn').onclick = async () => {
      const room = ctx.state.room;
      const seat = ctx.state.mySeat;
      // never mid-drag (the dragged tile is not placed yet), nor in the 0.5 s after a drag ends or is cut short
      if (!myTurn(room, ctx) || ui.busy || ui.drag || performance.now() - (ui.dragEndedAt || -1e9) < 500) return;
      const placements = ui.temp.map(t => ({ r: t.r, c: t.c, letter: t.letter }));
      const m = Match.prepareMove(room, seat, placements);
      if (!m.ok) return UI.toast(ScrabbleEngine.ERROR_TEXT[m.error] || 'Invalid move.', 'error');
      const expectedMoveCount = room.game.moveCount;
      ui.busy = true; $('#playBtn').textContent = '🔍 Checking…'; update(el, room, ctx);
      try {
        // Vertical words are checked both ways (top to bottom, bottom to top); spellings = what to show.
        const check = await Dictionary.checkPlay(m.words);
        if (check.rejected.length) {
          if (Sound.buzz) Sound.buzz();
          const words = m.words.map(w => ({ word: w.word, score: w.score })); // the appeal stores no back
          ui.rejected = { placements, words, rejectedWords: check.rejected, total: m.total, expectedMoveCount };
          return;
        }
        // Turn moments #3: which rack tiles this play uses, recorded before the write; the room update
        // (local first) may arrive before mutateRoom resolves, and the refill needs it.
        ui.lastUsed = ui.temp.map(t => t.rackIndex);
        ui.lastRack = room.game.racks[seat].slice();
        const res = await Store.mutateRoom(ctx.code, r => Match.applyPlay(r, seat, placements, { now: Store.serverNow(), expectedMoveCount, unverified: check.unverified, spellings: check.spellings }));
        if (res.committed) { ui.temp = []; ui.selected = null; Sound.play('accept'); }
        else { UI.toast('Move not accepted (time up or the game changed).', 'error'); ui.temp = []; ui.lastUsed = null; ui.lastRack = null; }
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
      if (b.dataset.act === 'fix') { ui.rejected = null; return update(el, ctx.state.room, ctx); } // keep the tiles on the board to change them
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

  // ---- drag-and-drop (feature #5): what may be dragged, and what a drop does ----
  // The drag lives in ui.drag ({kind:'rack', index} | {kind:'board', r, c}); while it is set,
  // update() shows the dragged tile's rack slot empty / leaves it off the board.
  function dragHooks(el, ctx) {
    const ui = ctx.state.ui;
    const room = () => ctx.state.room;
    const locked = () => ui.busy || !!ui.rejected;
    return {
      source(t) {
        if (!isSeat(ctx.state.mySeat) || !t || !t.closest || !room() || !room().game) return null;
        const rt = t.closest('#rack .tile');
        if (rt && !rt.classList.contains('used')) return { kind: 'rack', index: Number(rt.dataset.i) };
        const bt = t.closest('#board-container .tile.temp');
        if (bt && myTurn(room(), ctx) && !locked()) {
          const sq = bt.closest('.sq');
          return { kind: 'board', r: Number(sq.dataset.r), c: Number(sq.dataset.c) };
        }
        return null;
      },
      context() {
        const rm = room();
        const board = rm && rm.game ? rm.game.board : {};
        return {
          myTurn: !!(rm && rm.game) && myTurn(rm, ctx),
          locked: locked(),
          occupied: (r, c) => !!board[ScrabbleEngine.key(r, c)] || ui.temp.some(t => t.r === r && t.c === c)
        };
      },
      start(from) {
        ui.drag = from;
        ui.dragMove = room().game.moveCount;
        ui.selected = null;
        update(el, room(), ctx);
      },
      // Where the floating tile flies back to: a placed tile dropped somewhere invalid stays on its own
      // square, so it goes there; a rack tile, or a placed tile taken back, goes to its rack slot.
      returnRect(from, action) {
        if (from.kind === 'board' && action && action.type === 'return') {
          const s = el.querySelector(`#board-container .sq[data-r="${from.r}"][data-c="${from.c}"]`);
          return s ? s.getBoundingClientRect() : null;
        }
        const idx = from.kind === 'rack' ? from.index : (ui.temp.find(t => t.r === from.r && t.c === from.c) || {}).rackIndex;
        const t = idx === undefined ? null : el.querySelector(`#rack .tile[data-i="${idx}"]`);
        return t ? t.getBoundingClientRect() : null;
      },
      finish(action) {
        ui.dragEndedAt = performance.now(); // Play waits a moment after any drag ends (a second finger can cut one short)
        const rm = room();
        // A move landed while dragging: the rack and board it was based on are gone, so it only returns.
        const stale = !rm || !rm.game || rm.game.moveCount !== ui.dragMove;
        ui.drag = null;
        applyDrag(el, ctx, stale && action.type !== 'reorder' ? { type: 'return' } : action);
      }
    };
  }

  function applyDrag(el, ctx, a) {
    const ui = ctx.state.ui;
    const room = ctx.state.room;
    if (!room || !room.game || !el.querySelector('#liveRoot')) return;
    let landed = null;
    if (a.type === 'place') {
      const letter = room.game.racks[ctx.state.mySeat][a.index];
      if (letter !== undefined && !ui.temp.some(t => t.rackIndex === a.index)) {
        ui.temp.push({ r: a.r, c: a.c, letter, rackIndex: a.index });
        ui.selected = null;
        landed = a;
      }
    } else if (a.type === 'move') {
      const t = ui.temp.find(x => x.r === a.from.r && x.c === a.from.c);
      if (t) { t.r = a.r; t.c = a.c; landed = a; }
    } else if (a.type === 'unplace') {
      ui.temp = ui.temp.filter(t => !(t.r === a.r && t.c === a.c));
    } else if (a.type === 'reorder' && ui.rackOrder) {
      const fromPos = ui.rackOrder.order.indexOf(a.index);
      if (fromPos !== -1) ui.rackOrder = { key: ui.rackOrder.key, order: Rack.move(ui.rackOrder.order, fromPos, a.pos) };
    }
    if (landed) Sound.play('place');
    update(el, ctx.state.room, ctx);
    if (landed && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      const t = el.querySelector(`#board-container .sq[data-r="${landed.r}"][data-c="${landed.c}"] .tile`);
      if (t) t.classList.add('drop-in');
    }
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

    for (const s of seatsOf(room)) {
      const side = $('#side' + s);
      if (!side) continue;
      const o = outOf(room, s);
      side.classList.toggle('turn', g.turn === s && PLAYING.includes(room.status));
      side.classList.toggle('out', !!o);
      const tag = o ? `<span class="sb-out">${o === 'left' ? 'LEFT' : 'OUT'}</span>` : '';
      const agency = room['agency' + s] || (room.seats[s] && room.seats[s].agency) || '';
      const html = `<span class="chip chip-${s.toLowerCase()} team" title="${esc(agency || Match.teamNameOf(room, s))}">${esc(agency ? short(agency) : teamOf(room, s))}</span>
        <div class="who"><span class="player" title="${esc(room.seats[s] ? room.seats[s].name : Match.teamNameOf(room, s))}">${esc(playerOf(room, s))}${seat === s ? ' (you)' : ''}</span><span class="score disp">${g.scores[s]}</span></div>${tag}`;
      // Rewrite only on change: a celebration holds the old score in this element until its points land.
      if (ui.sideHtml[s] !== html) { side.innerHTML = html; ui.sideHtml[s] = html; }
    }

    const mine = myTurn(room, ctx);
    const lifted = ui.drag && ui.drag.kind === 'board' ? ui.drag : null; // the placed tile being dragged
    UI.renderBoard($('#board-container'), g.board, {
      temp: mine ? ui.temp.filter(t => !(lifted && t.r === lifted.r && t.c === lifted.c)) : [],
      pending: g.pending ? g.pending.placements : null,
      onSquare: (r, c) => onSquare(el, ctx, r, c)
    });
    decorateDrop(el, ctx); // an opponent's word still dropping in keeps animating across redraws

    const rackEl = $('#rack');
    const shuffleBtn = $('#shuffleBtn');
    const iAmOut = isSeat(seat) && !!outOf(room, seat); // 3-4 player rooms: out, watching the rest
    const hasRack = isSeat(seat) && !iAmOut;
    rackEl.classList.toggle('hidden', !hasRack);
    shuffleBtn.classList.toggle('hidden', !hasRack);
    $('.rack-row').classList.toggle('hidden', !hasRack); // no empty row (and gap) for spectators / the host
    if (hasRack) {
      // This device's tile order (Shuffle). After my own play (turn moments #3) the tiles I kept stay
      // where they were and the drawn ones go into the used slots; any other change resets the order.
      const rackNow = g.racks[seat];
      // My appeal was turned down (the pending word is gone and my rack is unchanged): forget the play notes.
      if (g.pending && g.pending.seat === seat) ui.sawMyAppeal = true;
      else if (ui.sawMyAppeal) {
        ui.sawMyAppeal = false;
        if (ui.lastRack && rackNow.join(',') === ui.lastRack.join(',')) { ui.lastUsed = null; ui.lastRack = null; }
      }
      if (ui.rackOrder && ui.lastUsed && ui.lastRack && ui.rackOrder.key !== rackNow.join(',')) {
        const refilled = Rack.refill(ui.rackOrder, ui.lastRack, rackNow, ui.lastUsed);
        if (refilled) {
          ui.rackOrder = refilled;
          if (refilled.fresh.length) ui.refill = { fresh: refilled.fresh, at: performance.now(), started: false, key: rackNow.join(',') };
        }
        ui.lastUsed = null; ui.lastRack = null;
      }
      ui.rackOrder = Rack.sync(ui.rackOrder, rackNow);
      const used = mine ? ui.temp.map(t => t.rackIndex) : [];
      if (ui.drag && ui.drag.kind === 'rack') used.push(ui.drag.index); // its slot stays empty while dragged
      UI.renderRack(rackEl, g.racks[seat], {
        selectedIndex: ui.selected,
        usedIndices: used,
        order: ui.rackOrder.order,
        onTile: i => { if (!myTurn(ctx.state.room, ctx) || ui.busy) return; ui.selected = ui.selected === i ? null : i; update(el, ctx.state.room, ctx); }
      });
      shuffleBtn.disabled = g.racks[seat].length - used.length < 2;
      decorateRefill(el, ctx);
    }

    $('#actions').classList.toggle('hidden', !isSeat(seat));
    $('#actions').classList.toggle('out', iAmOut); // an out player keeps only 😀 and ⋯
    for (const id of ['#playBtn', '#recallBtn', '#passBtn']) $(id).disabled = !mine || ui.busy || !!ui.rejected;
    syncTaunt(el, room, ctx);
    // During my own live game the header's "How to play" opens in a new tab (app.js), so the game stays open.
    App.inLiveSeat = isSeat(seat) && ['live', 'suddenDeath', 'hostDecision'].includes(room.status);
    $('#resignBtn').disabled = !isSeat(seat) || iAmOut || !['live', 'suddenDeath', 'hostDecision'].includes(room.status);

    // Bottom sheet (empty = hidden): the recall / ask-host choice, or my appeal waiting for the host.
    // The dictionary decides (no host appeal): fix the word, or take the tiles back. The turn clock keeps running.
    let sheet = ui.rejected ? `<div class="sheet-msg">❌ <b>${ui.rejected.rejectedWords.map(esc).join(', ')}</b> is not in the dictionary. Try another word.</div>
        <div class="sheet-hint">${esc(ScrabbleEngine.READ_HINT)}</div>
        <div class="sheet-actions"><button class="secondary" data-act="recall">↩ Recall tiles</button><button class="btn-primary" data-act="fix">✎ Move tiles</button></div>` : '';
    $('#rejectBox').innerHTML = sheet;

    $('#lastMove').innerHTML = lastMoveText(room);
    $('#stopWatching').classList.toggle('hidden', seat !== 'watch');
    // Seated players reach "Back to start" through the ⋯ menu, so nothing sits below the actions.
    $('#liveFoot').classList.toggle('hidden', isSeat(seat));
    $('#liveRoot').classList.toggle('seated', isSeat(seat));
    if (RoomLive.updateHost) RoomLive.updateHost(el, room, ctx);
    tick(el, ctx);
    fitBoard(el, ctx);
    // A drag in progress keeps its target ring and the rack's make-room shift across this redraw.
    if (ui.drag && ui.dragApi) ui.dragApi.refresh();
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
      // Keeps a pop that is still running (the ribbon in tick() pops it when this player's turn starts).
      pill.className = 'pill pill-' + kind + (pill.classList.contains('pill-pop') ? ' pill-pop' : '');
      ui.pillKind = kind;
    }
    const text = p ? p.text : '';
    const txtEl = pill.querySelector('.pill-text');
    if (txtEl.textContent !== text) txtEl.textContent = text;
    const clock = p && p.ms !== null ? UI.formatClock(p.ms) : '';
    const clockEl = pill.querySelector('#turnClock');
    if (clockEl.textContent !== clock) clockEl.textContent = clock;
  }

  // The 😀 button: seated players only, on the game screen once the VS intro is over. During the
  // 10 s cooldown (from the room data, so a refresh keeps it) it is disabled and shows the seconds left.
  function syncTaunt(el, room, ctx) {
    const wrap = el.querySelector('#tauntWrap');
    if (!wrap) return;
    const seat = ctx.state.mySeat, now = Store.serverNow();
    const on = isSeat(seat) && Match.tauntWindow(room, now);
    wrap.classList.toggle('hidden', !on);
    const can = on && Taunt.canSend(room, seat, now);
    const btn = el.querySelector('#tauntBtn');
    if (btn.disabled !== !can) btn.disabled = !can;
    const left = on ? Taunt.cooldownLeft(room, seat, now) : 0;
    const cd = el.querySelector('#tauntCd');
    const text = left > 0 ? String(Math.ceil(left / 1000)) : '';
    if (cd.textContent !== text) cd.textContent = text;
    cd.classList.toggle('hidden', !text);
    if (!can && ctx.state.ui.setTauntPop) ctx.state.ui.setTauntPop(false);
  }

  function tick(el, ctx) {
    const room = ctx.state.room;
    if (!room || !room.clock || !el.querySelector('#liveRoot')) return;
    const now = Store.serverNow();
    syncTaunt(el, room, ctx); // the cooldown countdown, and the button showing once the VS intro ends
    // 🎵 match music: Tile Rush, then Last Minute for the final 60 s and sudden death; low while on hold
    Music.set(Music.enabled() ? Music.trackFor(room, now) : null, Music.levelFor(room, now));
    // Turn moments #4: the whose-turn ribbon, once per turn, when its clock starts (not on a refresh).
    const ribbon = Pill.ribbon(room, ctx.state.mySeat);
    if (Pill.ribbonDue(ribbon, ctx.state.ui.ribbonKey, now)) {
      Scenes.ribbon(el.querySelector('#liveRoot'), ribbon, el.querySelector('#board-container'));
      ctx.state.ui.ribbonKey = ribbon.key;
      // The pill pop, "turn" sound and vibration come with "YOUR TURN!" (spec), not when the move arrives.
      const pill = el.querySelector('#statusLine');
      if (ribbon.mine && pill) {
        pill.classList.remove('pill-pop'); void pill.offsetWidth; pill.classList.add('pill-pop');
        clearTimeout(ctx.state.ui.popTimer);
        ctx.state.ui.popTimer = setTimeout(() => pill.classList.remove('pill-pop'), 450); // .pill-pop runs .38 s
        Sound.play('turn'); Sound.buzz();
      }
    }
    const c = room.clock;
    const phase = Match.roomPhase(room);
    const matchMs = c.paused ? c.paused.matchRemainingMs : c.endsAt - now;
    const mc = el.querySelector('#matchClock');
    if (room.status === 'suddenDeath') mc.textContent = 'SD';
    else if (room.status === 'hostDecision') mc.textContent = '—';
    else mc.textContent = UI.formatClock(matchMs);
    mc.classList.toggle('low', room.status === 'live' && matchMs <= 60000);
    renderPill(el, room, ctx);

    tickForfeit(el, room);
    // Only seated players and the host write automatic transitions; spectators never write.
    const writer = isSeat(ctx.state.mySeat) || App.isHost();
    if (writer && PLAYING.includes(room.status)) watchDisconnects(room, ctx, now);
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

  // Disconnects (no host needed): a seat without presence for OFFLINE_DEBOUNCE_MS (this device's own
  // stopwatch) is recorded as offline; DISCONNECT_FORFEIT_MS later the other player's device (or the
  // host's) ends the game by forfeit. A returning player's device clears its own seat's mark.
  function watchDisconnects(room, ctx, now) {
    const ui = ctx.state.ui;
    ui.offSince = ui.offSince || {};
    const mine = ctx.state.mySeat;
    for (const s of seatsOf(room)) {
      const seat = room.seats[s];
      if (!seat || outOf(room, s)) continue;
      if (s === mine) {
        if (seat.offlineAt && seat.clientId === ctx.me && room.presence[ctx.me] && Retry.due(ui.tried, 'on:' + seat.offlineAt)) {
          Store.mutateRoom(ctx.code, r => Match.markOnline(r, s, ctx.me));
        }
        continue;
      }
      if (Match.isSeatOnline(room, s)) { delete ui.offSince[s]; continue; }
      if (!ui.offSince[s]) ui.offSince[s] = performance.now();
      if (!seat.offlineAt) {
        if (performance.now() - ui.offSince[s] >= Match.OFFLINE_DEBOUNCE_MS && Retry.due(ui.tried, 'off:' + s + ':' + seat.clientId)) {
          Store.mutateRoom(ctx.code, r => Match.markOffline(r, s, Store.serverNow()));
        }
      } else if (now >= seat.offlineAt + Match.DISCONNECT_FORFEIT_MS && Retry.due(ui.tried, 'forfeit:' + s + ':' + seat.offlineAt)) {
        const at = seat.offlineAt;
        Store.mutateRoom(ctx.code, r => Match.forfeitOffline(r, s, Store.serverNow(), at));
      }
    }
  }

  // The "wins by forfeit in m:ss" countdown inside the disconnect notice.
  function tickForfeit(el, room) {
    el.querySelectorAll('[data-forfeit]').forEach(span => {
      const left = Match.offlineLeftMs(room, span.dataset.forfeit, Store.serverNow());
      const t = left === null ? '' : UI.formatClock(left);
      if (span.textContent !== t) span.textContent = t;
    });
  }

  // Emoji taunts (batch 5): a taunt shows on every room view (players, spectators, host) when it
  // ARRIVES, popping out of the sender's side of the score bar. The first render after building the
  // view only sets the baseline, so a refresh or late join never replays one (live only).
  function showTaunts(el, room, ctx) {
    const ui = ctx.state.ui;
    const a = Taunt.arrivals(ui.tauntSeen, room, Store.serverNow());
    ui.tauntSeen = a.seen;
    for (const t of a.show) {
      const s = room.seats && room.seats[t.seat];
      const name = Names.short((s && s.name) || room['team' + t.seat + 'Name'] || '');
      Taunt.show(el.querySelector('#side' + t.seat), el.querySelector('.scorebar'), { seat: t.seat, e: t.e, name });
      // Screen readers: a lasting polite live region whose text changes (an inserted, already-filled
      // region is often not announced). The floating face is aria-hidden.
      const live = el.querySelector('#tauntLive');
      if (live) { const msg = Taunt.text(name, t.e); live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 60); } // the same text twice still announces
    }
  }

  // Word celebration when moveCount goes up with a play. The first live render (page load,
  // refresh, joining mid-game) only sets the baseline, so nothing ever replays.
  function celebrateNewMove(el, room, ctx) {
    const ui = ctx.state.ui;
    if (!room.game) return;
    const c = Celebrate.detect(ui.lastSeenMove, room);
    // Turn moments #10: a play from the other seat (every play, for spectators and the host) drops
    // onto the board first; its celebration waits Match.DROP_MS. The mover placed the tiles themselves.
    const lm = room.game.lastMove;
    const isNew = ui.lastSeenMove !== null && ui.lastSeenMove !== undefined && room.game.moveCount > ui.lastSeenMove;
    let dropped = false;
    // A move during the ribbon: the newest moment wins. A pass or timeout starts the next turn at once,
    // so its ribbon may already be up for that new turn: only an older turn's ribbon is cleared (QA pass).
    const nowRibbon = isNew ? Pill.ribbon(room, ctx.state.mySeat) : null;
    if (isNew && (!nowRibbon || ui.ribbonKey !== nowRibbon.key)) Scenes.clearRibbon();
    if (isNew && lm && lm.type === 'play' && lm.seat !== ctx.state.mySeat) {
      const cells = Celebrate.newCells(lm);
      if (cells.length) {
        ui.drop = { moveCount: room.game.moveCount, cells, at: performance.now() };
        dropped = true;
        decorateDrop(el, ctx);
      }
    }
    if (c) {
      const seat = c.seat;
      Music.dip(Music.dipFor(c.tier)); // the celebration stands out over the music (tiers 1-4, as on the big screen)
      Celebrate.show(c, {
        container: el.querySelector('#liveRoot'),
        scoreEl: el.querySelector('#side' + seat + ' .score'),
        areaEl: el.querySelector('#board-container'),
        mine: seat === ctx.state.mySeat,
        delayMs: dropped ? Match.DROP_MS : 0
      });
    }
    ui.lastSeenMove = room.game.moveCount;
  }

  // Turn moments #3: the tiles just drawn fly out of the tile bag, face-down, and flip face-up into
  // the slots this player's play used. Like the drop, the delays come from the start time, so the
  // rack being redrawn on a room update resumes the deal instead of restarting it.
  const DEAL_TOTAL_MS = 900, DEAL_EACH_MS = 500, DEAL_SHOW_MS = 1100;
  function decorateRefill(el, ctx) {
    const ui = ctx.state.ui, f = ui.refill;
    const bag = el.querySelector('.rack-bag');
    if (!f) return;
    const elapsed = performance.now() - f.at;
    const room = ctx.state.room, seat = ctx.state.mySeat;
    const rackNow = room && room.game && room.game.racks[seat] ? room.game.racks[seat].join(',') : '';
    // Done, or the rack is no longer the refilled one (the play failed and it went back): stop at once.
    if (elapsed > DEAL_SHOW_MS || (f.key && rackNow !== f.key)) { ui.refill = null; if (bag) bag.classList.remove('on'); return; }
    // The bag is never redrawn: its fade starts once (setting its delay again would make it jump ahead).
    if (bag && !f.started) { bag.style.animationDelay = '0ms'; bag.classList.remove('on'); void bag.offsetWidth; bag.classList.add('on'); }
    f.started = true;
    const from = bag ? bag.getBoundingClientRect() : null;
    const delays = Celebrate.stagger(f.fresh.length, DEAL_TOTAL_MS, DEAL_EACH_MS);
    f.fresh.forEach((idx, i) => {
      const t = el.querySelector(`#rack .tile[data-i="${idx}"]`);
      if (!t) return;
      if (from) {
        const r = t.getBoundingClientRect();
        t.style.setProperty('--fx', Math.round(from.left + from.width / 2 - (r.left + r.width / 2)) + 'px');
        t.style.setProperty('--fy', Math.round(from.top + from.height / 2 - (r.top + r.height / 2)) + 'px');
      }
      t.classList.add('tile-dealt');
      t.style.animationDelay = Math.round(delays[i] - elapsed) + 'ms';
    });
  }

  // Applies the word drop to the freshly drawn board. The board is redrawn on every room update, so
  // each tile's animation-delay is set from the drop's start time: a redraw resumes it mid-way.
  const DROP_EACH_MS = 450;
  function decorateDrop(el, ctx) {
    const ui = ctx.state.ui, d = ui.drop, room = ctx.state.room;
    if (!d) return;
    const elapsed = performance.now() - d.at;
    if (!room || !room.game || room.game.moveCount !== d.moveCount || elapsed > Match.DROP_MS + 600) { ui.drop = null; return; }
    const delays = Celebrate.stagger(d.cells.length, Match.DROP_MS, DROP_EACH_MS);
    d.cells.forEach((cell, i) => {
      const t = el.querySelector(`#board-container .sq[data-r="${cell.r}"][data-c="${cell.c}"] .tile`);
      if (!t) return;
      t.classList.add('tile-drop');
      t.style.animationDelay = `${Math.round(delays[i] - elapsed)}ms, ${Math.round(Match.DROP_MS - 150 - elapsed)}ms`;
    });
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

  // A draw (still tied after the sudden-death rounds): Scenes.renderResult shows a winner, so draws
  // get this screen, with the same parts (#board-container, #finalStandings, #backBtn, #finalHost).
  function renderDraw(el, room, ctx) {
    ensureStyles();
    const drew = (room.result.drawSeats && room.result.drawSeats.length) ? room.result.drawSeats : seatsOf(room);
    const line = seatsOf(room).map(s => {
      const nm = room.seats[s] ? room.seats[s].name : Match.teamNameOf(room, s);
      return `<div><b title="${esc(nm)}">${esc(short(nm))}</b><small>${esc(room['agency' + s] || '')}</small><div class="disp" style="font-size:1.6rem;font-weight:800;">${Number(room.result['score' + s]) || 0}</div></div>`;
    }).join('<i>–</i>');
    const mine = isSeat(ctx.state.mySeat) && drew.includes(ctx.state.mySeat);
    el.innerHTML = `<div class="card narrow stack res-final mm-draw">
        <div class="mm-big" aria-hidden="true">🤝</div>
        <h2 style="margin:0;">It's a draw!</h2>
        <p class="muted small-text" style="margin:0;">Still tied after ${Match.SUDDEN_DEATH_MAX_ROUNDS} sudden-death rounds.${mine ? ' You get ½ point.' : ' ½ point each.'}</p>
        <div class="mm-vs">${line}</div>
        <button class="btn-primary" id="backBtn">← Back to start</button>
        <div id="finalHost"></div>
      </div>
      <div class="card"><div id="board-container"></div></div>
      <div class="card narrow"><h3>🏆 Standings</h3><div id="finalStandings"></div></div>`;
  }

  const RoomLive = {
    renderLive(el, room, ctx) {
      document.body.classList.add('in-game'); // collapsed header during a live game
      const fresh = !el.querySelector('#liveRoot');
      if (fresh) buildLive(el, ctx);
      update(el, room, ctx);
      syncIntro(el, room, ctx, fresh);
      celebrateNewMove(el, room, ctx);
      showTaunts(el, room, ctx);
    },

    // Result screen (Scenes.renderResult): winner / other player / neutral (spectators, host) / void.
    // Rebuilt only when the result itself changes (presence updates keep the scene as it is), so the
    // entrance plays once. A play that ended the game (bag out, last sudden-death move) never got its
    // word celebration on the live screen: it plays here over the result, whose entrance waits for it.
    renderFinal(el, room, ctx) {
      App.inLiveSeat = false; // the game is over: How to play opens in the same tab again
      // The match is over: the music stops, and a result seen happening live rings the ringside bell once
      // (a sound effect, so it follows 🔇/🔊). Never on a void, a refresh or a late join.
      Music.stop();
      let bellRang = false;
      if (el.querySelector('#liveRoot') && room.status === 'final' && room.result && ctx.state.bellAt !== room.result.decidedAt) {
        ctx.state.bellAt = room.result.decidedAt;
        Sound.play('bell');
        bellRang = true;
      }
      document.body.classList.add('in-game'); // collapsed header, so the result scene fills a phone like the mockup
      const ui = ctx.state.ui;
      const viewer = Scenes.resultViewer(room, ctx.state.mySeat);
      const res = room.result;
      const key = [room.status, viewer, App.isHost() ? 'host' : '',
        res ? [res.winner, ...seatsOf(room).map(s => res['score' + s]), res.reason, res.decidedAt, res.note || ''].join('/') : '',
        room.voidedAt || '', room.voidNote || ''].join('|');
      if (ui.finalKey === key && el.querySelector('.res-final')) {
        RoomLive.updateFinalHost(el, room, ctx);
        return;
      }
      ui.finalKey = key;
      Celebrate.clear();
      Scenes.clearIntro();
      Scenes.clearRibbon();
      Taunt.clear();
      detachLive(ui);
      const ending = Scenes.endingCelebration(ui.lastSeenMove, room);
      if (room.game) ui.lastSeenMove = room.game.moveCount; // nothing replays on a later rebuild
      const delayMs = ending ? (Match.CELEBRATE_MS[ending.tier] || 0) : 0;
      if (Match.isDraw(room)) renderDraw(el, room, ctx);
      else Scenes.renderResult(el, room, viewer, { animate: Scenes.resultFresh(room, Store.serverNow()), delayMs, winSoundDelayMs: bellRang ? 1200 : 0 });
      if (room.game) UI.renderBoard(el.querySelector('#board-container'), room.game.board, {});
      if (!ui.standings) ui.standings = UI.mountStandings(() => el.querySelector('#finalStandings'));
      else ui.standings.render();
      const back = el.querySelector('#backBtn');
      if (back) {
        // players go straight back to matchmaking; the start page is where Find opponent lives
        if (isSeat(ctx.state.mySeat) && session()) back.textContent = '🔍 Find next opponent';
        back.onclick = () => App.go('');
      }
      RoomLive.updateFinalHost(el, room, ctx);
      if (ending) Celebrate.show(ending, { container: el, scoreEl: null, mine: ending.seat === ctx.state.mySeat });
    },

    // Host control bar + notices shown to everyone (disconnects).
    updateHost(el, room, ctx) {
      const g = room.game;
      const phase = Match.roomPhase(room);
      const inPlay = ['live', 'suddenDeath', 'hostDecision'].includes(room.status);

      // Disconnect notice: a bottom sheet that can be hidden (✕) until the set of offline players changes.
      const SEATS = seatsOf(room);
      const isMulti = SEATS.length > 2;
      // Out seats (3-4 player rooms) no longer play: no disconnect notice for them.
      const offline = SEATS.filter(s => room.seats[s] && !outOf(room, s) && !Match.isSeatOnline(room, s));
      const ui = ctx.state.ui;
      const noticeKey = offline.map(s => s + ':' + room.seats[s].clientId).join('|');
      if (!offline.length) ui.noticeHidden = null; // a new disconnect shows again
      const notice = el.querySelector('#noticeBox');
      // "<name> disconnected · <other> wins by forfeit in 1:43 unless they come back"
      const line = offline.map(s => {
        const seat = room.seats[s];
        const others = SEATS.filter(x => x !== s && room.seats[x] && !outOf(room, x));
        const cd = seat.offlineAt ? ` · ${isMulti ? 'out' : `<span class="nm">${esc(short(others.length ? room.seats[others[0]].name : ''))}</span> wins by forfeit`} in <span class="mm-forfeit" data-forfeit="${s}"></span> unless they return` : '';
        return `<span class="nm">${esc(short(seat.name))}</span> disconnected${cd}`;
      }).join('<br>');
      notice.innerHTML = inPlay && offline.length && ui.noticeHidden !== noticeKey
        ? `<div class="sheet-row"><div class="sheet-msg">📴 ${line}</div>
            <button class="btn-ghost sheet-close" data-act="hideNotice" aria-label="Hide this notice">✕</button></div>`
        : '';
      tickForfeit(el, room);
      notice.onclick = ev => {
        if (!ev.target.closest('[data-act=hideNotice]')) return;
        ui.noticeHidden = noticeKey;
        notice.innerHTML = '';
      };

      // The host only watches: Pin to the big screen, and an emergency Void. Everything else is automatic.
      const bar = el.querySelector('#hostBar');
      if (!App.isHost()) { bar.innerHTML = ''; return; }
      const warnings = SEATS
        .filter(s => room.seats[s] && room.fairPlay[s].screenLeaves > 0)
        .map(s => `<div class="warn-line">⚠️ ${esc(short(room.seats[s].name))} left the screen ${room.fairPlay[s].screenLeaves}×</div>`).join('');
      const pinned = ctx.state.pinned === ctx.code;
      bar.innerHTML = `<div class="hostbar">
        <h4>⚙ Host (watching)</h4>
        ${warnings}
        <div class="row">
          ${phase === 'paused' ? '<button class="small" data-host="resume">▶ Resume</button>' : ''}
          <button class="small secondary" data-host="pin">${pinned ? 'Unpin' : '📌 Pin to big screen'}</button>
          <button class="small danger" data-host="void">🗑 Void (emergency)</button>
        </div>
        <div class="small-text muted">Words, turn time, match time, disconnects and ties are handled automatically.</div>
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
        if (act === 'resume') fn = r => Match.resumeClocks(r, now());
        else if (act === 'void') {
          const note = prompt('Reason for voiding (kept in the record):', '');
          if (note === null || !confirm('Void this game? It will count for no one.')) return;
          fn = r => Match.voidRoom(r, now(), note);
        }
        if (!fn) return;
        b.disabled = true;
        const res = await Store.mutateRoom(ctx.code, fn);
        if (!res.committed) UI.toast('That action is no longer possible (the game changed).', 'error');
      };
    },

    // Host-only: correct or void a final result.
    updateFinalHost(el, room, ctx) {
      const box = el.querySelector('#finalHost');
      if (!box || !App.isHost() || room.status !== 'final' || !room.result) return;
      // 2 players: give the win to the other seat. 3-4 players: one button per other seat.
      const others = seatsOf(room).filter(s => s !== room.result.winner);
      const correctBtn = s => `<button class="small secondary nm-btn" data-correct-to="${s}" title="Give the win to ${esc(teamOf(room, s))}">Give the win to ${esc(teamOf(room, s))}</button>`;
      box.innerHTML = `<div class="hostbar"><h4>⚙ Host</h4><div class="row">
        ${others.map((s, i) => correctBtn(s).replace('<button ', i === 0 ? '<button id="correctBtn" ' : '<button ')).join('')}
        <button class="small danger" id="voidFinalBtn">Void</button></div></div>`;
      for (const b of box.querySelectorAll('[data-correct-to]')) b.onclick = async () => {
        const to = b.dataset.correctTo;
        const note = prompt('Reason for the correction (kept in the record):', '');
        if (note === null || !confirm(`Give the win to ${teamOf(room, to)} instead?`)) return;
        await Store.mutateRoom(ctx.code, r => Match.correctResult(r, Store.serverNow(), note, to));
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
      Scenes.clearRibbon();
      Taunt.clear();
      Scenes.clearResult();
      if (ctx.state.ui.standings) ctx.state.ui.standings.off();
    }
  };
  root.RoomLive = RoomLive;

  root.RoomView = { showJoin, show };
})(window);
