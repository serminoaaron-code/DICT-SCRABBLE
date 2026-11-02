const test = require('node:test');
const assert = require('node:assert');
const Rack = require('../js/rack.js');

// Small deterministic rng (mulberry32).
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sorted = a => a.slice().sort((x, y) => x - y);

test('sync: no previous order -> identity for the rack', () => {
  assert.deepStrictEqual(Rack.sync(null, ['A', 'B', 'C']), { key: 'A,B,C', order: [0, 1, 2] });
});

test('sync: same letters keep the shuffled order', () => {
  const prev = { key: 'A,B,C', order: [2, 0, 1] };
  assert.deepStrictEqual(Rack.sync(prev, ['A', 'B', 'C']).order, [2, 0, 1]);
});

test('sync: changed letters (after a play) reset to identity', () => {
  assert.deepStrictEqual(Rack.sync({ key: 'A,B,C', order: [2, 0, 1] }, ['A', 'B', 'D']), { key: 'A,B,D', order: [0, 1, 2] });
});

test('sync: a stale order of the wrong length never survives', () => {
  assert.deepStrictEqual(Rack.sync({ key: 'A,B', order: [1, 0, 2] }, ['A', 'B']).order, [0, 1]);
});

test('shuffle: a permutation of the same indices that always differs from its input', () => {
  const rng = seeded(7);
  let order = [0, 1, 2, 3, 4, 5, 6];
  for (let i = 0; i < 50; i++) {
    const next = Rack.shuffle(order, rng);
    assert.deepStrictEqual(sorted(next), [0, 1, 2, 3, 4, 5, 6]);
    assert.notDeepStrictEqual(next, order);
    order = next;
  }
});

test('shuffle: falls back to a rotation when the draws keep giving the same order', () => {
  // 0.999 makes Fisher–Yates pick j = i every time: the identity.
  assert.deepStrictEqual(Rack.shuffle([0, 1], () => 0.999), [1, 0]);
});

test('shuffle: 0 or 1 tiles stay as they are; the input is not mutated', () => {
  assert.deepStrictEqual(Rack.shuffle([0]), [0]);
  assert.deepStrictEqual(Rack.shuffle([]), []);
  const input = [0, 1, 2];
  Rack.shuffle(input, seeded(1));
  assert.deepStrictEqual(input, [0, 1, 2]);
});

test('shuffle: repeated letters still shuffle by index', () => {
  const s = Rack.sync(null, ['E', 'E', 'E']);
  assert.deepStrictEqual(sorted(Rack.shuffle(s.order, seeded(3))), [0, 1, 2]);
});
