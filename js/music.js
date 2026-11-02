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

  // ---------- browser part (Task 3) ----------
  function stop() {}

  return { TRACKS, LAST_MINUTE_MS, trackFor, levelFor, useKey, enabled, toggle, stop };
});
