// Guards on css/style.css that the QA findings of 2026-11-03 (mobile) depend on:
// tiles keep their points on phones, and the bonus squares use the soft palette the user picked (C1)
// with every label at WCAG AA on its square, in both themes.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// the bodies of every block whose selector is exactly `selector` (brace-matched), joined
function block(selector) {
  const bodies = [];
  for (let i = css.indexOf(selector + ' {'); i >= 0; i = css.indexOf(selector + ' {', i + 1)) {
    const open = css.indexOf('{', i);
    let depth = 0, j = open;
    for (; j < css.length; j++) { if (css[j] === '{') depth++; else if (css[j] === '}' && --depth === 0) break; }
    bodies.push(css.slice(open + 1, j));
  }
  assert.ok(bodies.length, `no "${selector}" block`);
  return bodies.join('\n');
}
const tokens = body => Object.fromEntries([...body.matchAll(/(--sq-[a-z-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)].map(m => [m[1], m[2].toLowerCase()]));

const lum = h => { const c = h.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const LIGHT = { '--sq-tw': '#fde1df', '--sq-tw-ink': '#b3170f', '--sq-dw': '#efe2fb', '--sq-dw-ink': '#6a2ea6',
  '--sq-tl': '#d9f2e4', '--sq-tl-ink': '#05703a', '--sq-dl': '#d5f3f8', '--sq-dl-ink': '#0a6273' };
const DARK = { '--sq-tw': '#5a2436', '--sq-tw-ink': '#ffb3ad', '--sq-dw': '#46285f', '--sq-dw-ink': '#dcb8ff',
  '--sq-tl': '#1c4a2c', '--sq-tl-ink': '#8fe3b6', '--sq-dl': '#0d4f5e', '--sq-dl-ink': '#86e6f5' };
const themes = () => ({ light: { ...tokens(block(':root')), ...tokens(block('html[data-theme="light"]')) },
  dark: { ...tokens(block(':root')), ...tokens(block('html[data-theme="dark"]')) } });

const help = fs.readFileSync(path.join(__dirname, '..', 'css', 'help.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
// every rule (selector + body) in a stylesheet, media blocks flattened
const rules = src => [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));

test('phones keep the tile points (no hidden .sub at 480px), at a readable size', () => {
  const phone = block('@media (max-width: 480px)');
  const board = rules(phone).find(r => r.sel === '.tile .sub');
  assert.ok(board, 'the phone block sizes the board tile points');
  const m = /font-size\s*:\s*([\d.]+)px/.exec(board.body);
  assert.ok(m && Number(m[1]) >= 6, 'a phone size for the board tile points');
});

test('tile points are never hidden, at any width', () => {
  for (const r of rules(css).filter(r => /\.sub\b/.test(r.sel))) {
    assert.doesNotMatch(r.body, /display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(px)?\s*(;|$)/, r.sel);
  }
});

test('every bonus-square rule (board, legend, big screen, How to play) colours it with the tokens only', () => {
  const sq = { tw: 'tw', dw: 'dw', center: 'dw', tl: 'tl', dl: 'dl', st: 'dw' };
  for (const r of [...rules(css), ...rules(help)]) {
    const m = /\.(?:gh-)?sq\.(tw|dw|tl|dl|center|st)\b/.exec(r.sel);
    if (!m) continue;
    const k = sq[m[1]];
    for (const d of r.body.matchAll(/(?:^|;)\s*(color|background(?:-color)?)\s*:\s*([^;]+)/g)) {
      const want = d[1] === 'color' ? `var(--sq-${k}-ink)` : `var(--sq-${k})`;
      assert.strictEqual(d[2].trim(), want, `${r.sel} ${d[1]}`);
    }
  }
  for (const k of ['tw', 'dw', 'tl', 'dl']) assert.match(help, new RegExp(`\\.gh-sq\\.${k}[^{]*\\{[^}]*color:\\s*var\\(--sq-${k}-ink\\)`), 'help ' + k);
});

// a ring is visible on a square when at least one of its bands is 3:1 against it (WCAG non-text contrast)
const hexes = body => Object.fromEntries([...body.matchAll(/(--[a-z-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)].map(m => [m[1], m[2].toLowerCase()]));
const tok = (theme, name) => ({ ...hexes(block(':root')), ...hexes(block(`html[data-theme="${theme}"]`)) })[name];
const colours = (theme, body) => [...body.matchAll(/var\((--[a-z-]+)\)|(#[0-9a-fA-F]{6})\b/g)].map(m => (m[2] ? m[2].toLowerCase() : tok(theme, m[1]))).filter(Boolean);
for (const [name, sel] of [['the drop ring (a tile dragged onto a square)', '.sq.drop-ok'], ['the big screen\'s last-move ring', '.bp-board .tile.bp-new']]) {
  test(`${name} stands out on every square in both themes`, () => {
    const r = rules(css).find(x => x.sel === sel);
    for (const theme of ['light', 'dark']) {
      const bands = colours(theme, r.body.replace(/#c9b78a/g, '')); // the projector tile's own shadow is not part of the ring
      for (const k of ['tw', 'dw', 'tl', 'dl', '']) {
        const sqc = k ? tok(theme, `--sq-${k}`) : tok(theme, '--sq');
        const best = Math.max(...bands.map(b => ratio(b, sqc)));
        assert.ok(best >= 3, `${theme} ${k || 'normal'}: best band ${best.toFixed(2)} (${bands.join(', ')})`);
      }
    }
  });
}

test('bonus squares: the picked colours (C1) in both themes', () => {
  const t = themes();
  for (const [k, v] of Object.entries(LIGHT)) assert.strictEqual(t.light[k], v, `light ${k}`);
  for (const [k, v] of Object.entries(DARK)) assert.strictEqual(t.dark[k], v, `dark ${k}`);
});

test('bonus labels pass AA (4.5:1) on their squares in both themes', () => {
  for (const [name, t] of Object.entries(themes())) for (const k of ['tw', 'dw', 'tl', 'dl']) {
    const r = ratio(t[`--sq-${k}`], t[`--sq-${k}-ink`]);
    assert.ok(r >= 4.5, `${name} ${k}: ${r.toFixed(2)}`);
  }
});

test('the board squares use the label tokens', () => {
  for (const k of ['dl', 'tl', 'dw', 'tw']) assert.match(css, new RegExp(`\\.sq\\.${k}[^{]*\\{[^}]*color:\\s*var\\(--sq-${k}-ink\\)`), k);
});
