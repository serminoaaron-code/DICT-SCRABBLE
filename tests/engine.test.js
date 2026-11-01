const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');

// Deterministic rng (mulberry32) for shuffle tests.
function seeded(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Task 1: foundations ----------

test('PREMIUM_GRID is 15x15 and symmetric', () => {
  const g = E.PREMIUM_GRID;
  assert.strictEqual(g.length, 15);
  for (const row of g) assert.strictEqual(row.length, 15);
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      assert.strictEqual(g[r][c], g[c][r], `diag mirror ${r},${c}`);
      assert.strictEqual(g[r][c], g[14 - r][c], `vertical mirror ${r},${c}`);
    }
  }
  assert.strictEqual(g[7][14], 'tw');
  assert.strictEqual(g[7][7], 'center');
  const counts = {};
  for (const row of g) for (const sq of row) counts[sq] = (counts[sq] || 0) + 1;
  assert.strictEqual(counts.tw, 8);
  assert.strictEqual(counts.dw, 16);
  assert.strictEqual(counts.tl, 12);
  assert.strictEqual(counts.dl, 24);
});

test('createBag has 98 tiles matching TILE_DISTRIBUTION', () => {
  const bag = E.createBag(seeded(1));
  assert.strictEqual(bag.length, 98);
  const counts = {};
  for (const l of bag) counts[l] = (counts[l] || 0) + 1;
  assert.deepStrictEqual(counts, { ...E.TILE_DISTRIBUTION });
});

test('createBag is shuffled by rng', () => {
  const a = E.createBag(seeded(1)).join('');
  const b = E.createBag(seeded(2)).join('');
  assert.notStrictEqual(a, b);
});

test('drawTiles is pure and draws from the end', () => {
  const input = ['A', 'B', 'C'];
  assert.deepStrictEqual(E.drawTiles(input, 2), { drawn: ['C', 'B'], bag: ['A'] });
  assert.deepStrictEqual(input, ['A', 'B', 'C']);
  assert.strictEqual(E.drawTiles(['A'], 3).drawn.length, 1);
});

test('applyPlacements returns a new board map', () => {
  const board = {};
  const next = E.applyPlacements(board, [{ r: 7, c: 7, letter: 'A' }]);
  assert.deepStrictEqual(next, { '7_7': 'A' });
  assert.deepStrictEqual(board, {});
  assert.strictEqual(E.getTile(next, 7, 7), 'A');
  assert.strictEqual(E.getTile(next, 0, 0), null);
  assert.strictEqual(E.key(3, 12), '3_12');
});

test('rackHas checks multiplicity', () => {
  assert.strictEqual(E.rackHas(['E', 'A'], ['E', 'E']), false);
  assert.strictEqual(E.rackHas(['E', 'E', 'A'], ['E', 'E']), true);
  assert.deepStrictEqual(E.removeFromRack(['E', 'A', 'E'], ['E']), ['A', 'E']);
});
