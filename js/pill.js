// Pure turn-pill state for the game screen (and later the projector).
// state(room, mySeat, now) -> null when no game is in play, else { kind, text, ms }:
//   kind: 'ready' | 'you' | 'them' | 'low' | 'paused' | 'appeal' | 'hostDecision' | 'suddenDeath' | 'out'
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

  // The name as shown: at most Names.MAX characters + "…" (QA pass).
  const Names = root.Names || (typeof require === 'function' ? require('./names.js') : null);
  function nameOf(room, seat) {
    const s = room.seats && room.seats[seat];
    const name = (s && s.name) || room['team' + seat + 'Name'] || 'Player';
    return Names ? Names.short(name) : name;
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
    // 3-4 player rooms: a seat that left or dropped out of sudden death watches the rest.
    if (g.out && g.out[mySeat]) return { kind: 'out', text: `You're out · ${who}`, ms };
    if (room.status === 'suddenDeath') {
      const round = ((g.suddenDeath && g.suddenDeath.rounds) || 0) + 1;
      return { kind: 'suddenDeath', text: `⚡ Sudden death · round ${round}/${Match.SUDDEN_DEATH_MAX_ROUNDS} · ${who}`, ms };
    }
    if (ms <= LOW_MS) return { kind: 'low', text: '⏱ ' + who, ms };
    return { kind: mine ? 'you' : 'them', text: who, ms };
  }

  // ---- whose-turn ribbon (turn moments #4) ----
  const RIBBON_WINDOW_MS = 1500; // shown from the turn start for this long; later (refresh, late join) nothing
  const RIBBON_STATUSES = ['live', 'suddenDeath'];

  // The ribbon for the turn now in play, or null (no game, paused, appeal pending, game over).
  // key = "<status>:<turn>@<moveCount>": each new turn (sudden death's first turn included) has its own,
  // and a host Resume (which moves turnStartedAt) keeps it, so the ribbon never plays twice for one turn.
  // Players see "YOUR TURN!" or the opponent's player name; spectators and the host see the team.
  function ribbon(room, mySeat) {
    if (!room || !room.game || !room.clock || !RIBBON_STATUSES.includes(room.status)) return null;
    if (room.clock.paused || room.game.pending) return null;
    const turn = room.game.turn;
    const mine = mySeat === turn;
    const seated = Match.isSeat(room, mySeat);
    let who;
    if (seated) who = nameOf(room, turn);
    else {
      const team = room['team' + turn + 'Name'] || 'Player';
      who = Names ? Names.short(team) : team;
    }
    const name = mine ? null : who.toUpperCase();
    return {
      key: `${room.status}:${turn}@${room.game.moveCount || 0}`,
      at: room.clock.turnStartedAt,
      mine,
      text: mine ? 'YOUR TURN!' : `${name}'S TURN`,
      name, // shown apart from "'S TURN", so a narrow screen cuts the name and keeps the suffix
      sudden: room.status === 'suddenDeath'
    };
  }

  function ribbonDue(info, lastKey, now) {
    return !!info && info.key !== lastKey && now >= info.at && now - info.at < RIBBON_WINDOW_MS;
  }

  return { state, LOW_MS, ribbon, ribbonDue, RIBBON_WINDOW_MS };
});
