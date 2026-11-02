const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/match.js');
const Taunt = require('../js/taunt.js');

// A live room after the VS intro (startedAt 7500), with optional taunts.
function live(taunts = {}, over = {}) {
  const ready = M.normalizeRoom({
    code: 'ABCDEF', teamA: 'ta', teamB: 'tb', teamAName: 'NCR', teamBName: 'CAR', matchLengthSec: 600, status: 'waiting',
    seats: { A: { name: 'Maria', clientId: 'ca', ready: true }, B: { name: 'Juan', clientId: 'cb', ready: true } }
  });
  const r = M.normalizeRoom(M.startMatch(ready, 1000, () => 0.2));
  Object.assign(r.taunts, taunts);
  return Object.assign(r, over);
}
const T = 20000;

test('constants: ids, labels, timings', () => {
  assert.deepStrictEqual(Taunt.IDS, ['angry', 'lol', 'cry']);
  assert.deepStrictEqual(Taunt.LABELS, { angry: 'Angry', lol: 'LOL', cry: 'Crying' });
  assert.strictEqual(Taunt.SHOW_MS, 2500);
  assert.strictEqual(Taunt.LATE_MS, 3000);
});

test('cooldownLeft: 10 s from this seat\'s last taunt, read from the room', () => {
  assert.strictEqual(Taunt.cooldownLeft(live(), 'A', T), 0);
  const r = live({ A: { e: 'lol', at: T } });
  assert.strictEqual(Taunt.cooldownLeft(r, 'A', T + 4000), 6000);
  assert.strictEqual(Taunt.cooldownLeft(r, 'A', T + 12000), 0);
  assert.strictEqual(Taunt.cooldownLeft(r, 'B', T + 1), 0, 'per seat');
});

test('canSend: the same rule as Match.taunt', () => {
  const r = live();
  assert.strictEqual(Taunt.canSend(r, 'A', T), true);
  assert.strictEqual(Taunt.canSend(live({ A: { e: 'lol', at: T } }), 'A', T + 5000), false, 'cooling down');
  assert.strictEqual(Taunt.canSend(r, 'A', r.clock.startedAt - 1), false, 'during the VS intro');
  assert.strictEqual(Taunt.canSend(r, 'watch', T), false, 'a spectator');
  assert.strictEqual(Taunt.canSend(live({}, { status: 'final' }), 'A', T), false, 'game over');
});

test('arrivals: the first render is only a baseline (a refresh or late join shows nothing)', () => {
  const r = live({ A: { e: 'lol', at: T } });
  const a = Taunt.arrivals(null, r, T + 100);
  assert.deepStrictEqual(a.show, []);
  assert.deepStrictEqual(a.seen, { A: T, B: null });
});

test('arrivals: a new taunt shows once', () => {
  const base = Taunt.arrivals(null, live(), T).seen;
  const r = live({ A: { e: 'lol', at: T + 500 } });
  const a = Taunt.arrivals(base, r, T + 700);
  assert.deepStrictEqual(a.show, [{ seat: 'A', e: 'lol', at: T + 500 }]);
  assert.deepStrictEqual(Taunt.arrivals(a.seen, r, T + 900).show, [], 'the same taunt again: nothing');
});

test('arrivals: a taunt arriving more than 3 s late is skipped, but counted as seen', () => {
  const base = Taunt.arrivals(null, live(), T).seen;
  const r = live({ B: { e: 'cry', at: T } });
  const a = Taunt.arrivals(base, r, T + 3001);
  assert.deepStrictEqual(a.show, []);
  assert.strictEqual(a.seen.B, T);
  assert.deepStrictEqual(Taunt.arrivals(base, r, T + 3000).show.length, 1, 'exactly 3 s still shows');
});

test('arrivals: both seats at once show both, A first', () => {
  const base = Taunt.arrivals(null, live(), T).seen;
  const r = live({ A: { e: 'angry', at: T + 10 }, B: { e: 'lol', at: T + 5 } });
  assert.deepStrictEqual(Taunt.arrivals(base, r, T + 50).show.map(x => x.seat), ['A', 'B']);
});

test('box: on the score bar, centred on the sender\'s side, 1.5x the bar height', () => {
  const bar = { left: 8, top: 88, width: 344, height: 44 };
  assert.deepStrictEqual(Taunt.box({ left: 10, top: 90, width: 150, height: 40 }, bar, 360), { left: 52, top: 77, size: 66 });
  const right = Taunt.box({ left: 300, top: 90, width: 120, height: 40 }, bar, 360);
  assert.ok(right.left + right.size <= 360, 'kept on screen: ' + JSON.stringify(right));
  assert.ok(Taunt.box({ left: 10, top: 90, width: 150, height: 40 }, bar, 360, 0.9).size < 66, 'a smaller scale');
  assert.strictEqual(Taunt.box({ left: 0, top: 0, width: 10, height: 10 }, { left: 0, top: 0, width: 10, height: 10 }, 360).size, 44, 'at least 44px');
});
