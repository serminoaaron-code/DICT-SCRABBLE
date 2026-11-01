const test = require('node:test');
const assert = require('node:assert');
const Scenes = require('../js/scenes.js');

test('introRemaining before, during, after', () => {
  const room = { clock: { startedAt: 6000 } };
  assert.strictEqual(Scenes.introRemaining(room, 1000), 5000);
  assert.strictEqual(Scenes.introRemaining(room, 4000), 2000);
  assert.strictEqual(Scenes.introRemaining(room, 7000), 0);
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
  assert.strictEqual(Scenes.bestWordText(finalRoom('A', g({ seat: 'A', words: [{ word: 'QUIZ', score: 44 }], total: 44, bingo: false }))),
    '⭐ Best word: QUIZ · 44 pts (Awesome!)');
  assert.strictEqual(Scenes.bestWordText(finalRoom('A', g({ seat: 'B', words: [{ word: 'CAT', score: 10 }], total: 10, bingo: false }))),
    '⭐ Best word: CAT · 10 pts');
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
  const c = Scenes.endingCelebration(11, ended('bagOut', play(44)));
  assert.ok(c && c.tier === 3 && c.total === 44 && c.seat === 'A');
  assert.strictEqual(Scenes.endingCelebration(11, ended('suddenDeath', play(20))).tier, 1);
  // tier 0, not a play, another reason, a page load (no baseline) or an already-seen move: nothing
  assert.strictEqual(Scenes.endingCelebration(11, ended('bagOut', play(9))), null);
  assert.strictEqual(Scenes.endingCelebration(11, ended('suddenDeath', { seat: 'B', type: 'pass', words: [], total: 0 })), null);
  assert.strictEqual(Scenes.endingCelebration(11, ended('time', play(44))), null);
  assert.strictEqual(Scenes.endingCelebration(null, ended('bagOut', play(44))), null);
  assert.strictEqual(Scenes.endingCelebration(12, ended('bagOut', play(44))), null);
  assert.strictEqual(Scenes.endingCelebration(11, Object.assign(ended('bagOut', play(44)), { status: 'void' })), null);
});
