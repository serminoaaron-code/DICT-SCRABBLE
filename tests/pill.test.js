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
