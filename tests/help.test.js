const test = require('node:test');
const assert = require('node:assert');
const Help = require('../js/view-help.js');

test('roleOf: which guide a hash opens (null when it is not the help page)', () => {
  assert.strictEqual(Help.roleOf('gamehelp'), 'player');
  assert.strictEqual(Help.roleOf('gamehelp=host'), 'host');
  assert.strictEqual(Help.roleOf('gamehelp=watch'), 'watch');
  assert.strictEqual(Help.roleOf('gamehelp=player'), 'player');
  assert.strictEqual(Help.roleOf('gamehelp=nope'), 'player', 'an unknown role opens the player guide');
  assert.strictEqual(Help.roleOf('GameHelp=Watch'), 'watch', 'case does not matter');
  assert.strictEqual(Help.roleOf('host'), null);
  assert.strictEqual(Help.roleOf('room=ABCDEF'), null);
  assert.strictEqual(Help.roleOf(''), null);
  assert.deepStrictEqual(Help.ROLES, ['player', 'host', 'watch']);
});

test('facts: the numbers on the page come from the game itself', () => {
  assert.deepStrictEqual(Help.facts(), { turnSec: 60, tiers: [8, 15, 25, 40], bingo: 50, tauntSec: 10, sdRounds: 3 });
});
