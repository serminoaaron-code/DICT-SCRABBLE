const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/match.js');
const RoomList = require('../js/roomlist.js');

const room = (code, status, extra = {}) => Object.assign({ code, status, clock: null, game: null }, extra);
const phaseOf = M.roomPhase;

// 2 live (one paused by the host), 1 waiting, 12 final, 1 void: already in display order.
function fixture() {
  const rooms = [
    room('L1', 'live'),
    room('L2', 'live', { clock: { paused: { by: 'host' } } }),
    room('W1', 'waiting')
  ];
  for (let i = 1; i <= 12; i++) rooms.push(room('F' + i, 'final'));
  rooms.push(room('V1', 'void'));
  return rooms;
}

test('tabOf: every running or waiting phase is active; final is finished; void is void', () => {
  for (const p of ['live', 'waiting', 'paused', 'appeal', 'suddenDeath', 'hostDecision']) assert.strictEqual(RoomList.tabOf(p), 'active', p);
  assert.strictEqual(RoomList.tabOf('final'), 'finished');
  assert.strictEqual(RoomList.tabOf('void'), 'void');
  assert.strictEqual(RoomList.PER_PAGE, 5);
});

test('view: counts per tab; the active tab shows every active room on one page', () => {
  const v = RoomList.view(fixture(), { tab: 'active', page: 4 }, phaseOf);
  assert.deepStrictEqual(v.counts, { active: 3, finished: 12, void: 1 });
  assert.deepStrictEqual(v.items.map(r => r.code), ['L1', 'L2', 'W1']);
  assert.strictEqual(v.page, 1);
  assert.strictEqual(v.pages, 1);
  assert.strictEqual(v.tab, 'active');
});

test('view: finished pages hold 5 rooms each, in input order', () => {
  const p1 = RoomList.view(fixture(), { tab: 'finished', page: 1 }, phaseOf);
  assert.deepStrictEqual(p1.items.map(r => r.code), ['F1', 'F2', 'F3', 'F4', 'F5']);
  assert.strictEqual(p1.pages, 3);
  const p3 = RoomList.view(fixture(), { tab: 'finished', page: 3 }, phaseOf);
  assert.deepStrictEqual(p3.items.map(r => r.code), ['F11', 'F12']);
  assert.strictEqual(p3.page, 3);
});

test('view: a page past the end clamps to the last page; an empty tab is page 1 of 1', () => {
  const v = RoomList.view(fixture(), { tab: 'finished', page: 9 }, phaseOf);
  assert.strictEqual(v.page, 3);
  assert.deepStrictEqual(v.items.map(r => r.code), ['F11', 'F12']);
  const empty = RoomList.view([room('L1', 'live')], { tab: 'finished', page: 2 }, phaseOf);
  assert.deepStrictEqual([empty.page, empty.pages, empty.items], [1, 1, []]);
});

test('view: the void tab pages the same way', () => {
  const v = RoomList.view(fixture(), { tab: 'void', page: 1 }, phaseOf);
  assert.deepStrictEqual(v.items.map(r => r.code), ['V1']);
  assert.strictEqual(v.pages, 1);
});

test('pageList: first, last and the neighbours of the current page, with … for gaps', () => {
  assert.deepStrictEqual(RoomList.pageList(1, 1), [1]);
  assert.deepStrictEqual(RoomList.pageList(1, 3), [1, 2, 3]);
  assert.deepStrictEqual(RoomList.pageList(5, 20), [1, '…', 4, 5, 6, '…', 20]);
  assert.deepStrictEqual(RoomList.pageList(2, 20), [1, 2, 3, '…', 20]);
  assert.deepStrictEqual(RoomList.pageList(20, 20), [1, '…', 19, 20]);
});
