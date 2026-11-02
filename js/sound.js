// Optional, quiet synthesized sound effects plus a short "your turn" vibration.
// Off by default; remembered per device (scrabble.sound). Loads as a browser
// global (Sound) or a Node module (pure bits only — no AudioContext in Node).
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Sound = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const STORAGE_KEY = 'scrabble.sound';

  function readStored() {
    try {
      return root.localStorage ? root.localStorage.getItem(STORAGE_KEY) : null;
    } catch (e) {
      return null;
    }
  }

  function writeStored(on) {
    try {
      if (!root.localStorage) return;
      if (on) root.localStorage.setItem(STORAGE_KEY, '1');
      else root.localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* storage unavailable (private mode, etc.) */ }
  }

  function enabled() { return readStored() === '1'; }

  // The AudioContext is created lazily, and only after a user gesture, so it
  // never trips browser autoplay restrictions. Chrome starts a context made
  // without a gesture "suspended" and only lets resume() work after one, so:
  // play() stays a silent no-op until the page has seen a gesture (the
  // projector opened by window.open, a player who refreshed), and every
  // gesture resumes a suspended context until it is running.
  let ctx = null;
  let gestured = false;
  function ensureCtx() {
    if (!ctx) {
      try {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (AC) ctx = new AC();
      } catch (e) {
        ctx = null;
      }
    }
    try {
      if (ctx && ctx.state === 'suspended' && ctx.resume) {
        const p = ctx.resume();
        if (p && p.then) p.then(unbindWhenRunning, () => {});
      }
    } catch (e) { /* ignore */ }
    return ctx;
  }

  function ready() { return !!ctx; }

  // Read-only, for checks: the AudioContext's state, or 'none' before one exists.
  function state() { return ctx ? ctx.state : 'none'; }

  // Flips the stored preference and returns the new state. Only creates the
  // context when turning sound on (nothing to play for, or vibrate, once off).
  function toggle() {
    gestured = true; // toggle() only runs from the sound button's click
    const next = !enabled();
    if (next) ensureCtx();
    writeStored(next);
    return next;
  }

  // A returning player whose device already has sound on (scrabble.sound =
  // '1' from an earlier session) gets no running AudioContext until some
  // gesture happens on the new page — toggle() isn't called again. Every
  // pointerdown/pointerup/keydown resumes it (pointerup: a touch only counts
  // as a gesture when the finger lifts), and the listeners stay until the
  // context is running, then remove themselves.
  const GESTURES = ['pointerdown', 'pointerup', 'keydown'];
  function onGesture() {
    gestured = true;
    if (enabled()) ensureCtx();
    unbindWhenRunning();
  }
  function unbindWhenRunning() {
    if (!ctx || ctx.state !== 'running') return;
    try { GESTURES.forEach(t => root.document.removeEventListener(t, onGesture, true)); } catch (e) { /* ignore */ }
  }
  try {
    if (root.document && root.document.addEventListener) {
      GESTURES.forEach(t => root.document.addEventListener(t, onGesture, true));
    }
  } catch (e) { /* no document (Node, etc.) */ }

  // Short, quiet note sequences. Each note is well under 1s and gain stays
  // <= 0.2; total length per preset also stays under 1s.
  const PRESETS = {
    turn: [{ f: 880, t: 0, d: 0.12, type: 'sine', g: 0.15 }],
    place: [{ f: 300, t: 0, d: 0.04, type: 'square', g: 0.08 }],
    accept: [
      { f: 523, t: 0, d: 0.09, type: 'sine', g: 0.15 },
      { f: 784, t: 0.09, d: 0.12, type: 'sine', g: 0.15 }
    ],
    tier1: [{ f: 659, t: 0, d: 0.15, type: 'sine', g: 0.15 }],
    tier2: [
      { f: 659, t: 0, d: 0.1, type: 'sine', g: 0.15 },
      { f: 880, t: 0.1, d: 0.15, type: 'sine', g: 0.15 }
    ],
    tier3: [
      { f: 523, t: 0, d: 0.1, type: 'sine', g: 0.16 },
      { f: 659, t: 0.1, d: 0.1, type: 'sine', g: 0.16 },
      { f: 880, t: 0.2, d: 0.2, type: 'sine', g: 0.16 }
    ],
    tier4: [
      { f: 523, t: 0, d: 0.08, type: 'sine', g: 0.18 },
      { f: 659, t: 0.08, d: 0.08, type: 'sine', g: 0.18 },
      { f: 784, t: 0.16, d: 0.08, type: 'sine', g: 0.18 },
      { f: 1047, t: 0.24, d: 0.3, type: 'sine', g: 0.18 }
    ],
    vs: [
      { f: 220, t: 0, d: 0.15, type: 'sawtooth', g: 0.12 },
      { f: 440, t: 0.15, d: 0.2, type: 'sawtooth', g: 0.12 }
    ],
    coin: [
      { f: 1200, t: 0, d: 0.06, type: 'sine', g: 0.12 },
      { f: 1600, t: 0.06, d: 0.1, type: 'sine', g: 0.12 }
    ],
    win: [
      { f: 523, t: 0, d: 0.12, type: 'sine', g: 0.18 },
      { f: 659, t: 0.12, d: 0.12, type: 'sine', g: 0.18 },
      { f: 784, t: 0.24, d: 0.12, type: 'sine', g: 0.18 },
      { f: 1047, t: 0.36, d: 0.4, type: 'sine', g: 0.18 }
    ]
  };

  function playPreset(name) {
    const notes = PRESETS[name];
    if (!notes || !ctx) return;
    const now = ctx.currentTime;
    for (const n of notes) {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = n.type;
        osc.frequency.value = n.f;
        const t0 = now + n.t;
        const t1 = t0 + n.d;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(n.g, t0 + 0.01);
        gain.gain.linearRampToValueAtTime(0, t1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t1 + 0.02);
      } catch (e) { /* skip this note, keep going */ }
    }
  }

  // name: 'turn' | 'place' | 'accept' | 'tier1'..'tier4' | 'vs' | 'coin' | 'win'.
  // Silent no-op when sound is off, before the page's first gesture, or while
  // the context isn't running (notes queued on a suspended context would all
  // burst out at once on resume); never throws.
  function play(name) {
    if (!enabled() || !gestured) return;
    ensureCtx();
    if (!ctx || ctx.state !== 'running') return;
    try { playPreset(name); } catch (e) { /* never throw */ }
  }

  // Short "your turn" buzz; only when sound is on.
  function buzz() {
    if (!enabled()) return;
    try {
      if (root.navigator && typeof root.navigator.vibrate === 'function') root.navigator.vibrate(120);
    } catch (e) { /* ignore */ }
  }

  return { enabled, toggle, play, buzz, ready, state };
});
