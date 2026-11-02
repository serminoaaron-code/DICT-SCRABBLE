// Display names (QA pass, 2026-11-02): a team or player name is shown with at most MAX characters
// and then "…". Display only: Firebase keeps the full name (standings, renames, the room data), and
// titles / screen-reader text can still show it. CSS adds a width-based "…" as a safety net where
// even 25 characters don't fit (wide letters on a 360px phone).
//   short(name, max = MAX) -> the name, or its first max characters (code points) + "…"
// Loads as a browser global (Names) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Names = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX = 25;

  function short(name, max = MAX) {
    if (name === null || name === undefined) return '';
    const chars = Array.from(String(name));
    if (chars.length <= max) return chars.join('');
    return chars.slice(0, max).join('').trimEnd() + '…';
  }

  return { MAX, short };
});
