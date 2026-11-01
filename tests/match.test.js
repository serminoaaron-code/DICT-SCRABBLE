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

// ---------- Task 4 ----------

const P = (r, c, letter) => ({ r, c, letter });
const CAT = [P(7, 6, 'C'), P(7, 7, 'A'), P(7, 8, 'T')];
const RACK_CAT = ['C', 'A', 'T', 'S', 'R', 'N', 'O'];

// Live room, firstSeat A (rng 0.2), started at 1000, endsAt 601000.
function liveRoom(over = {}) {
  const r = startedRoom(1000, constRng(0.2));
  Object.assign(r.game, over.game || {});
  if (over.status) r.status = over.status;
  if (over.clock) Object.assign(r.clock, over.clock);
  return r;
}

test('prepareMove rejects letters not in rack (multiset)', () => {
  const r = liveRoom({ game: { racks: { A: ['E', 'A', 'T', 'S', 'R', 'N', 'O'], B: [] } } });
  const m = M.prepareMove(r, 'A', [P(7, 6, 'E'), P(7, 7, 'E')]);
  assert.strictEqual(m.ok, false);
  assert.strictEqual(m.error, 'NOT_IN_RACK');
});

test('prepareMove rejects wrong turn and pending', () => {
  const r = liveRoom({ game: { racks: { A: RACK_CAT, B: RACK_CAT } } });
  assert.strictEqual(M.prepareMove(r, 'B', CAT).error, 'NOT_YOUR_TURN');
  const pending = liveRoom({ game: { racks: { A: RACK_CAT, B: RACK_CAT }, pending: { seat: 'A' } } });
  assert.strictEqual(M.prepareMove(pending, 'A', CAT).error, 'PENDING');
});

test('applyPlay applies score, refills rack, switches turn', () => {
  const r = liveRoom({ game: { racks: { A: RACK_CAT.slice(), B: RACK_CAT.slice() } } });
  const bagBefore = r.game.bag.length;
  const n = M.applyPlay(r, 'A', CAT, { now: 5000, expectedMoveCount: 0 });
  assert.notStrictEqual(n, null);
  assert.strictEqual(n.game.scores.A, 10);
  assert.strictEqual(n.game.racks.A.length, 7);
  assert.strictEqual(n.game.bag.length, bagBefore - 3);
  assert.strictEqual(n.game.turn, 'B');
  assert.strictEqual(n.game.moveCount, 1);
  assert.strictEqual(n.clock.turnStartedAt, 5000);
  assert.deepStrictEqual(n.game.board, { '7_6': 'C', '7_7': 'A', '7_8': 'T' });
  assert.deepStrictEqual(n.game.lastMove, { seat: 'A', type: 'play', words: [{ word: 'CAT', score: 10 }], total: 10, unverified: false, at: 5000 });
});

test('applyPlay rejected on wrong turn, stale moveCount, after endsAt, while paused, while pending', () => {
  const racks = { A: RACK_CAT, B: RACK_CAT };
  const r = liveRoom({ game: { racks } });
  assert.strictEqual(M.applyPlay(r, 'B', CAT, { now: 5000, expectedMoveCount: 0 }), null, 'wrong turn');
  assert.strictEqual(M.applyPlay(r, 'A', CAT, { now: 5000, expectedMoveCount: 3 }), null, 'stale moveCount');
  assert.strictEqual(M.applyPlay(r, 'A', CAT, { now: 601000, expectedMoveCount: 0 }), null, 'after endsAt');
  const paused = liveRoom({ game: { racks }, clock: { paused: { by: 'host', matchRemainingMs: 1, turnRemainingMs: 1 } } });
  assert.strictEqual(M.applyPlay(paused, 'A', CAT, { now: 5000, expectedMoveCount: 0 }), null, 'paused');
  const pending = liveRoom({ game: { racks, pending: { seat: 'A' } } });
  assert.strictEqual(M.applyPlay(pending, 'A', CAT, { now: 5000, expectedMoveCount: 0 }), null, 'pending');
  const final = liveRoom({ game: { racks }, status: 'final' });
  assert.strictEqual(M.applyPlay(final, 'A', CAT, { now: 5000, expectedMoveCount: 0 }), null, 'final');
});

test('applyPass records a pass and switches turn', () => {
  const n = M.applyPass(liveRoom(), 'A', { now: 2000, expectedMoveCount: 0 });
  assert.strictEqual(n.game.lastMove.type, 'pass');
  assert.strictEqual(n.game.turn, 'B');
  assert.strictEqual(n.game.moveCount, 1);
});

