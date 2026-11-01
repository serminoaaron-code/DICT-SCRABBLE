const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/match.js');
const Director = require('../js/director.js');

// ---------- small local room factories ----------

const FAR = 10000000; // a match clock that never runs low during a test

// A live room. startedAt defaults to well in the past (no intro); endsAt to far away.
function live(code, { moveCount = 0, startedAt = -100000, endsAt = FAR, status = 'live', lastMove = null, paused = null } = {}) {
  return {
    code, teamAName: code + '-A', teamBName: code + '-B',
    seats: { A: { name: code + ' Ana' }, B: { name: code + ' Ben' } },
    status,
    clock: { startedAt, endsAt, turnStartedAt: startedAt, paused },
    game: { moveCount, lastMove },
    result: null
  };
}

function waiting(code) {
  return { code, teamAName: code + '-A', teamBName: code + '-B', seats: { A: null, B: null }, status: 'waiting', clock: null, game: null, result: null };
}

// The same room after one more play worth `total` (40 = Awesome!/tier 3, 60 = IMPOSSIBLE!!!/tier 4).
function played(room, total, bingo = false) {
  const moveCount = room.game.moveCount + 1;
  return {
    ...room,
    game: { moveCount, lastMove: { type: 'play', seat: 'A', words: [{ word: 'QUIZ', score: total }], total, bingo } }
  };
}

function finished(room) {
  return { ...room, status: 'final', result: { winner: 'A', scoreA: 100, scoreB: 90, reason: 'time' } };
}

