// "How to play" page (#gamehelp): step-by-step guides for players, hosts and spectators.
// Static: reads no game data. Its numbers come from the game itself (Help.facts), so they never drift.
// Mobile first: one column and a compact Player / Host / Watch row on phones; a step grid on laptops.
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

  // ---------- page (static markup: no user text anywhere) ----------

  // Small pieces that look like the real game. Decorative: the step text says everything they show.
  const tl = (l, cls = '') => `<span class="gh-tl ${cls}">${l}</span>`;
  const sq = (cls, t) => `<span class="gh-sq ${cls}">${t}</span>`;
  const bt = (cls, t) => `<span class="gh-bt ${cls}">${t}</span>`;
  const inp = (label, v) => `<span class="gh-in">${label} <b>${v}</b></span>`;
  const chip = (cls, t) => `<span class="gh-chip ${cls}">${t}</span>`;
  const mini = html => `<div class="gh-mini" aria-hidden="true">${html}</div>`;
  const bigBar = live => `<div class="gh-big"><div class="gh-big-row"><span>NCR 112</span><span>vs</span><span>98 CAR</span></div><div class="gh-big-live">● LIVE · ${live}</div></div>`;
  const step = (title, pic, text) => `<li class="gh-step"><h3>${title}</h3>${mini(pic)}<p>${text}</p></li>`;

  function guides(f) {
    const turn = f.turnSec === 60 ? '1-minute' : `${f.turnSec}-second`;
    const [t1, t2, t3, t4] = f.tiers;
    return {
      player: {
        icon: '🎮', title: "I'm a player", short: 'Player', sub: "I'm playing for my team", h2: 'Playing for your team',
        steps: [
          step('Join your room', inp('Code', 'K7Q-42M') + inp('Your name', 'Maria') + bt('blue', 'Find room'),
            'Your host gives you a 6-character code. Type it on the <b>Home</b> page with your name.'),
          step('Take your seat, press Ready', bt('blue', 'Play for NCR') + bt('red', 'Play for CAR') + bt('green', "I'm ready"),
            "Pick your team's seat. When both players are ready, the host starts the game."),
          step('Watch the coin toss', '<span class="gh-team">NCR</span><b class="gh-vs">VS</b><span class="gh-team b">CAR</span><span class="gh-coin"></span>',
            'A coin decides who goes first. Get ready: the clocks start right after.'),
          step('Make a word', tl('C') + tl('A', 'sel') + tl('T') + tl('S') + '<span class="gh-arrow">→</span>' + sq('st', '★'),
            '<b>Tap a tile, then a square</b> — or just drag it. The first word must cover the ★. After that, every new word must touch tiles already on the board.'),
          step('Play, recall, pass or shuffle', bt('red', '✅ Play word') + bt('gray', '↩ Recall') + bt('gray', '⏭ Pass') + bt('ylw', '🔀'),
            '<b>Recall</b> takes your tiles back. <b>🔀</b> mixes your rack to help you spot new words.'),
          step('Beat the clock', '<span class="gh-pill">● Your turn 0:42</span>' + chip('c3', '4:58 match'),
            `Each turn has a <b>${turn}</b> clock — let it run out and your turn passes. The match clock runs for the whole game.`),
          step('Use the bonus squares', sq('dl', '2L') + sq('tl', '3L') + sq('dw', '2W') + sq('tw', '3W') + sq('st', '★'),
            `2L and 3L double or triple a letter; 2W and 3W the whole word. Tap <b>? Bonuses</b> during a game to see them. Use all 7 tiles in one play for a <b>+${f.bingo} bingo</b>!`),
          step('Word not found?', bt('gray', '↩ Recall') + bt('blue', '⚖️ Ask host'),
            "Every word is checked in an English dictionary. If yours isn't found, take it back — or ask the host to decide."),
          step('Celebrate (and tease!)', chip('c1', `Not Bad! ${t1}+`) + chip('c2', `Cool! ${t2}+`) + chip('c3', `Awesome! ${t3}+`) + chip('c4', `IMPOSSIBLE!!! ${t4}+`),
            `Bigger words get bigger celebrations: Not Bad! at ${t1}+ points, Cool! ${t2}+, Awesome! ${t3}+, IMPOSSIBLE!!! ${t4}+ or any bingo. Tap 😀 to send your opponent 😠 😂 or 😭 — once every ${f.tauntSec} s.`),
          step('Win for your team', chip('c3', '🏆 +1 NCR'),
            `When the match clock runs out, the higher score wins and earns <b>+1</b> for the team. <b>Tied?</b> ⚡ Sudden death: up to ${f.sdRounds} rounds more, then the host decides. A game also ends early when a player runs out of tiles and the bag is empty.`)
        ],
        tip: "💡 Keep the game on screen during your match (leaving it warns the host). You can refresh any time — you'll be put back in your seat."
      },
      host: {
        icon: '🛠️', title: "I'm the host", short: 'Host', sub: "I'm running the matches and the big screen", h2: 'Running the matches',
        steps: [
          step('Log in as host', inp('Host password', '••••') + bt('blue', 'Log in'),
            'Open <b>Host</b> at the top of the page. The password comes from the organizers.'),
          step('Add the teams', inp('Team name', 'NCR') + bt('blue', 'Add'),
            'Add every team once. The standings update by themselves after each match.'),
          step('Create a match room', inp('NCR vs CAR', '10 min') + bt('blue', 'Create'),
            'Pick the two teams and the match length. You get a room code like <b>K7Q-42M</b> — give it to the two players.'),
          step('Start the game', chip('c2', '✓ Maria ready') + chip('c2', '✓ Juan ready') + bt('green', '▶ Start match'),
            'When both players are ready, press <b>Start</b>. The coin toss plays, then the clocks run.'),
          step('Keep it fair', bt('gray', '⏸ Pause') + bt('gray', 'Award win → NCR') + bt('red', 'Void') + bt('gray', "Free Maria's seat"),
            "<b>Pause</b> if something goes wrong. <b>Free … seat</b> lets a player switch devices. ⚠️ shows when a player leaves the game screen. You decide any dispute."),
          step('Answer word appeals', chip('c3', '⚖️ "QI" not found') + bt('green', 'Approve') + bt('red', 'Deny'),
            'When a player asks, the game pauses until you approve or deny the word.'),
          step('Put it on the big screen', bigBar('ROOM K7Q-42M · 4:12'),
            'Open <a class="gh-link" href="?view=scoreboard" target="_blank" rel="noopener">the big screen ↗</a> on the projector. It follows the live rooms by itself; <b>📌 Pin</b> a room to keep it on screen.'),
          step('Follow the rooms', bt('ylw', 'Active') + bt('gray', 'Finished') + bt('gray', 'Void'),
            'Active rooms need you. Finished ones count in the standings automatically.')
        ],
        tip: "💡 You can close the host page during a game — the players' screens keep the clocks running. But come back for ⚖️ word appeals and ties: they wait for you."
      },
      watch: {
        icon: '👀', title: "I'm watching", short: 'Watch', sub: "I'm here to cheer", h2: 'Watching a match',
        steps: [
          step('Open the room', inp('Code', 'K7Q-42M') + inp('Your name', 'Fan') + bt('blue', 'Find room'),
            "Use the same code as the players, on the <b>Home</b> page."),
          step('Choose "Just watch"', bt('gray', '👁️ Just watch'),
            "You see the board, the scores and the clocks live — but you can't touch the tiles."),
          step('Enjoy the show', chip('c4', 'IMPOSSIBLE!!!') + '<span class="gh-face">😂</span><span class="gh-pill">● Juan\'s turn 0:31</span>',
            "Words drop in, celebrations play and the players' taunts pop up, just like on their screens."),
          step('Or watch the big screen', bigBar('switches between the games'),
            'The projector follows every live match, with the standings and the latest results.')
        ],
        tip: '💡 Need to play after all? Tap <b>Stop watching / take a seat</b> if a seat is free.'
      }
    };
  }

  function show(el, role) {
    const f = facts();
    const g = guides(f);
    const tab = r => `<button type="button" role="tab" class="gh-role gh-${r}" id="ghtab-${r}" data-role="${r}" aria-controls="ghpanel-${r}">
        <span class="gh-ico" aria-hidden="true">${g[r].icon}</span><b><span class="gh-long">${g[r].title}</span><span class="gh-short">${g[r].short}</span></b>
        <small>${g[r].sub}</small></button>`;
    const panel = r => `<section role="tabpanel" class="gh-panel gh-${r}" id="ghpanel-${r}" data-role="${r}" aria-labelledby="ghtab-${r}">
        <h2>${g[r].h2}</h2><ol class="gh-steps">${g[r].steps.join('')}</ol><p class="gh-tip">${g[r].tip}</p></section>`;
    el.innerHTML = `<div class="gh">
      <div class="gh-hero">
        <div class="gh-tiles" aria-hidden="true">${tl('H<sub>4</sub>')}${tl('E<sub>1</sub>')}${tl('L<sub>1</sub>')}${tl('P<sub>3</sub>')}</div>
        <h1 class="disp">How to play</h1>
        <p>One player per team, one timed game per match. The winner's team gets +1.</p>
      </div>
      <ul class="gh-facts">
        <li>⏱ ${f.turnSec === 60 ? '1-minute' : f.turnSec + '-second'} turns</li><li>🕑 5 / 10 / 15-minute matches (or a custom length)</li>
        <li>🏆 +1 for the winning team</li><li>📖 English words only</li>
      </ul>
      <div class="gh-roles" role="tablist" aria-label="Who are you?">${ROLES.map(tab).join('')}</div>
      ${ROLES.map(panel).join('')}
    </div>`;

    const tabs = [...el.querySelectorAll('[role=tab]')];
    const pick = (r, fromUser) => {
      for (const t of tabs) {
        const on = t.dataset.role === r;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        t.classList.toggle('on', on);
      }
      for (const p of el.querySelectorAll('[role=tabpanel]')) p.hidden = p.dataset.role !== r;
      // The address names the role (a link to it opens it), without adding a history entry.
      if (fromUser && root.history && root.history.replaceState) root.history.replaceState(null, '', '#gamehelp=' + r);
    };
    tabs.forEach(t => { t.onclick = () => pick(t.dataset.role, true); });
    // Arrow keys / Home / End move focus between the roles; Enter or Space picks (manual activation).
    el.querySelector('[role=tablist]').onkeydown = ev => {
      const i = tabs.indexOf(document.activeElement);
      if (i === -1) return;
      const to = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[ev.key];
      if (to === undefined) return;
      ev.preventDefault();
      tabs[to].focus();
    };
    pick(ROLES.includes(role) ? role : 'player', false);
    return () => {};
  }

  return { ROLES, roleOf, facts, show };
});
