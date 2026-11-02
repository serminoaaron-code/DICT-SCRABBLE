const test = require('node:test');
const assert = require('node:assert');
const Drag = require('../js/drag.js');

const free = () => false;
const taken = () => true;
const ctx = (over = {}) => Object.assign({ myTurn: true, locked: false, occupied: free }, over);
const rack = index => ({ kind: 'rack', index });
const board = (r, c) => ({ kind: 'board', r, c });
const sq = (r, c) => ({ kind: 'square', r, c });

test('THRESHOLD_PX: a drag starts after 6px of movement', () => {
  assert.strictEqual(Drag.THRESHOLD_PX, 6);
});

test('place: a rack tile dropped on an empty square on my turn', () => {
  assert.deepStrictEqual(Drag.decide(Object.assign({ from: rack(3), to: sq(7, 7) }, ctx())), { type: 'place', index: 3, r: 7, c: 7 });
});

test('place is refused (tile goes back) on an occupied square, off my turn, or while locked', () => {
  assert.deepStrictEqual(Drag.decide(Object.assign({ from: rack(3), to: sq(7, 7) }, ctx({ occupied: taken }))), { type: 'return' }, 'occupied');
  assert.deepStrictEqual(Drag.decide(Object.assign({ from: rack(3), to: sq(7, 7) }, ctx({ myTurn: false }))), { type: 'return' }, 'not my turn');
  assert.deepStrictEqual(Drag.decide(Object.assign({ from: rack(3), to: sq(7, 7) }, ctx({ locked: true }))), { type: 'return' }, 'busy / word rejected');
});

test('move: a placed tile dropped on another empty square', () => {
  assert.deepStrictEqual(Drag.decide(Object.assign({ from: board(7, 7), to: sq(7, 8) }, ctx())), { type: 'move', from: { r: 7, c: 7 }, r: 7, c: 8 });
});

test('move onto its own square or an occupied one sends it back', () => {
  assert.deepStrictEqual(Drag.decide(Object.assign({ from: board(7, 7), to: sq(7, 7) }, ctx())), { type: 'return' }, 'same square');
  assert.deepStrictEqual(Drag.decide(Object.assign({ from: board(7, 7), to: sq(7, 8) }, ctx({ occupied: taken }))), { type: 'return' }, 'occupied');
  assert.deepStrictEqual(Drag.decide(Object.assign({ from: board(7, 7), to: sq(7, 8) }, ctx({ myTurn: false }))), { type: 'return' }, 'not my turn');
});

test('unplace: a placed tile dropped on the rack is taken back (always allowed)', () => {
  assert.deepStrictEqual(Drag.decide(Object.assign({ from: board(7, 8), to: { kind: 'rack', pos: 2 } }, ctx())), { type: 'unplace', r: 7, c: 8 });
  assert.deepStrictEqual(Drag.decide(Object.assign({ from: board(7, 8), to: { kind: 'rack', pos: 2 } }, ctx({ myTurn: false, locked: true }))), { type: 'unplace', r: 7, c: 8 });
});

test('reorder: a rack tile dropped on the rack, also on the opponent\'s turn', () => {
  assert.deepStrictEqual(Drag.decide(Object.assign({ from: rack(1), to: { kind: 'rack', pos: 5 } }, ctx({ myTurn: false }))), { type: 'reorder', index: 1, pos: 5 });
});

test('dropped nowhere (off the board and rack): back to the rack', () => {
  assert.deepStrictEqual(Drag.decide(Object.assign({ from: rack(1), to: { kind: 'none' } }, ctx())), { type: 'return' });
  assert.deepStrictEqual(Drag.decide(Object.assign({ from: board(1, 1), to: { kind: 'none' } }, ctx())), { type: 'return' });
});
