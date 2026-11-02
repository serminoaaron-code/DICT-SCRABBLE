// The music player in Node, with a fake AudioContext and document (review fixes for js/music.js).
const test = require('node:test');
const assert = require('node:assert');

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const handlers = {};
globalThis.document = { addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); }, removeEventListener: () => {} };
const gesture = type => (handlers[type] || []).forEach(fn => fn({ type }));

let contexts = 0, oscillators = 0, gainTargets = 0;
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() { gainTargets++; } });
const node = () => ({ connect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), type: '', setPeriodicWave() {} });
class FakeContext {
  constructor() { contexts++; this.currentTime = 0; this.state = 'running'; this.sampleRate = 8000; this.destination = {}; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createGain() { return node(); }
  createOscillator() { oscillators++; return node(); }
  createBiquadFilter() { return node(); }
  createBufferSource() { return node(); }
  createPeriodicWave() { return {}; }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
}
globalThis.AudioContext = FakeContext;

const Sound = require('../js/sound.js');
globalThis.Sound = Sound;
const Music = require('../js/music.js');

test('a touch that lifts (pointerup) is the gesture that starts the music on phones (#4)', () => {
  Music.set('rush', 'full'); // the match screen asks for music before any gesture
  assert.strictEqual(Music.status().playing, false);
  gesture('pointerup'); // a phone tap: only the finger lifting counts
  assert.strictEqual(Music.status().playing, true);
  Music.stop();
});

test('a stopped match stays quiet: a later tap never restarts the music (critical #1)', () => {
  gesture('pointerdown');
  Music.set('tense', 'full');
  assert.strictEqual(Music.status().playing, true);
  Music.stop();
  assert.strictEqual(Music.status().playing, false);
  gesture('pointerdown'); // a tap on the result screen, Home or the dashboard
  assert.strictEqual(Music.status().playing, false);
  Music.stop();
});

test('with 🎵 off, a tap never starts the music', () => {
  store.set('scrabble.music', '0');
  Music.set('rush', 'full'); // a page asked for music before checking
  gesture('pointerdown');
  assert.strictEqual(Music.status().playing, false);
  store.delete('scrabble.music');
  Music.stop();
});


test('one AudioContext per page, shared with the sound effects (#8)', () => {
  gesture('pointerdown');
  Music.set('rush', 'full');
  store.set('scrabble.sound', '1');
  Sound.toggle(); Sound.toggle(); // sound on: it needs its context too
  assert.strictEqual(contexts, 1);
  Music.stop();
});

test('after a stall the scheduler does not burst the missed notes (#5)', async () => {
  gesture('pointerdown');
  Music.set('rush', 'full');
  const ctx = Sound.sharedContext();
  ctx.currentTime += 5; // the page stalled for 5 s
  const before = oscillators;
  await new Promise(r => setTimeout(r, 40)); // one scheduler pass
  assert.ok(oscillators - before <= 6, `only the next notes are scheduled (${oscillators - before})`);
  Music.stop();
});

test('stop() cancels a pending dip recovery (#10)', async () => {
  gesture('pointerdown');
  Music.set('rush', 'full');
  Music.dip(30);
  Music.stop();
  const before = gainTargets;
  await new Promise(r => setTimeout(r, 80));
  assert.strictEqual(gainTargets, before, 'no gain change after stop');
});

test('dipFor: the same dip on both screens - a celebration tier 1-4 only (#7)', () => {
  assert.strictEqual(Music.dipFor(0), 0, 'no dip for a +N float');
  for (const t of [1, 2, 3, 4]) assert.ok(Music.dipFor(t) > 0, 'tier ' + t);
});

test('trackFor: no music while a pause freezes the VS intro (#6)', () => {
  const now = 100000;
  const room = { status: 'live', clock: { startedAt: now - 1000, endsAt: now + 300000, paused: { by: 'host', introRemainingMs: 2000, matchRemainingMs: 300000, turnRemainingMs: 60000 } }, game: {} };
  assert.strictEqual(Music.trackFor(room, now), null);
});
