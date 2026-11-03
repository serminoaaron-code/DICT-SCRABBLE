const test = require('node:test');
const assert = require('node:assert');
const Scenes = require('../js/scenes.js');

test('introRemaining before, during, after', () => {
  const room = { clock: { startedAt: 6000 } };
  assert.strictEqual(Scenes.introRemaining(room, 1000), 5000);
  assert.strictEqual(Scenes.introRemaining(room, 4000), 2000);
  assert.strictEqual(Scenes.introRemaining(room, 7000), 0);
});

test('the coin result ("<TEAM> GOES FIRST!") stays on screen at least 2 s before the clocks start', () => {
  const Match = require('../js/match.js');
  assert.strictEqual(typeof Scenes.COIN_RESULT_AT, 'number', 'Scenes.COIN_RESULT_AT: when the result pops, ms into the intro');
  const shown = Match.INTRO_MS - Scenes.COIN_RESULT_AT;
  assert.ok(shown >= 2000, `result shows ${shown} ms (INTRO_MS ${Match.INTRO_MS} - pop at ${Scenes.COIN_RESULT_AT})`);
});

// ---- result scenes (Task 10) ----
const finalRoom = (winner = 'A', extra = {}) => Object.assign({
  status: 'final', teamAName: 'NCR', teamBName: 'IV-A',
  seats: { A: { name: 'Maria' }, B: { name: 'Juan' } },
  result: { winner, scoreA: 312, scoreB: 287, reason: 'time', decidedAt: 1000 },
  game: { bestMove: null }
}, extra);

test('resultViewer: the winning seat sees the winner scene', () => {
  assert.strictEqual(Scenes.resultViewer(finalRoom('A'), 'A'), 'winner');
  assert.strictEqual(Scenes.resultViewer(finalRoom('B'), 'B'), 'winner');
});

test('resultViewer: the other seat sees the respectful scene', () => {
  assert.strictEqual(Scenes.resultViewer(finalRoom('A'), 'B'), 'other');
  assert.strictEqual(Scenes.resultViewer(finalRoom('B'), 'A'), 'other');
});

test('resultViewer: spectators, the host and unknown viewers are neutral', () => {
  assert.strictEqual(Scenes.resultViewer(finalRoom('A'), 'watch'), 'neutral');
  assert.strictEqual(Scenes.resultViewer(finalRoom('A'), null), 'neutral');
  assert.strictEqual(Scenes.resultViewer(finalRoom('A'), undefined), 'neutral');
});

test('resultViewer: a void room or a room without a result is neutral for everyone', () => {
  assert.strictEqual(Scenes.resultViewer(finalRoom('A', { status: 'void' }), 'A'), 'neutral');
  assert.strictEqual(Scenes.resultViewer(finalRoom('A', { result: null }), 'A'), 'neutral');
  assert.strictEqual(Scenes.resultViewer(null, 'A'), 'neutral');
});

test('resultReason keeps the existing copy, with "<player> left the game" for a resign', () => {
  assert.strictEqual(Scenes.resultReason(finalRoom('A')), "Time's up");
  assert.strictEqual(Scenes.resultReason(finalRoom('A', { result: { winner: 'A', reason: 'bagOut' } })), 'Tiles ran out');
  assert.strictEqual(Scenes.resultReason(finalRoom('A', { result: { winner: 'A', reason: 'suddenDeath' } })), 'Won in sudden death');
  assert.strictEqual(Scenes.resultReason(finalRoom('A', { result: { winner: 'A', reason: 'awarded' } })), 'Awarded by the host');
  assert.strictEqual(Scenes.resultReason(finalRoom('A', { result: { winner: 'A', reason: 'walkover' } })), 'Walkover');
  assert.strictEqual(Scenes.resultReason(finalRoom('B', { result: { winner: 'B', reason: 'resign' } })), 'Maria left the game');
  assert.strictEqual(Scenes.resultReason(finalRoom('A', { result: { winner: 'A', reason: 'corrected', note: 'Typo' } })), 'Result corrected by the host: Typo');
});