test('applyPass timeout requires 60s and matching turnStartedAt', () => {
  const r = liveRoom();
  const opts = now => ({ now, expectedMoveCount: 0, timeout: true, expectedTurnStartedAt: 1000 });
  assert.strictEqual(M.applyPass(r, 'A', opts(1000 + 59999)), null);
  const n = M.applyPass(r, 'A', opts(1000 + 60000));
  assert.strictEqual(n.game.lastMove.type, 'timeout');
  assert.strictEqual(n.game.turn, 'B');
  assert.strictEqual(M.applyPass(n, 'A', opts(1000 + 60000)), null, 'second identical timeout rejected');
});

test('resolveTimeUp picks the higher score', () => {
  const r = liveRoom({ game: { scores: { A: 20, B: 15 } } });
  const n = M.resolveTimeUp(r, 601000);
  assert.strictEqual(n.status, 'final');
  assert.deepStrictEqual(n.result, { winner: 'A', teamId: 'tA', scoreA: 20, scoreB: 15, reason: 'time', decidedAt: 601000 });
});

test('resolveTimeUp on a final room returns null', () => {
  const n = M.resolveTimeUp(liveRoom({ game: { scores: { A: 20, B: 15 } } }), 601000);
  assert.strictEqual(M.resolveTimeUp(n, 602000), null);
});

test('resolveTimeUp before endsAt or while paused returns null', () => {
  assert.strictEqual(M.resolveTimeUp(liveRoom(), 600999), null);
  const paused = liveRoom({ clock: { paused: { by: 'host', matchRemainingMs: 5, turnRemainingMs: 5 } } });
  assert.strictEqual(M.resolveTimeUp(paused, 700000), null);
});

test('tie at time-up enters sudden death with firstSeat to move', () => {
  const r = liveRoom({ game: { scores: { A: 10, B: 10 }, firstSeat: 'B', turn: 'A', moveCount: 4 } });
  const n = M.resolveTimeUp(r, 601000);
  assert.strictEqual(n.status, 'suddenDeath');
  assert.strictEqual(n.game.turn, 'B');
  assert.deepStrictEqual(n.game.suddenDeath, { startMove: 4, rounds: 0 });
  assert.strictEqual(n.clock.turnStartedAt, 601000);
  assert.strictEqual(n.result, null);
});

function suddenDeathRoom() {
  const r = liveRoom({ game: { scores: { A: 10, B: 10 }, firstSeat: 'B', racks: { A: RACK_CAT, B: RACK_CAT } } });
  return M.resolveTimeUp(r, 601000);
}

test('sudden death ends when a full round leaves a leader', () => {
  let r = suddenDeathRoom();
  r = M.applyPlay(r, 'B', CAT, { now: 602000, expectedMoveCount: 0 });
  assert.strictEqual(r.status, 'suddenDeath', 'no result mid-round');
  r = M.applyPass(r, 'A', { now: 603000, expectedMoveCount: 1 });
  assert.strictEqual(r.status, 'final');
  assert.strictEqual(r.result.winner, 'B');
  assert.strictEqual(r.result.reason, 'suddenDeath');
  assert.strictEqual(r.result.teamId, 'tB');
});

test('sudden death goes to hostDecision after 3 tied rounds', () => {
  let r = suddenDeathRoom();
  const order = ['B', 'A', 'B', 'A', 'B', 'A'];
  order.forEach((seat, i) => {
    r = M.applyPass(r, seat, { now: 602000 + i, expectedMoveCount: i });
    if (i < 5) assert.strictEqual(r.status, 'suddenDeath');
  });
  assert.strictEqual(r.status, 'hostDecision');
  assert.strictEqual(r.game.suddenDeath.rounds, 3);
  assert.strictEqual(r.result, null);
});

test('bag-out ends the game', () => {
  const r = liveRoom({ game: { bag: [], board: { '7_6': 'C' }, racks: { A: ['A', 'T'], B: ['Q'] }, scores: { A: 0, B: 5 } } });
  const n = M.applyPlay(r, 'A', [P(7, 7, 'A'), P(7, 8, 'T')], { now: 5000, expectedMoveCount: 0 });
  assert.strictEqual(n.game.scores.A, 10);
  assert.strictEqual(n.status, 'final');
  assert.strictEqual(n.result.reason, 'bagOut');
  assert.strictEqual(n.result.winner, 'A');
});

