// Match-start scenes: the VS intro + 3D coin toss before each match, and the
// projector's combined "ROUND STARTING" scene. Look and timing follow the
// approved mockup (.superpowers/brainstorm/.../intro-coin-winner-v2.html).
//
// Pure parts (Node-testable): introRemaining, INTRO_VS_MS, ROUND_MS.
// DOM parts: playIntro, clearIntro, roundStart, clearRound. Nothing touches the
// DOM at load time. Loads as a browser global (Scenes) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Scenes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const INTRO_VS_MS = 2600;   // VS intro 0–2600 ms, coin toss 2600–INTRO_MS
  const COIN_FLIP_MS = 1800;  // the coin lands 1800 ms into the toss
  const COIN_RESULT_MS = 1900; // "<TEAM> GOES FIRST!" pops 100 ms after landing
  const VS_LAND_MS = 1100;    // the VS badge finishes spinning in (.6 s delay + .5 s)
  const ROUND_MS = 5000;
  const FADE_OUT_MS = 250;

  // ---------- pure ----------

  const introMs = () => (root.Match && root.Match.INTRO_MS) || 5000;

  // Time left before the clocks start (0 once the match is under way).
  function introRemaining(room, now) {
    const s = room && room.clock ? Number(room.clock.startedAt) : NaN;
    if (!isFinite(s)) return 0;
    return Math.max(0, s - now);
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

  return { INTRO_VS_MS, ROUND_MS, introRemaining, playIntro, clearIntro, introSkipped, holdIntro, roundStart, clearRound };
});
