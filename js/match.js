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

  function normalizeCode(input) { return String(input || '').toUpperCase().replace(/[\s-]/g, ''); }

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

  return {
    CODE_ALPHABET, TURN_MS, SUDDEN_DEATH_MAX_ROUNDS,
    generateRoomCode, formatCode, normalizeCode, createRoom, normalizeRoom,
    claimSeat, setReady, removePlayer, startMatch,
    _internal: { clone, other }
  };
});
