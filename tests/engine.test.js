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

// ---------- Task 2: validation, words, scoring ----------

const P = (r, c, letter) => ({ r, c, letter });
const LV = E.LETTER_VALUES;

test('first move must cover centre', () => {
  assert.strictEqual(E.validatePlacement({}, [P(0, 0, 'A'), P(0, 1, 'T')]).error, 'FIRST_MOVE_CENTER');
});

test('first move single tile is NO_WORD', () => {
  assert.strictEqual(E.validatePlacement({}, [P(7, 7, 'A')]).error, 'NO_WORD');
});

test('tiles must be in one line', () => {
  assert.strictEqual(E.validatePlacement({}, [P(7, 7, 'A'), P(8, 8, 'T')]).error, 'NOT_IN_LINE');
});

test('gap not filled by board is rejected', () => {
  assert.strictEqual(E.validatePlacement({}, [P(7, 6, 'C'), P(7, 8, 'T')]).error, 'GAP');
});

test('gap filled by existing tile is ok', () => {
  const board = { '7_7': 'A' };
  const placements = [P(7, 6, 'C'), P(7, 8, 'T')];
  const v = E.validatePlacement(board, placements);
  assert.deepStrictEqual(v, { ok: true, direction: 'H' });
  assert.strictEqual(E.findWords(board, placements, 'H')[0].word, 'CAT');
});

test('later move must connect', () => {
  const board = { '7_7': 'A', '7_8': 'T' };
  assert.strictEqual(E.validatePlacement(board, [P(0, 0, 'G'), P(0, 1, 'O')]).error, 'NOT_CONNECTED');
});

test('occupied square rejected', () => {
  assert.strictEqual(E.validatePlacement({ '7_7': 'A' }, [P(7, 7, 'B')]).error, 'OCCUPIED');
});

test('duplicate square and out of bounds rejected', () => {
  assert.strictEqual(E.validatePlacement({}, [P(7, 7, 'A'), P(7, 7, 'B')]).error, 'DUPLICATE_SQUARE');
  assert.strictEqual(E.validatePlacement({}, [P(7, 15, 'A'), P(7, 14, 'B')]).error, 'OUT_OF_BOUNDS');
  assert.strictEqual(E.validatePlacement({}, []).error, 'EMPTY');
});

test('CAT on centre scores double word', () => {
  const m = E.scoreMove({}, [P(7, 6, 'C'), P(7, 7, 'A'), P(7, 8, 'T')]);
  assert.strictEqual(m.ok, true);
  assert.deepStrictEqual(m.words, [{ word: 'CAT', score: 10 }]);
  assert.strictEqual(m.total, 10);
  assert.strictEqual(m.bingo, false);
});

test('premium only under new tiles', () => {
  assert.strictEqual(E.PREMIUM_GRID[7][9], '');
  const m = E.scoreMove({ '7_6': 'C', '7_7': 'A', '7_8': 'T' }, [P(7, 9, 'S')]);
  assert.deepStrictEqual(m.words, [{ word: 'CATS', score: 6 }]);
  assert.strictEqual(m.total, 6);
});

test('cross-words are found and scored', () => {
  const board = { '7_7': 'A', '7_8': 'T' };
  const m = E.scoreMove(board, [P(6, 7, 'B'), P(6, 8, 'E')]);
  assert.strictEqual(m.ok, true);
  // (6,7) is plain, (6,8) is a double letter square.
  assert.strictEqual(E.PREMIUM_GRID[6][7], '');
  assert.strictEqual(E.PREMIUM_GRID[6][8], 'dl');
  const BE = LV.B + LV.E * 2;
  const BA = LV.B + LV.A;
  const ET = LV.E * 2 + LV.T;
  const words = Object.fromEntries(m.words.map(w => [w.word, w.score]));
  assert.deepStrictEqual(words, { BE, BA, ET });
  assert.strictEqual(m.words[0].word, 'BE'); // main word first
  assert.strictEqual(m.total, BE + BA + ET);
});

test('single tile picks the direction that forms a word', () => {
  const board = { '6_7': 'A', '8_7': 'E' };
  const v = E.validatePlacement(board, [P(7, 7, 'T')]);
  assert.deepStrictEqual(v, { ok: true, direction: 'V' });
  assert.strictEqual(E.findWords(board, [P(7, 7, 'T')], 'V')[0].word, 'ATE');
});

test('bingo adds 50', () => {
  const letters = ['R', 'E', 'T', 'A', 'I', 'N', 'S'];
  const placements = letters.map((l, i) => P(7, 4 + i, l));
  const m = E.scoreMove({}, placements);
  assert.strictEqual(m.bingo, true);
  assert.deepStrictEqual(m.words, [{ word: 'RETAINS', score: 14 }]);
  assert.strictEqual(m.total, 64);
});

test('scoreMove reports validation errors', () => {
  const m = E.scoreMove({}, [P(0, 0, 'A'), P(0, 1, 'T')]);
  assert.strictEqual(m.ok, false);
  assert.strictEqual(m.error, 'FIRST_MOVE_CENTER');
  assert.ok(E.ERROR_TEXT.FIRST_MOVE_CENTER.includes('centre'));
});
