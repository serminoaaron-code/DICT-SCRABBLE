// Match music: two original 8-bit loops made live by the browser (no audio files, nothing copied).
// "Tile Rush" plays during a match; "Last Minute" takes over (a hard cut) for the final 60 s and sudden death.
// 🎵 controls only this music; sound effects (incl. the match-end bell) stay under 🔇/🔊 (js/sound.js).
//
// Pure parts (Node-testable): TRACKS, LAST_MINUTE_MS, trackFor, levelFor, useKey / enabled / toggle.
// Browser part: set(track, level), dip(ms), stop(), status(). Nothing plays before a user gesture.
// Loads as a browser global (Music) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Music = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const LAST_MINUTE_MS = 60000;
  const PLAYING = ['live', 'suddenDeath', 'hostDecision'];
  const split = s => s.trim().split(/\s+/);

  // The two loops picked from the listening sample (4 bars of 8 eighth-notes; '-' = rest).
  const TRACKS = {
    rush: { bpm: 128, leadGain: 0.08, bassGain: 0.18,
      lead: split('A4 C5 E5 C5 A4 C5 E5 G5   F4 A4 C5 A4 F4 A4 C5 E5   G4 B4 D5 B4 G4 B4 D5 F5   E5 D5 C5 B4 A4 - E4 -'),
      bass: split('A2 A3 A2 A3 A2 A3 A2 A3   F2 F3 F2 F3 F2 F3 F2 F3   G2 G3 G2 G3 G2 G3 G2 G3   E2 E3 E2 E3 E2 E3 G#2 B2'),
      drums: split('k h s h k k s h   k h s h k k s h   k h s h k k s h   k h s h k s s s') },
    tense: { bpm: 144, leadGain: 0.07, bassGain: 0.2,
      lead: split('E5 - D#5 - E5 - G5 F#5   E5 - - - B4 - - -   E5 - D#5 - E5 - A5 G5   F#5 - E5 - D#5 - B4 -'),
      bass: split('E2 E2 E2 E2 E2 E2 E2 E2   F2 F2 F2 F2 F2 F2 F2 F2   F#2 F#2 F#2 F#2 F#2 F#2 F#2 F#2   G2 G2 G2 G2 A#2 A#2 B2 B2'),
      drums: split('k h h h s h h h   k h h h s h k h   k h h h s h h h   k h s h s s s s') }
  };

  // ---------- pure ----------

  // Which loop a match screen plays now: none before the clocks start or outside a match; Last Minute in
  // the final 60 s (a paused clock counts its frozen time), in sudden death and a host decision after it.
  function trackFor(room, now) {
    if (!room || !PLAYING.includes(room.status) || !room.clock) return null;
    if (now < room.clock.startedAt) return null;
    if (room.status === 'suddenDeath') return 'tense';
    if (room.status === 'hostDecision') return room.game && room.game.suddenDeath ? 'tense' : 'rush';
    const c = room.clock;
    const left = c.paused ? c.paused.matchRemainingMs : c.endsAt - now;
    return left <= LAST_MINUTE_MS ? 'tense' : 'rush';
  }

  // Low while the match is on hold: a host pause, an appeal, a host decision.
  function levelFor(room, now) {
    if (!room) return 'full';
    if ((room.clock && room.clock.paused) || (room.game && room.game.pending) || room.status === 'hostDecision') return 'low';
    return 'full';
  }

  // The setting: game pages 'scrabble.music', the big screen 'scrabble.music.bigscreen'; on unless '0'.
  let KEY = 'scrabble.music';
  function useKey(key) { KEY = key; }
  function read() { try { return root.localStorage ? root.localStorage.getItem(KEY) : null; } catch (e) { return null; } }
  function enabled() { return read() !== '0'; }
  function toggle() {
    const next = !enabled();
    try { if (root.localStorage) root.localStorage.setItem(KEY, next ? '1' : '0'); } catch (e) { /* storage unavailable */ }
    if (!next && typeof stop === 'function') stop();
    return next;
  }

  // ---------- browser part: a tiny chiptune sequencer (pulse lead, triangle bass, noise drums) ----------
  const GAIN = { full: 0.12, low: 0.035 };   // quieter than the sound effects
  let ctx = null, master = null, pulse = null, noise = null, timer = null;
  let current = null, pending = null, level = 'full', step = 0, nextAt = 0, wanted = null, dipUntil = 0, gestured = false;

  const midi = s => { const m = /^([A-G])(#?)(\d)$/.exec(s || ''); if (!m) return null;
    return 12 * (Number(m[3]) + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0); };
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);

  // The context is made only on a user gesture (browsers block sound before one).
  function ensureCtx() {
    if (!ctx) {
      try {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
        const n = 64, real = new Float32Array(n), imag = new Float32Array(n);
        for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25); // a 25% pulse
        pulse = ctx.createPeriodicWave(real, imag);
        const len = ctx.sampleRate * 0.5; noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const ch = noise.getChannelData(0); for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      } catch (e) { ctx = null; return null; }
    }
    try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) { /* ignore */ }
    return ctx;
  }
  function onGesture() { gestured = true; if (wanted && wanted.track) set(wanted.track, wanted.level); }
  try { if (root.document) ['pointerdown', 'keydown'].forEach(t => root.document.addEventListener(t, onGesture, true)); } catch (e) { /* no document */ }

  function tone(type, freq, t, dur, gain) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    if (type === 'pulse') o.setPeriodicWave(pulse); else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.setValueAtTime(gain, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function hit(kind, t) {
    if (kind === 'k') { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.18); return; }
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), snare = kind === 's';
    s.buffer = noise; f.type = snare ? 'bandpass' : 'highpass'; f.frequency.value = snare ? 1800 : 7000;
    g.gain.setValueAtTime(snare ? 0.22 : 0.1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (snare ? 0.14 : 0.05));
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 0.16);
  }

  function schedule() {
    if (!ctx || !current) return;
    while (nextAt < ctx.currentTime + 0.12) {
      if (pending) { current = pending; pending = null; step = 0; } // a hard cut, on the beat
      const tr = TRACKS[current], i = step % tr.lead.length, eighth = 60 / tr.bpm / 2;
      const l = midi(tr.lead[i]); if (l !== null) tone('pulse', hz(l), nextAt, eighth * 0.9, tr.leadGain);
      const b = midi(tr.bass[i]); if (b !== null) tone('triangle', hz(b), nextAt, eighth * 0.95, tr.bassGain);
      if (tr.drums[i] !== '-') hit(tr.drums[i], nextAt);
      step++; nextAt += eighth;
    }
  }
  function applyGain() {
    if (!master) return;
    const target = ctx.currentTime < dipUntil ? GAIN.low : GAIN[level];
    master.gain.setTargetAtTime(target, ctx.currentTime, 0.1); // about a 300 ms fade
  }

  // The track for now ('rush' | 'tense' | null = silence) and its level ('full' | 'low').
  // Starts on the first gesture; a new track cuts in on the next beat.
  function set(track, lvl = 'full') {
    wanted = { track, level: lvl };
    if (!track) return stop();
    if (!gestured || !ensureCtx()) return;
    if (lvl !== level) { level = lvl; applyGain(); }
    if (!current) {
      current = track; step = 0; nextAt = ctx.currentTime + 0.05; level = lvl; applyGain();
      clearInterval(timer); timer = setInterval(schedule, 25); schedule();
    } else if (track !== current && track !== pending) {
      pending = track;
    }
  }
  // The music ducks for a celebration, then comes back.
  function dip(ms) {
    if (!ctx || !current) return;
    dipUntil = ctx.currentTime + ms / 1000; applyGain();
    setTimeout(applyGain, ms + 20);
  }
  function stop() {
    clearInterval(timer); timer = null; current = null; pending = null;
    if (master && ctx) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(0, ctx.currentTime); }
  }
  function status() { return { track: current ? (pending || current) : null, level, playing: !!(timer && current && ctx && ctx.state === 'running') }; }

  return { TRACKS, LAST_MINUTE_MS, trackFor, levelFor, useKey, enabled, toggle, set, dip, stop, status };
});
