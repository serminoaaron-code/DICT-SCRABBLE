// The one team line ("TEAM vs TEAM", or a 3-/4-WAY lineup) used by the host room cards, the lobby and the seat picker.
const test = require('node:test');
const assert = require('node:assert');
globalThis.Names = require('../js/names.js');
const TeamLine = require('../js/teamline.js');

const T = [{ seat: 'A', name: 'DICT-NCR' }, { seat: 'B', name: 'DICT-CAR' }, { seat: 'C', name: 'DICT-IV-A' }, { seat: 'D', name: 'DICT-RIV' }];
const chips = html => [...html.matchAll(/<span class="chip chip-([a-d]) tl-chip"/g)].map(m => m[1]);

test('2 teams: TEAM VS TEAM, no label and no seat numbers', () => {
  const h = TeamLine.html(T.slice(0, 2));
  assert.match(h, /class="teamline n2"/);
  assert.deepStrictEqual(chips(h), ['a', 'b']);
  assert.strictEqual((h.match(/class="tl-vs"/g) || []).length, 1);
  assert.doesNotMatch(h, /tl-lab|tl-num/);
});

test('3 and 4 teams: a "3-WAY / 4-WAY MATCH" label over chips numbered like the seats, no VS', () => {
  for (const n of [3, 4]) {
    const h = TeamLine.html(T.slice(0, n));
    assert.match(h, new RegExp(`class="teamline n${n}"`));
    assert.match(h, new RegExp(`<span class="tl-lab">${n}-WAY MATCH</span>`));
    assert.deepStrictEqual(chips(h), ['a', 'b', 'c', 'd'].slice(0, n));
    assert.deepStrictEqual([...h.matchAll(/<span class="tl-num"[^>]*>(\d)<\/span>/g)].map(m => m[1]), ['1', '2', '3', '4'].slice(0, n));
    assert.doesNotMatch(h, /tl-vs/);
  }
});

test('names are escaped, shown short (full name in the title), and the seat order is kept', () => {
  const long = 'National Capital Region Team Number One!!!!';
  const h = TeamLine.html([{ seat: 'B', name: '<img src=x onerror=alert(1)>' }, { seat: 'A', name: long }]);
  assert.doesNotMatch(h, /<img/);
  assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(h, new RegExp(`title="${long}"`));
  assert.match(h, new RegExp(`>${Names.short(long).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`));
  assert.deepStrictEqual(chips(h), ['b', 'a']);
});

test('seat letters outside A-D never reach the markup', () => {
  assert.deepStrictEqual(chips(TeamLine.html([{ seat: 'A', name: 'x' }, { seat: '"><b>', name: 'y' }])), ['a']);
});
