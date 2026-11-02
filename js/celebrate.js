// Word celebrations: a "+N" float for small plays and four overlay tiers
// (Not Bad! / Cool! / Awesome! / IMPOSSIBLE!!!) with a count-up score that
// flies into the score bar. Look and timing follow the approved mockup
// (.superpowers/brainstorm/.../celebrate-tiers-v2.html).
//
// Pure parts (Node-testable): TITLES, tierFor, detect, createQueue.
// DOM parts: show, clear. Nothing touches the DOM at load time.
// Loads as a browser global (Celebrate) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Celebrate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const Engine = typeof require === 'function' ? require('./engine.js') : root.ScrabbleEngine;

  const TITLES = ['', 'Not Bad!', 'Cool!', 'Awesome!', 'IMPOSSIBLE!!!'];
  const STALE_MS = 12000; // a queued item older than this is dropped (e.g. a backgrounded tab)

  // ---------- pure ----------

  function tierFor({ total, bingo }) {
    return Engine.celebrationTier(Number(total) || 0, !!bingo);
  }

  // A new scored play since prevMoveCount, or null. prevMoveCount null = first
  // snapshot (page load / refresh): it only sets the baseline, never replays.
  function detect(prevMoveCount, room) {
    if (prevMoveCount === null || prevMoveCount === undefined) return null;
    const g = room && room.game;
    if (!g || !g.lastMove) return null;
    if (!(g.moveCount > prevMoveCount)) return null;
    const lm = g.lastMove;
    if (lm.type !== 'play') return null;
    const seat = lm.seat;
    const total = Number(lm.total) || 0;
    const bingo = !!lm.bingo; // rooms from before the bingo flag: treat as false
    const teamName = (seat === 'A' ? room.teamAName : room.teamBName) || '';
    const seatInfo = room.seats && room.seats[seat];
    return {
      tier: tierFor({ total, bingo }),
      total,
      words: (lm.words || []).map(w => ({ word: String(w.word || ''), score: Number(w.score) || 0 })),
      bingo,
      seat,
      playerName: (seatInfo && seatInfo.name) || teamName,
      teamName,
      moveCount: g.moveCount
    };
  }

  // The approved mockup's length of each tier's scene, in ms (tier 0 is the small "+N" float).
  const NATURAL_MS = [1000, 2600, 2600, 2950, 4950];
  const FALLBACK_CELEBRATE_MS = [0, 2600, 2600, 3000, 4500];
  function celebrateMs() {
    const M = root.Match || (typeof require === 'function' ? require('./match.js') : null);
    return (M && M.CELEBRATE_MS) || FALLBACK_CELEBRATE_MS;
  }

  // How long a tier's scene runs, in ms. An overlay (tiers 1-4) is always fully gone by
  // Match.CELEBRATE_MS[tier], the delay before the next turn's clock starts, so a celebration
  // never costs the next player turn time; a timeline longer than that is compressed to fit.
  // Tier 0 has no overlay and no turn delay: its float keeps its natural length.
  function durationFor(tier) {
    const natural = NATURAL_MS[tier];
    if (!natural) return 0;
    if (tier === 0) return natural;
    const limit = Number(celebrateMs()[tier]);
    return limit > 0 ? Math.min(natural, limit) : natural;
  }

  // FIFO used by show(): moves that arrive during an overlay wait their turn.
  function createQueue() {
    const items = [];
    return {
      push(item) { items.push(item); },
      shift() { return items.shift(); },
      size() { return items.length; },
      clear() { items.length = 0; }
    };
  }

  // ---------- DOM ----------

  const queue = createQueue();
  let current = null; // { timers, rafs, nodes, hold, done }

  const doc = () => root.document;
  const reducedMotion = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const resolve = x => (typeof x === 'function' ? x() : x) || null;

  function el(tag, cls, text) {
    const e = doc().createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text; // user strings never go through innerHTML
    return e;
  }

  // The score bar already shows the new total; show the old one until the points land.
  function holdScore(scoreEl, total) {
    const e = resolve(scoreEl);
    if (!e || !/^-?\d+$/.test(e.textContent.trim())) return null;
    const final = e.textContent.trim();
    const shown = String(Number(final) - total);
    e.textContent = shown;
    return { el: e, final, shown, released: false };
  }

  function releaseScore(hold, bump, scoreEl) {
    if (hold && !hold.released) {
      hold.released = true;
      // Only if nothing re-rendered it meanwhile (a newer value is already correct).
      if (hold.el.isConnected && hold.el.textContent === hold.shown) hold.el.textContent = hold.final;
    }
    if (!bump) return;
    const e = resolve(scoreEl) || (hold && hold.el);
    if (!e || !e.isConnected) return;
    e.classList.remove('fx-bump');
    void e.offsetWidth;
    e.classList.add('fx-bump');
    setTimeout(() => e.classList.remove('fx-bump'), 600);
  }

  // Public: queue a detected move. opts: { container, scoreEl (Element or () => Element), mine }.
  function show(c, opts = {}) {
    if (!c || !doc()) return;
    const reduced = reducedMotion();
    const hold = reduced ? null : holdScore(opts.scoreEl, c.total);
    queue.push({ c, opts, reduced, hold, at: Date.now() });
    if (!current) next();
  }

  // Public: drop everything (route change / teardown).
  function clear() {
    let item;
    while ((item = queue.shift())) releaseScore(item.hold, false);
    if (current) finish(current, false);
    current = null;
  }

  function next() {
    current = null;
    let item;
    while ((item = queue.shift())) {
      const container = item.opts.container;
      const usable = container && container.isConnected && Date.now() - item.at < STALE_MS;
      if (usable) break;
      releaseScore(item.hold, false);
    }
    if (!item) return;
    current = { item, timers: [], rafs: [], nodes: [], done: false };
    play(current);
  }

  function finish(run, advance) {
    if (run.done) return;
    run.done = true;
    run.timers.forEach(clearTimeout);
    run.rafs.forEach(id => root.cancelAnimationFrame && root.cancelAnimationFrame(id));
    run.nodes.forEach(n => n.remove());
    if (doc()) doc().body.classList.remove('fx-active');
    releaseScore(run.item.hold, false);
    if (advance && current === run) next();
  }

  function play(run) {
    const { c, opts, reduced } = run.item;
    const later = (ms, f) => run.timers.push(setTimeout(() => { if (!run.done) f(); }, ms));
    const end = ms => later(ms, () => finish(run, true));
    if (c.tier > 0 && root.Sound) root.Sound.play('tier' + c.tier);

    if (c.tier === 0) return floatPoints(run, later, end);
    const ov = overlay(run, opts, c, reduced);
    if (reduced) return reducedCard(run, ov, c, later, end);
    if (c.tier <= 2) return simpleTier(run, ov, c, later, end);
    if (c.tier === 3) return awesomeTier(run, ov, c, later, end);
    return impossibleTier(run, ov, c, later, end);
  }

  function mainWord(c) {
    return (c.words[0] && c.words[0].word) || '';
  }

  function overlay(run, opts, c, reduced) {
    const ov = el('div', `fx-overlay fx-tier-${c.tier}${reduced ? ' fx-reduced' : ''}`);
    ov.dataset.mine = opts.mine ? '1' : '0';
    // Screen readers get one short line; the animated stage (with its count-up) stays silent.
    const sr = el('div', 'fx-sr', `${TITLES[c.tier]} ${c.total} points${c.bingo ? ', bingo' : ''}: ${mainWord(c)}, by ${c.playerName}`);
    sr.setAttribute('role', 'status');
    ov.appendChild(sr);
    const stage = el('div', 'fx-stage');
    stage.setAttribute('aria-hidden', 'true');
    const content = el('div', 'fx-content'); // the area under the score bar, which stays visible
    stage.appendChild(content);
    ov.appendChild(stage);
    // Desktop landscape: the stage sits over the board at board scale (opts.areaEl, Layout.fitStage).
    // Otherwise (phones, the projector) the content starts under the score bar, as in the mockup.
    if (!(root.Layout && root.Layout.fitStage(ov, opts.areaEl))) {
      const sc = resolve(opts.scoreEl);
      const vh = viewport().h;
      const top = sc && sc.isConnected ? sc.getBoundingClientRect().bottom + 8 : 0;
      ov.style.setProperty('--fx-top', Math.round(Math.min(Math.max(top, 0), vh * 0.35)) + 'px');
    }
    const skip = el('button', 'fx-skip', '✕ Skip');
    skip.type = 'button';
    skip.setAttribute('aria-label', 'Skip celebration');
    skip.onclick = ev => { ev.stopPropagation(); finish(run, true); };
    ov.appendChild(skip);
    opts.container.appendChild(ov);
    run.nodes.push(ov);
    run.stage = stage;
    run.content = content;
    doc().body.classList.add('fx-active');
    return ov;
  }

  function countUp(run, node, to, dur, delay) {
    const now = () => (root.performance ? root.performance.now() : Date.now());
    const start = now() + delay;
    const step = () => {
      if (run.done) return;
      const p = Math.min(1, Math.max(0, (now() - start) / dur));
      node.textContent = '+' + Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) run.rafs.push(root.requestAnimationFrame(step));
    };
    run.rafs.push(root.requestAnimationFrame(step));
  }

  const centre = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  // "+N" flies from `from` (a point) into the score, which then bumps. Lands after `dur` ms.
  function flyToScore(run, later, pts, from, at, dur = 600) {
    const { opts, hold } = run.item;
    later(at, () => {
      const f = el('div', 'fx-fly disp', '+' + pts);
      f.style.left = from.x + 'px';
      f.style.top = from.y + 'px';
      opts.container.appendChild(f);
      run.nodes.push(f);
      const target = resolve(opts.scoreEl) || (hold && hold.el);
      let dx = 0, dy = -120;
      if (target && target.isConnected) {
        const t = centre(target.getBoundingClientRect());
        dx = t.x - from.x; dy = t.y - from.y;
      }
      if (f.animate) {
        f.animate([
          { transform: 'translate(-50%,-50%) scale(1.4)', opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.6)`, opacity: 0.3 }
        ], { duration: dur, easing: 'ease-in', fill: 'forwards' });
      }
      later(dur, () => { f.remove(); releaseScore(hold, true, opts.scoreEl); });
    });
  }

  // Size of the scene's stage: the whole window on phones, the board in the desktop landscape layout.
  function stageSize(run) {
    const s = run.stage;
    return s && s.clientWidth ? { w: s.clientWidth, h: s.clientHeight } : viewport();
  }

  function viewport() {
    return { w: root.innerWidth || 360, h: root.innerHeight || 640 };
  }

  // ---- tier 0: small "+N" from the middle of the play area into the score ----
  function floatPoints(run, later, end) {
    const { c, opts, reduced } = run.item;
    if (reduced) { releaseScore(run.item.hold, false); return end(0); }
    // From the middle of the play area: the board in the desktop landscape layout.
    const onBoard = opts.areaEl && opts.areaEl.isConnected && root.Layout && root.Layout.landscapeNow();
    const box = (onBoard ? opts.areaEl : opts.container).getBoundingClientRect();
    const vp = viewport();
    const from = {
      x: Math.min(vp.w - 30, Math.max(30, box.left + box.width / 2)),
      y: Math.min(vp.h - 30, Math.max(30, box.top + Math.min(box.height, vp.h) / 2))
    };
    const f = el('div', 'fx-float disp', '+' + c.total);
    f.style.left = from.x + 'px';
    f.style.top = from.y + 'px';
    opts.container.appendChild(f);
    run.nodes.push(f);
    const target = resolve(opts.scoreEl) || (run.item.hold && run.item.hold.el);
    let dx = 0, dy = -100;
    if (target && target.isConnected) {
      const t = centre(target.getBoundingClientRect());
      dx = t.x - from.x; dy = t.y - from.y;
    }
    if (f.animate) {
      f.animate([
        { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
        { transform: 'translate(-50%,-90%) scale(1.15)', opacity: 1, offset: 0.3 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7)`, opacity: 0.4 }
      ], { duration: 950, easing: 'ease-in-out', fill: 'forwards' });
    }
    later(950, () => { f.remove(); releaseScore(run.item.hold, true, opts.scoreEl); });
    end(durationFor(0));
  }

  function fadeOverlay(ov, total, inAt, outAt) {
    if (!ov.animate) return;
    ov.animate([{ opacity: 0 }, { opacity: 1, offset: inAt }, { opacity: 1, offset: outAt }, { opacity: 0 }],
      { duration: total, fill: 'forwards' });
  }

  function confetti(run, n, fromCorners) {
    const colors = ['#e1251b', '#ffc20e', '#00a651', '#2e7cf6', '#ffffff', '#ff7ac6'];
    const { w, h } = stageSize(run);
    for (let i = 0; i < n; i++) {
      const p = el('div', 'confetti');
      p.style.background = colors[i % colors.length];
      if (fromCorners) {
        const left = i % 2 === 0;
        p.style.left = left ? '0px' : (w - 8) + 'px';
        p.style.top = h + 'px';
        const dx = (left ? 1 : -1) * (w * 0.2 + Math.random() * w * 0.7);
        const dy = -(h * 0.48 + Math.random() * h * 0.48);
        if (p.animate) {
          p.animate([
            { transform: 'translate(0,0) rotate(0)' },
            { transform: `translate(${dx}px,${dy}px) rotate(${Math.random() * 540}deg)`, offset: 0.45 },
            { transform: `translate(${dx * 1.3}px,${dy + h}px) rotate(${Math.random() * 1080}deg)` }
          ], { duration: 2200 + Math.random() * 800, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
        }
      } else {
        p.style.left = (w * 0.15 + Math.random() * w * 0.7) + 'px';
        p.style.top = (h * 0.44) + 'px';
        const a = Math.random() * Math.PI * 2, r = Math.min(w, h) * (0.25 + Math.random() * 0.4);
        if (p.animate) {
          p.animate([
            { transform: 'translate(0,0)' },
            { transform: `translate(${Math.cos(a) * r}px,${Math.sin(a) * r + h * 0.33}px) rotate(${Math.random() * 540}deg)`, opacity: 0 }
          ], { duration: 1400 + Math.random() * 600, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'forwards' });
        }
      }
      run.stage.appendChild(p);
    }
  }

  // Points/word/title nodes shared by tiers 1–3.
  function texts(box, c, title) {
    const t = el('div', 'fx-title disp', title);
    const pts = el('div', 'fx-pts disp', '+0');
    const word = el('div', 'fx-word', mainWord(c));
    box.append(t, pts, word);
    return { t, pts, word };
  }

  // ---- tiers 1–2: pop + burst (unchanged from v1) ----
  function simpleTier(run, ov, c, later, end) {
    run.stage.insertBefore(el('div', 'fx-dim'), run.content);
    run.content.appendChild(el('div', 'fx-burst'));
    const { pts } = texts(run.content, c, TITLES[c.tier].toUpperCase());
    const total = durationFor(c.tier);
    const T = ms => Math.round(ms * total / NATURAL_MS[c.tier]);
    fadeOverlay(ov, total, 0.08, 0.82);
    countUp(run, pts, c.total, T(900), T(250));
    later(T(1500), () => flyToScore(run, later, c.total, centre(pts.getBoundingClientRect()), 0, T(600)));
    end(total);
  }

  // ---- tier 3: golden sunburst ----
  function awesomeTier(run, ov, c, later, end) {
    const stage = run.stage;
    stage.insertBefore(el('div', 'fx-dim'), run.content);
    run.content.appendChild(el('div', 'fx-rays'));
    const { pts } = texts(run.content, c, TITLES[3].toUpperCase());
    const { w, h } = stageSize(run);
    for (let i = 0; i < 9; i++) {
      const s = el('div', 'fx-star', '✦');
      s.style.left = (w * 0.08 + Math.random() * w * 0.82) + 'px';
      s.style.top = (h * 0.2 + Math.random() * h * 0.45) + 'px';
      s.style.animationDelay = Math.random() + 's';
      stage.appendChild(s);
    }
    const total = durationFor(3);
    const T = ms => Math.round(ms * total / NATURAL_MS[3]);
    fadeOverlay(ov, T(2900), 0.07, 0.84);
    countUp(run, pts, c.total, T(950), T(350));
    later(T(300), () => confetti(run, 26, false));
    later(T(1750), () => flyToScore(run, later, c.total, centre(pts.getBoundingClientRect()), 0, T(600)));
    end(total);
  }

  // ---- tier 4: cinematic ----
  function impossibleTier(run, ov, c, later, end) {
    const stage = run.stage;
    const letters = mainWord(c).split('');
    const tiles = el('div', 'fx-tiles');
    tiles.style.setProperty('--n', String(Math.max(letters.length, 1)));
    letters.forEach(l => tiles.appendChild(el('b', '', l)));
    const ring = el('div', 'fx-ring');
    const flash = el('div', 'fx-flash');
    const title = el('div', 'fx-title disp', TITLES[4]);
    const pts = el('div', 'fx-pts disp', '+0');
    const by = el('div', 'fx-by', `BY ${c.playerName} · ${c.teamName}`.toUpperCase());
    const box = run.content;
    stage.insertBefore(el('div', 'fx-black'), box);
    box.append(el('div', 'fx-spot'), tiles, ring, title, pts);
    let stamp = null;
    if (c.bingo) { stamp = el('div', 'fx-stamp disp', 'BINGO +50'); box.appendChild(stamp); }
    box.appendChild(by);
    stage.appendChild(flash);

    // The mockup's 4950 ms timeline, compressed proportionally to fit CELEBRATE_MS[4] (T()).
    const total = durationFor(4);
    const T = ms => Math.round(ms * total / NATURAL_MS[4]);
    // Tiles slam in one by one; long words go faster so the impact stays near the mockup's.
    const step = Math.min(150, Math.floor(1050 / Math.max(letters.length, 1)));
    [...tiles.children].forEach((t, i) => later(T(450 + i * step), () => t.classList.add('in')));
    const impact = 450 + letters.length * step + 150;
    later(T(impact), () => {
      ring.classList.add('go');
      flash.classList.add('go'); // the one flash of this scene
      stage.classList.add('fx-shake');
    });
    later(T(impact + 120), () => {
      title.classList.add('go');
      later(T(460), () => { title.classList.remove('go'); title.classList.add('shown', 'glitch'); });
    });
    later(T(impact + 500), () => { pts.classList.add('go'); countUp(run, pts, c.total, T(700), 0); });
    if (stamp) later(T(impact + 1150), () => stamp.classList.add('go'));
    later(T(impact + 1400), () => by.classList.add('go'));
    later(T(impact + 700), () => confetti(run, 70, true));
    later(T(4400), () => { if (stage.animate) stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: T(400), fill: 'forwards' }); });
    later(T(4300), () => flyToScore(run, later, c.total, centre(pts.getBoundingClientRect()), 0, T(600)));
    end(total);
  }

  // ---- reduced motion: one calm fade card, no shake/flash/confetti/rays ----
  function reducedCard(run, ov, c, later, end) {
    const card = el('div', 'fx-card');
    card.append(el('div', 'fx-title disp', TITLES[c.tier]), el('div', 'fx-pts disp', '+' + c.total), el('div', 'fx-word', mainWord(c)));
    if (c.tier === 4) {
      if (c.bingo) card.appendChild(el('div', 'fx-card-note', 'BINGO +50'));
      card.appendChild(el('div', 'fx-card-note', `BY ${c.playerName} · ${c.teamName}`.toUpperCase()));
    }
    run.content.appendChild(card);
    const total = durationFor(c.tier) || 2600;
    fadeOverlay(ov, total, 0.12, 0.85);
    end(total);
  }

  return { TITLES, tierFor, detect, createQueue, durationFor, show, clear };
});
