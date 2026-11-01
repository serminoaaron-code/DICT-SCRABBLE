const test = require('node:test');
const assert = require('node:assert');
const Scenes = require('../js/scenes.js');

test('introRemaining before, during, after', () => {
  const room = { clock: { startedAt: 6000 } };
  assert.strictEqual(Scenes.introRemaining(room, 1000), 5000);
  assert.strictEqual(Scenes.introRemaining(room, 4000), 2000);
  assert.strictEqual(Scenes.introRemaining(room, 7000), 0);
});
