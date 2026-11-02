// Desktop landscape in-match layout (feature #9): the board is a square on the left, the game
// panel (PANEL_PX wide) on the right. Phones keep the one-column layout.
//   QUERY                          -> the media query; css/style.css uses the same string
//   isLandscape(w, h)              -> the same rule as QUERY, for a given window size
//   boardPx({ vh, top, width })    -> board size: fits below its top edge (vh: window height) and,
//                                     beside the gap + panel, in the game area's content width
//   landscapeNow()                 -> QUERY for the current window (browser only)
//   fitStage(overlay, areaEl)      -> puts a celebration / intro stage over the board (browser only)
// Loads as a browser global (Layout) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Layout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const QUERY = '(min-width: 1024px) and (min-height: 560px) and (orientation: landscape)';
  const PANEL_PX = 420;
  const GAP_PX = 20;
  const MARGIN_PX = 20; // the card's bottom padding + border, plus a little air

  const isLandscape = (w, h) => w >= 1024 && h >= 560 && w > h;

  function boardPx({ vh, top, width, minPx = 220 }) {
    const byHeight = vh - top - MARGIN_PX;
    const byWidth = width - GAP_PX - PANEL_PX;
    return Math.floor(Math.max(minPx, Math.min(byHeight, byWidth)));
  }

  function landscapeNow() {
    if (root.matchMedia) return root.matchMedia(QUERY).matches;
    return isLandscape(root.innerWidth || 0, root.innerHeight || 0);
  }

  // The stage box for a celebration / intro over the board: whole px, and k = one mockup px
  // (the celebration and intro mockups were drawn on a 280px-wide phone).
  function stageBox(rect) {
    const r = v => Math.round(v);
    return { left: r(rect.left), top: r(rect.top), width: r(rect.width), height: r(rect.height), k: rect.width / 280 };
  }

  // Desktop landscape only: puts an .fx-overlay's stage over areaEl (the board) at board scale.
  // Returns false, and changes nothing, on phones or without a board.
  function fitStage(overlay, areaEl) {
    if (!overlay || !areaEl || !areaEl.isConnected || !landscapeNow()) return false;
    const b = stageBox(areaEl.getBoundingClientRect());
    overlay.classList.add('fx-on-board');
    overlay.style.setProperty('--fx-left', b.left + 'px');
    overlay.style.setProperty('--fx-top', b.top + 'px');
    overlay.style.setProperty('--fx-w', b.width + 'px');
    overlay.style.setProperty('--fx-h', b.height + 'px');
    overlay.style.setProperty('--k', b.k + 'px');
    return true;
  }

  return { QUERY, PANEL_PX, GAP_PX, MARGIN_PX, isLandscape, boardPx, landscapeNow, stageBox, fitStage };
});
