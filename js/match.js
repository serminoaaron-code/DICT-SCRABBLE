// Pure room-state transitions and standings. Every mutator takes a room and
// returns a NEW room, or null to reject. Firebase transactions wrap these.
// Loads as a browser global (Match) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Match = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const Engine = typeof require === 'function' ? require('./engine.js') : root.ScrabbleEngine;

  const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const TURN_MS = 60000;
  const INTRO_MS = 6500; // VS intro 2.6 s + coin flip 1.9 s, then "<TEAM> GOES FIRST!" holds 2 s (Scenes.COIN_RESULT_AT)
  // After a play the next turn's clock starts DROP_MS + CELEBRATE_MS[tier] later (turn moments):
  // the opponent's word drops in (DROP_MS), its celebration plays (CELEBRATE_MS, indexed by
  // Engine.celebrationTier(); tier 0 is the 1 s "+N" float), then the "YOUR TURN!" ribbon starts
  // with the clock, so watching never costs turn time.
  const DROP_MS = 700;
  const CELEBRATE_MS = [1000, 2600, 2600, 3000, 4500];
  const SUDDEN_DEATH_MAX_ROUNDS = 3;
  // 3-4 player rooms (2026-11-03): the "3/4-WAY" team intro + roulette wheel take 2 s longer
  // (teams 2.6 s, wheel 3.4 s, then "<TEAM> GOES FIRST!" holds 2.5 s; Scenes.WHEEL_RESULT_AT).
  const INTRO_MULTI_MS = 8500;
  const ALL_SEATS = ['A', 'B', 'C', 'D'];

  const clone = obj => JSON.parse(JSON.stringify(obj));
  const other = seat => (seat === 'A' ? 'B' : 'A');

  // ---------- seats (2-4 players) ----------
  // A room without `players` is a 2-player room; 3-4 player rooms add seats C and D
  // (teamC/teamCName, teamD/teamDName). The fields of a 2-player room never change.
  function seatsOf(room) {
    const n = room && [3, 4].includes(room.players) ? room.players : 2;
    return ALL_SEATS.slice(0, n);
  }
  const isMulti = room => seatsOf(room).length > 2;
  function isSeat(room, s) { return seatsOf(room).includes(s); }
  function teamOf(room, seat) { return (room && room['team' + seat]) || ''; }
  function teamNameOf(room, seat) { return (room && room['team' + seat + 'Name']) || 'Team ' + seat; }
  function introMsFor(room) { return isMulti(room) ? INTRO_MULTI_MS : INTRO_MS; }

  // ---------- codes ----------

  function generateRoomCode(rng = Math.random) {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
    return code;
  }

  function formatCode(code) { return code.slice(0, 3) + '-' + code.slice(3); }

  function normalizeCode(input) {
    return String(input || '').toUpperCase().split('').filter(ch => CODE_ALPHABET.includes(ch)).join('');
  }

  // A real room has a status and both teams; a reconnecting client's presence write can
  // otherwise create a "ghost" node with only presence/<id> under a deleted room.
  function isRoomRecord(raw) {
    return !!(raw && raw.status && raw.teamA && raw.teamB);
  }

  // ---------- room shape ----------

  function createRoom(opts) {
    const { code, teamA, teamB, teamAName, teamBName, label, matchLengthSec, now, players = 2 } = opts;
    if (![2, 3, 4].includes(players)) throw new Error('BAD_PLAYERS');
    const seats = ALL_SEATS.slice(0, players);
    const ids = seats.map(s => opts['team' + s]);
    if (players > 2 && ids.some(id => !id)) throw new Error('MISSING_TEAM');
    if (new Set(ids).size !== ids.length) throw new Error('SAME_TEAM');
    const r = {
      code, teamA, teamB,
      teamAName: teamAName || '', teamBName: teamBName || '',
      label: label || '',
      matchLengthSec,
      status: 'waiting',
      seats: { A: null, B: null },
      watchers: {},
      clock: null,
      game: null,
      fairPlay: { A: { screenLeaves: 0 }, B: { screenLeaves: 0 } },
      result: null,
      createdAt: now
    };
    if (players === 2) return r; // exactly today's room
    r.players = players;
    for (const s of seats.slice(2)) {
      r['team' + s] = opts['team' + s];
      r['team' + s + 'Name'] = opts['team' + s + 'Name'] || '';
      r.seats[s] = null;
      r.fairPlay[s] = { screenLeaves: 0 };
    }
    return r;
  }

  // Firebase drops empty arrays/objects and nulls; restore every default.
  function normalizeRoom(raw) {
    const r = clone(raw || {});
    r.label = r.label || '';
    r.teamAName = r.teamAName || '';
    r.teamBName = r.teamBName || '';
    const SEATS = seatsOf(r);
    for (const s of SEATS.slice(2)) r['team' + s + 'Name'] = r['team' + s + 'Name'] || '';
    r.seats = r.seats || {};
    for (const s of SEATS) r.seats[s] = r.seats[s] || null;
    r.watchers = r.watchers || {};
    r.presence = r.presence || {};
    r.fairPlay = r.fairPlay || {};
    for (const s of SEATS) {
      r.fairPlay[s] = r.fairPlay[s] || {};
      r.fairPlay[s].screenLeaves = r.fairPlay[s].screenLeaves || 0;
    }
    r.result = r.result || null;
    r.taunts = r.taunts || {};
    for (const s of SEATS) r.taunts[s] = r.taunts[s] || null;
    r.clock = r.clock || null;
    if (r.clock) r.clock.paused = r.clock.paused || null;
    r.game = r.game || null;
    if (r.game) {
      const g = r.game;
      g.board = g.board || {};
      g.bag = g.bag || [];
      g.racks = g.racks || {};
      g.scores = g.scores || {};
      for (const s of SEATS) {
        g.racks[s] = g.racks[s] || [];
        g.scores[s] = Number(g.scores[s]) || 0; // always a number (views put it into HTML)
      }
      g.moveCount = g.moveCount || 0;
      // 3-4 player rooms: { seat: 'left' | 'sd' } (resigned / out of sudden death). Only real seats are
      // kept, here and in suddenDeath.seats / played: room data is client-written and ends up in markup.
      const out = g.out || {};
      g.out = {};
      for (const s of SEATS) if (out[s] === 'left' || out[s] === 'sd') g.out[s] = out[s];
      g.pending = g.pending || null;
      if (g.pending) g.pending.rejectedWords = g.pending.rejectedWords || [];
      g.suddenDeath = g.suddenDeath || null;
      if (g.suddenDeath) {
        const sd = g.suddenDeath;
        if (Array.isArray(sd.seats)) sd.seats = sd.seats.filter(s => SEATS.includes(s));
        if (Array.isArray(sd.played)) sd.played = sd.played.filter(s => SEATS.includes(s));
        if (isMulti(r)) sd.played = sd.played || [];
      }
      g.lastMove = g.lastMove || null;
      if (g.lastMove) {
        g.lastMove.words = g.lastMove.words || [];
        g.lastMove.bingo = !!g.lastMove.bingo;
      }
      g.bestMove = g.bestMove || null;
      if (g.pending) g.pending.words = g.pending.words || [];
    }
    return r;
  }

  // ---------- seats ----------

  function claimSeat(room, seat, { name, clientId }) {
    if (room.status === 'final' || room.status === 'void') return null;
    if (!isSeat(room, seat)) return null;
    const cur = room.seats && room.seats[seat];
    if (cur && cur.clientId !== clientId) return null;
    const r = clone(room);
    const cleanName = String(name || '').trim().slice(0, 40) || (cur && cur.name) || 'Player';
    r.seats[seat] = cur
      ? Object.assign({}, cur, { name: cleanName, online: true })
      : { name: cleanName, clientId, ready: false, online: true };
    return r;
  }

  function setReady(room, seat, clientId, ready) {
    if (room.status !== 'waiting') return null;
    const cur = room.seats[seat];
    if (!cur || cur.clientId !== clientId) return null;
    const r = clone(room);
    r.seats[seat].ready = !!ready;
    return r;
  }

  function removePlayer(room, seat) {
    if (room.status === 'final' || room.status === 'void') return null;
    const r = clone(room);
    r.seats[seat] = null;
    return r;
  }

  // A player leaving their own seat: only before the game starts (the host uses removePlayer).
  function leaveSeat(room, seat, clientId) {
    if (room.status !== 'waiting') return null;
    const cur = room.seats[seat];
    if (!cur || cur.clientId !== clientId) return null;
    return removePlayer(room, seat);
  }

  // Reopening the room on the same device: only if the seat is still ours. A freed seat
  // (host Remove / own Leave) must be taken again on purpose via claimSeat.
  function rejoinSeat(room, seat, clientId) {
    const cur = room.seats && room.seats[seat];
    if (!cur || cur.clientId !== clientId) return null;
    return claimSeat(room, seat, { name: cur.name, clientId });
  }

  // Display copy with the teams' current names (renames), falling back to the snapshot.
  function withTeamNames(room, teams) {
    const r = clone(room);
    for (const s of seatsOf(r)) {
      const id = r['team' + s];
      if (teams && teams[id] && teams[id].name) r['team' + s + 'Name'] = teams[id].name;
    }
    return r;
  }

  const cleanNote = note => String(note || '').trim().slice(0, 120);

  // ---------- start ----------

  function startMatch(room, now, rng = Math.random, introMs = 0) {
    if (room.status !== 'waiting') return null;
    const seats = seatsOf(room);
    if (!seats.every(s => room.seats[s] && room.seats[s].ready)) return null;
    const r = clone(room);
    let bag = Engine.createBag(rng);
    const racks = {}, scores = {};
    for (const s of seats) {
      const d = Engine.drawTiles(bag, Engine.RACK_SIZE);
      bag = d.bag; racks[s] = d.drawn; scores[s] = 0;
    }
    // 2 players: the coin toss (as before); 3-4 players: the roulette's pick. Chosen once, here, so
    // every screen plays the same coin / wheel landing from the stored firstSeat.
    const firstSeat = seats.length === 2 ? (rng() < 0.5 ? 'A' : 'B') : seats[Math.min(seats.length - 1, Math.floor(rng() * seats.length))];
    r.game = {
      board: {}, bag, racks, scores,
      firstSeat, turn: firstSeat, moveCount: 0, pending: null, suddenDeath: null, lastMove: null, bestMove: null
    };
    const startedAt = now + introMs;
    r.clock = { startedAt, endsAt: startedAt + room.matchLengthSec * 1000, turnStartedAt: startedAt, paused: null };
    r.status = 'live';
    return r;
  }

  // ---------- turns ----------

  const PLAYING = ['live', 'suddenDeath'];

  // Shared guards for a player acting on their turn.
  function canAct(room, seat, expectedMoveCount, now) {
    if (!room.game || !room.clock) return false;
    if (!PLAYING.includes(room.status)) return false;
    if (now < room.clock.startedAt) return false;
    if (room.clock.paused) return false;
    if (room.game.pending) return false;
    if (room.game.turn !== seat) return false;
    if (room.game.moveCount !== expectedMoveCount) return false;
    if (room.status === 'live' && now >= room.clock.endsAt) return false;
    return true;
  }

  function prepareMove(room, seat, placements) {
    const fail = error => ({ ok: false, error, words: [], total: 0, bingo: false });
    if (!room.game || room.game.turn !== seat) return fail('NOT_YOUR_TURN');
    if (room.game.pending) return fail('PENDING');
    if (!Engine.rackHas(room.game.racks[seat], placements.map(p => p.letter))) return fail('NOT_IN_RACK');
    return Engine.scoreMove(room.game.board, placements);
  }

  function finalize(room, winnerSeat, reason, now) {
    const r = clone(room);
    const scores = (r.game && r.game.scores) || { A: 0, B: 0 };
    r.status = 'final';
    r.result = {
      winner: winnerSeat,
      teamId: teamOf(r, winnerSeat),
      scoreA: scores.A || 0,
      scoreB: scores.B || 0,
      reason,
      decidedAt: now
    };
    for (const s of seatsOf(r).slice(2)) r.result['score' + s] = scores[s] || 0;
    return r;
  }

  // ---------- turn order, out seats, sudden death (2-4 players) ----------
  // game.out (3-4 player rooms only): { seat: 'left' (resigned) | 'sd' (out of sudden death) }.
  // An out seat keeps its score but gets no turns. 2-player rooms never write it.

  function activeSeats(room) {
    const out = (room.game && room.game.out) || {};
    return seatsOf(room).filter(s => !out[s]);
  }

  // The next active seat after `seat`, in seat order, wrapping (2 players: the other seat).
  function nextSeat(room, seat) {
    const order = seatsOf(room);
    const act = activeSeats(room);
    const i = order.indexOf(seat);
    for (let k = 1; k <= order.length; k++) {
      const s = order[(i + k) % order.length];
      if (act.includes(s)) return s;
    }
    return seat;
  }

  // The seats among `seats` with the top score.
  function leadersOf(room, seats) {
    const sc = room.game.scores;
    const top = Math.max(...seats.map(s => sc[s] || 0));
    return seats.filter(s => (sc[s] || 0) === top);
  }

  // Sudden-death seats: 3-4 player rooms store them; 2 players = both.
  function sdSeats(room) {
    const sd = room.game.suddenDeath;
    return sd && Array.isArray(sd.seats) && sd.seats.length ? sd.seats : activeSeats(room);
  }

  // Mutates r: a tie at the top goes to sudden death between the tied seats only; in 3-4 player
  // rooms the others are out ('sd'). The first tied seat at or after firstSeat moves first.
  function enterSuddenDeath(r, now, delayMs, leaders) {
    const g = r.game;
    r.status = 'suddenDeath';
    g.suddenDeath = { startMove: g.moveCount, rounds: 0 };
    if (isMulti(r)) {
      g.out = g.out || {};
      for (const s of activeSeats(r)) if (!leaders.includes(s)) g.out[s] = 'sd';
      g.suddenDeath.seats = leaders.slice();
      g.suddenDeath.played = [];
    }
    const order = seatsOf(r);
    const fi = Math.max(0, order.indexOf(g.firstSeat));
    for (let k = 0; k < order.length; k++) {
      const s = order[(fi + k) % order.length];
      if (leaders.includes(s)) { g.turn = s; break; }
    }
    r.clock.turnStartedAt = now + delayMs;
    return r;
  }

  // Mutates r (a clone): the highest active score wins; a tie at the top -> sudden death.
  function endByScore(r, reason, now, delayMs = 0) {
    const leaders = leadersOf(r, activeSeats(r));
    if (leaders.length === 1) return finalize(r, leaders[0], reason, now);
    return enterSuddenDeath(r, now, delayMs, leaders);
  }

  // Mutates r: a sudden-death round is over. One leader wins; otherwise (3-4 players) the seats
  // that fell behind are out too, and the round count keeps going; 3 rounds -> host decides.
  function endRound(r, now) {
    const g = r.game;
    const sd = g.suddenDeath;
    sd.rounds += 1;
    const leaders = leadersOf(r, sdSeats(r));
    if (leaders.length === 1) return finalize(r, leaders[0], 'suddenDeath', now);
    if (isMulti(r)) {
      for (const s of sdSeats(r)) if (!leaders.includes(s)) g.out[s] = 'sd';
      sd.seats = leaders;
      sd.played = [];
      if (g.out[g.turn]) g.turn = nextSeat(r, g.turn);
    }
    if (sd.rounds >= SUDDEN_DEATH_MAX_ROUNDS) r.status = 'hostDecision';
    return r;
  }

  // 3-4 player rooms: has every sudden-death seat played this round?
  const roundDone = g => g.suddenDeath.seats.every(s => (g.suddenDeath.played || []).includes(s));

  // Mutates r (already a clone): advance the turn, then apply end-of-game rules.
  // delayMs holds the opponent's turn clock back for a celebration (0 for passes/timeouts).
  function endTurn(r, seat, now, wentOut, delayMs = 0) {
    const g = r.game;
    g.moveCount += 1;
    g.turn = nextSeat(r, seat);
    r.clock.turnStartedAt = now + delayMs;

    if (wentOut && r.status === 'live') return endByScore(r, 'bagOut', now, delayMs);
    if (r.status === 'suddenDeath') {
      if (!isMulti(r)) {
        if ((g.moveCount - g.suddenDeath.startMove) % 2 === 0) return endRound(r, now);
      } else {
        const played = g.suddenDeath.played || [];
        g.suddenDeath.played = played.includes(seat) ? played : played.concat(seat);
        if (roundDone(g)) return endRound(r, now);
      }
    }
    return r;
  }

  // The words as stored: { word, score } plus alt when a vertical word reads as a word both ways.
  // spellings (from the player's dictionary check, aligned with words) may only pick the board
  // reading, its exact reverse for a vertical word (back), or both; anything else is ignored, so a
  // client can never store other text or a right-to-left reading. back itself is never stored.
  function storedWords(words, spellings) {
    const ok = Array.isArray(spellings) && spellings.length === words.length;
    return words.map((w, i) => {
      const out = { word: w.word, score: w.score };
      const sp = ok ? spellings[i] : null;
      if (!sp || typeof sp !== 'object' || !w.back) return out;
      if (sp.alt === undefined && sp.word === w.back) out.word = w.back;
      else if (sp.word === w.word && sp.alt === w.back) out.alt = w.back;
      return out;
    });
  }

  // Applies a validated play without clock/turn-order guards (used by applyPlay and appeals).
  function playCore(room, seat, placements, now, unverified, spellings = null) {
    const m = prepareMove(room, seat, placements);
    if (!m.ok) return null;
    const r = clone(room);
    const g = r.game;
    g.board = Engine.applyPlacements(g.board, placements);
    const rack = Engine.removeFromRack(g.racks[seat], placements.map(p => p.letter));
    const d = Engine.drawTiles(g.bag, Engine.RACK_SIZE - rack.length);
    g.racks[seat] = rack.concat(d.drawn);
    g.bag = d.bag;
    g.scores[seat] += m.total;
    // cells: the squares this play filled (the word drop / projector glow); words carry no positions
    const words = storedWords(m.words, spellings);
    g.lastMove = { seat, type: 'play', words, cells: placements.map(p => ({ r: p.r, c: p.c })), total: m.total, bingo: m.bingo, unverified: !!unverified, at: now };
    if (!g.bestMove || m.total > g.bestMove.total) {
      g.bestMove = { seat, words: words.map(w => ({ ...w })), total: m.total, bingo: m.bingo };
    }
    const tier = Engine.celebrationTier(m.total, m.bingo);
    const wentOut = g.racks[seat].length === 0 && g.bag.length === 0;
    return endTurn(r, seat, now, wentOut, DROP_MS + CELEBRATE_MS[tier]);
  }

  function applyPlay(room, seat, placements, { now, expectedMoveCount, unverified = false, spellings = null }) {
    if (!canAct(room, seat, expectedMoveCount, now)) return null;
    return playCore(room, seat, placements, now, unverified, spellings);
  }

  function applyPass(room, seat, { now, expectedMoveCount, timeout = false, expectedTurnStartedAt }) {
    if (!canAct(room, seat, expectedMoveCount, now)) return null;
    if (timeout) {
      if (room.clock.turnStartedAt !== expectedTurnStartedAt) return null;
      if (now < room.clock.turnStartedAt + TURN_MS) return null;
    }
    const r = clone(room);
    r.game.lastMove = { seat, type: timeout ? 'timeout' : 'pass', words: [], total: 0, bingo: false, unverified: false, at: now };
    return endTurn(r, seat, now, false);
  }

  function resolveTimeUp(room, now) {
    if (room.status !== 'live' || room.result || !room.clock || room.clock.paused) return null;
    if (now < room.clock.endsAt) return null;
    return endByScore(clone(room), 'time', now);
  }

  // ---------- pause & appeals ----------

  function pausedSnapshot(room, now, by) {
    return {
      by,
      introRemainingMs: Math.max(0, room.clock.startedAt - now),
      matchRemainingMs: room.clock.endsAt - now,
      turnRemainingMs: Math.min(TURN_MS, Math.max(0, TURN_MS - (now - room.clock.turnStartedAt)))
    };
  }

  // Mutates r (a clone): restart both clocks from the stored remaining times.
  // A pause taken during the intro keeps the remaining "Get ready" time frozen
  // too, so the clocks and the start guard resume in lockstep.
  function resumeInPlace(r, now) {
    const p = r.clock.paused;
    if (p.introRemainingMs) {
      r.clock.startedAt = now + p.introRemainingMs;
      r.clock.turnStartedAt = r.clock.startedAt;
    } else {
      r.clock.turnStartedAt = now - (TURN_MS - p.turnRemainingMs);
    }
    r.clock.endsAt = now + p.matchRemainingMs;
    r.clock.paused = null;
    return r;
  }

  function pauseClocks(room, now, by = 'host') {
    if (!PLAYING.includes(room.status) || !room.clock || room.clock.paused) return null;
    const r = clone(room);
    r.clock.paused = pausedSnapshot(room, now, by);
    return r;
  }

  function resumeClocks(room, now) {
    if (!room.clock || !room.clock.paused) return null;
    if (room.game && room.game.pending) return null; // appeals resume via resolveAppeal
    return resumeInPlace(clone(room), now);
  }

  function requestAppeal(room, seat, placements, { now, expectedMoveCount, words, rejectedWords, total }) {
    if (!canAct(room, seat, expectedMoveCount, now)) return null;
    if (!prepareMove(room, seat, placements).ok) return null;
    const r = clone(room);
    r.game.pending = { seat, placements, words, rejectedWords, total, requestedAt: now };
    r.clock.paused = pausedSnapshot(room, now, 'appeal');
    return r;
  }

  function resolveAppeal(room, approve, { now }) {
    if (!room.game || !room.game.pending || !room.clock || !room.clock.paused) return null;
    const r = clone(room);
    const pending = r.game.pending;
    r.game.pending = null;
    resumeInPlace(r, now);
    if (!approve) return r;
    return playCore(r, pending.seat, pending.placements, now, false) || r;
  }

  // ---------- host decisions & endings ----------

  const DECIDABLE = ['live', 'suddenDeath', 'hostDecision'];

  // A player leaves the game and loses. With one player left, that player wins (2 players: the
  // other seat, as before). In 3-4 player rooms the others play on: the seat is out ('left'), its
  // tiles leave the game (the bag is unchanged) and its turns are skipped.
  function resign(room, seat, now) {
    if (!DECIDABLE.includes(room.status) || !room.game) return null;
    const act = activeSeats(room);
    if (!act.includes(seat)) return null;
    const rest = act.filter(s => s !== seat);
    if (rest.length === 1 && !isMulti(room)) return finalize(room, rest[0], 'resign', now);
    const r = clone(room);
    const g = r.game;
    g.out = g.out || {};
    g.out[seat] = 'left';
    g.racks[seat] = [];
    if (rest.length === 1) { // 3-4 players: the last other player left; the leaver keeps its LEFT tag
      const f = finalize(r, rest[0], 'resign', now);
      f.result.leftSeat = seat;
      return f;
    }
    if (g.pending && g.pending.seat === seat) {
      g.pending = null;
      if (r.clock.paused && r.clock.paused.by === 'appeal') resumeInPlace(r, now);
    }
    if (g.turn === seat) {
      g.turn = nextSeat(r, seat);
      if (r.clock.paused) r.clock.paused.turnRemainingMs = TURN_MS;
      // never earlier than a celebration's or the intro's hold on the turn clock
      else r.clock.turnStartedAt = Math.max(now, r.clock.turnStartedAt, r.clock.startedAt);
    }
    const sd = g.suddenDeath;
    if (sd && Array.isArray(sd.seats)) {
      sd.seats = sd.seats.filter(s => s !== seat);
      sd.played = (sd.played || []).filter(s => s !== seat);
      if (r.status === 'suddenDeath' && roundDone(g)) return endRound(r, now);
    }
    return r;
  }

  function awardWin(room, seat, now) {
    if (!DECIDABLE.includes(room.status) || !isSeat(room, seat)) return null;
    return finalize(room, seat, 'awarded', now);
  }

  function walkover(room, seat, now) {
    if (room.status !== 'waiting' || !isSeat(room, seat)) return null;
    return finalize(room, seat, 'walkover', now);
  }

  function voidRoom(room, now, note = '') {
    if (room.status === 'void') return null;
    const r = clone(room);
    r.status = 'void';
    r.voidedAt = now;
    r.voidNote = cleanNote(note);
    return r;
  }

  // 2 players: the win goes to the other seat (toSeat optional). 3-4 players: the host picks the
  // new winner (toSeat, a seat of the room other than the current winner).
  function correctResult(room, now, note = '', toSeat = null) {
    if (room.status !== 'final' || !room.result) return null;
    const cur = room.result.winner;
    const valid = isSeat(room, toSeat) && toSeat !== cur;
    if (isMulti(room) && !valid) return null;
    const r = clone(room);
    const winner = valid ? toSeat : other(cur);
    r.result.originalReason = r.result.originalReason || r.result.reason;
    r.result.winner = winner;
    r.result.teamId = teamOf(r, winner);
    r.result.reason = 'corrected';
    r.result.note = cleanNote(note);
    r.result.decidedAt = now;
    return r;
  }

  function recordScreenLeave(room, seat) {
    if (!PLAYING.includes(room.status)) return null;
    const r = clone(room);
    r.fairPlay[seat].screenLeaves = (r.fairPlay[seat].screenLeaves || 0) + 1;
    return r;
  }

  // ---- emoji taunts (batch 5): live only, each seat's LATEST taunt, overwritten, no history ----
  const TAUNTS = ['angry', 'lol', 'cry'];
  const TAUNT_COOLDOWN_MS = 10000;
  const TAUNT_STATUSES = ['live', 'suddenDeath', 'hostDecision']; // the game screen (paused / appeal included)

  // A seated player sends taunt `id`. Rejected (null) outside the game screen, during the VS intro,
  // for a bad seat or id, and within TAUNT_COOLDOWN_MS of this seat's previous taunt. Only `taunts`
  // changes, so a taunt's transaction racing with a play or a pass never loses the move.
  // The guard on its own, with no copy (the 😀 button asks it 4 times a second): the game screen, the
  // VS intro over (and not frozen by a pause), a seated player, and this seat's cooldown over.
  // The game screen is up for taunting: a playing status, the VS intro over and not frozen by a pause.
  // Shared by tauntAllowed and the room view's 😀 button.
  function tauntWindow(room, now) {
    if (!room || !TAUNT_STATUSES.includes(room.status) || !room.clock || typeof now !== 'number') return false;
    if (now < room.clock.startedAt) return false;
    return !(room.clock.paused && room.clock.paused.introRemainingMs > 0);
  }

  function tauntAllowed(room, seat, now) {
    if (!isSeat(room, seat) || !tauntWindow(room, now)) return false;
    const last = room.taunts && room.taunts[seat];
    return !(last && now - last.at < TAUNT_COOLDOWN_MS);
  }

  function taunt(room, seat, id, { now }) {
    if (!TAUNTS.includes(id) || !tauntAllowed(room, seat, now)) return null;
    const r = clone(room);
    r.taunts = Object.assign({ A: null, B: null }, r.taunts || {});
    r.taunts[seat] = { e: id, at: now };
    return r;
  }

  // presence/<clientId> = 'A' | 'B' | 'watch' | 'host' (removed on disconnect)
  function isSeatOnline(room, seat) {
    const s = room.seats && room.seats[seat];
    return !!(s && room.presence && room.presence[s.clientId]);
  }

  function watcherCount(room) {
    return Object.values(room.presence || {}).filter(v => v === 'watch').length;
  }

  function roomPhase(room) {
    if (room.game && room.game.pending) return 'appeal';
    if (room.clock && room.clock.paused && room.clock.paused.by === 'host') return 'paused';
    return room.status;
  }

  // ---------- standings ----------

  function computeStandings(teams, rooms) {
    const table = {};
    const ensure = (id, fallbackName) => {
      if (!table[id]) {
        const name = (teams && teams[id] && teams[id].name) || fallbackName || id;
        table[id] = { teamId: id, name, wins: 0, losses: 0, points: 0, rank: 0 };
      }
      return table[id];
    };
    for (const id of Object.keys(teams || {})) ensure(id);
    for (const room of Object.values(rooms || {})) {
      if (!room || room.status !== 'final' || !room.result) continue;
      // +1 and a win for the winner; a loss for every other seat (3-4 players: 1 win, 2-3 losses).
      const winSeat = room.result.winner;
      const nameOf = s => room['team' + s + 'Name'];
      const w = ensure(teamOf(room, winSeat), nameOf(winSeat));
      w.wins += 1; w.points += 1;
      for (const s of seatsOf(room)) if (s !== winSeat) ensure(teamOf(room, s), nameOf(s)).losses += 1;
    }
    const list = Object.values(table).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    list.forEach((t, i) => {
      t.rank = i > 0 && list[i - 1].points === t.points ? list[i - 1].rank : i + 1;
    });
    return list;
  }

  // The result screen's podium: the recorded winner first (place 1, even after an award or a
  // correction), then the players who stayed by score, then those who left; equal scores share a
  // place within a group. Scores from the result when final, else the live game.
  function ranking(room) {
    const res = room.result || null;
    const g = room.game || {};
    const out = g.out || {};
    const order = seatsOf(room);
    const scoreOf = s => (res && typeof res['score' + s] === 'number' ? res['score' + s] : ((g.scores || {})[s] || 0));
    const all = order.map(s => ({ seat: s, score: scoreOf(s), place: 0, left: out[s] === 'left' }));
    const byScore = (a, b) => b.score - a.score || order.indexOf(a.seat) - order.indexOf(b.seat);
    const win = res ? all.filter(x => x.seat === res.winner) : [];
    const rest = all.filter(x => !win.includes(x));
    const groups = [win, rest.filter(x => !x.left).sort(byScore), rest.filter(x => x.left).sort(byScore)];
    const list = [];
    for (const grp of groups) {
      grp.forEach((x, i) => {
        x.place = i > 0 && grp[i - 1].score === x.score && grp !== win ? grp[i - 1].place : list.length + 1;
        list.push(x);
      });
    }
    return list;
  }

  return {
    CODE_ALPHABET, TURN_MS, INTRO_MS, INTRO_MULTI_MS, DROP_MS, CELEBRATE_MS, SUDDEN_DEATH_MAX_ROUNDS,
    ALL_SEATS, seatsOf, isSeat, teamOf, teamNameOf, introMsFor, activeSeats, nextSeat, ranking,
    generateRoomCode, formatCode, normalizeCode, isRoomRecord, createRoom, normalizeRoom,
    claimSeat, setReady, removePlayer, leaveSeat, rejoinSeat, withTeamNames, startMatch,
    prepareMove, applyPlay, applyPass, resolveTimeUp, finalize,
    requestAppeal, resolveAppeal, pauseClocks, resumeClocks,
    resign, awardWin, walkover, voidRoom, correctResult, recordScreenLeave,
    TAUNTS, TAUNT_COOLDOWN_MS, TAUNT_STATUSES, tauntWindow, tauntAllowed, taunt,
    roomPhase, computeStandings, isSeatOnline, watcherCount,
    _internal: { clone, other, playCore, enterSuddenDeath }
  };
});
