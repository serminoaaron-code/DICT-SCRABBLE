const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/match.js');
const Pill = require('../js/pill.js');

// firstSeat A (rng 0.2), startedAt = turnStartedAt = 1000.
function started() {
  let r = M.createRoom({
    code: 'K7Q42M', teamA: 'tA', teamB: 'tB', teamAName: 'NCR', teamBName: 'Region IV-A',
    label: '', matchLengthSec: 600, now: 0
  });
  r = M.claimSeat(r, 'A', { name: 'Maria', clientId: 'c1' });
  r = M.claimSeat(r, 'B', { name: 'Juan', clientId: 'c2' });
  r = M.setReady(r, 'A', 'c1', true);
  r = M.setReady(r, 'B', 'c2', true);
  return M.startMatch(r, 1000, () => 0.2, 0);
}

test('fixture: A starts at 1000', () => {
  const r = started();
  assert.strictEqual(r.game.turn, 'A');
  assert.strictEqual(r.clock.startedAt, 1000);
  assert.strictEqual(r.clock.turnStartedAt, 1000);
});

test('your turn', () => {
  assert.deepStrictEqual(Pill.state(started(), 'A', 21000), { kind: 'you', text: 'Your turn', ms: 40000 });
});

test('their turn shows name', () => {
  const p = Pill.state(started(), 'B', 21000);
  assert.strictEqual(p.kind, 'them');
  assert.strictEqual(p.text, "Maria's turn");
  assert.strictEqual(p.ms, 40000);
});

test('spectator sees name', () => {
  const p = Pill.state(started(), 'watch', 21000);
  assert.strictEqual(p.kind, 'them');
  assert.strictEqual(p.text, "Maria's turn");
  const q = Pill.state(started(), null, 21000);
  assert.strictEqual(q.text, "Maria's turn");
});

test('last ten seconds is low for everyone', () => {
  const r = started();
  const a = Pill.state(r, 'A', 51000);
  const b = Pill.state(r, 'B', 51000);
  assert.strictEqual(a.kind, 'low');
  assert.strictEqual(b.kind, 'low');
  assert.strictEqual(a.text, '⏱ Your turn');
  assert.strictEqual(b.text, "⏱ Maria's turn");
  assert.strictEqual(a.ms, 10000);
  assert.strictEqual(Pill.state(r, 'A', 50999).kind, 'you');
});

test('turn time never goes below zero', () => {
  assert.strictEqual(Pill.state(started(), 'A', 70000).ms, 0);
});

test('get ready before startedAt', () => {
  const r = started();
  r.clock.startedAt = 5000;
  r.clock.turnStartedAt = 5000;
  assert.deepStrictEqual(Pill.state(r, 'A', 3000), { kind: 'ready', text: 'Get ready', ms: 60000 });
  assert.strictEqual(Pill.state(r, 'watch', 3000).kind, 'ready');
});

test('celebration delay shows full minute', () => {
  const r = started();
  const now = 30000;
  r.clock.turnStartedAt = now + 3000;
  const p = Pill.state(r, 'A', now);
  assert.strictEqual(p.ms, 60000);
  assert.strictEqual(p.kind, 'you');
});

test('paused', () => {
  const r = M.pauseClocks(started(), 11000);
  const p = Pill.state(r, 'A', 40000);
  assert.strictEqual(p.kind, 'paused');
  assert.strictEqual(p.text, '⏸ Paused');
  assert.strictEqual(p.ms, 50000);
});

test('appeal', () => {
  let r = started();
  r.game.racks.A = ['C', 'Q', 'Z', 'S', 'R', 'E', 'N'];
  const placements = [{ r: 7, c: 6, letter: 'C' }, { r: 7, c: 7, letter: 'Q' }, { r: 7, c: 8, letter: 'Z' }];
  r = M.requestAppeal(r, 'A', placements, {
    now: 11000, expectedMoveCount: 0, words: [{ word: 'CQZ', score: 46 }], rejectedWords: ['CQZ'], total: 46
  });
  assert.ok(r, 'appeal accepted by the fixture');
  for (const seat of ['A', 'B', 'watch']) {
    const p = Pill.state(r, seat, 20000);
    assert.strictEqual(p.kind, 'appeal');
    assert.strictEqual(p.text, '⚖️ Waiting for host');
    assert.strictEqual(p.ms, 50000);
  }
});

test('host decision', () => {
  const r = started();
  r.status = 'hostDecision';
  assert.deepStrictEqual(Pill.state(r, 'A', 21000), { kind: 'hostDecision', text: '⚖️ Waiting for host decision', ms: null });
});

test('sudden death', () => {
  const r = M.resolveTimeUp(started(), 601000);
  assert.strictEqual(r.status, 'suddenDeath');
  const mine = Pill.state(r, 'A', 611000);
  assert.strictEqual(mine.kind, 'suddenDeath');
  assert.ok(mine.text.includes('⚡ Sudden death · round 1/3'), mine.text);
  assert.strictEqual(mine.text, '⚡ Sudden death · round 1/3 · Your turn');
  assert.strictEqual(mine.ms, 50000);
  assert.strictEqual(Pill.state(r, 'B', 611000).text, "⚡ Sudden death · round 1/3 · Maria's turn");
});

