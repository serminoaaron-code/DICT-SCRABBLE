// Firebase wiring. Every room write goes through mutateRoom(), whose update
// function is a pure Match.* function (null = reject = abort transaction).
// The matchmaking lobby works the same way: mutateLobby() runs a pure Match.lobby* function.
(function (root) {
  'use strict';

  const firebaseConfig = {
    apiKey: "AIzaSyDK4G-AtPgEOTVODA2hDwxofWTMOvL-I60",
    authDomain: "dict-chess-tournament.firebaseapp.com",
    projectId: "dict-chess-tournament",
    storageBucket: "dict-chess-tournament.firebasestorage.app",
    messagingSenderId: "73955094836",
    appId: "1:73955094836:web:4df083fc284dffa73c7561",
    measurementId: "G-X6WM6FGD5J",
    databaseURL: "https://dict-chess-tournament-default-rtdb.firebaseio.com"
  };

  const ENV = Env.dataRoot(root.location.hostname, root.location.search);
  const ROOT = ENV.root; // 'scrabble' (live) or 'scrabble_playground' (local testing)
  let db = null;
  let offset = 0;

  // localStorage with an in-memory fallback (private mode, blocked storage).
  const memory = {};
  const local = {
    get(k) { try { const v = root.localStorage.getItem(k); return v === null ? (memory[k] ?? null) : v; } catch (e) { return memory[k] ?? null; } },
    set(k, v) { memory[k] = String(v); try { root.localStorage.setItem(k, String(v)); } catch (e) { /* memory only */ } },
    remove(k) { delete memory[k]; try { root.localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  function init() {
    if (db) return;
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    db.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
  }

  function serverNow() { return Date.now() + offset; }

  function clientId() {
    let id = local.get('scrabble.clientId');
    if (!id) {
      id = '';
      const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
      for (let i = 0; i < 16; i++) id += abc[Math.floor(Math.random() * abc.length)];
      local.set('scrabble.clientId', id);
    }
    return id;
  }

  function watch(path, map, cb) {
    const ref = db.ref(path);
    const handler = snap => cb(map(snap));
    ref.on('value', handler);
    return () => ref.off('value', handler);
  }

  // Players are their own "teams" now (matchmaking, no fixture rooms): { pid: { name, agency } }, so
  // the standings and the big screen rank players. Kicked players stay listed with their results.
  function watchTeams(cb) {
    return watch(`${ROOT}/players`, s => {
      const raw = s.val() || {};
      const out = {};
      for (const pid of Object.keys(raw)) if (raw[pid] && raw[pid].name) out[pid] = { name: raw[pid].name, agency: raw[pid].agency || '' };
      return out;
    }, cb);
  }

  function watchRooms(cb) {
    return watch(`${ROOT}/rooms`, s => {
      const raw = s.val() || {};
      const out = {};
      for (const code of Object.keys(raw)) {
        if (!Match.isRoomRecord(raw[code])) continue; // skip presence-only ghost nodes
        out[code] = Match.normalizeRoom(Object.assign({}, raw[code], { code }));
      }
      return out;
    }, cb);
  }

  function watchRoom(code, cb) {
    return watch(`${ROOT}/rooms/${code}`, s => (s.exists() && Match.isRoomRecord(s.val()) ? Match.normalizeRoom(s.val()) : null), cb);
  }

  function addTeam(name) {
    const ref = db.ref(`${ROOT}/teams`).push();
    return ref.set({ name, createdAt: firebase.database.ServerValue.TIMESTAMP }).then(() => ref.key);
  }
  function renameTeam(id, name) { return db.ref(`${ROOT}/teams/${id}/name`).set(name); }
  function deleteTeam(id) { return db.ref(`${ROOT}/teams/${id}`).remove(); }

  // Returning null for a not-yet-cached value lets Firebase retry with the
  // server value; returning undefined aborts the transaction.
  //
  // The SDK rejects a transaction (Error 'set' / 'maxretry') when this same client writes to an
  // overlapping path (presence, reset) while the transaction is in flight and the server reports a
  // concurrent change. Retry once, then report it as not committed instead of throwing, so callers'
  // "not committed" handling (toasts, automatic retries) covers it and nothing goes unhandled.
  function mutateRoom(code, fn, attempt = 0) {
    return db.ref(`${ROOT}/rooms/${code}`).transaction(cur => {
      if (cur === null) return null;
      const next = fn(Match.normalizeRoom(cur));
      return next === null ? undefined : next;
    }).then(r => ({
      committed: r.committed && r.snapshot.exists(),
      room: r.snapshot.exists() ? Match.normalizeRoom(r.snapshot.val()) : null
    }), err => {
      if (attempt < 1) return mutateRoom(code, fn, attempt + 1);
      console.warn('Room update aborted:', err && err.message);
      return { committed: false, room: null, error: err && err.message };
    });
  }

  async function createRoom(opts) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Match.generateRoomCode();
      const room = Match.createRoom(Object.assign({}, opts, { code, now: serverNow() }));
      const res = await db.ref(`${ROOT}/rooms/${code}`).transaction(cur => (cur === null ? room : undefined));
      if (res.committed) return code;
    }
    throw new Error('Could not create a unique room code. Try again.');
  }

  // role: 'A' | 'B' | 'watch' | 'host'. Removed automatically on disconnect.
  // The returned stop function also blocks a write still in flight (`stopped`). The existence check can
  // read this device's stale copy on a reconnect (the room was deleted while it was offline), so a
  // presence-only "ghost" may be written for a moment; the room view then sees the room is gone and
  // calls stop, which removes it (fix/ghost-presence, BF-27).
  function setPresence(code, role) {
    const ref = db.ref(`${ROOT}/rooms/${code}/presence/${clientId()}`);
    const connRef = db.ref('.info/connected');
    let stopped = false;
    const onConn = snap => {
      if (stopped || snap.val() !== true) return;
      // Only mark presence in a room that still exists (a reset/deleted room must not be recreated).
      db.ref(`${ROOT}/rooms/${code}/status`).once('value').then(s => {
        if (stopped || !s.exists()) return;
        ref.onDisconnect().remove();
        ref.set(role);
      });
    };
    connRef.on('value', onConn);
    return () => {
      stopped = true;
      connRef.off('value', onConn);
      ref.onDisconnect().cancel();
      ref.remove();
    };
  }

  function resetTournament() { return db.ref(ROOT).remove(); }

  // ---------- tournament, access codes, players, matchmaking ----------
  const once = path => db.ref(path).once('value').then(s => s.val());

  // tournament: { status: 'running' | 'ended', startedAt, endsAt, durationMin, matchMin }
  // settings:   { requireCode, lockRegistration, matchMin }
  function watchTournament(cb) { return watch(`${ROOT}/tournament`, s => s.val() || null, cb); }
  function setTournament(t) { return db.ref(`${ROOT}/tournament`).set(t); }
  function updateTournament(u) { return db.ref(`${ROOT}/tournament`).update(u); }
  function watchSettings(cb) { return watch(`${ROOT}/settings`, s => s.val() || {}, cb); }
  function updateSettings(u) { return db.ref(`${ROOT}/settings`).update(u); }

  // accessCodes/<CODE>: { type: 'shared' | 'individual', batch, createdAt, revoked,
  //                       (individual, once used) pid, name, agency, usedAt }
  function watchAccessCodes(cb) { return watch(`${ROOT}/accessCodes`, s => s.val() || {}, cb); }
  function getAccessCode(code) { return once(`${ROOT}/accessCodes/${code}`); }
  function addAccessCodes(map) { return db.ref(`${ROOT}/accessCodes`).update(map); }
  function setCodeRevoked(code, revoked) { return db.ref(`${ROOT}/accessCodes/${code}/revoked`).set(revoked ? true : null); }
  function deleteAccessCode(code) { return db.ref(`${ROOT}/accessCodes/${code}`).remove(); }
  // An individual code belongs to the first player who signs in with it; the same code signs that
  // player in again on any device (their stored name and agency are kept).
  function claimIndividualCode(code, name, agency) {
    return db.ref(`${ROOT}/accessCodes/${code}`).transaction(cur => {
      if (cur === null) return null; // not cached yet: Firebase retries with the server value
      if (cur.type !== 'individual' || cur.revoked) return undefined;
      if (cur.pid) return cur; // already claimed: unchanged
      return Object.assign({}, cur, { pid: 'p_' + code, name, agency, usedAt: serverNow() });
    }).then(r => (r.committed && r.snapshot.exists() ? r.snapshot.val() : null));
  }

  // players/<pid>: { name, agency, code, codeType, joinedAt, lastSeen, online, kicked, kickReason, room, lastOpp }
  function watchPlayers(cb) { return watch(`${ROOT}/players`, s => s.val() || {}, cb); }
  function watchPlayer(pid, cb) { return watch(`${ROOT}/players/${pid}`, s => s.val() || null, cb); }
  function getPlayer(pid) { return once(`${ROOT}/players/${pid}`); }
  function updatePlayer(pid, u) { return db.ref(`${ROOT}/players/${pid}`).update(u); }
  function setKicked(pid, kicked, reason = '') {
    return db.ref(`${ROOT}/players/${pid}`).update({ kicked: kicked ? true : null, kickReason: kicked ? String(reason || '').slice(0, 120) : null });
  }
  // online = true while this device is connected (cleared by the server on disconnect)
  function playerPresence(pid) {
    const ref = db.ref(`${ROOT}/players/${pid}/online`);
    const connRef = db.ref('.info/connected');
    const onConn = snap => {
      if (snap.val() !== true) return;
      ref.onDisconnect().set(null);
      ref.set(true);
      db.ref(`${ROOT}/players/${pid}/lastSeen`).set(serverNow());
    };
    connRef.on('value', onConn);
    return () => { connRef.off('value', onConn); ref.onDisconnect().cancel(); ref.set(null); };
  }

  // The matchmaking lobby (queue + offers) changes only through Match.lobby* in one transaction.
  function watchLobby(cb) { return watch(`${ROOT}/lobby`, s => s.val() || {}, cb); }
  function mutateLobby(fn, attempt = 0) {
    return db.ref(`${ROOT}/lobby`).transaction(cur => {
      const next = fn(cur);
      // A rejection on a not-yet-cached (null) lobby writes null instead of aborting, so Firebase
      // retries with the server's value; on an empty server it changes nothing.
      if (next === null) return cur === null ? null : undefined;
      return next;
    }).then(r => ({ committed: r.committed && r.snapshot.exists(), lobby: r.snapshot.val() || {} }), err => {
      if (attempt < 2) return mutateLobby(fn, attempt + 1);
      console.warn('Lobby update aborted:', err && err.message);
      return { committed: false, lobby: null, error: err && err.message };
    });
  }
  // A queued player drops out of the queue if this device disconnects.
  function queueOnDisconnect(pid, on) {
    const d = db.ref(`${ROOT}/lobby/queue/${pid}`).onDisconnect();
    return on ? d.remove() : d.cancel();
  }

  // The accepted offer's game: whichever player's device gets here first creates it; the other's
  // transaction sees it exists and changes nothing.
  async function createMatchRoom(code, build) {
    const res = await db.ref(`${ROOT}/rooms/${code}`).transaction(cur => (cur === null ? build() : undefined));
    return res.committed;
  }
  function getRoom(code) { return once(`${ROOT}/rooms/${code}`); }

  // Host pin for the big screen: a plain value (room code, or null), not a room transaction.
  // Only one room is pinned at a time; setting it replaces whatever was pinned before.
  function setPinned(code) { return db.ref(`${ROOT}/broadcast/pinned`).set(code); }
  function watchPinned(cb) { return watch(`${ROOT}/broadcast/pinned`, s => s.val() || null, cb); }

  root.Store = {
    ROOT, playground: ENV.playground,
    init, serverNow, clientId, local,
    watchTeams, watchRooms, watchRoom,
    addTeam, renameTeam, deleteTeam,
    mutateRoom, createRoom, setPresence, resetTournament,
    setPinned, watchPinned,
    watchTournament, setTournament, updateTournament, watchSettings, updateSettings,
    watchAccessCodes, getAccessCode, addAccessCodes, setCodeRevoked, deleteAccessCode, claimIndividualCode,
    watchPlayers, watchPlayer, getPlayer, updatePlayer, setKicked, playerPresence,
    watchLobby, mutateLobby, queueOnDisconnect, createMatchRoom, getRoom
  };
})(window);
