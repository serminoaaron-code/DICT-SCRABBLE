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
  assert.deepStrictEqual(v.counts, { active: 3, finished: 12, void: 1, attention: 0 });
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

test('view: counts the active rooms waiting on the host (appeal or tie) on every tab', () => {
  const rooms = fixture().concat([
    room('AP', 'live', { game: { pending: { seat: 'A' } } }),
    room('HD', 'hostDecision')
  ]);
  for (const tab of ['active', 'finished', 'void']) {
    assert.strictEqual(RoomList.view(rooms, { tab, page: 1 }, phaseOf).counts.attention, 2, tab);
  }
  assert.strictEqual(RoomList.view(fixture(), { tab: 'finished', page: 1 }, phaseOf).counts.attention, 0);
});

// ---- the host room card's per-seat model (host room cards redesign, 2026-11-03) ----
const base = (players, extra = {}) => M.normalizeRoom(Object.assign({
  code: 'ABC123', status: 'waiting', teamA: 'ta', teamB: 'tb', teamAName: 'NCR', teamBName: 'CAR', matchLengthSec: 600, createdAt: 1,
  seats: {}, presence: {}, clock: null, game: null, result: null
}, players > 2 ? { players, teamC: 'tc', teamCName: 'IV-A' } : {}, players > 3 ? { teamD: 'td', teamDName: 'RIV' } : {}, extra));
const texts = (row, phase) => RoomList.seatTags(row, phase).map(t => t.kind + ':' + t.text);

test('seatRows: one row per seat (2, 3 or 4), numbered 1..n, empty seats have no name', () => {
  for (const n of [2, 3, 4]) {
    const rows = RoomList.seatRows(base(n));
    assert.deepStrictEqual(rows.map(r => [r.seat, r.num, r.taken, r.name]), M.seatsOf(base(n)).map((s, i) => [s, i + 1, false, null]));
  }
});

test('seatRows: a taken seat has its name, ready flag and whether its device is connected', () => {
  const r = base(3, { seats: { A: { name: 'josh', clientId: 'c1', ready: true }, C: { name: 'liza', clientId: 'c3', ready: false } }, presence: { c1: 'A' } });
  const [a, b, c] = RoomList.seatRows(r);
  assert.deepStrictEqual([a.name, a.taken, a.ready, a.online], ['josh', true, true, true]);
  assert.deepStrictEqual([b.name, b.taken], [null, false]);
  assert.deepStrictEqual([c.name, c.ready, c.online], ['liza', false, false]);
});

test('seatTags while waiting: Ready / Not ready, Offline for a seat whose device is gone, nothing for an empty seat', () => {
  const r = base(3, { seats: { A: { name: 'josh', clientId: 'c1', ready: true }, B: { name: 'mark', clientId: 'c2', ready: false } }, presence: { c1: 'A' } });
  const [a, b, c] = RoomList.seatRows(r);
  assert.deepStrictEqual(texts(a, 'waiting'), ['ok:✓ Ready']);
  assert.deepStrictEqual(texts(b, 'waiting'), ['off:Not ready', 'off:📴 Offline']);
  assert.deepStrictEqual(texts(c, 'waiting'), []);
});

test('seatTags while live: whose turn, scores, screen-leave count; LEFT / OUT seats get no Turn', () => {
  const seats = { A: { name: 'a', clientId: 'ca' }, B: { name: 'b', clientId: 'cb' }, C: { name: 'c', clientId: 'cc' }, D: { name: 'd', clientId: 'cd' } };
  const r = base(4, { status: 'live', seats, presence: { ca: 'A', cb: 'B', cc: 'C', cd: 'D' },
    game: { turn: 'A', scores: { A: 88, B: 74, C: 20, D: 61 }, out: { C: 'left', D: 'sd' }, board: {}, bag: [], racks: {} },
    fairPlay: { B: { screenLeaves: 3 } } });
  const rows = RoomList.seatRows(r);
  assert.deepStrictEqual(rows.map(x => x.score), [88, 74, 20, 61]);
  assert.deepStrictEqual(rows.map(x => x.out), [null, null, 'left', 'sd']);
  assert.deepStrictEqual(texts(rows[0], 'live'), ['turn:▶ Turn']);
  assert.deepStrictEqual(texts(rows[1], 'live'), ['warn:⚠️ Left the screen · 3×']);
  assert.deepStrictEqual(texts(rows[2], 'live'), ['bad:LEFT']);
  assert.deepStrictEqual(texts(rows[3], 'suddenDeath'), ['bad:OUT']);
  assert.deepStrictEqual(texts(rows[0], 'paused'), ['turn:▶ Turn'], 'the turn shows while paused too');
});

test('seatTags: a seat that left is not also "Offline"; finished and void rooms have no tags', () => {
  const r = base(3, { status: 'live', seats: { A: { name: 'a', clientId: 'ca' }, B: { name: 'b', clientId: 'cb' }, C: { name: 'c', clientId: 'cc' } },
    presence: {}, game: { turn: 'A', scores: { A: 1, B: 2, C: 3 }, out: { B: 'left' }, board: {}, bag: [], racks: {} }, fairPlay: { A: { screenLeaves: 1 } } });
  const [a, b] = RoomList.seatRows(r);
  assert.deepStrictEqual(texts(b, 'live'), ['bad:LEFT']);
  assert.deepStrictEqual(texts(a, 'live'), ['turn:▶ Turn', 'off:📴 Offline', 'warn:⚠️ Left the screen · 1×']);
  for (const p of ['final', 'void']) assert.deepStrictEqual(texts(a, p), [], p);
});

test('seatRows: scores are numbers only while a game exists, null before it', () => {
  assert.deepStrictEqual(RoomList.seatRows(base(2)).map(x => x.score), [null, null]);
  const r = base(2, { status: 'live', game: { turn: 'A', scores: { A: '7', B: 'x' }, board: {}, bag: [], racks: {} } });
  assert.deepStrictEqual(RoomList.seatRows(r).map(x => x.score), [7, 0]);
});

test('seatTags: no ▶ Turn while the host decides a tie (nobody can move then)', () => {
  const r = base(2, { status: 'hostDecision', seats: { A: { name: 'a', clientId: 'ca' }, B: { name: 'b', clientId: 'cb' } }, presence: { ca: 'A', cb: 'B' },
    game: { turn: 'A', scores: { A: 9, B: 9 }, board: {}, bag: [], racks: {}, suddenDeath: { startMove: 4, rounds: 1 } } });
  const [a] = RoomList.seatRows(r);
  assert.deepStrictEqual(texts(a, 'hostDecision'), []);
  assert.deepStrictEqual(texts(a, 'appeal'), ['turn:▶ Turn'], 'during an appeal the turn is still with that seat');
});

test('fairPlayLine: the screen-leave counts of a finished or void room in one short line', () => {
  const r = base(3, { status: 'final', seats: { A: { name: 'josh', clientId: 'c1' }, B: { name: 'mark', clientId: 'c2' }, C: { name: 'ana', clientId: 'c3' } },
    fairPlay: { A: { screenLeaves: 1 }, C: { screenLeaves: 4 } } });
  assert.deepStrictEqual(RoomList.fairPlayLine(r), [{ name: 'josh', leaves: 1 }, { name: 'ana', leaves: 4 }]);
  assert.deepStrictEqual(RoomList.fairPlayLine(base(2)), []);
});
