// Pure local tile order for the player's rack (feature #6, Shuffle). The order lives only on
// this device: it never goes to Firebase, and the rack in the room data keeps its own order.
// An order is a list of rack indices, so selection, placement and Recall keep using rack indices.
//   sync(prev, rack)     -> { key, order }: prev when the rack's letters are unchanged, else identity
//   shuffle(order, rng)  -> a new permutation that differs from order (when it has 2+ tiles)
// Loads as a browser global (Rack) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Rack = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const identity = n => Array.from({ length: n }, (_, i) => i);
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  function sync(prev, rack) {
    const key = rack.join(',');
    if (prev && prev.key === key && Array.isArray(prev.order) && prev.order.length === rack.length) return prev;
    return { key, order: identity(rack.length) };
  }

  function shuffle(order, rng = Math.random) {
    if (order.length < 2) return order.slice();
    for (let attempt = 0; attempt < 10; attempt++) {
      const next = order.slice();
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      if (!same(next, order)) return next;
    }
    return order.slice(1).concat(order[0]); // rotate by one: always different
  }

  // Drag within the rack (feature #5): the tile at display position `from` goes to insertion
  // position `to` (0..length, counted before it is removed). Returns a new order.
  function move(order, from, to) {
    const next = order.slice();
    const [tile] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, tile);
    return next;
  }

  // After your own play (turn moments #3): the tiles you didn't use keep their places on this
  // device (Shuffle / drag order included) and the tiles drawn from the bag go into the slots you
  // used. The server keeps the unused letters first, in order (Engine.removeFromRack removes the
  // first copy of each played letter), then the drawn ones; kept tiles are matched by letter, so it
  // doesn't matter which copy of a repeated letter the server removed.
  //   prev: { key, order } over prevRack, used: rack indices you played.
  //   -> { key, order, fresh } (fresh: new rack indices that were just drawn), or null when the
  //      new rack doesn't fit the play (the caller falls back to sync).
  function refill(prev, prevRack, rack, used) {
    if (!prev || !Array.isArray(prev.order) || prev.order.length !== prevRack.length) return null;
    const usedSet = new Set(used);
    const keptCount = prevRack.length - usedSet.size;
    if (keptCount < 0 || keptCount > rack.length) return null;
    const pool = {}; // letter -> new indices of the kept tiles, in order
    for (let j = 0; j < keptCount; j++) (pool[rack[j]] = pool[rack[j]] || []).push(j);
    const drawn = [];
    for (let j = keptCount; j < rack.length; j++) drawn.push(j);
    const order = [], fresh = [];
    for (const o of prev.order) {
      if (usedSet.has(o)) {
        if (drawn.length) { const d = drawn.shift(); order.push(d); fresh.push(d); }
        continue; // the bag ran out: this slot goes
      }
      const list = pool[prevRack[o]];
      if (!list || !list.length) return null; // a kept letter is missing: not this play
      order.push(list.shift());
    }
    for (const d of drawn) { order.push(d); fresh.push(d); }
    if (order.length !== rack.length) return null;
    return { key: rack.join(','), order, fresh };
  }

  return { sync, shuffle, move, refill };
});
