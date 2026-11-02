const test = require('node:test');
const assert = require('node:assert');
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const Music = require('../js/music.js');

const NOW = 100000;
const room = (status, over = {}) => Object.assign({
  status, clock: { startedAt: 1000, endsAt: NOW + 300000, turnStartedAt: NOW, paused: null }, game: { pending: null, suddenDeath: null }
}, over);

test('trackFor: nothing before the clocks start, outside a match, or after it', () => {
  for (const s of ['waiting', 'final', 'void']) assert.strictEqual(Music.trackFor(room(s), NOW), null, s);
  assert.strictEqual(Music.trackFor(room('live', { clock: { startedAt: NOW + 1, endsAt: NOW + 300000, paused: null } }), NOW), null, 'during the VS intro');
  assert.strictEqual(Music.trackFor(null, NOW), null);
});

test('trackFor: Tile Rush, then Last Minute for the final 60 s', () => {
  assert.strictEqual(Music.LAST_MINUTE_MS, 60000);
  assert.strictEqual(Music.trackFor(room('live', { clock: { startedAt: 1000, endsAt: NOW + 60001, paused: null } }), NOW), 'rush');
  assert.strictEqual(Music.trackFor(room('live', { clock: { startedAt: 1000, endsAt: NOW + 60000, paused: null } }), NOW), 'tense');
});

test('trackFor: Last Minute through sudden death and a host decision after it', () => {
  assert.strictEqual(Music.trackFor(room('suddenDeath'), NOW), 'tense');
  assert.strictEqual(Music.trackFor(room('hostDecision', { game: { suddenDeath: { startMove: 9, rounds: 3 } } }), NOW), 'tense');
});

test('trackFor: a pause in the last minute keeps Last Minute; a pause earlier keeps Tile Rush', () => {
  assert.strictEqual(Music.trackFor(room('live', { clock: { startedAt: 1000, endsAt: NOW - 5000, paused: { by: 'host', matchRemainingMs: 30000, turnRemainingMs: 1000 } } }), NOW), 'tense');
  assert.strictEqual(Music.trackFor(room('live', { clock: { startedAt: 1000, endsAt: NOW - 5000, paused: { by: 'host', matchRemainingMs: 200000, turnRemainingMs: 1000 } } }), NOW), 'rush');
});

test('levelFor: low while paused, in an appeal or a host decision', () => {
  assert.strictEqual(Music.levelFor(room('live'), NOW), 'full');
  assert.strictEqual(Music.levelFor(room('live', { clock: { startedAt: 1000, endsAt: NOW + 9e5, paused: { by: 'host', matchRemainingMs: 1, turnRemainingMs: 1 } } }), NOW), 'low');
  assert.strictEqual(Music.levelFor(room('live', { game: { pending: { seat: 'A' } } }), NOW), 'low');
  assert.strictEqual(Music.levelFor(room('hostDecision'), NOW), 'low');
});

test("settings: on by default; toggle writes '0'/'1'; the big screen's key is separate", () => {
  store.clear();
  Music.useKey('scrabble.music');
  assert.strictEqual(Music.enabled(), true);
  assert.strictEqual(Music.toggle(), false);
  assert.strictEqual(store.get('scrabble.music'), '0');
  Music.useKey('scrabble.music.bigscreen');
  assert.strictEqual(Music.enabled(), true, 'the big screen is still on');
  Music.useKey('scrabble.music');
  assert.strictEqual(Music.enabled(), false);
  Music.toggle();
  assert.strictEqual(Music.enabled(), true);
});

test("TRACKS: the sample's two loops, 32 eighth-steps each", () => {
  assert.strictEqual(Music.TRACKS.rush.bpm, 128);
  assert.strictEqual(Music.TRACKS.tense.bpm, 144);
  for (const t of ['rush', 'tense']) for (const part of ['lead', 'bass', 'drums']) assert.strictEqual(Music.TRACKS[t][part].length, 32, `${t} ${part}`);
});
