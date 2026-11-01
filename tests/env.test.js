const test = require('node:test');
const assert = require('node:assert');
const Env = require('../js/env.js');

test('localhost uses the playground data area', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]', '::1', '']) {
    assert.deepStrictEqual(Env.dataRoot(host, ''), { root: 'scrabble_playground', playground: true }, host);
  }
});

test('LAN addresses used for phone testing also use the playground', () => {
  assert.strictEqual(Env.dataRoot('192.168.1.20', '').playground, true);
  assert.strictEqual(Env.dataRoot('10.0.0.5', '').playground, true);
  assert.strictEqual(Env.dataRoot('172.16.4.2', '').playground, true);
});

test('the deployed site uses the real tournament data', () => {
  assert.deepStrictEqual(Env.dataRoot('serminoaaron-code.github.io', ''), { root: 'scrabble', playground: false });
});

test('?db= overrides the automatic choice', () => {
  assert.strictEqual(Env.dataRoot('localhost', '?db=live').root, 'scrabble');
  assert.strictEqual(Env.dataRoot('serminoaaron-code.github.io', '?view=scoreboard&db=playground').root, 'scrabble_playground');
  assert.strictEqual(Env.dataRoot('localhost', '?db=nonsense').root, 'scrabble_playground');
});
