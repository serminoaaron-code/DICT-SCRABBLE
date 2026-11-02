const test = require('node:test');
const assert = require('node:assert');
const Layout = require('../js/layout.js');

test('QUERY is the one landscape rule shared with the CSS', () => {
  assert.strictEqual(Layout.QUERY, '(min-width: 1024px) and (min-height: 560px) and (orientation: landscape)');
});

test('isLandscape: laptops and desktops yes; phones, portrait tablets, narrow or square windows no', () => {
  assert.strictEqual(Layout.isLandscape(1366, 640), true);
  assert.strictEqual(Layout.isLandscape(1024, 560), true);
  assert.strictEqual(Layout.isLandscape(1023, 700), false, 'under 1024 wide');
  assert.strictEqual(Layout.isLandscape(1366, 559), false, 'under 560 tall');
  assert.strictEqual(Layout.isLandscape(800, 1280), false, 'portrait tablet');
  assert.strictEqual(Layout.isLandscape(915, 412), false, 'phone in landscape');
  assert.strictEqual(Layout.isLandscape(600, 600), false, 'not wider than tall');
});

// width: the game area's content width (the grid holding board + gap + panel); MARGIN_PX keeps the
// card's bottom padding and border inside the window.
test('boardPx: the largest square that fits below its top edge and beside the panel', () => {
  assert.strictEqual(Layout.MARGIN_PX, 20);
  assert.strictEqual(Layout.boardPx({ vh: 640, top: 60, width: 1300 }), 560, 'height-limited laptop: 640 - 60 - 20');
  assert.strictEqual(Layout.boardPx({ vh: 950, top: 60, width: 1850 }), 870, 'big screen');
  assert.strictEqual(Layout.boardPx({ vh: 900, top: 60, width: 960 }), 520, 'width-limited: 960 - 20 gap - 420 panel');
  assert.strictEqual(Layout.boardPx({ vh: 560, top: 400, width: 960 }), 220, 'never under the floor');
});
