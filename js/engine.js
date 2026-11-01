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

  const ERROR_TEXT = {
    EMPTY: 'Place at least one tile first.',
    OUT_OF_BOUNDS: 'Tiles must be on the board.',
    OCCUPIED: 'That square already has a tile.',
    DUPLICATE_SQUARE: 'Two tiles cannot share a square.',
    NOT_IN_LINE: 'Tiles must be in one row or one column.',
    GAP: 'Your word cannot have gaps.',
    FIRST_MOVE_CENTER: 'First word must cover the ★ centre square.',
    NOT_CONNECTED: 'Your word must touch tiles already on the board.',
    NO_WORD: 'Words must be at least 2 letters long.',
    NOT_YOUR_TURN: 'It is not your turn.',
    NOT_IN_RACK: 'Those tiles are not on your rack.',
    PENDING: 'Waiting for the host to decide on the last move.'
  };

  function inBounds(r, c) { return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; }

  // Board tile or newly placed tile at (r, c).
  function tileAt(board, newMap, r, c) {
    return newMap[key(r, c)] || getTile(board, r, c);
  }

  function step(direction) { return direction === 'H' ? { dr: 0, dc: 1 } : { dr: 1, dc: 0 }; }

  // Cells of the maximal word through (r, c) along direction.
  function wordThrough(board, newMap, r, c, direction) {
    const { dr, dc } = step(direction);
    let sr = r, sc = c;
    while (inBounds(sr - dr, sc - dc) && tileAt(board, newMap, sr - dr, sc - dc)) { sr -= dr; sc -= dc; }
    const cells = [];
    let cr = sr, cc = sc;
    while (inBounds(cr, cc) && tileAt(board, newMap, cr, cc)) {
      const k = key(cr, cc);
      cells.push({ r: cr, c: cc, letter: tileAt(board, newMap, cr, cc), isNew: !!newMap[k] });
      cr += dr; cc += dc;
    }
    return cells;
  }

  function newMapOf(placements) {
    const m = {};
    for (const p of placements) m[key(p.r, p.c)] = p.letter;
    return m;
  }

  function hasNeighbor(board, r, c, direction) {
    const { dr, dc } = step(direction);
    return (inBounds(r - dr, c - dc) && !!getTile(board, r - dr, c - dc)) ||
           (inBounds(r + dr, c + dc) && !!getTile(board, r + dr, c + dc));
  }

  function validatePlacement(board, placements) {
    if (!placements || placements.length === 0) return { ok: false, error: 'EMPTY' };
    if (placements.some(p => !inBounds(p.r, p.c))) return { ok: false, error: 'OUT_OF_BOUNDS' };
    const seen = new Set();
    for (const p of placements) {
      const k = key(p.r, p.c);
      if (seen.has(k)) return { ok: false, error: 'DUPLICATE_SQUARE' };
      seen.add(k);
    }
    if (placements.some(p => getTile(board, p.r, p.c))) return { ok: false, error: 'OCCUPIED' };

    let direction;
    if (placements.length > 1) {
      if (placements.every(p => p.r === placements[0].r)) direction = 'H';
      else if (placements.every(p => p.c === placements[0].c)) direction = 'V';
      else return { ok: false, error: 'NOT_IN_LINE' };
    } else {
      const p = placements[0];
      direction = hasNeighbor(board, p.r, p.c, 'H') ? 'H' : (hasNeighbor(board, p.r, p.c, 'V') ? 'V' : 'H');
    }

    const newMap = newMapOf(placements);
    const idx = p => (direction === 'H' ? p.c : p.r);
    const sorted = placements.slice().sort((a, b) => idx(a) - idx(b));
    const first = sorted[0], last = sorted[sorted.length - 1];
    const { dr, dc } = step(direction);
    for (let r = first.r, c = first.c; r !== last.r || c !== last.c; r += dr, c += dc) {
      if (!tileAt(board, newMap, r, c)) return { ok: false, error: 'GAP' };
    }

    const boardEmpty = Object.keys(board || {}).length === 0;
    if (boardEmpty) {
      if (!newMap[key(CENTER.r, CENTER.c)]) return { ok: false, error: 'FIRST_MOVE_CENTER' };
    } else {
      const touches = placements.some(p => hasNeighbor(board, p.r, p.c, 'H') || hasNeighbor(board, p.r, p.c, 'V'));
      if (!touches) return { ok: false, error: 'NOT_CONNECTED' };
    }

    if (findWords(board, placements, direction).length === 0) return { ok: false, error: 'NO_WORD' };
    return { ok: true, direction };
  }

  function findWords(board, placements, direction) {
    const newMap = newMapOf(placements);
    const words = [];
    const toWord = cells => ({ word: cells.map(x => x.letter).join(''), cells });
    const main = wordThrough(board, newMap, placements[0].r, placements[0].c, direction);
    if (main.length >= 2) words.push(toWord(main));
    const cross = direction === 'H' ? 'V' : 'H';
    for (const p of placements) {
      const cells = wordThrough(board, newMap, p.r, p.c, cross);
      if (cells.length >= 2) words.push(toWord(cells));
    }
    return words;
  }

  function scoreWord(cells) {
    let sum = 0, mult = 1;
    for (const cell of cells) {
      let v = LETTER_VALUES[cell.letter] || 0;
      if (cell.isNew) {
        const sq = PREMIUM_GRID[cell.r][cell.c];
        if (sq === 'dl') v *= 2;
        else if (sq === 'tl') v *= 3;
        else if (sq === 'dw' || sq === 'center') mult *= 2;
        else if (sq === 'tw') mult *= 3;
      }
      sum += v;
    }
    return sum * mult;
  }

  function scoreMove(board, placements) {
    const v = validatePlacement(board, placements);
    if (!v.ok) return { ok: false, error: v.error, words: [], total: 0, bingo: false };
    const words = findWords(board, placements, v.direction).map(w => ({ word: w.word, score: scoreWord(w.cells) }));
    const bingo = placements.length === RACK_SIZE;
    const total = words.reduce((s, w) => s + w.score, 0) + (bingo ? BINGO_BONUS : 0);
    return { ok: true, words, total, bingo };
  }

  return {
    LETTER_VALUES, TILE_DISTRIBUTION, PREMIUM_GRID, BOARD_SIZE, CENTER, RACK_SIZE, BINGO_BONUS, ERROR_TEXT,
    createBag, drawTiles, key, getTile, applyPlacements, rackHas, removeFromRack,
    validatePlacement, findWords, scoreMove
  };
});
