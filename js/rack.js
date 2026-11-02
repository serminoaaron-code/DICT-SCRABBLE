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

  return { sync, shuffle };
});
