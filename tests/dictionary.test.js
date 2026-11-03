const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/dictionary.js');

const okResp = { status: 200, ok: true };
const notFound = { status: 404, ok: false };
const W = (...ws) => ws.map(word => ({ word })); // horizontal words: no bottom-to-top reading

test('404 rejects a word', async () => {
  const fetchFn = async url => (url.endsWith('/zz') ? notFound : okResp);
  const res = await D.checkPlay(W('CAT', 'ZZ'), { fetchFn });
  assert.deepStrictEqual(res, { rejected: ['ZZ'], unverified: false, spellings: W('CAT', 'ZZ') });
});

test('requests use the lowercased word', async () => {
  const urls = [];
  await D.checkPlay(W('CAT'), { fetchFn: async url => { urls.push(url); return okResp; } });
  assert.deepStrictEqual(urls, ['https://api.dictionaryapi.dev/api/v2/entries/en/cat']);
});

test('network error marks unverified, not rejected', async () => {
  const fetchFn = async () => { throw new TypeError('Failed to fetch'); };
  assert.deepStrictEqual(await D.checkPlay(W('CAT'), { fetchFn }), { rejected: [], unverified: true, spellings: W('CAT') });
});

test('server error marks unverified, not rejected', async () => {
  const fetchFn = async () => ({ status: 500, ok: false });
  assert.deepStrictEqual(await D.checkPlay(W('CAT'), { fetchFn }), { rejected: [], unverified: true, spellings: W('CAT') });
});

test('hanging fetch resolves unverified after timeout', async () => {
  const fetchFn = () => new Promise(() => {});
  const started = Date.now();
  const res = await D.checkPlay(W('CAT'), { fetchFn, timeoutMs: 20 });
  assert.deepStrictEqual(res, { rejected: [], unverified: true, spellings: W('CAT') });
  assert.ok(Date.now() - started < 1000);
});

test('duplicate words are fetched once', async () => {
  let calls = 0;
  await D.checkPlay(W('CAT', 'cat', 'CAT'), { fetchFn: async () => { calls++; return okResp; } });
  assert.strictEqual(calls, 1);
});

// ---------- checkPlay: bottom-to-top words (2026-11-03) ----------

// fetchFn from a table of lowercase word -> 'ok' | 'gone' | 'error' | 'throw' (missing = 404).
function fake(table, urls = []) {
  return async url => {
    const w = url.slice(url.lastIndexOf('/') + 1);
    urls.push(w);
    const v = table[w];
    if (v === 'ok') return okResp;
    if (v === 'error') return { status: 500, ok: false };
    if (v === 'throw') throw new TypeError('Failed to fetch');
    return notFound;
  };
}

test('checkPlay: bottom-to-top word is accepted as its reverse', async () => {
  const res = await D.checkPlay([{ word: 'YFIREV', score: 30, back: 'VERIFY' }], { fetchFn: fake({ verify: 'ok' }) });
  assert.deepStrictEqual(res, { rejected: [], unverified: false, spellings: [{ word: 'VERIFY' }] });
});

test('checkPlay: both readings', async () => {
  const res = await D.checkPlay([{ word: 'STOP', back: 'POTS' }], { fetchFn: fake({ stop: 'ok', pots: 'ok' }) });
  assert.deepStrictEqual(res, { rejected: [], unverified: false, spellings: [{ word: 'STOP', alt: 'POTS' }] });
});

test('checkPlay: neither reading is rejected', async () => {
  const res = await D.checkPlay([{ word: 'XQZV', back: 'VZQX' }], { fetchFn: fake({}) });
  assert.deepStrictEqual(res, { rejected: ['XQZV'], unverified: false, spellings: [{ word: 'XQZV' }] });
});

test('checkPlay: right-to-left is not tried', async () => {
  const urls = [];
  const res = await D.checkPlay([{ word: 'TAC' }], { fetchFn: fake({ cat: 'ok' }, urls) });
  assert.deepStrictEqual(res.rejected, ['TAC']);
  assert.deepStrictEqual(urls, ['tac']);
});

test('checkPlay: cross-word reads bottom-to-top', async () => {
  const res = await D.checkPlay([{ word: 'CAT' }, { word: 'AB', back: 'BA' }], { fetchFn: fake({ cat: 'ok', ba: 'ok' }) });
  assert.deepStrictEqual(res, { rejected: [], unverified: false, spellings: [{ word: 'CAT' }, { word: 'BA' }] });
});

test('checkPlay: forward unverified, reverse confirmed', async () => {
  const res = await D.checkPlay([{ word: 'YFIREV', back: 'VERIFY' }], { fetchFn: fake({ yfirev: 'error', verify: 'ok' }) });
  assert.deepStrictEqual(res, { rejected: [], unverified: false, spellings: [{ word: 'VERIFY' }] });
});

test('checkPlay: forward confirmed, reverse unverified', async () => {
  const res = await D.checkPlay([{ word: 'STOP', back: 'POTS' }], { fetchFn: fake({ stop: 'ok', pots: 'throw' }) });
  assert.deepStrictEqual(res, { rejected: [], unverified: false, spellings: [{ word: 'STOP' }] });
});

test('checkPlay: nothing confirmed and not fully rejected is unverified', async () => {
  const res = await D.checkPlay([{ word: 'YFIREV', back: 'VERIFY' }], { fetchFn: fake({ verify: 'throw' }) });
  assert.deepStrictEqual(res, { rejected: [], unverified: true, spellings: [{ word: 'YFIREV' }] });
});

test('checkPlay: each string fetched once, in parallel', async () => {
  const urls = [];
  let inFlight = 0, most = 0;
  const fetchFn = async url => { inFlight++; most = Math.max(most, inFlight); urls.push(url); await new Promise(r => setTimeout(r, 5)); inFlight--; return okResp; };
  await D.checkPlay([{ word: 'AB', back: 'BA' }, { word: 'BA', back: 'AB' }], { fetchFn });
  assert.strictEqual(urls.length, 2);
  assert.strictEqual(most, 2);
});
