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

test('move: a dragged tile lands at its insertion position (measured before it is removed)', () => {
  assert.deepStrictEqual(Rack.move([0, 1, 2, 3], 0, 4), [1, 2, 3, 0], 'first to the end');
  assert.deepStrictEqual(Rack.move([0, 1, 2, 3], 3, 0), [3, 0, 1, 2], 'last to the front');
  assert.deepStrictEqual(Rack.move([2, 0, 1], 0, 2), [0, 2, 1], 'one step right');
});

test('move: dropping a tile where it already is changes nothing; the input is not mutated', () => {
  const input = [0, 1, 2, 3];
  assert.deepStrictEqual(Rack.move(input, 1, 1), [0, 1, 2, 3]);
  assert.deepStrictEqual(Rack.move(input, 1, 2), [0, 1, 2, 3]);
  assert.deepStrictEqual(input, [0, 1, 2, 3]);
});

test('shuffle: repeated letters still shuffle by index', () => {
  const s = Rack.sync(null, ['E', 'E', 'E']);
  assert.deepStrictEqual(sorted(Rack.shuffle(s.order, seeded(3))), [0, 1, 2]);
});

// ---- refill (turn moments #3): your tiles stay put, the drawn tiles fill the slots you used ----
test('refill: shuffled rack — used slot gets the drawn tile, the rest keep their places', () => {
  const r = Rack.refill({ key: 'A,B,C,D', order: [2, 0, 1, 3] }, ['A', 'B', 'C', 'D'], ['A', 'C', 'D', 'X'], [1]);
  assert.deepStrictEqual(r, { key: 'A,C,D,X', order: [1, 0, 3, 2], fresh: [3] }); // shown C A X D
});

test('refill: two used slots in a normal order are filled in place', () => {
  const prev = { key: 'A,B,C,D,E,F,G', order: [0, 1, 2, 3, 4, 5, 6] };
  const r = Rack.refill(prev, ['A', 'B', 'C', 'D', 'E', 'F', 'G'], ['B', 'D', 'E', 'F', 'G', 'X', 'Y'], [0, 2]);
  assert.deepStrictEqual(r.order, [5, 0, 6, 1, 2, 3, 4]); // shown X B Y D E F G
  assert.deepStrictEqual(r.fresh, [5, 6]);
});

test('refill: repeated letters — whichever copy the server removed, your other tiles stay put', () => {
  // You played the second E (index 2); the server removes the first E it finds.
  const r = Rack.refill({ key: 'E,A,E', order: [0, 1, 2] }, ['E', 'A', 'E'], ['A', 'E', 'Z'], [2]);
  assert.deepStrictEqual(r.order, [1, 0, 2]); // shown E A Z: the drawn Z is where your played E was
  assert.deepStrictEqual(r.fresh, [2]);
});

test('refill: an empty bag shortens the rack instead of leaving holes', () => {
  const r = Rack.refill({ key: 'A,B,C', order: [0, 1, 2] }, ['A', 'B', 'C'], ['C'], [0, 1]);
  assert.deepStrictEqual(r, { key: 'C', order: [0], fresh: [] });
});

test('refill: a rack that does not match the play returns null (fall back to sync); inputs untouched', () => {
  assert.strictEqual(Rack.refill({ key: 'A,B,C', order: [0, 1, 2] }, ['A', 'B', 'C'], ['Q', 'R', 'S'], [0]), null);
  assert.strictEqual(Rack.refill(null, ['A'], ['B'], [0]), null);
  const prev = { key: 'A,B', order: [1, 0] }, before = JSON.stringify(prev);
  Rack.refill(prev, ['A', 'B'], ['B', 'X'], [0]);
  assert.strictEqual(JSON.stringify(prev), before);
});