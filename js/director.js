// Auto-director for the projector (spec §5.7): decides which room the big
// screen features and which scene it plays, like an esports observer.
//
// Pure: no DOM, no clock. `now` is always a parameter and every step returns
// a NEW state object. The broadcast view calls step() on room updates and on
// the shared ticker, and renders state.scene.
// Loads as a browser global (Director) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Director = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const Match = typeof require === 'function' ? require('./match.js') : root.Match;
  const Celebrate = typeof require === 'function' ? require('./celebrate.js') : root.Celebrate;

  const ROTATE_MS = 20000;       // normal rotation
  const DWELL_MS = 8000;         // minimum time on a room between non-event switches
  const ROUND_WINDOW_MS = 10000; // starts this close together share one roundStart scene
  const ROUND_MS = 5000;         // roundStart scene length
  const WINNER_MS = 8000;        // winner card
  const DRAMA_MS = 60000;        // last minute of the match clock counts as drama
  const CORNER_MS = 4000;        // corner card for other rooms' highlights while pinned
  const HIGHLIGHT_PAD_MS = 300;  // added to CELEBRATE_MS[tier]
  const HIGHLIGHT_TIER = 3;      // Awesome! and up cut to the room

  const LIVE = ['live', 'suddenDeath', 'hostDecision'];
  const DEAD = ['final', 'void'];
  const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  function init() {
    return {
      featured: null, scene: 'idle', sceneUntil: 0, since: 0,
      queue: [], corner: null, seen: {}, ignoredPin: null, roundCodes: [], move: null,
      sceneId: 0 // +1 on every new scene: the view re-renders when it changes
    };
  }

  const isLive = room => !!room && LIVE.includes(room.status);

  // Sudden death, or the last minute of a running match clock. A paused room (host
  // pause or appeal) and a live room whose clock already ran out (nobody resolved
  // time-up, e.g. an abandoned room) are frozen boards, never drama.
  function isDrama(room, now) {
    if (!isLive(room)) return false;
    const c = room.clock;
    if (c && c.paused) return false;
    if (room.status === 'suddenDeath') return true;
    if (room.status !== 'live' || !c) return false;
    const left = c.endsAt - now;
    return Number.isFinite(left) && left > 0 && left <= DRAMA_MS;
  }

  // The host's pin holds the screen unless that room finished (or was voided) or its pin was spent.
  function pinActive(state, rooms, pinned) {
    if (!pinned || pinned === (state && state.ignoredPin)) return false;
    const room = rooms && rooms[pinned];
    return !!room && !DEAD.includes(room.status);
  }

  // Diff rooms against `seen`. A room seen for the first time only sets its
  // baseline, except a start for a room still in its intro.
  function diff(seen, rooms, now) {
    const events = [];
    const next = {};
    for (const code of Object.keys(rooms).sort(byCode)) {
      const room = rooms[code];
      if (!room) continue;
      const prev = seen[code];
      const startedAt = room.clock && typeof room.clock.startedAt === 'number' ? room.clock.startedAt : null;
      if (room.status === 'live' && startedAt !== null && now < startedAt && (!prev || prev.status === 'waiting')) {
        events.push({ type: 'start', code, startedAt });
      }
      const move = Celebrate.detect(prev ? prev.moveCount : null, room);
      if (move && move.tier >= HIGHLIGHT_TIER) events.push({ type: 'highlight', code, move });
      if (room.status === 'final' && prev && prev.status !== 'final') events.push({ type: 'end', code });
      next[code] = { moveCount: (room.game && room.game.moveCount) || 0, status: room.status, startedAt };
    }
    return { events, seen: next };
  }

  // Queue order (FIFO within each): the pinned room's own events, then starts (an intro
  // can't wait: past its startedAt it is never played), then highlights, then ends.
  const RANK = { start: 1, highlight: 2, end: 3 };
  const rank = (ev, pinFor) => (ev.code === pinFor ? 0 : RANK[ev.type]);

  function enqueue(queue, ev, pinFor) {
    const r = rank(ev, pinFor);
    let i = queue.length;
    while (i > 0 && rank(queue[i - 1], pinFor) > r) i--;
    queue.splice(i, 0, ev);
  }

  function setFeatured(s, code, now) {
    if (s.featured !== code) {
      s.featured = code;
      s.since = now;
    }
  }

  // A timed scene (until > 0) is always a fresh scene, even the same scene type in the same room.
  function setScene(s, scene, until, move = null, roundCodes = []) {
    if (until > 0) s.fresh = true;
    s.scene = scene;
    s.sceneUntil = until;
    s.move = move;
    s.roundCodes = roundCodes;
  }

  // A timed scene keeps running only while its room still exists (a reset ends it).
  function sceneAlive(s, rooms) {
    if (s.scene === 'roundStart') return s.roundCodes.some(c => rooms[c]);
    return !!(s.featured && rooms[s.featured]);
  }

  // A start arriving during an intro/roundStart within the round window joins that scene.
  function joinRound(s, ev, rooms, pinned, now) {
    if (ev.type !== 'start' || pinActive(s, rooms, pinned)) return false;
    if (s.scene !== 'intro' && s.scene !== 'roundStart') return false;
    if (!(now < ev.startedAt)) return false;
    const lead = s.scene === 'intro' ? s.featured : s.roundCodes[0];
    const at = s.seen[lead] && s.seen[lead].startedAt;
    if (typeof at !== 'number' || Math.abs(ev.startedAt - at) > ROUND_WINDOW_MS) return false;
    if (s.scene === 'intro') setScene(s, 'roundStart', Math.max(s.sceneUntil, now + ROUND_MS), null, [lead]);
    if (!s.roundCodes.includes(ev.code)) s.roundCodes.push(ev.code);
    return true;
  }

  // Start event(s): one combined roundStart or a single intro. Too late for an intro,
  // nothing happens: the room just joins the rotation (spec §5.7.4).
  // Returns true when a timed scene started.
  function playStart(s, ev, rooms, pinned, now) {
    if (!isLive(rooms[ev.code])) return false;
    const group = [ev];
    if (!pinActive(s, rooms, pinned)) {
      s.queue = s.queue.filter(e => {
        const same = e.type === 'start' && isLive(rooms[e.code]) && Math.abs(e.startedAt - ev.startedAt) <= ROUND_WINDOW_MS;
        if (same) group.push(e);
        return !same;
      });
    }
    group.sort((a, b) => a.startedAt - b.startedAt || byCode(a.code, b.code));
    if (!group.some(e => now < e.startedAt)) return false; // intros are never replayed late
    if (group.length >= 2) {
      setFeatured(s, group[0].code, now);
      setScene(s, 'roundStart', now + ROUND_MS, null, group.map(e => e.code));
    } else {
      setFeatured(s, ev.code, now);
      setScene(s, 'intro', ev.startedAt);
    }
    return true;
  }

  // Play one dequeued event as a scene. Returns true when a timed scene started.
  function play(s, ev, rooms, pinned, now) {
    if (ev.type === 'highlight') {
      setFeatured(s, ev.code, now);
      setScene(s, 'highlight', now + (Match.CELEBRATE_MS[ev.move.tier] || 0) + HIGHLIGHT_PAD_MS, ev.move);
      return true;
    }
    if (ev.type === 'end') {
      if (rooms[ev.code].status !== 'final') return false;
      setFeatured(s, ev.code, now);
      setScene(s, 'winner', now + WINNER_MS);
      if (ev.code === pinned) s.ignoredPin = pinned;
      return true;
    }
    return playStart(s, ev, rooms, pinned, now);
  }

  // Next room after `cur` in code order, wrapping; `pool` is sorted.
  function pickNext(pool, cur) {
    if (!cur) return pool[0];
    return pool.find(c => c > cur) || pool[0];
  }

  // One director tick. sceneId goes up when the scene type or the featured room
  // changes, or a new timed scene (intro, roundStart, highlight, winner) begins.
  function step(state, rooms, pinned, now) {
    const prev = state || init();
    const s = advance(prev, rooms || {}, pinned || null, now);
    const fresh = !!s.fresh;
    delete s.fresh;
    const changed = fresh || s.scene !== prev.scene || s.featured !== prev.featured;
    s.sceneId = (prev.sceneId || 0) + (changed ? 1 : 0);
    return s;
  }

  function advance(prev, rooms, pinned, now) {
    const s = { ...prev, fresh: false, queue: (prev.queue || []).slice(), roundCodes: (prev.roundCodes || []).slice() };
    if (s.ignoredPin && s.ignoredPin !== pinned) s.ignoredPin = null; // the host changed the pin

    const d = diff(prev.seen || {}, rooms, now);
    s.seen = d.seen;
    const pinFor = pinned && pinned !== s.ignoredPin ? pinned : null;
    if (s.corner && (now >= s.corner.until || !pinActive(s, rooms, pinned))) s.corner = null;

    // 1. A running scene keeps going; new events wait (a start may join a round scene).
    if (now < s.sceneUntil && sceneAlive(s, rooms)) {
      for (const ev of d.events) if (!joinRound(s, ev, rooms, pinned, now)) enqueue(s.queue, ev, pinFor);
      return s;
    }
    for (const ev of d.events) enqueue(s.queue, ev, pinFor);
    setScene(s, 'room', 0);

    // 2–6. Queued events, in order. While pinned, other rooms never cut away:
    // their highlights become the corner card and their starts/ends are skipped.
    while (s.queue.length) {
      const ev = s.queue.shift();
      const room = rooms[ev.code];
      if (!room || room.status === 'void') continue;
      if (pinActive(s, rooms, pinned) && ev.code !== pinned) {
        if (ev.type === 'highlight') s.corner = { code: ev.code, move: ev.move, until: now + CORNER_MS };
        continue;
      }
      if (play(s, ev, rooms, pinned, now)) return s;
    }

    // 2. Pinned room.
    if (pinActive(s, rooms, pinned)) {
      setFeatured(s, pinned, now);
      return s;
    }

    // 7. Nothing live.
    const live = Object.keys(rooms).filter(c => isLive(rooms[c])).sort(byCode);
    if (!live.length) {
      setFeatured(s, null, now);
      setScene(s, 'idle', 0);
      return s;
    }

    // 8. Rotation, drama rooms first. A featured room that stopped being live is left at once.
    const drama = live.filter(c => isDrama(rooms[c], now));
    const pool = drama.length ? drama : live;
    const cur = s.featured;
    if (!cur || !live.includes(cur)) {
      setFeatured(s, pickNext(pool, cur), now);
      return s;
    }
    const held = now - s.since;
    const dramaElsewhere = drama.length > 0 && !drama.includes(cur);
    if (held >= ROTATE_MS || (dramaElsewhere && held >= DWELL_MS)) setFeatured(s, pickNext(pool, cur), now);
    return s;
  }

  return {
    ROTATE_MS, DWELL_MS, ROUND_WINDOW_MS, ROUND_MS, WINNER_MS, DRAMA_MS, CORNER_MS, HIGHLIGHT_PAD_MS,
    init, step, isDrama, pinActive
  };
});