const deepFreeze = o => {
  if (o && typeof o === 'object') { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
  return o;
};

const HL3 = M.CELEBRATE_MS[3] + 300; // Awesome! highlight scene length
const HL4 = M.CELEBRATE_MS[4] + 300; // IMPOSSIBLE!!! highlight scene length

// ---------- the brief's tests ----------

test('first step records state without events', () => {
  const rooms = {
    AAA: played(live('AAA', { moveCount: 4 }), 60, true), // a big play already on the board
    BBB: finished(live('BBB')),                            // already over
    CCC: waiting('CCC')
  };
  const s0 = deepFreeze(Director.init());
  const s = Director.step(s0, rooms, null, 1000);
  assert.notStrictEqual(s, s0, 'returns a new state');
  assert.strictEqual(s.scene, 'room');
  assert.strictEqual(s.featured, 'AAA');
  assert.deepStrictEqual(s.queue, []);
  assert.strictEqual(s.move, null);
  assert.deepStrictEqual(s.seen.AAA, { moveCount: 5, status: 'live', startedAt: -100000 });
  assert.strictEqual(s.seen.BBB.status, 'final');
  assert.strictEqual(s.seen.CCC.status, 'waiting');
  // Nothing replays on the next step either.
  const s2 = Director.step(deepFreeze(s), rooms, null, 1500);
  assert.strictEqual(s2.scene, 'room');
  assert.deepStrictEqual(s2.queue, []);
});

test('idle when nothing is live', () => {
  const rooms = { AAA: waiting('AAA'), BBB: finished(live('BBB')) };
  const s = Director.step(Director.init(), rooms, null, 0);
  assert.strictEqual(s.scene, 'idle');
  assert.strictEqual(s.featured, null);
  const empty = Director.step(Director.init(), {}, null, 0);
  assert.strictEqual(empty.scene, 'idle');
});

test('rotates after 20 s and not before', () => {
  const rooms = { AAA: live('AAA'), BBB: live('BBB'), CCC: live('CCC') };
  let s = Director.step(Director.init(), rooms, null, 0);
  assert.strictEqual(s.featured, 'AAA');
  s = Director.step(s, rooms, null, 19999);
  assert.strictEqual(s.featured, 'AAA');
  s = Director.step(s, rooms, null, 20000);
  assert.strictEqual(s.featured, 'BBB');
  assert.strictEqual(s.since, 20000);
  s = Director.step(s, rooms, null, 39999);
  assert.strictEqual(s.featured, 'BBB');
  s = Director.step(s, rooms, null, 40000);
  assert.strictEqual(s.featured, 'CCC');
  s = Director.step(s, rooms, null, 60000);
  assert.strictEqual(s.featured, 'AAA', 'wraps around in code order');
});

test('prefers drama rooms when rotating', () => {
  const rooms = {
    AAA: live('AAA', { status: 'suddenDeath' }),
    BBB: live('BBB'),
    CCC: live('CCC', { status: 'suddenDeath' })
  };
  let s = Director.step(Director.init(), rooms, null, 0);
  assert.strictEqual(s.featured, 'AAA', 'drama room first');
  s = Director.step(s, rooms, null, 20000);
  assert.strictEqual(s.featured, 'CCC', 'skips the calm room BBB');
  s = Director.step(s, rooms, null, 40000);
  assert.strictEqual(s.featured, 'AAA');
  // The last 60 s of the match clock also counts as drama (and a paused clock uses its frozen time).
  const clockRooms = {
    AAA: live('AAA'),
    BBB: live('BBB', { endsAt: 70000 }),
    CCC: live('CCC', { paused: { by: 'host', matchRemainingMs: 30000, turnRemainingMs: 1000 } })
  };
  assert.strictEqual(Director.isDrama(clockRooms.BBB, 9999), false);
  assert.strictEqual(Director.isDrama(clockRooms.BBB, 10000), true);
  assert.strictEqual(Director.isDrama(clockRooms.CCC, 0), true);
  assert.strictEqual(Director.isDrama(clockRooms.AAA, 0), false);
});

test('highlight cuts immediately and queues a second highlight', () => {
  let rooms = { AAA: live('AAA'), BBB: live('BBB') };
  let s = Director.step(Director.init(), rooms, null, 0);
  assert.strictEqual(s.featured, 'AAA');

  rooms = { ...rooms, BBB: played(rooms.BBB, 40) }; // Awesome! in the room that isn't featured
  s = Director.step(s, rooms, null, 1000);
  assert.strictEqual(s.scene, 'highlight');
  assert.strictEqual(s.featured, 'BBB');
  assert.strictEqual(s.sceneUntil, 1000 + HL3);
  assert.strictEqual(s.move.tier, 3);
  assert.strictEqual(s.move.total, 40);

  rooms = { ...rooms, AAA: played(rooms.AAA, 60) }; // IMPOSSIBLE!!! while that plays
  s = Director.step(s, rooms, null, 2000);
  assert.strictEqual(s.scene, 'highlight');
  assert.strictEqual(s.featured, 'BBB', 'the running scene keeps going');
  assert.strictEqual(s.queue.length, 1);
  assert.strictEqual(s.queue[0].type, 'highlight');

  s = Director.step(s, rooms, null, 1000 + HL3);
  assert.strictEqual(s.scene, 'highlight');
  assert.strictEqual(s.featured, 'AAA');
  assert.strictEqual(s.move.tier, 4);
  assert.strictEqual(s.sceneUntil, 1000 + HL3 + HL4);
  assert.strictEqual(s.queue.length, 0);

  s = Director.step(s, rooms, null, 1000 + HL3 + HL4);
  assert.strictEqual(s.scene, 'room');
  assert.strictEqual(s.featured, 'AAA');
  assert.strictEqual(s.move, null);
});

test('single start plays intro until startedAt', () => {
  let rooms = { AAA: live('AAA'), BBB: waiting('BBB') };
  let s = Director.step(Director.init(), rooms, null, 0);
  rooms = { ...rooms, BBB: live('BBB', { startedAt: 6000, endsAt: 606000 }) };
  s = Director.step(s, rooms, null, 1000);
  assert.strictEqual(s.scene, 'intro');
  assert.strictEqual(s.featured, 'BBB');
  assert.strictEqual(s.sceneUntil, 6000);
  s = Director.step(s, rooms, null, 5999);
  assert.strictEqual(s.scene, 'intro');
  s = Director.step(s, rooms, null, 6000);
  assert.strictEqual(s.scene, 'room');
  assert.strictEqual(s.featured, 'BBB');

  // A projector opened mid-intro plays only the remaining part.
  const mid = Director.step(Director.init(), { BBB: live('BBB', { startedAt: 6000 }) }, null, 4000);
  assert.strictEqual(mid.scene, 'intro');
  assert.strictEqual(mid.sceneUntil, 6000);
  // Intros are never replayed late.
  const late = Director.step(Director.init(), { BBB: live('BBB', { startedAt: 6000 }) }, null, 6000);
  assert.strictEqual(late.scene, 'room');
});

test('rooms starting within 10 s get one roundStart', () => {
  let rooms = { AAA: waiting('AAA'), BBB: waiting('BBB'), CCC: waiting('CCC') };
  let s = Director.step(Director.init(), rooms, null, 0);
  assert.strictEqual(s.scene, 'idle');
  rooms = {
    AAA: live('AAA', { startedAt: 9000 }),
    BBB: live('BBB', { startedAt: 6000 }),
    CCC: waiting('CCC')
  };
  s = Director.step(s, rooms, null, 1000);
  assert.strictEqual(s.scene, 'roundStart');
  assert.deepStrictEqual(s.roundCodes, ['BBB', 'AAA'], 'earliest start first');
  assert.strictEqual(s.sceneUntil, 6000);
  assert.deepStrictEqual(s.queue, []);
  s = Director.step(s, rooms, null, 6000);
  assert.strictEqual(s.scene, 'room');
  assert.strictEqual(s.featured, 'BBB', 'then the first room');

  // A room starting more than 10 s apart gets its own intro.
  rooms = { ...rooms, CCC: live('CCC', { startedAt: 30000 }) };
  s = Director.step(s, rooms, null, 25000);
  assert.strictEqual(s.scene, 'intro');
  assert.strictEqual(s.featured, 'CCC');
});

test('winner card for 8 s on end', () => {
  let rooms = { AAA: live('AAA'), BBB: live('BBB') };
  let s = Director.step(Director.init(), rooms, null, 0);
  rooms = { ...rooms, BBB: finished(rooms.BBB) };
  s = Director.step(s, rooms, null, 1000);
  assert.strictEqual(s.scene, 'winner');
  assert.strictEqual(s.featured, 'BBB');
  assert.strictEqual(s.sceneUntil, 9000);
  s = Director.step(s, rooms, null, 8999);
  assert.strictEqual(s.scene, 'winner');
  s = Director.step(s, rooms, null, 9000);
  assert.strictEqual(s.scene, 'room');
  assert.strictEqual(s.featured, 'AAA');
  // The last room ending leaves nothing live.
  rooms = { ...rooms, AAA: finished(rooms.AAA) };
  s = Director.step(s, rooms, null, 10000);
  assert.strictEqual(s.scene, 'winner');
  s = Director.step(s, rooms, null, 18000);
  assert.strictEqual(s.scene, 'idle');
  assert.strictEqual(s.featured, null);
});

test('pinned room stays featured; other highlights go to corner', () => {
  let rooms = { AAA: live('AAA'), BBB: live('BBB') };
  let s = Director.step(Director.init(), rooms, 'BBB', 0);
  assert.strictEqual(s.featured, 'BBB');
  assert.strictEqual(s.scene, 'room');
  assert.strictEqual(Director.pinActive(s, rooms, 'BBB'), true);
  s = Director.step(s, rooms, 'BBB', 30000);
  assert.strictEqual(s.featured, 'BBB', 'no rotation while pinned');

  rooms = { ...rooms, AAA: played(rooms.AAA, 60) };
  s = Director.step(s, rooms, 'BBB', 31000);
  assert.strictEqual(s.featured, 'BBB');
  assert.strictEqual(s.scene, 'room');
  assert.strictEqual(s.corner.code, 'AAA');
  assert.strictEqual(s.corner.move.tier, 4);
  assert.strictEqual(s.corner.until, 35000);
  assert.deepStrictEqual(s.queue, []);
  s = Director.step(s, rooms, 'BBB', 35000);
  assert.strictEqual(s.corner, null);

  // The pinned room's own events play as scenes.
  rooms = { ...rooms, BBB: played(rooms.BBB, 40) };
  s = Director.step(s, rooms, 'BBB', 36000);
  assert.strictEqual(s.scene, 'highlight');
  assert.strictEqual(s.featured, 'BBB');

  // Unpinning goes back to AUTO: BBB has been on screen for over 20 s, so it rotates.
  s = Director.step(s, rooms, null, 36000 + HL3);
  assert.strictEqual(s.scene, 'room');
  assert.strictEqual(s.featured, 'AAA');
  assert.strictEqual(s.corner, null);
});

test('pinned room finishing returns to auto after winner card', () => {
  let rooms = { AAA: live('AAA'), BBB: live('BBB'), CCC: live('CCC') };
  let s = Director.step(Director.init(), rooms, 'BBB', 0);
  assert.strictEqual(s.featured, 'BBB');

  // The pinned room's own IMPOSSIBLE!!! plays as a scene.
  rooms = { ...rooms, BBB: played(rooms.BBB, 60, true) };
  s = Director.step(s, rooms, 'BBB', 1000);
  assert.strictEqual(s.scene, 'highlight');
  assert.strictEqual(s.featured, 'BBB');

  // Highlights in other rooms arrive while that scene runs: they queue.
  rooms = { ...rooms, AAA: played(rooms.AAA, 40), CCC: played(rooms.CCC, 60) };
  s = Director.step(s, rooms, 'BBB', 2000);
  assert.strictEqual(s.queue.length, 2);

  // The pinned room finishes: its winner card goes ahead of the queued highlights.
  rooms = { ...rooms, BBB: finished(rooms.BBB) };
  s = Director.step(s, rooms, 'BBB', 3000);
  assert.deepStrictEqual(s.queue.map(e => e.type + ':' + e.code), ['end:BBB', 'highlight:AAA', 'highlight:CCC']);

  const t1 = 1000 + HL4;
  s = Director.step(s, rooms, 'BBB', t1);
  assert.strictEqual(s.scene, 'winner');
  assert.strictEqual(s.featured, 'BBB');
  assert.strictEqual(s.ignoredPin, 'BBB');
  assert.strictEqual(Director.pinActive(s, rooms, 'BBB'), false, 'mode is AUTO again');

  const t2 = t1 + 8000;
  s = Director.step(s, rooms, 'BBB', t2);
  assert.strictEqual(s.scene, 'highlight');
  assert.strictEqual(s.featured, 'AAA');

  const t3 = t2 + HL3;
  s = Director.step(s, rooms, 'BBB', t3);
  assert.strictEqual(s.scene, 'highlight');
  assert.strictEqual(s.featured, 'CCC');

  // Then rotation, still with the (finished) room pinned, never going back to it.
  const seenFeatured = new Set();
  for (let t = t3 + HL4; t <= t3 + HL4 + 120000; t += 250) {
    s = Director.step(s, rooms, 'BBB', t);
    seenFeatured.add(s.featured);
    assert.strictEqual(s.scene, 'room');
  }
  assert.ok(!seenFeatured.has('BBB'), 'featured never returns to the finished room');
  assert.ok(seenFeatured.has('AAA') && seenFeatured.has('CCC'), 'rotation runs');
  assert.strictEqual(s.ignoredPin, 'BBB');
  assert.strictEqual(s.corner, null);
});

test('minimum dwell of 8 s between rotations', () => {
  let rooms = { AAA: live('AAA'), BBB: live('BBB') };
  let s = Director.step(Director.init(), rooms, null, 0);
  assert.strictEqual(s.featured, 'AAA');

  // BBB enters sudden death: the director moves to it, but not before 8 s on AAA.
  rooms = { ...rooms, BBB: live('BBB', { status: 'suddenDeath' }) };
  s = Director.step(s, rooms, null, 3000);
  assert.strictEqual(s.featured, 'AAA');
  s = Director.step(s, rooms, null, 7999);
  assert.strictEqual(s.featured, 'AAA');
  s = Director.step(s, rooms, null, 8000);
  assert.strictEqual(s.featured, 'BBB');

  // AAA turns dramatic too: BBB is drama, so no early switch; normal rotation at 20 s.
  rooms = { ...rooms, AAA: live('AAA', { status: 'suddenDeath' }) };
  for (let t = 8250; t < 28000; t += 250) {
    s = Director.step(s, rooms, null, t);
    assert.strictEqual(s.featured, 'BBB', 'stays at ' + t);
  }
  s = Director.step(s, rooms, null, 28000);
  assert.strictEqual(s.featured, 'AAA');

  // Events are exempt: a highlight cuts away 1 s after a switch.
  rooms = { ...rooms, BBB: played(rooms.BBB, 40) };
  s = Director.step(s, rooms, null, 29000);
  assert.strictEqual(s.scene, 'highlight');
  assert.strictEqual(s.featured, 'BBB');
});

// ---------- ordering decisions (spec §5.7) ----------

test('a highlight and an end in the same step: celebration first, then winner card', () => {
  let rooms = { AAA: live('AAA'), BBB: live('BBB') };
  let s = Director.step(Director.init(), rooms, null, 0);
  rooms = { ...rooms, BBB: finished(played(rooms.BBB, 60)) }; // the game-ending play
  s = Director.step(s, rooms, null, 1000);
  assert.strictEqual(s.scene, 'highlight');
  assert.strictEqual(s.featured, 'BBB');
  assert.deepStrictEqual(s.queue.map(e => e.type), ['end']);
  s = Director.step(s, rooms, null, 1000 + HL4);
  assert.strictEqual(s.scene, 'winner');
  assert.strictEqual(s.featured, 'BBB');
});

test('a queued highlight goes ahead of a queued end', () => {
  let rooms = { AAA: live('AAA'), BBB: live('BBB'), CCC: live('CCC') };
  let s = Director.step(Director.init(), rooms, null, 0);
  rooms = { ...rooms, AAA: played(rooms.AAA, 40) };
  s = Director.step(s, rooms, null, 1000); // highlight AAA running
  rooms = { ...rooms, BBB: finished(rooms.BBB) };
  s = Director.step(s, rooms, null, 1500);
  rooms = { ...rooms, CCC: played(rooms.CCC, 40) };
  s = Director.step(s, rooms, null, 2000);
  assert.deepStrictEqual(s.queue.map(e => e.type + ':' + e.code), ['highlight:CCC', 'end:BBB']);
});

test('a start during a winner card cuts to that room without replaying the intro', () => {
  let rooms = { AAA: live('AAA'), BBB: live('BBB'), CCC: waiting('CCC') };
  let s = Director.step(Director.init(), rooms, null, 0);
  rooms = { ...rooms, BBB: finished(rooms.BBB) };
  s = Director.step(s, rooms, null, 1000); // winner card until 9000
  rooms = { ...rooms, CCC: live('CCC', { startedAt: 7000 }) };
  s = Director.step(s, rooms, null, 2000);
  assert.strictEqual(s.scene, 'winner');
  assert.strictEqual(s.queue.length, 1);
  s = Director.step(s, rooms, null, 9000);
  assert.strictEqual(s.scene, 'room', 'its startedAt has passed: no late intro');
  assert.strictEqual(s.featured, 'CCC', 'but the queued start still cuts to the new match');
  assert.strictEqual(s.since, 9000);

  // A start that is still in its intro when the card ends plays the remaining part.
  rooms = { ...rooms, AAA: finished(rooms.AAA), DDD: waiting('DDD') };
  s = Director.step(s, rooms, null, 10000); // winner AAA until 18000
  rooms = { ...rooms, DDD: live('DDD', { startedAt: 20000 }) };
  s = Director.step(s, rooms, null, 15000);
  s = Director.step(s, rooms, null, 18000);
  assert.strictEqual(s.scene, 'intro');
  assert.strictEqual(s.featured, 'DDD');
  assert.strictEqual(s.sceneUntil, 20000);
});

test('a start during another room\'s intro merges into one roundStart', () => {
  let rooms = { AAA: waiting('AAA'), BBB: waiting('BBB'), CCC: live('CCC') };
  let s = Director.step(Director.init(), rooms, null, 0);
  rooms = { ...rooms, AAA: live('AAA', { startedAt: 6000 }) };
  s = Director.step(s, rooms, null, 1000);
  assert.strictEqual(s.scene, 'intro');
  rooms = { ...rooms, BBB: live('BBB', { startedAt: 9000 }) };
  s = Director.step(s, rooms, null, 4000);
  assert.strictEqual(s.scene, 'roundStart');
  assert.deepStrictEqual(s.roundCodes, ['AAA', 'BBB']);
  assert.strictEqual(s.sceneUntil, 9000);
  assert.deepStrictEqual(s.queue, []);
  s = Director.step(s, rooms, null, 9000);
  assert.strictEqual(s.scene, 'room');
  assert.strictEqual(s.featured, 'AAA');
});

test('other rooms\' starts and ends do not cut away from a pinned room', () => {
  let rooms = { AAA: live('AAA'), BBB: live('BBB'), CCC: waiting('CCC') };
  let s = Director.step(Director.init(), rooms, 'AAA', 0);
  rooms = { ...rooms, BBB: finished(rooms.BBB), CCC: live('CCC', { startedAt: 6000 }) };
  s = Director.step(s, rooms, 'AAA', 1000);
  assert.strictEqual(s.scene, 'room');
  assert.strictEqual(s.featured, 'AAA');
  assert.deepStrictEqual(s.queue, []);
});

test('a deleted room ends its scene and drops its queued events', () => {
  let rooms = { AAA: live('AAA'), BBB: live('BBB') };
  let s = Director.step(Director.init(), rooms, null, 0);
  rooms = { AAA: played(rooms.AAA, 40), BBB: played(rooms.BBB, 40) };
  s = Director.step(s, rooms, null, 1000);
  assert.strictEqual(s.featured, 'AAA');
  assert.strictEqual(s.queue.length, 1);
  s = Director.step(s, {}, null, 1500); // reset tournament
  assert.strictEqual(s.scene, 'idle');
  assert.deepStrictEqual(s.queue, []);
  assert.deepStrictEqual(s.seen, {});
});
