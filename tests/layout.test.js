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

test('boardPx: the largest square that fits below its top edge and left of the panel', () => {
  assert.strictEqual(Layout.boardPx({ vw: 1366, vh: 640, top: 60, left: 30 }), 568, 'height-limited laptop');
  assert.strictEqual(Layout.boardPx({ vw: 1920, vh: 950, top: 60, left: 30 }), 878, 'big screen');
  assert.strictEqual(Layout.boardPx({ vw: 1024, vh: 900, top: 60, left: 30 }), 542, 'width-limited: 1024 - 30 - 20 - 420 - 12');
  assert.strictEqual(Layout.boardPx({ vw: 1024, vh: 560, top: 400, left: 30 }), 220, 'never under the floor');
});
