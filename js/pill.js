// Pure turn-pill state for the game screen (and later the projector).
// state(room, mySeat, now) -> null when no game is in play, else { kind, text, ms }:
//   kind: 'ready' | 'you' | 'them' | 'low' | 'paused' | 'appeal' | 'hostDecision' | 'suddenDeath'
//   text: plain text (render with textContent, never innerHTML)
//   ms:   turn time to show, clamped to 0..TURN_MS (null for hostDecision)
// Loads as a browser global (Pill) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Pill = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const Match = typeof require === 'function' ? require('./match.js') : root.Match;

  const LOW_MS = 10000;
  const IN_PLAY = ['live', 'suddenDeath', 'hostDecision'];

  function nameOf(room, seat) {
    const s = room.seats && room.seats[seat];
    if (s && s.name) return s.name;
    return (seat === 'A' ? room.teamAName : room.teamBName) || 'Player';
  }

  function state(room, mySeat, now) {
    if (!room || !room.game || !room.clock || !IN_PLAY.includes(room.status)) return null;
    const c = room.clock;
    const g = room.game;
    const TURN_MS = Match.TURN_MS;

    if (room.status === 'hostDecision') return { kind: 'hostDecision', text: '⚖️ Waiting for host decision', ms: null };

    // A turn that starts in the future (intro, celebration delay) shows the full minute.
    const raw = c.paused ? c.paused.turnRemainingMs : TURN_MS - (now - c.turnStartedAt);
    const ms = Math.max(0, Math.min(TURN_MS, raw));

    if (g.pending) return { kind: 'appeal', text: '⚖️ Waiting for host', ms };
    if (c.paused) return { kind: 'paused', text: '⏸ Paused', ms };
    if (now < c.startedAt) return { kind: 'ready', text: 'Get ready', ms };

    const mine = mySeat === g.turn;
    const who = mine ? 'Your turn' : `${nameOf(room, g.turn)}'s turn`;
    if (room.status === 'suddenDeath') {
      const round = ((g.suddenDeath && g.suddenDeath.rounds) || 0) + 1;
      return { kind: 'suddenDeath', text: `⚡ Sudden death · round ${round}/${Match.SUDDEN_DEATH_MAX_ROUNDS} · ${who}`, ms };
    }
    if (ms <= LOW_MS) return { kind: 'low', text: '⏱ ' + who, ms };
    return { kind: mine ? 'you' : 'them', text: who, ms };
  }

  return { state, LOW_MS };
});