test('bag-out with a tie enters sudden death', () => {
  const r = liveRoom({ game: { bag: [], board: { '7_6': 'C' }, racks: { A: ['A', 'T'], B: ['Q'] }, scores: { A: 0, B: 10 } } });
  const n = M.applyPlay(r, 'A', [P(7, 7, 'A'), P(7, 8, 'T')], { now: 5000, expectedMoveCount: 0 });
  assert.strictEqual(n.status, 'suddenDeath');
  assert.strictEqual(n.game.turn, n.game.firstSeat);
});

// ---------- Task 5 ----------

const appealOpts = (now, expectedMoveCount = 0) => ({
  now, expectedMoveCount, words: [{ word: 'CAT', score: 10 }], rejectedWords: ['CAT'], total: 10
});

test('appeal pauses clocks and blocks other moves', () => {
  const r = liveRoom({ game: { racks: { A: RACK_CAT, B: RACK_CAT } } });
  const n = M.requestAppeal(r, 'A', CAT, appealOpts(21000));
  assert.strictEqual(M.roomPhase(n), 'appeal');
  assert.deepStrictEqual(n.clock.paused, { by: 'appeal', matchRemainingMs: 580000, turnRemainingMs: 40000 });
  assert.deepStrictEqual(n.game.pending, {
    seat: 'A', placements: CAT, words: [{ word: 'CAT', score: 10 }], rejectedWords: ['CAT'], total: 10, requestedAt: 21000
  });
  assert.strictEqual(M.applyPass(n, 'A', { now: 22000, expectedMoveCount: 0 }), null);
  assert.strictEqual(M.resolveTimeUp(n, 700000), null);
  assert.strictEqual(M.requestAppeal(n, 'A', CAT, appealOpts(22000)), null, 'only one pending');
});

test('approve applies the pending move after resuming', () => {
  const r = liveRoom({ game: { racks: { A: RACK_CAT, B: RACK_CAT } }, clock: { endsAt: 400000, turnStartedAt: 100000 } });
  const asked = M.requestAppeal(r, 'A', CAT, appealOpts(100000));
  const n = M.resolveAppeal(asked, true, { now: 160000 });
  assert.strictEqual(n.game.scores.A, 10);
  assert.strictEqual(n.game.turn, 'B');
  assert.strictEqual(n.clock.endsAt, 460000);
  assert.strictEqual(n.clock.paused, null);
  assert.strictEqual(n.game.pending, null);
  assert.strictEqual(n.game.lastMove.type, 'play');
});

test('deny returns turn with remaining turn time', () => {
  const r = liveRoom({ game: { racks: { A: RACK_CAT, B: RACK_CAT } } });
  const asked = M.requestAppeal(r, 'A', CAT, appealOpts(21000));
  const n = M.resolveAppeal(asked, false, { now: 51000 });
  assert.strictEqual(n.game.turn, 'A');
  assert.strictEqual(51000 - n.clock.turnStartedAt, 20000);
  assert.strictEqual(n.game.pending, null);
  assert.strictEqual(n.clock.paused, null);
  assert.strictEqual(n.game.scores.A, 0);
  assert.strictEqual(n.game.moveCount, 0);
  assert.strictEqual(M.resolveAppeal(n, true, { now: 52000 }), null, 'nothing pending');
});

test('host pause and resume shift endsAt', () => {
  const p = M.pauseClocks(liveRoom(), 11000);
  assert.strictEqual(M.roomPhase(p), 'paused');
  assert.strictEqual(M.pauseClocks(p, 12000), null, 'already paused');
  const n = M.resumeClocks(p, 101000);
  assert.strictEqual(n.clock.endsAt, 691000);
  assert.strictEqual(n.clock.turnStartedAt, 91000);
  assert.strictEqual(n.clock.paused, null);
  assert.strictEqual(M.roomPhase(n), 'live');
  assert.strictEqual(M.resumeClocks(n, 102000), null, 'not paused');
});

test('walkover only from waiting', () => {
  const w = M.walkover(baseRoom(), 'A', 5000);
  assert.strictEqual(w.status, 'final');
  assert.deepStrictEqual(w.result, { winner: 'A', teamId: 'tA', scoreA: 0, scoreB: 0, reason: 'walkover', decidedAt: 5000 });
  assert.strictEqual(M.walkover(liveRoom(), 'A', 5000), null);
});