test('bestWordText: word, points and tier title; no parenthesis for tier 0; empty without bestMove', () => {
  const g = bm => ({ game: { bestMove: bm } });
  assert.strictEqual(Scenes.bestWordText(finalRoom('A', g({ seat: 'A', words: [{ word: 'QUIZZED', score: 74 }], total: 74, bingo: false }))),
    '⭐ Best word: QUIZZED · 74 pts (IMPOSSIBLE!!!)');
  assert.strictEqual(Scenes.bestWordText(finalRoom('A', g({ seat: 'A', words: [{ word: 'QUIZ', score: 30 }], total: 30, bingo: false }))),
    '⭐ Best word: QUIZ · 30 pts (Awesome!)');
  assert.strictEqual(Scenes.bestWordText(finalRoom('A', g({ seat: 'B', words: [{ word: 'CAT', score: 5 }], total: 5, bingo: false }))),
    '⭐ Best word: CAT · 5 pts');
  assert.strictEqual(Scenes.bestWordText(finalRoom('A', g(null))), '');
  assert.strictEqual(Scenes.bestWordText(finalRoom('A', { game: {} })), '');
  assert.strictEqual(Scenes.bestWordText(finalRoom('A', { game: null })), '');
});

test('resultFresh: the scene animates only for a recently decided result', () => {
  const r = finalRoom('A');
  assert.strictEqual(Scenes.resultFresh(r, 1000 + 5000), true);
  assert.strictEqual(Scenes.resultFresh(r, 1000 + Scenes.RESULT_FRESH_MS + 1), false);
  assert.strictEqual(Scenes.resultFresh(finalRoom('A', { result: null }), 2000), false);
});

test('endingCelebration: the play that ended the game (bag out / sudden death) still gets its celebration', () => {
  const play = (total, bingo = false) => ({ seat: 'A', type: 'play', words: [{ word: 'QUIZ', score: total }], total, bingo });
  const ended = (reason, lastMove, moveCount = 12) => finalRoom('A', {
    result: { winner: 'A', scoreA: 300, scoreB: 200, reason, decidedAt: 1000 },
    game: { moveCount, lastMove, bestMove: null }
  });
  const c = Scenes.endingCelebration(11, ended('bagOut', play(30)));
  assert.ok(c && c.tier === 3 && c.total === 30 && c.seat === 'A');
  assert.strictEqual(Scenes.endingCelebration(11, ended('suddenDeath', play(10))).tier, 1);
  // tier 0, not a play, another reason, a page load (no baseline) or an already-seen move: nothing
  assert.strictEqual(Scenes.endingCelebration(11, ended('bagOut', play(7))), null);
  assert.strictEqual(Scenes.endingCelebration(11, ended('suddenDeath', { seat: 'B', type: 'pass', words: [], total: 0 })), null);
  assert.strictEqual(Scenes.endingCelebration(11, ended('time', play(44))), null);
  assert.strictEqual(Scenes.endingCelebration(null, ended('bagOut', play(44))), null);
  assert.strictEqual(Scenes.endingCelebration(12, ended('bagOut', play(44))), null);
  assert.strictEqual(Scenes.endingCelebration(11, Object.assign(ended('bagOut', play(44)), { status: 'void' })), null);
});

