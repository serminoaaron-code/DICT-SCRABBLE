// Pure Scrabble rules: constants, bag, board map, placement validation,
// word finding and scoring. No DOM, no Firebase.
// Loads as a browser global (ScrabbleEngine) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScrabbleEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LETTER_VALUES = {
    A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
    N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10
  };

  const TILE_DISTRIBUTION = {
    A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2,
    N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1
  };

  const PREMIUM_GRID = [
    ['tw', '', '', 'dl', '', '', '', 'tw', '', '', '', 'dl', '', '', 'tw'],
    ['', 'dw', '', '', '', 'tl', '', '', '', 'tl', '', '', '', 'dw', ''],
    ['', '', 'dw', '', '', '', 'dl', '', 'dl', '', '', '', 'dw', '', ''],
    ['dl', '', '', 'dw', '', '', '', 'dl', '', '', '', 'dw', '', '', 'dl'],
    ['', '', '', '', 'dw', '', '', '', '', '', 'dw', '', '', '', ''],
    ['', 'tl', '', '', '', 'tl', '', '', '', 'tl', '', '', '', 'tl', ''],
    ['', '', 'dl', '', '', '', 'dl', '', 'dl', '', '', '', 'dl', '', ''],
    ['tw', '', '', 'dl', '', '', '', 'center', '', '', '', 'dl', '', '', 'tw'],
    ['', '', 'dl', '', '', '', 'dl', '', 'dl', '', '', '', 'dl', '', ''],
    ['', 'tl', '', '', '', 'tl', '', '', '', 'tl', '', '', '', 'tl', ''],
    ['', '', '', '', 'dw', '', '', '', '', '', 'dw', '', '', '', ''],
    ['dl', '', '', 'dw', '', '', '', 'dl', '', '', '', 'dw', '', '', 'dl'],
    ['', '', 'dw', '', '', '', 'dl', '', 'dl', '', '', '', 'dw', '', ''],
    ['', 'dw', '', '', '', 'tl', '', '', '', 'tl', '', '', '', 'dw', ''],
    ['tw', '', '', 'dl', '', '', '', 'tw', '', '', '', 'dl', '', '', 'tw']
  ];

  const BOARD_SIZE = 15;
  const CENTER = { r: 7, c: 7 };
  const RACK_SIZE = 7;
  const BINGO_BONUS = 50;

  function createBag(rng = Math.random) {
    const bag = [];
    for (const letter of Object.keys(TILE_DISTRIBUTION)) {
      for (let i = 0; i < TILE_DISTRIBUTION[letter]; i++) bag.push(letter);
    }
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
  }

  function drawTiles(bag, n) {
    const rest = bag.slice();
    const drawn = [];
    for (let i = 0; i < n && rest.length > 0; i++) drawn.push(rest.pop());
    return { drawn, bag: rest };
  }

  function key(r, c) { return r + '_' + c; }

  function getTile(board, r, c) {
    const v = board && board[key(r, c)];
    return v ? v : null;
  }

  function applyPlacements(board, placements) {
    const next = Object.assign({}, board);
    for (const p of placements) next[key(p.r, p.c)] = p.letter;
    return next;
  }

  function countLetters(letters) {
    const m = {};
    for (const l of letters) m[l] = (m[l] || 0) + 1;
    return m;
  }

  function rackHas(rack, letters) {
    const have = countLetters(rack || []);
    const need = countLetters(letters);
    return Object.keys(need).every(l => (have[l] || 0) >= need[l]);
  }

  function removeFromRack(rack, letters) {
    const rest = rack.slice();
    for (const l of letters) {
      const i = rest.indexOf(l);
      if (i !== -1) rest.splice(i, 1);
    }
    return rest;
  }

  return {
    LETTER_VALUES, TILE_DISTRIBUTION, PREMIUM_GRID, BOARD_SIZE, CENTER, RACK_SIZE, BINGO_BONUS,
    createBag, drawTiles, key, getTile, applyPlacements, rackHas, removeFromRack
  };
});
