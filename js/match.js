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
  const SUDDEN_DEATH_MAX_ROUNDS = 3;
  const SEATS = ['A', 'B'];

  const clone = obj => JSON.parse(JSON.stringify(obj));
  const other = seat => (seat === 'A' ? 'B' : 'A');

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

  function createRoom({ code, teamA, teamB, teamAName, teamBName, label, matchLengthSec, now }) {
    if (teamA === teamB) throw new Error('SAME_TEAM');
    return {
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
  }

  // Firebase drops empty arrays/objects and nulls; restore every default.
  function normalizeRoom(raw) {
    const r = clone(raw || {});
    r.label = r.label || '';
    r.teamAName = r.teamAName || '';
    r.teamBName = r.teamBName || '';
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
        g.scores[s] = g.scores[s] || 0;
      }
      g.moveCount = g.moveCount || 0;
      g.pending = g.pending || null;
      if (g.pending) g.pending.rejectedWords = g.pending.rejectedWords || [];
      g.suddenDeath = g.suddenDeath || null;
      g.lastMove = g.lastMove || null;
      if (g.lastMove) g.lastMove.words = g.lastMove.words || [];
      if (g.pending) g.pending.words = g.pending.words || [];
    }
    return r;
  }

  // ---------- seats ----------

  function claimSeat(room, seat, { name, clientId }) {
    if (room.status === 'final' || room.status === 'void') return null;
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
    if (teams && teams[r.teamA] && teams[r.teamA].name) r.teamAName = teams[r.teamA].name;
    if (teams && teams[r.teamB] && teams[r.teamB].name) r.teamBName = teams[r.teamB].name;
    return r;
  }

  const cleanNote = note => String(note || '').trim().slice(0, 120);

  // ---------- start ----------

  function startMatch(room, now, rng = Math.random) {
    if (room.status !== 'waiting') return null;
    if (!SEATS.every(s => room.seats[s] && room.seats[s].ready)) return null;
    const r = clone(room);
    let bag = Engine.createBag(rng);
    const a = Engine.drawTiles(bag, Engine.RACK_SIZE); bag = a.bag;
    const b = Engine.drawTiles(bag, Engine.RACK_SIZE); bag = b.bag;
    const firstSeat = rng() < 0.5 ? 'A' : 'B';
    r.game = {
      board: {}, bag, racks: { A: a.drawn, B: b.drawn }, scores: { A: 0, B: 0 },
      firstSeat, turn: firstSeat, moveCount: 0, pending: null, suddenDeath: null, lastMove: null
    };
    r.clock = { startedAt: now, endsAt: now + room.matchLengthSec * 1000, turnStartedAt: now, paused: null };
    r.status = 'live';
    return r;
  }

  // ---------- turns ----------

  const PLAYING = ['live', 'suddenDeath'];

  // Shared guards for a player acting on their turn.
  function canAct(room, seat, expectedMoveCount, now) {
    if (!room.game || !room.clock) return false;
    if (!PLAYING.includes(room.status)) return false;
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
      teamId: winnerSeat === 'A' ? r.teamA : r.teamB,
      scoreA: scores.A || 0,
      scoreB: scores.B || 0,
      reason,
      decidedAt: now
    };
    return r;
  }

  function leader(room) {
    const { A, B } = room.game.scores;
    return A === B ? null : (A > B ? 'A' : 'B');
  }

  function enterSuddenDeath(r, now) {
    r.status = 'suddenDeath';
    r.game.suddenDeath = { startMove: r.game.moveCount, rounds: 0 };
    r.game.turn = r.game.firstSeat;
    r.clock.turnStartedAt = now;
    return r;
  }

  // Mutates r (already a clone): advance the turn, then apply end-of-game rules.
  function endTurn(r, seat, now, wentOut) {
    const g = r.game;
    g.moveCount += 1;
    g.turn = other(seat);
    r.clock.turnStartedAt = now;

    if (wentOut && r.status === 'live') {
      const lead = leader(r);
      return lead ? finalize(r, lead, 'bagOut', now) : enterSuddenDeath(r, now);
    }
    if (r.status === 'suddenDeath' && (g.moveCount - g.suddenDeath.startMove) % 2 === 0) {
      g.suddenDeath.rounds += 1;
      const lead = leader(r);
      if (lead) return finalize(r, lead, 'suddenDeath', now);
      if (g.suddenDeath.rounds >= SUDDEN_DEATH_MAX_ROUNDS) r.status = 'hostDecision';
    }
    return r;
  }

  // Applies a validated play without clock/turn-order guards (used by applyPlay and appeals).
  function playCore(room, seat, placements, now, unverified) {
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
    g.lastMove = { seat, type: 'play', words: m.words, total: m.total, unverified: !!unverified, at: now };
    const wentOut = g.racks[seat].length === 0 && g.bag.length === 0;
    return endTurn(r, seat, now, wentOut);
  }

  function applyPlay(room, seat, placements, { now, expectedMoveCount, unverified = false }) {
    if (!canAct(room, seat, expectedMoveCount, now)) return null;
    return playCore(room, seat, placements, now, unverified);
  }

  function applyPass(room, seat, { now, expectedMoveCount, timeout = false, expectedTurnStartedAt }) {
    if (!canAct(room, seat, expectedMoveCount, now)) return null;
    if (timeout) {
      if (room.clock.turnStartedAt !== expectedTurnStartedAt) return null;
      if (now < room.clock.turnStartedAt + TURN_MS) return null;
    }
    const r = clone(room);
    r.game.lastMove = { seat, type: timeout ? 'timeout' : 'pass', words: [], total: 0, unverified: false, at: now };
    return endTurn(r, seat, now, false);
  }

  function resolveTimeUp(room, now) {
    if (room.status !== 'live' || room.result || !room.clock || room.clock.paused) return null;
    if (now < room.clock.endsAt) return null;
    const lead = leader(room);
    if (lead) return finalize(room, lead, 'time', now);
    return enterSuddenDeath(clone(room), now);
  }

  // ---------- pause & appeals ----------

  function pausedSnapshot(room, now, by) {
    return {
      by,
      matchRemainingMs: room.clock.endsAt - now,
      turnRemainingMs: Math.max(0, TURN_MS - (now - room.clock.turnStartedAt))
    };
  }

  // Mutates r (a clone): restart both clocks from the stored remaining times.
  function resumeInPlace(r, now) {
    const p = r.clock.paused;
    r.clock.endsAt = now + p.matchRemainingMs;
    r.clock.turnStartedAt = now - (TURN_MS - p.turnRemainingMs);
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

  function resign(room, seat, now) {
    if (!DECIDABLE.includes(room.status)) return null;
    return finalize(room, other(seat), 'resign', now);
  }

  function awardWin(room, seat, now) {
    if (!DECIDABLE.includes(room.status)) return null;
    return finalize(room, seat, 'awarded', now);
  }

  function walkover(room, seat, now) {
    if (room.status !== 'waiting') return null;
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

  function correctResult(room, now, note = '') {
    if (room.status !== 'final' || !room.result) return null;
    const r = clone(room);
    const winner = other(r.result.winner);
    r.result.originalReason = r.result.originalReason || r.result.reason;
    r.result.winner = winner;
    r.result.teamId = winner === 'A' ? r.teamA : r.teamB;
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
      const winSeat = room.result.winner;
      const loseSeat = other(winSeat);
      const idOf = s => (s === 'A' ? room.teamA : room.teamB);
      const nameOf = s => (s === 'A' ? room.teamAName : room.teamBName);
      const w = ensure(idOf(winSeat), nameOf(winSeat));
      const l = ensure(idOf(loseSeat), nameOf(loseSeat));
      w.wins += 1; w.points += 1;
      l.losses += 1;
    }
    const list = Object.values(table).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    list.forEach((t, i) => {
      t.rank = i > 0 && list[i - 1].points === t.points ? list[i - 1].rank : i + 1;
    });
    return list;
  }

  return {
    CODE_ALPHABET, TURN_MS, SUDDEN_DEATH_MAX_ROUNDS,
    generateRoomCode, formatCode, normalizeCode, isRoomRecord, createRoom, normalizeRoom,
    claimSeat, setReady, removePlayer, leaveSeat, rejoinSeat, withTeamNames, startMatch,
    prepareMove, applyPlay, applyPass, resolveTimeUp, finalize,
    requestAppeal, resolveAppeal, pauseClocks, resumeClocks,
    resign, awardWin, walkover, voidRoom, correctResult, recordScreenLeave,
    roomPhase, computeStandings, isSeatOnline, watcherCount,
    _internal: { clone, other, playCore, enterSuddenDeath }
  };
});
