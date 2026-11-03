// iPhone sound (BF-31): Safari, and every iPhone browser on its engine (Brave too), mutes Web Audio on silent
// unless the page says its sound is media, and older Safari only unlocks audio on touchend / click.
// A fake iPhone in Node: navigator.audioSession, a document that records listeners, an AudioContext that
// starts suspended (as one made outside a tap does on an iPhone).
const test = require('node:test');
const assert = require('node:assert');

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const handlers = {};
globalThis.document = { addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); }, removeEventListener: () => {} };
const gesture = type => (handlers[type] || []).slice().forEach(fn => fn({ type }));
Object.defineProperty(globalThis, 'navigator', { value: { audioSession: { type: 'auto' } }, configurable: true, writable: true });

const made = [];
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
const node = () => ({ connect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), type: '', setPeriodicWave() {} });
class FakeContext {
  constructor() { made.push(this); this.sessionAtCreate = navigator.audioSession.type; this.currentTime = 0; this.state = 'suspended'; this.sampleRate = 8000; this.destination = {}; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createGain() { return node(); }
  createOscillator() { return node(); }
  createBiquadFilter() { return node(); }
  createBufferSource() { return node(); }
  createPeriodicWave() { return {}; }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
}
globalThis.AudioContext = FakeContext;

const Sound = require('../js/sound.js');
globalThis.Sound = Sound;
const Music = require('../js/music.js');

test('opening a page leaves the iPhone audio alone: no context, the session untouched', () => {
  assert.strictEqual(made.length, 0);
  assert.strictEqual(navigator.audioSession.type, 'auto');
});

test('the sound effects and the music both listen for touchend and click (older Safari unlocks audio only on these)', () => {
  assert.strictEqual((handlers.touchend || []).length, 2);
  assert.strictEqual((handlers.click || []).length, 2);
});

test('a tap ending (touchend) starts the music, and the sound plays as media, so the silent switch does not mute it', () => {
  Music.set('rush', 'full'); // the match screen asks for music before any tap
  assert.strictEqual(Music.status().playing, false);
  gesture('touchend');
  assert.strictEqual(made.length, 1);
  assert.strictEqual(made[0].sessionAtCreate, 'playback', 'set before the context is made');
  assert.strictEqual(Music.status().playing, true);
});

test('a click resumes a context the iPhone suspended (a call, the lock screen)', () => {
  made[0].state = 'suspended';
  gesture('click');
  assert.strictEqual(made[0].state, 'running');
  assert.strictEqual(made.length, 1, 'still the one shared context');
  Music.stop();
});
