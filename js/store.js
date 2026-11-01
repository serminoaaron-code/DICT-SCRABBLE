// Firebase wiring. Every room write goes through mutateRoom(), whose update
// function is a pure Match.* function (null = reject = abort transaction).
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

  function watchTeams(cb) { return watch(`${ROOT}/teams`, s => s.val() || {}, cb); }

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
  function setPresence(code, role) {
    const ref = db.ref(`${ROOT}/rooms/${code}/presence/${clientId()}`);
    const connRef = db.ref('.info/connected');
    const onConn = snap => {
      if (snap.val() !== true) return;
      // Only mark presence in a room that still exists (a reset/deleted room must not be recreated).
      db.ref(`${ROOT}/rooms/${code}/status`).once('value').then(s => {
        if (!s.exists()) return;
        ref.onDisconnect().remove();
        ref.set(role);
      });
    };
    connRef.on('value', onConn);
    return () => {
      connRef.off('value', onConn);
      ref.onDisconnect().cancel();
      ref.remove();
    };
  }

  function resetTournament() { return db.ref(ROOT).remove(); }

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
    setPinned, watchPinned
  };
})(window);
