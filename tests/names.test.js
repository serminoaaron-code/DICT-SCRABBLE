const test = require('node:test');
const assert = require('node:assert');
const Names = require('../js/names.js');

test('MAX is 25 characters', () => {
  assert.strictEqual(Names.MAX, 25);
});

test('short: names up to 25 characters are shown as they are', () => {
  assert.strictEqual(Names.short('Team A'), 'Team A');
  assert.strictEqual(Names.short('x'.repeat(25)), 'x'.repeat(25));
});

test('short: longer names keep their first 25 characters and end in "…"', () => {
  assert.strictEqual(Names.short('TEST-' + 'w'.repeat(35)), 'TEST-' + 'w'.repeat(20) + '…');
  assert.strictEqual(Names.short('x'.repeat(26)), 'x'.repeat(25) + '…');
});

test('short: a cut never leaves a space before the "…"', () => {
  assert.strictEqual(Names.short('Department of Information and Communications'), 'Department of Information…');
  assert.strictEqual(Names.short('abcdefghijklmnopqrstuvwx yz123'), 'abcdefghijklmnopqrstuvwx…');
});

test('short: counts characters, not UTF-16 units (emoji and accents are never split)', () => {
  const name = '🏆'.repeat(30);
  assert.strictEqual(Names.short(name), '🏆'.repeat(25) + '…');
  assert.strictEqual(Names.short('Ñ'.repeat(25)), 'Ñ'.repeat(25));
});

test('short: missing names become an empty string; max can be passed', () => {
  assert.strictEqual(Names.short(null), '');
  assert.strictEqual(Names.short(undefined), '');
  assert.strictEqual(Names.short('abcdef', 3), 'abc…');
});
