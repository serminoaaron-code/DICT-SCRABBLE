// Match scenes: the VS intro + 3D coin toss before each match, the projector's
// combined "ROUND STARTING" scene, and the result screens (winner / other player /
// neutral / void). Look and timing follow the approved mockup
// (.superpowers/brainstorm/.../intro-coin-winner-v2.html).
//
// Pure parts (Node-testable): introRemaining, INTRO_VS_MS, ROUND_MS, resultViewer,
// resultReason, bestWordText, resultFresh, RESULT_FRESH_MS, endingCelebration.
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

  // ---------- pure ----------

  const introMs = () => (root.Match && root.Match.INTRO_MS) || 6500;

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

  const hasResult = room => !!(room && room.status !== 'void' && room.result && (room.result.winner === 'A' || room.result.winner === 'B'));

  // Which result scene this viewer gets: the winning seat 'winner', the other seat 'other',
  // spectators / the host / anyone else 'neutral' (also for void rooms and rooms without a result).
  function resultViewer(room, mySeat) {
    if (!hasResult(room) || (mySeat !== 'A' && mySeat !== 'B')) return 'neutral';
    return mySeat === room.result.winner ? 'winner' : 'other';
  }

  // The reason line, with the existing copy ("<player> left the game" for a resign) and the host's note.
  function resultReason(room) {
    if (!hasResult(room)) return '';
    const res = room.result;
    let line = REASON_LINE[res.reason] || '';
    if (res.reason === 'resign') {
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
    return { word: String(bm.words[0].word || ''), total, title: (tier && Cel && Cel.TITLES[tier]) || '' };
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

  const teamOf = (room, seat) => (seat === 'A' ? room.teamAName : room.teamBName) || (seat === 'A' ? 'Team A' : 'Team B');
  const playerOf = (room, seat) => (room.seats && room.seats[seat] && room.seats[seat].name) || '';
  const sizeClass = name => (name.length > 22 ? ' xlong' : name.length > 12 ? ' long' : '');

  function roomTag(room) {
    const code = room.code ? (root.Match && root.Match.formatCode ? root.Match.formatCode(room.code) : room.code) : '';
    const min = Math.round((Number(room.matchLengthSec) || 0) / 6) / 10;
    return [code && 'ROOM ' + code, min ? min + ' MIN MATCH' : ''].filter(Boolean).join(' · ');
  }

  // #tossLine caption: "🪙 Coin toss: <b>TEAM</b> goes first" (built from text nodes).
  function setTossLine(line, team) {
    if (!line) return;
    line.textContent = '';
    const b = el('b', '', team);
    line.append('🪙 Coin toss: ', b, ' goes first');
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
    const total = introMs();
    const elapsed = Math.max(0, total - remaining);
    const reduced = reducedMotion();
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
    const sr = el('div', 'fx-sr', `${teamOf(room, 'A')} versus ${teamOf(room, 'B')}. Coin toss: ${firstTeam} goes first.`);
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
    const result = el('div', 'in-result disp', `${firstTeam} GOES FIRST!`.toUpperCase());
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
    const lines = list.map(r => `${teamOf(r, 'A')} vs ${teamOf(r, 'B')}`);
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
      row.append(el('span', 'rs-team rs-a', teamOf(r, 'A')), el('span', 'rs-vs disp', 'vs'), el('span', 'rs-team rs-b', teamOf(r, 'B')));
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
        el('p', 'res-void-note', 'It does not count for either team.'));
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
      head.append(el('span', 'res-team disp' + sizeClass(team), team), ' ',
        el('span', 'res-wins disp', kind === 'winner' ? 'wins!' : kind === 'other' ? 'wins · well played' : 'wins'));
      inner.appendChild(head);

      const score = el('div', 'res-score');
      const side = s => {
        const box = el('div', 'res-side' + (s === win ? ' w' : ''));
        const p = playerOf(room, s);
        const num = el('div', 'res-num disp', '');
        box.append(el('div', 'res-lbl', p ? `${teamOf(room, s)} · ${p}` : teamOf(room, s)), num);
        nums.push([num, Number(s === 'A' ? res.scoreA : res.scoreB) || 0]);
        return box;
      };
      score.append(side('A'), el('div', 'res-dash disp', '–'), side('B'));
      inner.appendChild(score);

      inner.appendChild(el('div', 'res-plus disp' + sizeClass(team), `+1 ${team}`));
      const bw = bestWord(room);
      if (bw) {
        const line = el('div', 'res-best');
        line.append('⭐ Best word: ', el('b', '', bw.word), ` · ${bw.total} pts` + (bw.title ? ` (${bw.title})` : ''));
        inner.appendChild(line);
      }
      const reason = resultReason(room);
      if (reason) inner.appendChild(el('div', 'res-reason', reason));
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
    if (animate && kind === 'winner') run.later(delay + RS_SLAM_MS, () => root.Sound && root.Sound.play('win'));
    return hero;
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

  return {
    INTRO_VS_MS, COIN_RESULT_AT, ROUND_MS, introRemaining, playIntro, clearIntro, introSkipped, holdIntro, roundStart, clearRound,
    RESULT_FRESH_MS, resultViewer, resultReason, bestWordText, resultFresh, endingCelebration, renderResult, clearResult
  };
});
