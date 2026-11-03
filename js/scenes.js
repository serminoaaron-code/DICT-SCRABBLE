// Match scenes: the VS intro + 3D coin toss before each match, the projector's
// combined "ROUND STARTING" scene, and the result screens (winner / other player /
// neutral / void). Look and timing follow the approved mockup
// (.superpowers/brainstorm/.../intro-coin-winner-v2.html).
//
// Pure parts (Node-testable): introRemaining, INTRO_VS_MS, ROUND_MS, resultViewer,
// resultReason, bestWord, bestWordText, resultFresh, RESULT_FRESH_MS, endingCelebration.
// DOM parts: playIntro, clearIntro, roundStart, clearRound, renderResult, clearResult.
// Nothing touches the DOM at load time. Loads as a browser global (Scenes) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Scenes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const INTRO_VS_MS = 2600;   // VS intro 0–2600 ms, coin toss 2600–INTRO_MS (6500)
  const COIN_FLIP_MS = 1800;  // the coin lands 1800 ms into the toss
  const COIN_RESULT_MS = 1900; // "<TEAM> GOES FIRST!" pops 100 ms after landing
  const VS_LAND_MS = 1100;    // the VS badge finishes spinning in (.6 s delay + .5 s)
  const COIN_RESULT_AT = INTRO_VS_MS + COIN_RESULT_MS; // the result pops 4500 ms into the intro; it stays until INTRO_MS
  const ROUND_MS = 5000;
  const FADE_OUT_MS = 250;
  // 3-4 player rooms: the "3/4-WAY" team intro, then the roulette wheel spins and lands on the stored
  // firstSeat; "<TEAM> GOES FIRST!" shows at WHEEL_RESULT_AT and holds until Match.INTRO_MULTI_MS (8500).
  const MULTI_TEAMS_MS = 2600;
  const WHEEL_SPIN_MS = 3400;
  const WHEEL_RESULT_AT = MULTI_TEAMS_MS + WHEEL_SPIN_MS;

  // Degrees (clockwise) the wheel turns so firstSeat's slice centre ends under the top pointer.
  // Slice i covers [i, i + 1) x 360/n degrees clockwise from the top, in seat order.
  function wheelTurns(seats, firstSeat, spins = 5) {
    const n = seats.length;
    const i = Math.max(0, seats.indexOf(firstSeat));
    return spins * 360 + (360 - (i + 0.5) * 360 / n);
  }

  // ---------- pure ----------

  // The intro's length for this room: 6500 (VS + coin), 8500 for 3-4 players (teams + roulette).
  const introMs = room => {
    const M = root.Match || (typeof require === 'function' ? require('./match.js') : null);
    return (M && M.introMsFor ? M.introMsFor(room) : M && M.INTRO_MS) || 6500;
  };
  const isMultiRoom = room => !!room && [3, 4].includes(room.players);
  // Seat colours (fixed, as the room's chips): A blue, B red, C green, D yellow (C and D take dark text).
  const SEAT_BG = { A: '#1446a0', B: '#e1251b', C: '#00a651', D: '#ffc20e' };
  const SEAT_FG = { A: '#fff', B: '#fff', C: '#0b1f4d', D: '#0b1f4d' };

  // Time left before the clocks start (0 once the match is under way).
  function introRemaining(room, now) {
    const s = room && room.clock ? Number(room.clock.startedAt) : NaN;
    if (!isFinite(s)) return 0;
    return Math.max(0, s - now);
  }


  // ---- result scenes (pure) ----

  const RESULT_FRESH_MS = 30000; // a result older than this shows without the entrance (later visits, refreshes)
  const REASON_LINE = {
    time: "Time's up", suddenDeath: 'Won in sudden death', bagOut: 'Tiles ran out',
    resign: 'Opponent left the game', awarded: 'Awarded by the host', walkover: 'Walkover', corrected: 'Result corrected by the host'
  };
  const lib = (globalName, file) => root[globalName] || (typeof require === 'function' ? require(file) : null);

  const M = () => lib('Match', './match.js');
  const hasResult = room => !!(room && room.status !== 'void' && room.result && M().isSeat(room, room.result.winner));

  // Which result scene this viewer gets: the winning seat 'winner', the other seats 'other',
  // spectators / the host / anyone else 'neutral' (also for void rooms and rooms without a result).
  function resultViewer(room, mySeat) {
    if (!hasResult(room) || !M().isSeat(room, mySeat)) return 'neutral';
    return mySeat === room.result.winner ? 'winner' : 'other';
  }

  // The reason line, with the existing copy ("<player> left the game" for a resign) and the host's note.
  // 3-4 player rooms: a resign only ends the game when one player is left.
  function resultReason(room) {
    if (!hasResult(room)) return '';
    const res = room.result;
    let line = REASON_LINE[res.reason] || '';
    if (res.reason === 'resign' && M().seatsOf(room).length > 2) line = 'Everyone else left the game';
    else if (res.reason === 'resign') {
      const loser = res.winner === 'A' ? 'B' : 'A';
      line = `${playerOf(room, loser) || teamOf(room, loser)} left the game`;
    }
    return res.note ? `${line}: ${res.note}` : line;
  }

  // { word, total, title } for game.bestMove (title '' for tier 0), or null on rooms without one.
  function bestWord(room) {
    const bm = room && room.game && room.game.bestMove;
    if (!bm || !bm.words || !bm.words.length) return null;
    const total = Number(bm.total) || 0;
    const Engine = lib('ScrabbleEngine', './engine.js');
    const Cel = lib('Celebrate', './celebrate.js');
    const tier = Engine ? Engine.celebrationTier(total, !!bm.bingo) : 0;
    const w = bm.words[0] || {};
    const word = Engine ? Engine.shownWord(w) : String(w.word || ''); // "VERIFY", or "STOP/POTS" (both readings)
    return { word, total, title: (tier && Cel && Cel.TITLES[tier]) || '' };
  }

  // "⭐ Best word: WORD · N pts (<tier title>)", no parenthesis for tier 0, '' without a best move.
  function bestWordText(room) {
    const b = bestWord(room);
    if (!b) return '';
    return `⭐ Best word: ${b.word} · ${b.total} pts` + (b.title ? ` (${b.title})` : '');
  }

  // True while the result is recent enough to play the entrance (trophy, slam, count-up, confetti, fanfare).
  function resultFresh(room, now) {
    const at = room && room.result ? Number(room.result.decidedAt) : NaN;
    return isFinite(at) && now - at <= RESULT_FRESH_MS;
  }

  // The play that ended the game (bag out, or the last sudden-death move) never got its word
  // celebration on the live screen, because the final screen replaced it. Returns that move's
  // Celebrate.detect() item when it rates tier >= 1 and is new to this viewer, else null.
  // prevMoveCount null = this view never showed the live game (page load): nothing replays.
  function endingCelebration(prevMoveCount, room) {
    if (!hasResult(room) || room.status !== 'final') return null;
    if (room.result.reason !== 'bagOut' && room.result.reason !== 'suddenDeath') return null;
    const Cel = lib('Celebrate', './celebrate.js');
    const c = Cel ? Cel.detect(prevMoveCount, room) : null;
    return c && c.tier >= 1 ? c : null;
  }

  // ---------- DOM ----------

  const doc = () => root.document;
  const reducedMotion = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function el(tag, cls, text) {
    const e = doc().createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text; // user strings never go through innerHTML
    return e;
  }

  function createRun() {
    const run = { timers: [], nodes: [], anims: [], done: false, onEnd: null };
    run.later = (ms, f) => run.timers.push(setTimeout(() => { if (!run.done) f(); }, Math.max(0, ms)));
    return run;
  }

  // Ends a scene: cancels every timer and animation, removes its nodes. skipped = the viewer pressed Skip.
  function stopRun(run, skipped = false) {
    if (!run || run.done) return;
    run.done = true;
    run.skipped = skipped;
    run.timers.forEach(clearTimeout);
    run.anims.forEach(a => { try { a.cancel(); } catch (e) { /* ignore */ } });
    run.nodes.forEach(n => n.remove());
    syncBody();
    if (run.onEnd) run.onEnd(skipped);
  }

  // While a scene shows, lift the game area above the sticky PLAYGROUND bar (like body.fx-active).
  function syncBody() {
    const d = doc();
    if (d && d.body) d.body.classList.toggle('fx-scene', !!d.querySelector('.fx-intro, .fx-round'));
  }

  function skipButton(run, label) {
    const skip = el('button', 'fx-skip', '✕ Skip');
    skip.type = 'button';
    skip.setAttribute('aria-label', label);
    skip.onclick = ev => { ev.stopPropagation(); stopRun(run, true); };
    return skip;
  }

  function fadeOutAt(run, ov, at) {
    run.later(at, () => {
      if (ov.animate) run.anims.push(ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_OUT_MS, fill: 'forwards' }));
    });
  }

  // Names as shown: at most Names.MAX characters + "…" (QA pass); the full names stay available for
  // hover titles and screen-reader text.
  const teamFull = (room, seat) => room['team' + seat + 'Name'] || 'Team ' + seat;
  const playerFull = (room, seat) => (room.seats && room.seats[seat] && room.seats[seat].name) || '';
  const shortName = s => { const N = lib('Names', './names.js'); return N ? N.short(s) : s; };
  const teamOf = (room, seat) => shortName(teamFull(room, seat));
  const playerOf = (room, seat) => shortName(playerFull(room, seat));
  const sizeClass = name => (name.length > 22 ? ' xlong' : name.length > 12 ? ' long' : '');

  function roomTag(room) {
    const code = room.code ? (root.Match && root.Match.formatCode ? root.Match.formatCode(room.code) : room.code) : '';
    const min = Math.round((Number(room.matchLengthSec) || 0) / 6) / 10;
    return [code && 'ROOM ' + code, min ? min + ' MIN MATCH' : ''].filter(Boolean).join(' · ');
  }

  // #tossLine caption: "🪙 Coin toss: <b>TEAM</b> goes first" (3-4 players: "🎡 Roulette: …"),
  // built from text nodes.
  function setTossLine(line, team, wheel = false) {
    if (!line) return;
    line.textContent = '';
    const b = el('b', '', team);
    line.append(wheel ? '🎡 Roulette: ' : '🪙 Coin toss: ', b, ' goes first');
  }

  // ---- VS intro + coin toss ----

  let intro = null;

  // Plays the intro from the point matching the room's clock; removes itself at startedAt.
  // Returns true when a scene started. opts: { onDone }.
  function playIntro(container, room, now, opts = {}) {
    clearIntro();
    if (!container || !doc() || !room || !room.game) return false;
    const remaining = introRemaining(room, now);
    if (remaining <= 0) return false;
    const total = introMs(room);
    const elapsed = Math.max(0, total - remaining);
    const reduced = reducedMotion();
    if (isMultiRoom(room)) return playMultiIntro(container, room, remaining, elapsed, reduced, opts);
    const first = room.game.firstSeat === 'B' ? 'B' : 'A';
    const firstTeam = teamOf(room, first);

    const run = createRun();
    intro = run;
    const line = container.querySelector('#tossLine');
    setTossLine(line, firstTeam);
    // The caption stays until the clocks start, even when this viewer skips the scene.
    run.clearLine = () => { clearTimeout(run.lineTimer); if (line && line.isConnected) line.textContent = ''; };
    run.lineTimer = setTimeout(run.clearLine, remaining);
    run.onEnd = skipped => {
      if (!skipped) { run.clearLine(); if (intro === run) intro = null; }
      if (opts.onDone) opts.onDone();
    };

    const ov = el('div', 'fx-overlay fx-intro' + (reduced ? ' fx-reduced' : ''));
    if (root.Layout) root.Layout.fitStage(ov, opts.areaEl); // desktop landscape: over the board
    const sr = el('div', 'fx-sr', `${teamFull(room, 'A')} versus ${teamFull(room, 'B')}. Coin toss: ${teamFull(room, first)} goes first.`);
    sr.setAttribute('role', 'status');
    const stage = el('div', 'fx-stage');
    stage.setAttribute('aria-hidden', 'true');
    const vs = buildVs(room);
    const coin = buildCoin(room, firstTeam);
    stage.append(vs, coin.scene);
    ov.append(sr, stage, skipButton(run, 'Skip intro'));
    container.appendChild(ov);
    run.nodes.push(ov);
    syncBody();

    if (elapsed < INTRO_VS_MS) {
      // CSS animations start at the matching point through a negative delay.
      ov.style.setProperty('--in-off', -Math.round(elapsed) + 'ms');
      vs.classList.add('on');
      if (elapsed < VS_LAND_MS) run.later(VS_LAND_MS - elapsed, () => root.Sound && root.Sound.play('vs'));
      run.later(INTRO_VS_MS - elapsed, () => startCoin(run, vs, coin, first, 0, reduced));
    } else {
      startCoin(run, vs, coin, first, elapsed - INTRO_VS_MS, reduced);
    }
    fadeOutAt(run, ov, remaining - FADE_OUT_MS);
    run.later(remaining, () => stopRun(run));
    return true;
  }

  // ---- 3-4 player rooms: the "3/4-WAY" team intro, then the roulette wheel (mockup A) ----
  // The wheel lands on the stored firstSeat (Match.startMatch picked it once), so every screen and the
  // projector show the same spin; a late arrival or a refresh joins the spin at the matching point.
  function playMultiIntro(container, room, remaining, elapsed, reduced, opts) {
    const seats = (root.Match || lib('Match', './match.js')).seatsOf(room);
    const first = seats.includes(room.game.firstSeat) ? room.game.firstSeat : seats[0];
    const firstTeam = teamOf(room, first);
    const run = createRun();
    intro = run;
    const line = container.querySelector('#tossLine');
    setTossLine(line, firstTeam, true);
    run.clearLine = () => { clearTimeout(run.lineTimer); if (line && line.isConnected) line.textContent = ''; };
    run.lineTimer = setTimeout(run.clearLine, remaining);
    run.onEnd = skipped => {
      if (!skipped) { run.clearLine(); if (intro === run) intro = null; }
      if (opts.onDone) opts.onDone();
    };

    const ov = el('div', 'fx-overlay fx-intro fx-multi' + (reduced ? ' fx-reduced' : ''));
    if (root.Layout) root.Layout.fitStage(ov, opts.areaEl);
    const sr = el('div', 'fx-sr', `${seats.map(s => teamFull(room, s)).join(' versus ')}. Roulette: ${teamFull(room, first)} goes first.`);
    sr.setAttribute('role', 'status');
    const stage = el('div', 'fx-stage');
    stage.setAttribute('aria-hidden', 'true');
    const teams = buildTeams(room, seats);
    const wheel = buildWheel(room, seats, first, firstTeam);
    stage.append(teams, wheel.scene);
    ov.append(sr, stage, skipButton(run, 'Skip intro'));
    container.appendChild(ov);
    run.nodes.push(ov);
    syncBody();

    if (elapsed < MULTI_TEAMS_MS) {
      ov.style.setProperty('--in-off', -Math.round(elapsed) + 'ms');
      teams.classList.add('on');
      if (elapsed < 600) run.later(600 - elapsed, () => root.Sound && root.Sound.play('vs'));
      run.later(MULTI_TEAMS_MS - elapsed, () => startWheel(run, teams, wheel, 0, reduced));
    } else {
      startWheel(run, teams, wheel, elapsed - MULTI_TEAMS_MS, reduced);
    }
    fadeOutAt(run, ov, remaining - FADE_OUT_MS);
    run.later(remaining, () => stopRun(run));
    return true;
  }

  function buildTeams(room, seats) {
    const sc = el('div', 'in-scene in-multi');
    const box = el('div', 'in-mbox');
    box.appendChild(el('div', 'in-way disp', `${seats.length}-WAY`));
    seats.forEach((s, i) => {
      const team = teamOf(room, s);
      const band = el('div', `in-mteam in-ms-${s.toLowerCase()}`);
      band.style.setProperty('--d', i * 120 + 'ms');
      band.append(el('div', 'in-tm disp' + sizeClass(team), team));
      const p = playerOf(room, s);
      if (p) band.appendChild(el('div', 'in-pl', p.toUpperCase()));
      box.appendChild(band);
    });
    const tag = roomTag(room);
    if (tag) box.appendChild(el('div', 'in-tag', tag));
    sc.appendChild(box);
    return sc;
  }

  function buildWheel(room, seats, first, firstTeam) {
    const scene = el('div', 'in-scene in-wheel');
    const box = el('div', 'in-coin-box');
    const wrap = el('div', 'in-wheel-wrap');
    const disc = el('div', 'in-wheel-disc');
    const n = seats.length;
    const slice = 360 / n;
    disc.style.background = 'conic-gradient(' + seats.map((s, i) => `${SEAT_BG[s]} ${i * slice}deg ${(i + 1) * slice}deg`).join(', ') + ')';
    seats.forEach((s, i) => {
      const lbl = el('span', 'in-wheel-lbl', teamOf(room, s));
      lbl.style.color = SEAT_FG[s];
      lbl.style.setProperty('--a', (i + 0.5) * slice + 'deg');
      disc.appendChild(lbl);
    });
    const turns = wheelTurns(seats, first);
    disc.dataset.turns = String(turns);
    wrap.append(el('div', 'in-ptr'), disc, el('div', 'in-hub disp', 'GO'));
    const result = el('div', 'in-result disp');
    result.append(el('span', 'nm', firstTeam.toUpperCase()), ' GOES FIRST!');
    box.append(el('div', 'in-coin-title disp', '🎡 WHO GOES FIRST?'), wrap, result, el('div', 'in-note', 'Same result on every screen'));
    scene.appendChild(box);
    return { scene, disc, result, turns };
  }

  // we: ms already elapsed in the spin (late arrival / refresh).
  function startWheel(run, teams, w, we, reduced) {
    teams.classList.remove('on');
    w.scene.style.setProperty('--in-off', -Math.round(we) + 'ms');
    w.scene.classList.add('on');
    if (reduced || !w.disc.animate || we >= WHEEL_SPIN_MS) {
      w.disc.style.transform = `rotate(${w.turns}deg)`;
    } else {
      const spin = w.disc.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${w.turns}deg)` }],
        { duration: WHEEL_SPIN_MS, easing: 'cubic-bezier(.12,.6,.18,1)', fill: 'forwards' });
      spin.currentTime = we;
      run.anims.push(spin);
    }
    if (we < WHEEL_SPIN_MS) {
      run.later(WHEEL_SPIN_MS - we, () => { root.Sound && root.Sound.play('coin'); w.result.classList.add('go'); });
    } else w.result.classList.add('shown');
  }

  function clearIntro() {
    const run = intro;
    intro = null;
    if (!run) return;
    stopRun(run);
    run.clearLine();
  }

  // True when this viewer pressed Skip on the current intro (callers then don't re-mount it).
  function introSkipped() {
    return !!(intro && intro.skipped);
  }

  // Freezes the playing intro where it is (host pause during the intro): no timers, no sounds,
  // animations held, caption kept. A later playIntro (after the resume) replaces it.
  function holdIntro() {
    const run = intro;
    if (!run || run.done || run.held) return;
    run.held = true;
    run.timers.forEach(clearTimeout);
    run.timers = [];
    clearTimeout(run.lineTimer);
    run.anims.forEach(a => { try { a.pause(); } catch (e) { /* ignore */ } });
    run.nodes.forEach(n => { n.classList.add('fx-hold'); n.appendChild(el('div', 'in-paused', '⏸ Paused')); });
  }

  function buildVs(room) {
    const vs = el('div', 'in-scene in-vs');
    for (const s of ['A', 'B']) {
      const team = teamOf(room, s);
      const half = el('div', `in-half in-${s.toLowerCase()}`);
      half.append(el('div', 'in-tm disp' + sizeClass(team), team));
      const p = playerOf(room, s);
      if (p) half.appendChild(el('div', 'in-pl', p.toUpperCase()));
      vs.appendChild(half);
    }
    vs.appendChild(el('div', 'in-badge disp', 'VS'));
    const tag = roomTag(room);
    if (tag) vs.appendChild(el('div', 'in-tag', tag));
    return vs;
  }

  function buildCoin(room, firstTeam) {
    const scene = el('div', 'in-scene in-coin');
    const box = el('div', 'in-coin-box');
    const wrap = el('div', 'in-coin-wrap');
    const coin = el('div', 'in-coin3d');
    for (const [s, side, face] of [['A', 'HEADS', 'in-front'], ['B', 'TAILS', 'in-back']]) {
      const team = teamOf(room, s);
      const f = el('div', `in-face ${face}${sizeClass(team)}`);
      f.append(el('small', '', side), el('span', 'disp', team));
      coin.appendChild(f);
    }
    wrap.appendChild(coin);
    const shadow = el('div', 'in-shadow');
    // "<TEAM> GOES FIRST!": the team on one line ("…" when long), then "GOES FIRST!".
    const result = el('div', 'in-result disp');
    result.append(el('span', 'nm', firstTeam.toUpperCase()), ' GOES FIRST!');
    box.append(el('div', 'in-coin-title disp', '🪙 COIN TOSS'), wrap, shadow, result,
      el('div', 'in-note', 'Same result on every screen'));
    scene.appendChild(box);
    return { scene, coin, shadow, result };
  }

  // ce: ms already elapsed in the coin toss (late arrival / refresh).
  function startCoin(run, vs, c, first, ce, reduced) {
    vs.classList.remove('on');
    c.scene.style.setProperty('--in-off', -Math.round(ce) + 'ms');
    c.scene.classList.add('on');
    const land = first === 'A' ? 1800 : 1980; // Team A on the yellow face, Team B on the red face
    if (reduced || !c.coin.animate || ce >= COIN_FLIP_MS) {
      c.coin.style.transform = `rotateY(${land}deg)`;
    } else {
      const lift = Math.round(c.coin.getBoundingClientRect().height || 150); // the mockup's 150 px for a 150 px coin
      const flip = c.coin.animate([
        { transform: 'translateY(0) rotateY(0deg)' },
        { transform: `translateY(${-lift}px) rotateY(${land / 2}deg)`, offset: 0.5 },
        { transform: `translateY(0) rotateY(${land}deg)` }
      ], { duration: COIN_FLIP_MS, easing: 'cubic-bezier(.3,.1,.3,1)', fill: 'forwards' });
      const sh = c.shadow.animate([
        { transform: 'scale(1)', opacity: 0.35 }, { transform: 'scale(.5)', opacity: 0.15, offset: 0.5 }, { transform: 'scale(1)', opacity: 0.35 }
      ], { duration: COIN_FLIP_MS, fill: 'forwards' });
      flip.currentTime = ce;
      sh.currentTime = ce;
      run.anims.push(flip, sh);
    }
    if (ce < COIN_FLIP_MS) run.later(COIN_FLIP_MS - ce, () => root.Sound && root.Sound.play('coin'));
    if (ce < COIN_RESULT_MS) run.later(COIN_RESULT_MS - ce, () => c.result.classList.add('go'));
    else c.result.classList.add('shown');
  }

  // ---- ROUND STARTING (projector, several rooms starting together) ----

  let round = null;

  // All matchups ("A vs B") slam in under "ROUND STARTING"; removes itself after ROUND_MS.
  // Returns true when the scene started. opts: { onDone }.
  function roundStart(container, rooms, opts = {}) {
    clearRound();
    if (!container || !doc()) return false;
    const list = (rooms || []).filter(Boolean);
    const reduced = reducedMotion();
    const run = createRun();
    round = run;
    run.onEnd = () => { if (round === run) round = null; if (opts.onDone) opts.onDone(); };

    const ov = el('div', 'fx-overlay fx-round' + (reduced ? ' fx-reduced' : '') + (list.length > 6 ? ' many' : ''));
    const seatsIn = r => (root.Match || lib('Match', './match.js')).seatsOf(r);
    const lines = list.map(r => seatsIn(r).map(s => teamOf(r, s)).join(' vs '));
    const sr = el('div', 'fx-sr', `Round starting: ${lines.join('; ')}`);
    sr.setAttribute('role', 'status');
    const stage = el('div', 'fx-stage');
    stage.setAttribute('aria-hidden', 'true');
    const box = el('div', 'rs-box');
    box.appendChild(el('div', 'rs-title disp', 'ROUND STARTING'));
    const ul = el('div', 'rs-list');
    list.forEach((r, i) => {
      const row = el('div', 'rs-match');
      row.style.setProperty('--i', String(i));
      seatsIn(r).forEach((s, k) => {
        if (k) row.appendChild(el('span', 'rs-vs disp', 'vs'));
        row.appendChild(el('span', 'rs-team rs-' + s.toLowerCase(), teamOf(r, s)));
      });
      ul.appendChild(row);
    });
    box.appendChild(ul);
    stage.appendChild(box);
    ov.append(sr, stage);
    container.appendChild(ov);
    run.nodes.push(ov);
    syncBody();
    if (root.Sound) root.Sound.play('vs');
    fadeOutAt(run, ov, ROUND_MS - FADE_OUT_MS);
    run.later(ROUND_MS, () => stopRun(run));
    return true;
  }

  function clearRound() {
    if (round) stopRun(round);
    round = null;
  }

  // ---- result screens (spec §5.6) ----
  // winner: gold rays, 🏆 drops, the team slams in, scores count up, "+1 TEAM" stamp, ⭐ best word, confetti, fanfare.
  // other:  the same layout in calm blue, "<TEAM> wins · well played", 🤝, no confetti, light score pill (dark text).
  // neutral (spectators, host): the gold scene, "<TEAM> wins", with confetti.  void: a calm grey card.
  // The hero sits in the page (not an overlay); #finalHost, #board-container (behind View board),
  // #finalStandings and #backBtn come with it. The caller fills the board and standings and wires #backBtn.

  const RS_SLAM_MS = 450, RS_COUNT_MS = 800, RS_COUNT_DUR = 900, RS_CONFETTI_MS = 500; // mockup timings
  let result = null;

  function clearResult() {
    if (result) stopRun(result);
    result = null;
  }

  // opts: { animate (default true: play the entrance), delayMs (hold the entrance, e.g. behind a word
  // celebration) }. Replaces the container's content. Returns the hero element.
  function renderResult(container, room, viewer, opts = {}) {
    clearResult();
    if (!container || !doc()) return null;
    const animate = opts.animate !== false;
    const delay = Math.max(0, Number(opts.delayMs) || 0);
    const reduced = reducedMotion();
    const isVoid = !hasResult(room);
    const kind = isVoid ? 'void' : (viewer === 'winner' || viewer === 'other' ? viewer : 'neutral');

    const card = el('div', 'card narrow stack res-final');
    const hero = el('section', `res-hero res-${kind}` + (reduced ? ' res-reduced' : '') + (animate ? '' : ' res-static'));
    hero.setAttribute('aria-label', 'Result');
    hero.style.setProperty('--res-delay', delay + 'ms');
    const inner = el('div', 'res-in');
    let nums = [];

    if (isVoid) {
      inner.append(el('div', 'res-icon', '⚖️'), el('h2', 'res-void-head', 'This room was voided'),
        el('p', 'res-void-note', isMultiRoom(room) ? 'It does not count for any team.' : 'It does not count for either team.'));
      if (room && room.voidNote) inner.appendChild(el('p', 'res-void-note', 'Reason: ' + room.voidNote));
    } else {
      const res = room.result;
      const win = res.winner;
      const team = teamOf(room, win);
      if (!reduced) {
        const bg = el('div', 'res-bg');
        bg.appendChild(el('div', 'res-rays'));
        hero.appendChild(bg);
      }
      inner.appendChild(el('div', 'res-trophy', kind === 'other' ? '🤝' : '🏆'));
      // One text run, "<TEAM> wins", so the headline reads (and copies) as the fixed copy; CSS uppercases it.
      const head = el('h2', 'res-head');
      const teamEl = el('span', 'res-team disp' + sizeClass(team), team);
      teamEl.title = teamFull(room, win); // long names end in "…"; the full name on hover
      head.append(teamEl, ' ',
        el('span', 'res-wins disp', kind === 'winner' ? 'wins!' : kind === 'other' ? 'wins · well played' : 'wins'));
      inner.appendChild(head);

      const score = el('div', 'res-score');
      const side = s => {
        const box = el('div', 'res-side' + (s === win ? ' w' : ''));
        const p = playerOf(room, s);
        const num = el('div', 'res-num disp', '');
        // Team on one line, player on the next, each ending in "…" when long; the " · " stays in the
        // text (screen readers, copy) but isn't shown.
        const lbl = el('div', 'res-lbl');
        lbl.appendChild(el('span', 'res-lbl-team', teamOf(room, s)));
        if (p) lbl.append(el('span', 'res-lbl-sep', ' · '), el('span', 'res-lbl-pl', p));
        lbl.title = p ? `${teamFull(room, s)} · ${playerFull(room, s)}` : teamFull(room, s);
        box.append(lbl, num);
        nums.push([num, Number(s === 'A' ? res.scoreA : res.scoreB) || 0]);
        return box;
      };
      if (!isMultiRoom(room)) {
        score.append(side('A'), el('div', 'res-dash disp', '–'), side('B'));
        inner.appendChild(score);
      } else if (res.reason !== 'walkover') {
        inner.appendChild(buildPodium(room, nums)); // 3-4 players (mockup A); a walkover shows no podium
      }

      inner.appendChild(el('div', 'res-plus disp' + sizeClass(team), `+1 ${team}`));
      const bw = bestWord(room);
      if (bw) {
        const line = el('div', 'res-best');
        line.append('⭐ Best word: ', el('b', '', bw.word), ` · ${bw.total} pts` + (bw.title ? ` (${bw.title})` : ''));
        inner.appendChild(line);
      }
      const reason = resultReason(room);
      if (reason) {
        // "<player> left the game": the name gets the one-line "…" treatment, the rest stays readable.
        const line = el('div', 'res-reason');
        const loser = win === 'A' ? 'B' : 'A';
        const who = res.reason === 'resign' && !isMultiRoom(room) ? (playerOf(room, loser) || teamOf(room, loser)) : '';
        if (who && reason.startsWith(who)) line.append(el('span', 'nm', who), reason.slice(who.length));
        else line.textContent = reason;
        inner.appendChild(line);
      }
    }
    hero.appendChild(inner);

    const btns = el('div', 'res-btns');
    let boardBox = null;
    if (room && room.game) {
      boardBox = el('div', 'res-board hidden');
      boardBox.id = 'board-container';
      const view = el('button', 'res-alt', 'View board');
      view.type = 'button';
      view.id = 'viewBoardBtn';
      view.setAttribute('aria-expanded', 'false');
      view.setAttribute('aria-controls', 'board-container');
      view.onclick = () => {
        const open = !boardBox.classList.toggle('hidden');
        view.textContent = open ? 'Hide board' : 'View board';
        view.setAttribute('aria-expanded', String(open));
        if (open && boardBox.scrollIntoView) boardBox.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
      };
      btns.appendChild(view);
    }
    const back = el('button', 'res-main', 'Back to start');
    back.type = 'button';
    back.id = 'backBtn';
    btns.appendChild(back);
    hero.appendChild(btns);

    const host = el('div');
    host.id = 'finalHost';
    const stand = el('div');
    stand.id = 'finalStandings';
    card.append(hero, host);
    if (boardBox) card.appendChild(boardBox);
    card.append(el('h3', 'res-stand-title', '🏆 Team standings'), stand);
    container.textContent = '';
    container.appendChild(card);

    const run = createRun();
    result = run;
    run.onEnd = () => { if (result === run) result = null; };
    const playing = animate && !reduced;
    nums.forEach(([n, v]) => { n.textContent = String(playing ? 0 : v); });
    if (isVoid) return hero;
    if (playing) {
      run.later(delay + RS_COUNT_MS, () => nums.forEach(([n, v]) => countTo(run, n, v, RS_COUNT_DUR)));
      if (kind !== 'other') run.later(delay + RS_CONFETTI_MS, () => resultConfetti(run, hero));
    }
    // the win fanfare (after the ringside bell, when it rang: opts.winSoundDelayMs)
    if (animate && kind === 'winner') run.later(delay + RS_SLAM_MS + (opts.winSoundDelayMs || 0), () => root.Sound && root.Sound.play('win'));
    return hero;
  }

  // The podium (3-4 player rooms): Match.ranking's order. The recorded winner is on the tallest,
  // centre step; places 2 and 3 beside it (a shared place has the same height), 4th on a line below.
  // Players who left get a small "LEFT" tag. The scores count up with the hero's (nums).
  function buildPodium(room, nums) {
    const rank = (root.Match || lib('Match', './match.js')).ranking(room);
    const wrap = el('div', 'res-podium-wrap');
    const pod = el('div', 'res-podium' + (rank.length < 4 ? ' solo' : ''));
    const who = x => {
      const box = el('div', 'res-who');
      const team = el('span', 'chip chip-' + x.seat.toLowerCase(), teamOf(room, x.seat));
      team.title = teamFull(room, x.seat);
      box.appendChild(team);
      const p = playerOf(room, x.seat);
      if (p) { const pl = el('div', 'res-pl', p); pl.title = playerFull(room, x.seat); box.appendChild(pl); }
      if (x.left) box.appendChild(el('span', 'res-left-tag', 'LEFT'));
      return box;
    };
    const num = x => { const n = el('div', 'res-num disp' + (x.place === 1 ? ' w' : ''), ''); nums.push([n, x.score]); return n; };
    // display order: 2nd, 1st, 3rd
    const steps = [rank[1], rank[0], rank[2]].filter(Boolean);
    for (const x of steps) {
      const st = el('div', 'res-step' + (x.place === 1 ? ' w' : ''));
      st.dataset.seat = x.seat;
      st.dataset.place = String(x.place);
      st.append(who(x), num(x), el('div', `res-blk p${Math.min(3, x.place)} disp`, String(x.place)));
      pod.appendChild(st);
    }
    wrap.appendChild(pod);
    if (rank[3]) {
      const x = rank[3];
      const row = el('div', 'res-fourth');
      row.dataset.seat = x.seat;
      row.dataset.place = String(x.place);
      const left = el('span', 'res-fourth-who');
      left.append(el('b', 'disp', String(x.place)), who(x));
      row.append(left, num(x));
      wrap.appendChild(row);
    }
    return wrap;
  }

  // Ease-out count from 0 to `to`; a stopped run (re-render, route change) jumps to the final value.
  function countTo(run, node, to, dur) {
    const now = () => (root.performance ? root.performance.now() : Date.now());
    const start = now();
    const step = () => {
      const p = run.done ? 1 : Math.min(1, (now() - start) / dur);
      node.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) root.requestAnimationFrame(step);
    };
    if (root.requestAnimationFrame) root.requestAnimationFrame(step);
    else node.textContent = String(to);
  }

  // The mockup's confetti: 70 pieces fall through the hero, which clips them. Never with reduced motion.
  function resultConfetti(run, hero) {
    if (!hero.isConnected || reducedMotion()) return;
    const colors = ['#e1251b', '#1446a0', '#00a651', '#2e7cf6', '#ffffff', '#0b1f4d'];
    const h = hero.getBoundingClientRect().height || 560;
    const pieces = [];
    for (let i = 0; i < 70; i++) {
      const c = el('div', 'confetti res-confetti');
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[i % colors.length];
      if (c.animate) {
        run.anims.push(c.animate([
          { transform: 'translateY(0) rotate(0)' },
          { transform: `translateY(${Math.round(h + 40 + Math.random() * 100)}px) rotate(${Math.round(Math.random() * 900)}deg)` }
        ], { duration: 2200 + Math.random() * 1500, delay: Math.random() * 900, easing: 'cubic-bezier(.3,.6,.5,1)', fill: 'forwards' }));
      }
      hero.appendChild(c);
      run.nodes.push(c);
      pieces.push(c);
    }
    run.later(5000, () => pieces.forEach(c => c.remove()));
  }

  // ---- whose-turn ribbon (turn moments #4) ----
  // A band sweeps across the middle of the screen and away: green "YOUR TURN!" for the player whose
  // turn it is, navy "<NAME>'S TURN" for everyone else. Never blocks a tap (pointer-events: none).
  // info: Pill.ribbon(room, mySeat) -> { text, mine, sudden }.
  const RIBBON_MS = 1200;
  let ribbonEl = null, ribbonTimer = null;
  // areaEl (the board, optional): the ribbon is centred on it (Layout.placeRibbon); without it, the CSS place.
  function ribbon(container, info, areaEl) {
    clearRibbon();
    if (!container || !doc() || !info) return false;
    const wrap = el('div', 'turn-ribbon' + (info.mine ? ' mine' : '') + (reducedMotion() ? ' fx-reduced' : ''));
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');
    const band = el('div', 'tr-band');
    if (info.sudden) band.appendChild(el('div', 'tr-sd', '⚡ SUDDEN DEATH'));
    const text = el('div', 'tr-text disp');
    if (info.name) {
      // A narrow screen cuts the name ("…") and always keeps "'S TURN" readable.
      text.appendChild(el('span', 'tr-name', info.name));
      text.appendChild(el('span', 'tr-suf', "'S TURN"));
    } else {
      text.textContent = info.text;
    }
    band.appendChild(text);
    wrap.appendChild(band);
    container.appendChild(wrap);
    if (areaEl && root.Layout) root.Layout.placeRibbon(wrap, areaEl);
    ribbonEl = wrap;
    ribbonTimer = setTimeout(clearRibbon, RIBBON_MS);
    return true;
  }
  function clearRibbon() {
    clearTimeout(ribbonTimer);
    ribbonTimer = null;
    if (ribbonEl) ribbonEl.remove();
    ribbonEl = null;
  }

  return {
    INTRO_VS_MS, COIN_RESULT_AT, ROUND_MS, MULTI_TEAMS_MS, WHEEL_SPIN_MS, WHEEL_RESULT_AT, wheelTurns, introRemaining, playIntro, clearIntro, introSkipped, holdIntro, roundStart, clearRound,
    RESULT_FRESH_MS, resultViewer, resultReason, bestWord, bestWordText, resultFresh, endingCelebration, renderResult, clearResult,
    RIBBON_MS, ribbon, clearRibbon
  };
});
