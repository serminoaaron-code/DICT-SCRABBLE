const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/match.js');
const Celebrate = require('../js/celebrate.js');

// firstSeat A (rng 0.2), startedAt = turnStartedAt = 1000. Maria (NCR) holds C, A, T.
function started() {
  let r = M.createRoom({
    code: 'K7Q42M', teamA: 'tA', teamB: 'tB', teamAName: 'NCR', teamBName: 'Region IV-A',
    label: '', matchLengthSec: 600, now: 0
  });
  r = M.claimSeat(r, 'A', { name: 'Maria', clientId: 'c1' });
  r = M.claimSeat(r, 'B', { name: 'Juan', clientId: 'c2' });
  r = M.setReady(r, 'A', 'c1', true);
  r = M.setReady(r, 'B', 'c2', true);
  r = M.startMatch(r, 1000, () => 0.2, 0);
  r.game.racks.A = ['C', 'A', 'T', 'E', 'E', 'E', 'E'];
  return r;
}

// CAT across the centre star: (3 + 1 + 1) x 2 = 10 points.
function roomAfterCAT() {
  const placements = [{ r: 7, c: 7, letter: 'C' }, { r: 7, c: 8, letter: 'A' }, { r: 7, c: 9, letter: 'T' }];
  const r = M.applyPlay(started(), 'A', placements, { now: 2000, expectedMoveCount: 0 });
  assert.ok(r, 'fixture play accepted');
  return r;
}

test('TITLES are the fixed copy', () => {
  assert.deepStrictEqual(Celebrate.TITLES, ['', 'Not Bad!', 'Cool!', 'Awesome!', 'IMPOSSIBLE!!!']);
});

test('tierFor delegates to the engine', () => {
  assert.strictEqual(Celebrate.tierFor({ total: 7, bingo: false }), 0);
  assert.strictEqual(Celebrate.tierFor({ total: 8, bingo: false }), 1);
  assert.strictEqual(Celebrate.tierFor({ total: 15, bingo: false }), 2);
  assert.strictEqual(Celebrate.tierFor({ total: 25, bingo: false }), 3);
  assert.strictEqual(Celebrate.tierFor({ total: 40, bingo: false }), 4);
  assert.strictEqual(Celebrate.tierFor({ total: 5, bingo: true }), 4);
  assert.strictEqual(Celebrate.tierFor({ total: 39 }), 3); // older rooms lack bingo
});

test('detect ignores the first snapshot', () => {
  assert.strictEqual(Celebrate.detect(null, roomAfterCAT()), null);
});

test('detect returns the move when moveCount increases', () => {
  const c = Celebrate.detect(0, roomAfterCAT());
  assert.ok(c);
  assert.strictEqual(c.tier, 1); // CAT 10 = Not Bad! (tiers 8/15/25/40)
  assert.strictEqual(c.total, 10);
  assert.strictEqual(c.seat, 'A');
  assert.strictEqual(c.playerName, 'Maria');
  assert.strictEqual(c.teamName, 'NCR');
  assert.strictEqual(c.bingo, false);
  assert.strictEqual(c.moveCount, 1);
  assert.strictEqual(c.words[0].word, 'CAT');
});

test('detect ignores passes and timeouts', () => {
  const passed = M.applyPass(started(), 'A', { now: 2000, expectedMoveCount: 0 });
  assert.strictEqual(passed.game.lastMove.type, 'pass');
  assert.strictEqual(Celebrate.detect(0, passed), null);
  const timedOut = M.applyPass(started(), 'A', { now: 61000, expectedMoveCount: 0, timeout: true, expectedTurnStartedAt: 1000 });
  assert.strictEqual(timedOut.game.lastMove.type, 'timeout');
  assert.strictEqual(Celebrate.detect(0, timedOut), null);
});

test('detect ignores an unchanged moveCount', () => {
  assert.strictEqual(Celebrate.detect(1, roomAfterCAT()), null);
});

test('detect treats a missing bingo flag as false', () => {
  const r = roomAfterCAT();
  delete r.game.lastMove.bingo;
  r.game.lastMove.total = 62;
  const c = Celebrate.detect(0, r);
  assert.strictEqual(c.bingo, false);
  assert.strictEqual(c.tier, 4);
});

test('detect ignores rooms without a game or last move', () => {
  assert.strictEqual(Celebrate.detect(0, null), null);
  assert.strictEqual(Celebrate.detect(0, started()), null);
});

