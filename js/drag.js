// Drag-and-drop tiles (feature #5): rack -> empty square (place), placed tile -> another square
// (move) or back to the rack (unplace), and within the rack (reorder, any time, local only).
// Nothing is written to Firebase; Play word still sends the placement.
//   THRESHOLD_PX                      -> movement before a press becomes a drag (a shorter one is a tap)
//   decide({ from, to, myTurn, locked, occupied }) -> what a drop means (pure)
//     from: { kind: 'rack', index } | { kind: 'board', r, c }    (index = rack index)
//     to:   { kind: 'square', r, c } | { kind: 'rack', pos } | { kind: 'none' }
//     -> { type: 'place', index, r, c } | { type: 'move', from: { r, c }, r, c }
//        | { type: 'unplace', r, c } | { type: 'reorder', index, pos } | { type: 'return' }
//   attach(rootEl, hooks)             -> pointer controller (browser only); returns detach()
// Loads as a browser global (Drag) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Drag = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const THRESHOLD_PX = 6;
  const BACK = { type: 'return' };

  function decide({ from, to, myTurn, locked, occupied }) {
    if (!from || !to) return BACK;
    const canPlace = myTurn && !locked;
    if (from.kind === 'rack') {
      if (to.kind === 'rack') return { type: 'reorder', index: from.index, pos: to.pos };
      if (to.kind === 'square' && canPlace && !occupied(to.r, to.c)) return { type: 'place', index: from.index, r: to.r, c: to.c };
      return BACK;
    }
    if (from.kind === 'board') {
      if (to.kind === 'rack') return { type: 'unplace', r: from.r, c: from.c };
      const same = to.kind === 'square' && to.r === from.r && to.c === from.c;
      if (to.kind === 'square' && !same && canPlace && !occupied(to.r, to.c)) return { type: 'move', from: { r: from.r, c: from.c }, r: to.r, c: to.c };
    }
    return BACK;
  }

  function attach() { return () => {}; } // Task 2

  return { THRESHOLD_PX, decide, attach };
});