test('resign gives the other seat the win', () => {
  const n = M.resign(liveRoom(), 'A', 5000);
  assert.strictEqual(n.result.winner, 'B');
  assert.strictEqual(n.result.reason, 'resign');
  assert.strictEqual(M.resign(baseRoom(), 'A', 5000), null);
});

test('awardWin works from live, paused and hostDecision', () => {
  assert.strictEqual(M.awardWin(liveRoom(), 'B', 5000).result.reason, 'awarded');
  assert.strictEqual(M.awardWin(M.pauseClocks(liveRoom(), 5000), 'A', 6000).result.winner, 'A');
  assert.strictEqual(M.awardWin(liveRoom({ status: 'hostDecision' }), 'A', 6000).status, 'final');
  assert.strictEqual(M.awardWin(baseRoom(), 'A', 6000), null);
});

function finalRoom(code, teamA, teamB, winner) {
  const r = M.createRoom({ code, teamA, teamB, teamAName: teamA + '-name', teamBName: teamB + '-name', label: '', matchLengthSec: 600, now: 1 });
  return M.walkover(r, winner, 2);
}

test('void excludes the room from standings', () => {
  const teams = { tA: { name: 'NCR' }, tB: { name: 'CAR' } };
  const fin = finalRoom('AAAAAA', 'tA', 'tB', 'A');
  const voided = M.voidRoom(fin, 3);
  assert.strictEqual(voided.status, 'void');
  assert.strictEqual(voided.voidedAt, 3);
  assert.notStrictEqual(voided.result, null, 'result kept for the record');
  const s = M.computeStandings(teams, { AAAAAA: voided });
  assert.ok(s.every(t => t.wins === 0 && t.losses === 0));
  assert.strictEqual(M.voidRoom(voided, 4), null);
});

test('computeStandings counts wins, losses and shared ranks', () => {
  const teams = { T1: { name: 'NCR' }, T2: { name: 'CAR' }, T3: { name: 'Region VII' }, T4: { name: 'BARMM' }, T5: { name: 'Zeta' } };
  const rooms = {
    R1: finalRoom('R1', 'T1', 'T2', 'A'),
    R2: finalRoom('R2', 'T3', 'T4', 'A'),
    R3: finalRoom('R3', 'T1', 'T3', 'A'),
    R4: M.voidRoom(finalRoom('R4', 'T2', 'T4', 'A'), 3),
    R5: M.createRoom({ code: 'R5', teamA: 'T2', teamB: 'T5', matchLengthSec: 600, now: 1 })
  };
  const s = M.computeStandings(teams, rooms);
  assert.deepStrictEqual(s.map(t => [t.teamId, t.wins, t.losses, t.points, t.rank]), [
    ['T1', 2, 0, 2, 1],
    ['T3', 1, 1, 1, 2],
    ['T4', 0, 1, 0, 3],
    ['T2', 0, 1, 0, 3],
    ['T5', 0, 0, 0, 3]
  ]);
  assert.strictEqual(s[0].name, 'NCR');
});

test('computeStandings keeps a deleted team by its snapshot name', () => {
  const s = M.computeStandings({ T1: { name: 'NCR' } }, { R1: finalRoom('R1', 'T1', 'gone', 'B') });
  const gone = s.find(t => t.teamId === 'gone');
  assert.strictEqual(gone.name, 'gone-name');
  assert.strictEqual(gone.wins, 1);
});

test('correctResult flips the winner', () => {
  const n = M.correctResult(finalRoom('R1', 'tA', 'tB', 'A'), 9);
  assert.strictEqual(n.result.winner, 'B');
  assert.strictEqual(n.result.teamId, 'tB');
  assert.strictEqual(n.result.reason, 'corrected');
  assert.strictEqual(n.result.decidedAt, 9);
  assert.strictEqual(M.correctResult(liveRoom(), 9), null);
});

test('recordScreenLeave increments only during live play', () => {
  const n = M.recordScreenLeave(liveRoom(), 'A');
  assert.strictEqual(n.fairPlay.A.screenLeaves, 1);
  assert.strictEqual(M.recordScreenLeave(n, 'A').fairPlay.A.screenLeaves, 2);
  assert.strictEqual(M.recordScreenLeave(baseRoom(), 'A'), null);
});

test('roomPhase reports status otherwise', () => {
  assert.strictEqual(M.roomPhase(baseRoom()), 'waiting');
  assert.strictEqual(M.roomPhase(liveRoom()), 'live');
  assert.strictEqual(M.roomPhase(finalRoom('R1', 'tA', 'tB', 'A')), 'final');
});