test('not playing', () => {
  let r = M.createRoom({ code: 'K7Q42M', teamA: 'tA', teamB: 'tB', teamAName: 'NCR', teamBName: 'IV-A', matchLengthSec: 600, now: 0 });
  assert.strictEqual(Pill.state(r, 'A', 1000), null);
  const fin = M.resign(started(), 'A', 5000);
  assert.strictEqual(fin.status, 'final');
  assert.strictEqual(Pill.state(fin, 'A', 6000), null);
  assert.strictEqual(Pill.state(null, 'A', 6000), null);
});

test('a long opponent name is cut to 25 characters + "…" in the pill', () => {
  const r = started();
  r.seats.A.name = 'w'.repeat(40);
  assert.strictEqual(Pill.state(r, 'B', 21000).text, 'w'.repeat(25) + "…'s turn");
});
// ---- ribbon (turn moments #4) ----
test('ribbon: the seat whose turn it is gets YOUR TURN!; the key is status:turn@moveCount', () => {
  assert.deepStrictEqual(Pill.ribbon(started(), 'A'), { key: 'live:A@0', at: 1000, mine: true, text: 'YOUR TURN!', name: null, sudden: false });
});

test("ribbon: the other player sees the opponent's name; spectators and the host see the team", () => {
  assert.strictEqual(Pill.ribbon(started(), 'B').text, "MARIA'S TURN");
  assert.strictEqual(Pill.ribbon(started(), 'B').mine, false);
  assert.strictEqual(Pill.ribbon(started(), 'watch').text, "NCR'S TURN");
  assert.strictEqual(Pill.ribbon(started(), null).text, "NCR'S TURN");
});

test('ribbon: a long name is cut to 25 characters + "…"', () => {
  const r = started();
  r.seats.A.name = 'w'.repeat(40);
  assert.strictEqual(Pill.ribbon(r, 'B').text, 'W'.repeat(25) + "…'S TURN");
});

test('ribbon: nothing while paused, during an appeal or after the game', () => {
  const paused = started(); paused.clock.paused = { by: 'host', matchRemainingMs: 1000, turnRemainingMs: 1000 };
  const appeal = started(); appeal.game.pending = { seat: 'A' };
  const done = started(); done.status = 'final';
  assert.strictEqual(Pill.ribbon(paused, 'A'), null);
  assert.strictEqual(Pill.ribbon(appeal, 'A'), null);
  assert.strictEqual(Pill.ribbon(done, 'A'), null);
});

test('ribbon: sudden death is flagged', () => {
  const r = started(); r.status = 'suddenDeath';
  assert.strictEqual(Pill.ribbon(r, 'A').sudden, true);
});

test('ribbonDue: from the turn start for RIBBON_WINDOW_MS, once per key', () => {
  const info = Pill.ribbon(started(), 'A');
  assert.strictEqual(Pill.RIBBON_WINDOW_MS, 1500);
  assert.strictEqual(Pill.ribbonDue(info, null, 999), false, 'not before the turn starts');
  assert.strictEqual(Pill.ribbonDue(info, null, 1000), true, 'at the turn start');
  assert.strictEqual(Pill.ribbonDue(info, null, 1000 + 1600), false, 'too late (refresh / late join)');
  assert.strictEqual(Pill.ribbonDue(info, info.key, 1200), false, 'already shown');
  assert.strictEqual(Pill.ribbonDue(null, null, 1200), false, 'no ribbon');
});
test('ribbon: a host resume early in a turn keeps the key, so the ribbon does not play again', () => {
  const before = Pill.ribbon(started(), 'A');
  const resumed = started(); resumed.clock.turnStartedAt = 5000; // resumeInPlace: now - the 0.8 s already used
  const after = Pill.ribbon(resumed, 'A');
  assert.strictEqual(after.key, before.key);
  assert.strictEqual(Pill.ribbonDue(after, before.key, 5200), false);
});

test('ribbon: the next turn and the start of sudden death each get a new key', () => {
  const next = started(); next.game.moveCount = 1; next.game.turn = 'B';
  const sd = started(); sd.status = 'suddenDeath';
  const keys = new Set([Pill.ribbon(started(), 'A').key, Pill.ribbon(next, 'A').key, Pill.ribbon(sd, 'A').key]);
  assert.strictEqual(keys.size, 3);
});

test("ribbon: the name comes apart from \"'S TURN\", so a phone can cut the name and keep the suffix", () => {
  assert.strictEqual(Pill.ribbon(started(), 'B').name, 'MARIA');
  assert.strictEqual(Pill.ribbon(started(), 'watch').name, 'NCR');
  assert.strictEqual(Pill.ribbon(started(), 'A').name, null);
});
