// iPhone sound effects (BF-31), the sound.js path alone (no music): the session is set only when 🔊 makes
// the context, a tap with nothing to play leaves it alone, and an iPhone "interrupted" context (a call,
// Siri, another app taking the audio) is resumed by the next tap, even after the listeners went away.
const test = require('node:test');
const assert = require('node:assert');

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const handlers = {};
globalThis.document = {
  addEventListener: (t, fn) => { const l = (handlers[t] = handlers[t] || []); if (!l.includes(fn)) l.push(fn); },
  removeEventListener: (t, fn) => { handlers[t] = (handlers[t] || []).filter(f => f !== fn); }
};
const gesture = type => (handlers[type] || []).slice().forEach(fn => fn({ type }));
Object.defineProperty(globalThis, 'navigator', { value: { audioSession: { type: 'auto' } }, configurable: true, writable: true });

const made = [];
class FakeContext {
  constructor() { made.push(this); this.sessionAtCreate = navigator.audioSession.type; this.state = 'suspended'; }
  resume() { this.state = 'running'; if (this.onstatechange) this.onstatechange(); return Promise.resolve(); }
}
globalThis.AudioContext = FakeContext;
const Sound = require('../js/sound.js');
const tick = () => new Promise(r => setTimeout(r, 0));

test('a tap with sound effects off (and no music) makes no context and leaves the session alone', () => {
  gesture('pointerup'); gesture('touchend'); gesture('click');
  assert.strictEqual(made.length, 0);
  assert.strictEqual(navigator.audioSession.type, 'auto');
});

test('turning 🔊 on sets the session to media before it makes the context', () => {
  assert.strictEqual(Sound.toggle(), true);
  assert.strictEqual(made.length, 1);
  assert.strictEqual(made[0].sessionAtCreate, 'playback');
});

test('an interrupted context (a call) is resumed by the next tap, though the listeners had gone', async () => {
  await tick(); // running: the tap listeners remove themselves
  assert.strictEqual((handlers.touchend || []).length, 0);
  made[0].state = 'interrupted';
  made[0].onstatechange(); // the iPhone reports the interruption
  gesture('touchend');
  assert.strictEqual(made[0].state, 'running');
  assert.strictEqual(made.length, 1, 'still the one context');
});