test('queue plays moves in order', () => {
  const q = Celebrate.createQueue();
  const first = Celebrate.detect(0, roomAfterCAT());
  const r2 = roomAfterCAT();
  r2.game.moveCount = 2;
  r2.game.lastMove = { seat: 'B', type: 'play', words: [{ word: 'ZEBRAS', score: 46 }], total: 46, bingo: false, unverified: false, at: 3000 };
  const second = Celebrate.detect(1, r2);
  assert.strictEqual(second.tier, 4); // 46 = IMPOSSIBLE!!! (tiers 8/15/25/40)
  assert.strictEqual(second.playerName, 'Juan');
  q.push(first);
  q.push(second);
  assert.strictEqual(q.size(), 2);
  assert.strictEqual(q.shift().total, 10);
  assert.strictEqual(q.shift().total, 46);
  assert.strictEqual(q.shift(), undefined);
  assert.strictEqual(q.size(), 0);
});

test('durationFor: every overlay tier is fully gone by Match.CELEBRATE_MS[tier] (never costs turn time)', () => {
  for (const tier of [1, 2, 3, 4]) {
    const d = Celebrate.durationFor(tier);
    assert.ok(Number.isFinite(d) && d > 0, `tier ${tier}: a positive duration (${d})`);
    assert.ok(d <= M.CELEBRATE_MS[tier], `tier ${tier}: ${d} ms <= CELEBRATE_MS ${M.CELEBRATE_MS[tier]} ms`);
  }
  // Tier 0 is the small "+N" float: no overlay; the next turn waits for it (CELEBRATE_MS[0] = 1000).
  assert.ok(Celebrate.durationFor(0) <= M.CELEBRATE_MS[0], 'tier 0 float ends by CELEBRATE_MS[0]');
});

test('turn moments: the word drop (DROP_MS 700) and the tier-0 float (1000) are part of the turn delay', () => {
  assert.strictEqual(M.DROP_MS, 700);
  assert.strictEqual(M.CELEBRATE_MS[0], 1000);
});

test('detect cuts long player and team names to 25 characters + "…" (the BY line, the projector corner)', () => {
  const r = roomAfterCAT();
  r.seats.A.name = 'w'.repeat(40);
  r.teamAName = 'TEST-' + 'w'.repeat(35);
  const c = Celebrate.detect(0, r);
  assert.strictEqual(c.playerName, 'w'.repeat(25) + '…');
  assert.strictEqual(c.teamName, 'TEST-' + 'w'.repeat(20) + '…');
});
// ---- turn moments: which tiles drop, and when ----
test('newCells: the squares a play filled (lastMove.cells), in reading order; [] for a pass', () => {
  assert.deepStrictEqual(Celebrate.newCells({ type: 'play', cells: [{ r: 7, c: 8 }, { r: 7, c: 6 }, { r: 6, c: 9 }] }),
    [{ r: 6, c: 9 }, { r: 7, c: 6 }, { r: 7, c: 8 }]);
  assert.deepStrictEqual(Celebrate.newCells({ type: 'pass', words: [], cells: [] }), []);
  assert.deepStrictEqual(Celebrate.newCells(null), []);
});

test('newCells: older moves without cells fall back to the isNew cells of their words (unique)', () => {
  const lm = { type: 'play', words: [
    { word: 'CAT', cells: [{ r: 7, c: 6, isNew: true }, { r: 7, c: 7, isNew: false }, { r: 7, c: 8, isNew: true }] },
    { word: 'TO', cells: [{ r: 7, c: 8, isNew: true }, { r: 8, c: 8, isNew: false }] }] };
  assert.deepStrictEqual(Celebrate.newCells(lm), [{ r: 7, c: 6 }, { r: 7, c: 8 }]);
});

test('stagger: start delays that fit the total time, at most 120 ms apart', () => {
  assert.deepStrictEqual(Celebrate.stagger(1, 700, 450), [0]);
  assert.deepStrictEqual(Celebrate.stagger(3, 700, 450), [0, 120, 240]);
  const seven = Celebrate.stagger(7, 700, 450);
  assert.strictEqual(seven.length, 7);
  assert.ok(seven[6] + 450 <= 700, 'the last tile lands by the total time: ' + seven[6]);
  assert.deepStrictEqual(Celebrate.stagger(0, 700, 450), []);
});
test('detect keeps alt (a vertical word that reads both ways)', () => {
  const r = roomAfterCAT();
  r.game.lastMove.words = [{ word: 'STOP', score: 6, alt: 'POTS' }];
  assert.deepStrictEqual(Celebrate.detect(0, r).words[0], { word: 'STOP', score: 6, alt: 'POTS' });
  assert.deepStrictEqual(Celebrate.detect(0, roomAfterCAT()).words[0], { word: 'CAT', score: 10 });
});

test('detect names the team of seat C', () => {
  const r = roomAfterCAT();
  Object.assign(r, { players: 3, teamC: 'tC', teamCName: 'IV-A' });
  r.game.lastMove.seat = 'C';
  r.seats.C = { name: 'Ana' };
  const c = Celebrate.detect(0, r);
  assert.strictEqual(c.teamName, 'IV-A');
  assert.strictEqual(c.playerName, 'Ana');
});
