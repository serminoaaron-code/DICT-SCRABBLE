const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/match.js');

// ---------- helpers ----------
const constRng = v => () => v;

function baseRoom(extra = {}) {
  return M.createRoom(Object.assign({
    code: 'K7Q42M', teamA: 'tA', teamB: 'tB', teamAName: 'NCR', teamBName: 'Region IV-A',
    label: 'Tonight', matchLengthSec: 600, now: 1000
  }, extra));
}

function readyRoom() {
  let r = baseRoom();
  r = M.claimSeat(r, 'A', { name: 'Maria', clientId: 'c1' });
  r = M.claimSeat(r, 'B', { name: 'Juan', clientId: 'c2' });
  r = M.setReady(r, 'A', 'c1', true);
  r = M.setReady(r, 'B', 'c2', true);
  return r;
}

function startedRoom(now = 1000, rng = constRng(0.7)) {
  return M.startMatch(readyRoom(), now, rng);
}

module.exports = { baseRoom, readyRoom, startedRoom, constRng };

// ---------- Task 3 ----------

test('generateRoomCode uses only the safe alphabet', () => {
  let i = 0;
  const rng = () => ((i++ * 0.6180339887) % 1);
  for (let n = 0; n < 200; n++) {
    assert.match(M.generateRoomCode(rng), /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  }
  assert.match(M.generateRoomCode(Math.random), /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
});

test('normalizeCode/formatCode round trip', () => {
  assert.strictEqual(M.normalizeCode(' k7q-42m '), 'K7Q42M');
  assert.strictEqual(M.normalizeCode('k7q 42m'), 'K7Q42M');
  assert.strictEqual(M.formatCode('K7Q42M'), 'K7Q-42M');
});

test('createRoom builds a waiting room', () => {
  const r = baseRoom();
  assert.strictEqual(r.status, 'waiting');
  assert.deepStrictEqual(r.seats, { A: null, B: null });
  assert.strictEqual(r.game, null);
  assert.strictEqual(r.result, null);
  assert.strictEqual(r.createdAt, 1000);
  assert.deepStrictEqual(r.fairPlay, { A: { screenLeaves: 0 }, B: { screenLeaves: 0 } });
});

test('createRoom rejects same team', () => {
  assert.throws(() => baseRoom({ teamB: 'tA' }), /SAME_TEAM/);
});

test('normalizeRoom restores dropped empties', () => {
  const raw = {
    code: 'K7Q42M', teamA: 'tA', teamB: 'tB', status: 'live', matchLengthSec: 600,
    seats: { A: { name: 'Maria', clientId: 'c1', ready: true, online: true } },
    clock: { startedAt: 1, endsAt: 2, turnStartedAt: 1 },
    game: { turn: 'A', firstSeat: 'A', moveCount: 0, scores: { A: 3 } }
  };
  const r = M.normalizeRoom(raw);
  assert.deepStrictEqual(r.game.board, {});
  assert.deepStrictEqual(r.game.bag, []);
  assert.deepStrictEqual(r.game.racks.A, []);
  assert.deepStrictEqual(r.game.racks.B, []);
  assert.deepStrictEqual(r.game.scores, { A: 3, B: 0 });
  assert.strictEqual(r.game.pending, null);
  assert.strictEqual(r.game.suddenDeath, null);
  assert.strictEqual(r.game.lastMove, null);
  assert.strictEqual(r.clock.paused, null);
  assert.strictEqual(r.seats.B, null);
  assert.strictEqual(r.result, null);
  assert.deepStrictEqual(r.watchers, {});
  assert.deepStrictEqual(r.fairPlay, { A: { screenLeaves: 0 }, B: { screenLeaves: 0 } });
  assert.strictEqual(raw.game.board, undefined, 'input not mutated');
});

test('claimSeat first come first served', () => {
  const r = M.claimSeat(baseRoom(), 'A', { name: 'Maria', clientId: 'c1' });
  assert.deepStrictEqual(r.seats.A, { name: 'Maria', clientId: 'c1', ready: false, online: true });
  assert.strictEqual(M.claimSeat(r, 'A', { name: 'Ana', clientId: 'c2' }), null);
});

test('claimSeat trims names to 40 characters', () => {
  const r = M.claimSeat(baseRoom(), 'A', { name: 'x'.repeat(60), clientId: 'c1' });
  assert.strictEqual(r.seats.A.name.length, 40);
});

test('claimSeat allows same clientId to rejoin a live room', () => {
  const live = startedRoom();
  const rackBefore = live.game.racks.A.slice();
  const offline = JSON.parse(JSON.stringify(live));
  offline.seats.A.online = false;
  const r = M.claimSeat(offline, 'A', { name: 'Maria', clientId: 'c1' });
  assert.notStrictEqual(r, null);
  assert.strictEqual(r.seats.A.online, true);
  assert.strictEqual(r.seats.A.ready, true);
  assert.deepStrictEqual(r.game.racks.A, rackBefore);
});

test('claimSeat rejected on final/void room', () => {
  const r = baseRoom();
  assert.strictEqual(M.claimSeat(Object.assign({}, r, { status: 'final' }), 'A', { name: 'M', clientId: 'c1' }), null);
  assert.strictEqual(M.claimSeat(Object.assign({}, r, { status: 'void' }), 'A', { name: 'M', clientId: 'c1' }), null);
});

test('setReady only by the seat holder while waiting', () => {
  let r = M.claimSeat(baseRoom(), 'A', { name: 'Maria', clientId: 'c1' });
  assert.strictEqual(M.setReady(r, 'A', 'c2', true), null);
  r = M.setReady(r, 'A', 'c1', true);
  assert.strictEqual(r.seats.A.ready, true);
  assert.strictEqual(M.setReady(startedRoom(), 'A', 'c1', false), null);
});

test('removePlayer frees a seat unless final/void', () => {
  const r = M.removePlayer(readyRoom(), 'A');
  assert.strictEqual(r.seats.A, null);
  assert.strictEqual(M.removePlayer(Object.assign({}, readyRoom(), { status: 'final' }), 'A'), null);
});

test('startMatch requires both ready', () => {
  let r = baseRoom();
  r = M.claimSeat(r, 'A', { name: 'Maria', clientId: 'c1' });
  r = M.claimSeat(r, 'B', { name: 'Juan', clientId: 'c2' });
  r = M.setReady(r, 'A', 'c1', true);
  assert.strictEqual(M.startMatch(r, 1000, constRng(0.7)), null);
});

test('startMatch deals 7 each, sets clocks and coin toss', () => {
  const r = startedRoom(1000, constRng(0.7));
  assert.strictEqual(r.status, 'live');
  assert.strictEqual(r.game.racks.A.length, 7);
  assert.strictEqual(r.game.racks.B.length, 7);
  assert.strictEqual(r.game.bag.length, 84);
  assert.deepStrictEqual(r.game.board, {});
  assert.deepStrictEqual(r.game.scores, { A: 0, B: 0 });
  assert.strictEqual(r.game.moveCount, 0);
  assert.strictEqual(r.clock.startedAt, 1000);
  assert.strictEqual(r.clock.endsAt, 601000);
  assert.strictEqual(r.clock.turnStartedAt, 1000);
  assert.strictEqual(r.clock.paused, null);
  assert.strictEqual(r.game.firstSeat, 'B');
  assert.strictEqual(r.game.turn, 'B');
  assert.strictEqual(M.startMatch(r, 2000, constRng(0.1)), null, 'cannot start twice');
});

test('startMatch coin toss below 0.5 picks A', () => {
  const r = startedRoom(1000, constRng(0.2));
  assert.strictEqual(r.game.firstSeat, 'A');
});

test('mutators never mutate their input', () => {
  const r = readyRoom();
  const snapshot = JSON.stringify(r);
  M.startMatch(r, 1000, constRng(0.7));
  M.removePlayer(r, 'A');
  assert.strictEqual(JSON.stringify(r), snapshot);
});
