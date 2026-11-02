const test = require('node:test');
const assert = require('node:assert');

// a tiny localStorage for Node
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const Sound = require('../js/sound.js');

test('enabled: off by default for the game pages', () => {
  store.clear();
  Sound.useKey('scrabble.sound', false);
  assert.strictEqual(Sound.enabled(), false);
  store.set('scrabble.sound', '1');
  assert.strictEqual(Sound.enabled(), true);
});

test("useKey: the big screen's own key, on by default; '0' turns it off; toggle writes that key only", () => {
  store.clear();
  Sound.useKey('scrabble.sound.bigscreen', true);
  assert.strictEqual(Sound.enabled(), true, 'on by default');
  assert.strictEqual(Sound.toggle(), false);
  assert.strictEqual(store.get('scrabble.sound.bigscreen'), '0');
  assert.strictEqual(Sound.enabled(), false);
  assert.strictEqual(Sound.toggle(), true);
  assert.strictEqual(store.get('scrabble.sound.bigscreen'), '1');
  assert.strictEqual(store.has('scrabble.sound'), false, 'the game pages\' setting is untouched');
  Sound.useKey('scrabble.sound', false);
});

test('bell: three rings 0.32 s apart, four partials each, ringing out', () => {
  const bell = Sound.PRESETS.bell;
  assert.strictEqual(bell.length, 12);
  assert.deepStrictEqual([...new Set(bell.map(n => n.t))], [0, 0.32, 0.64]);
  assert.ok(bell.every(n => n.decay === 'exp' && n.d >= 0.4));
});
