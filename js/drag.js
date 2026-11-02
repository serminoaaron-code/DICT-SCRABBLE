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

  // ---------- pointer controller (browser only) ----------
  // hooks: source(el) -> from|null, context() -> { myTurn, locked, occupied }, start(from),
  //        finish(action), returnRect(from) -> DOMRect|null.
  // One pointer at a time (mouse, finger or pen). The drag's state lives in `from` (indices), never
  // in DOM nodes, so the room re-rendering mid-drag is harmless. The floating copy (.drag-ghost)
  // is built with textContent. A press that moves less than THRESHOLD_PX stays a tap (click).
  function attach(rootEl, hooks) {
    const doc = root.document;
    const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let press = null;      // pointer down on a draggable tile, not yet moved far enough
    let drag = null;       // an active drag
    let settling = null;   // the ghost flying back to the rack; new drags wait
    let swallowClick = false;

    const point = ev => ({ x: ev.clientX, y: ev.clientY });

    function onDown(ev) {
      if (press || drag || settling || !ev.isPrimary) return;
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      const from = hooks.source(ev.target);
      if (!from) return;
      const tile = ev.target.closest('.tile');
      if (!tile) return;
      if (ev.pointerType === 'mouse') ev.preventDefault(); // no text selection while dragging
      const sub = tile.querySelector('.sub');
      press = {
        id: ev.pointerId, type: ev.pointerType, from, start: point(ev),
        rect: tile.getBoundingClientRect(), fontSize: root.getComputedStyle(tile).fontSize,
        letter: (tile.firstChild && tile.firstChild.nodeType === 3 ? tile.firstChild.textContent : '').trim(),
        sub: sub ? sub.textContent : ''
      };
      root.addEventListener('pointermove', onMove, true);
      root.addEventListener('pointerup', onUp, true);
      root.addEventListener('pointercancel', onCancel, true);
      doc.addEventListener('keydown', onKey, true);
    }

    function begin(ev) {
      const p = press;
      const ghost = doc.createElement('div');
      ghost.className = 'tile drag-ghost';
      ghost.textContent = p.letter;
      const s = doc.createElement('span');
      s.className = 'sub';
      s.textContent = p.sub;
      ghost.appendChild(s);
      ghost.style.width = p.rect.width + 'px';
      ghost.style.height = p.rect.height + 'px';
      ghost.style.fontSize = p.fontSize;
      // A finger would hide the tile: it floats above the touch point, and lands where it is seen.
      const lift = p.type === 'mouse' ? 0 : Math.round(p.rect.height * 0.8 + 16);
      drag = { from: p.from, id: p.id, ghost, lift, w: p.rect.width, last: point(ev) };
      press = null;
      doc.body.appendChild(ghost);
      doc.body.classList.add('tile-dragging');
      hooks.start(drag.from);
      place(ev);
    }

    function place(ev) {
      const { x, y } = point(ev);
      drag.last = { x, y };
      const to = target(x, y - drag.lift);
      // Over the board it shrinks to the square, so the green / red ring around the square shows.
      const scale = to.kind === 'square' ? Math.max(0.5, to.el.getBoundingClientRect().width / drag.w) : 1.15;
      drag.ghost.style.transform = `translate(${x}px, ${y - drag.lift}px) translate(-50%, -50%) scale(${scale})`;
      highlight(to);
    }

    // What lies under (x, y): a board square, the rack (with the insertion position), or nothing.
    function target(x, y) {
      const el = doc.elementFromPoint(x, y);
      if (!el || !rootEl.contains(el)) return { kind: 'none' };
      const sq = el.closest('#board-container .sq[data-r]');
      if (sq) return { kind: 'square', r: Number(sq.dataset.r), c: Number(sq.dataset.c), el: sq };
      const rack = el.closest('#rack');
      if (rack) return { kind: 'rack', pos: rackPos(rack, x), el: rack };
      return { kind: 'none' };
    }

    // Insertion position from the tiles' layout centres (offsetLeft ignores the make-room shift).
    function rackPos(rack, x) {
      const tiles = [...rack.querySelectorAll('.tile')];
      let pos = 0;
      for (const t of tiles) {
        const parent = t.offsetParent ? t.offsetParent.getBoundingClientRect() : { left: 0 };
        if (x - parent.left > t.offsetLeft + t.offsetWidth / 2) pos++;
      }
      return pos;
    }

    function clearMarks() {
      rootEl.querySelectorAll('.drop-ok, .drop-bad').forEach(e => e.classList.remove('drop-ok', 'drop-bad'));
      rootEl.querySelectorAll('#rack .room-l, #rack .room-r').forEach(e => e.classList.remove('room-l', 'room-r'));
    }

    function highlight(to) {
      clearMarks();
      if (to.kind === 'square') {
        const own = drag.from.kind === 'board' && drag.from.r === to.r && drag.from.c === to.c;
        if (!own) to.el.classList.add(decide(Object.assign({ from: drag.from, to }, hooks.context())).type === 'return' ? 'drop-bad' : 'drop-ok');
      } else if (to.kind === 'rack' && !reduced()) {
        [...to.el.querySelectorAll('.tile')].forEach((t, i) => t.classList.add(i < to.pos ? 'room-l' : 'room-r'));
      }
    }

    function onMove(ev) {
      if (ev.pointerId !== (drag ? drag.id : press && press.id)) return;
      if (drag) { ev.preventDefault(); return place(ev); }
      const dx = ev.clientX - press.start.x, dy = ev.clientY - press.start.y;
      if (Math.hypot(dx, dy) >= THRESHOLD_PX) begin(ev);
    }

    function stopListening() {
      root.removeEventListener('pointermove', onMove, true);
      root.removeEventListener('pointerup', onUp, true);
      root.removeEventListener('pointercancel', onCancel, true);
      doc.removeEventListener('keydown', onKey, true);
    }

    function onUp(ev) {
      if (ev.pointerId !== (drag ? drag.id : press && press.id)) return;
      if (!drag) { press = null; stopListening(); return; } // a tap: the click handlers take it
      const to = target(drag.last.x, drag.last.y - drag.lift);
      drop(decide(Object.assign({ from: drag.from, to }, hooks.context())));
    }

    function onCancel(ev) {
      if (ev.pointerId !== (drag ? drag.id : press && press.id)) return;
      if (!drag) { press = null; stopListening(); return; }
      drop(BACK);
    }

    function onKey(ev) { if (ev.key === 'Escape' && drag) drop(BACK); }

    // Ends the drag. Place / move / reorder: the room shows the result at once (the placed tile
    // bounces in). Return / unplace: the floating tile first flies back to its rack slot.
    function drop(action) {
      stopListening();
      clearMarks();
      const d = drag;
      drag = null;
      doc.body.classList.remove('tile-dragging');
      swallowClick = true;
      setTimeout(() => { swallowClick = false; }, 60);
      const back = action.type === 'return' || action.type === 'unplace';
      const dest = back ? hooks.returnRect(d.from) : null;
      if (!back || !dest || reduced() || !d.ghost.animate) {
        d.ghost.remove();
        hooks.finish(action);
        return;
      }
      settling = d.ghost;
      const to = `translate(${dest.left + dest.width / 2}px, ${dest.top + dest.height / 2}px) translate(-50%, -50%) scale(1)`;
      const anim = d.ghost.animate([{ transform: d.ghost.style.transform }, { transform: to }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
      const done = () => { if (settling !== d.ghost) return; settling = null; d.ghost.remove(); hooks.finish(action); };
      anim.onfinish = done;
      setTimeout(done, 400); // in case the animation never reports back
    }

    // After a real drag the browser may still fire a click on the tile: it must not also select or place.
    function onClick(ev) {
      if (!swallowClick) return;
      swallowClick = false;
      ev.stopPropagation();
      ev.preventDefault();
    }

    rootEl.addEventListener('pointerdown', onDown);
    rootEl.addEventListener('click', onClick, true);
    return function detach() {
      rootEl.removeEventListener('pointerdown', onDown);
      rootEl.removeEventListener('click', onClick, true);
      stopListening();
      if (drag) { drag.ghost.remove(); doc.body.classList.remove('tile-dragging'); }
      if (settling) settling.remove();
    };
  }

  return { THRESHOLD_PX, decide, attach };
});
