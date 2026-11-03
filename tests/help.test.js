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

test('help.css uses the theme tokens (no fixed colours except white)', () => {
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'css', 'help.css'), 'utf8');
  const fixed = (css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter(c => !/^#fff(fff)?$/i.test(c));
  assert.deepStrictEqual(fixed, []);
});

test('the player guide says which ways words read (the engine hint, not retyped)', () => {
  const E = require('../js/engine.js');
  assert.ok(Help.guides(Help.facts()).player.steps.join('').includes(E.READ_HINT));
});

test('the guides mention 2-4 players and the roulette (3-4 player rooms)', () => {
  const g = Help.guides(Help.facts());
  const player = g.player.steps.join('');
  const host = g.host.steps.join('');
  assert.ok(/roulette/i.test(player), 'player guide: the roulette for 3-4 players');
  assert.ok(host.includes('2, 3 or 4'), 'host guide: pick 2, 3 or 4 players');
  assert.ok(/all players are ready/i.test(host), 'host guide: start when all players are ready');
});
