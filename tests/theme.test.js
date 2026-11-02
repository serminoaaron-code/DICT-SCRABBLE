const test = require('node:test');
const assert = require('node:assert');
const Theme = require('../js/theme.js');

test('stored choice wins', () => {
  assert.strictEqual(Theme.resolve('dark', false), 'dark');
  assert.strictEqual(Theme.resolve('light', true), 'light');
});

test('falls back to the device setting', () => {
  assert.strictEqual(Theme.resolve(null, true), 'dark');
  assert.strictEqual(Theme.resolve(undefined, false), 'light');
});

test('ignores junk', () => {
  assert.strictEqual(Theme.resolve('blue', true), 'dark');
});