test('resultReason cuts a long player name to 25 characters + "…"', () => {
  const room = finalRoom('A', { result: { winner: 'A', reason: 'resign', scoreA: 1, scoreB: 0, decidedAt: 1 }, seats: { A: { name: 'Maria' }, B: { name: 'M'.repeat(40) } } });
  assert.strictEqual(Scenes.resultReason(room), 'M'.repeat(25) + '… left the game');
});
test('bestWord / bestWordText show the dictionary spelling, both readings as STOP/POTS', () => {
  const g = bm => ({ game: { bestMove: bm } });
  const both = finalRoom('A', g({ seat: 'A', words: [{ word: 'STOP', score: 30, alt: 'POTS' }], total: 30, bingo: false }));
  assert.strictEqual(Scenes.bestWord(both).word, 'STOP/POTS');
  assert.strictEqual(Scenes.bestWordText(both), '⭐ Best word: STOP/POTS · 30 pts (Awesome!)');
  const up = finalRoom('A', g({ seat: 'A', words: [{ word: 'VERIFY', score: 30 }], total: 30, bingo: false }));
  assert.strictEqual(Scenes.bestWord(up).word, 'VERIFY');
});

// ---- 3-4 player rooms (2026-11-03) ----
const M4 = require('../js/match.js');
const room4final = (winner, extra = {}) => Object.assign({
  status: 'final', players: 4, teamAName: 'NCR', teamBName: 'CAR', teamCName: 'IV-A', teamDName: 'BARMM',
  seats: { A: { name: 'Maria' }, B: { name: 'Juan' }, C: { name: 'Ana' }, D: { name: 'Ali' } },
  result: { winner, scoreA: 1, scoreB: 2, scoreC: 3, scoreD: 4, reason: 'time', decidedAt: 1000 },
  game: { bestMove: null }
}, extra);

test('wheelTurns lands every seat under the pointer', () => {
  for (const seats of [['A', 'B', 'C'], ['A', 'B', 'C', 'D']]) {
    const n = seats.length;
    seats.forEach((s, i) => {
      const t = Scenes.wheelTurns(seats, s);
      assert.ok(t >= 5 * 360, `${n}/${s}: at least 5 spins (${t})`);
      const top = ((t + (i + 0.5) * 360 / n) % 360 + 360) % 360;
      assert.ok(Math.abs(top) < 1e-9 || Math.abs(top - 360) < 1e-9, `${n}/${s}: slice centre under the pointer (${top})`);
    });
  }
});

test('the wheel result stays at least 2 s before the clocks start', () => {
  assert.strictEqual(Scenes.WHEEL_RESULT_AT, 6000);
  assert.strictEqual(Scenes.MULTI_TEAMS_MS + Scenes.WHEEL_SPIN_MS, Scenes.WHEEL_RESULT_AT);
  assert.ok(M4.INTRO_MULTI_MS - Scenes.WHEEL_RESULT_AT >= 2000);
});

test('resultViewer: 4-player room', () => {
  const r = room4final('C');
  assert.strictEqual(Scenes.resultViewer(r, 'C'), 'winner');
  assert.strictEqual(Scenes.resultViewer(r, 'A'), 'other');
  assert.strictEqual(Scenes.resultViewer(r, 'D'), 'other');
  assert.strictEqual(Scenes.resultViewer(r, 'watch'), 'neutral');
  assert.strictEqual(Scenes.resultViewer(finalRoom('A'), 'C'), 'neutral', '2-player room: no seat C');
});

test('resultReason: 4-player resign', () => {
  assert.strictEqual(Scenes.resultReason(room4final('B', { result: { winner: 'B', reason: 'resign' } })), 'Everyone else left the game');
});

test('resultReason: 3-4 player resign names the leaver unless everyone else left', () => {
  const base = { winner: 'A', reason: 'resign', scoreA: 1, scoreB: 2, scoreC: 3, scoreD: 4, decidedAt: 1 };
  const sdRoom = room4final('A', { result: Object.assign({}, base, { leftSeat: 'B' }), game: { bestMove: null, out: { B: 'left', C: 'sd', D: 'sd' } } });
  assert.strictEqual(Scenes.resultReason(sdRoom), 'Juan left the game');
  const allLeft = room4final('A', { result: Object.assign({}, base, { leftSeat: 'B' }), game: { bestMove: null, out: { B: 'left', C: 'left', D: 'left' } } });
  assert.strictEqual(Scenes.resultReason(allLeft), 'Everyone else left the game');
});
