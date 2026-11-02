// "How to play" page (#gamehelp): step-by-step guides for players, hosts and spectators.
// Static: reads no game data. Its numbers come from the game itself (Help.facts), so they never drift.
//
// Pure parts (Node-testable): ROLES, roleOf(hash), facts().
// DOM part: HelpView.show(el, role) (browser global HelpView). Loads as a browser global (Help) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Help = api; root.HelpView = { show: api.show }; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const Match = typeof require === 'function' ? require('./match.js') : root.Match;
  const Engine = typeof require === 'function' ? require('./engine.js') : root.ScrabbleEngine;

  const ROLES = ['player', 'host', 'watch'];

  // 'gamehelp' or 'gamehelp=<role>' (any case) -> the role to open; anything else -> null.
  function roleOf(hash) {
    const m = /^gamehelp(?:=(.*))?$/i.exec(String(hash || ''));
    if (!m) return null;
    const role = String(m[1] || '').toLowerCase();
    return ROLES.includes(role) ? role : 'player';
  }

  function facts() {
    return {
      turnSec: Math.round(Match.TURN_MS / 1000),
      tiers: Engine.TIER_MIN.slice(1),
      bingo: Engine.BINGO_BONUS,
      tauntSec: Math.round(Match.TAUNT_COOLDOWN_MS / 1000),
      sdRounds: Match.SUDDEN_DEATH_MAX_ROUNDS
    };
  }

  function show(el, role) {
    el.innerHTML = '<div class="card"><h1>How to play</h1></div>';
    return () => {};
  }

  return { ROLES, roleOf, facts, show };
});
