const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/dictionary.js');

const okResp = { status: 200, ok: true };
const notFound = { status: 404, ok: false };

test('404 rejects a word', async () => {
  const fetchFn = async url => (url.endsWith('/zz') ? notFound : okResp);
  const res = await D.checkWords(['CAT', 'ZZ'], { fetchFn });
  assert.deepStrictEqual(res, { rejected: ['ZZ'], unverified: false });
});

test('requests use the lowercased word', async () => {
  const urls = [];
  await D.checkWords(['CAT'], { fetchFn: async url => { urls.push(url); return okResp; } });
  assert.deepStrictEqual(urls, ['https://api.dictionaryapi.dev/api/v2/entries/en/cat']);
});

test('network error marks unverified, not rejected', async () => {
  const fetchFn = async () => { throw new TypeError('Failed to fetch'); };
  assert.deepStrictEqual(await D.checkWords(['CAT'], { fetchFn }), { rejected: [], unverified: true });
});

test('server error marks unverified, not rejected', async () => {
  const fetchFn = async () => ({ status: 500, ok: false });
  assert.deepStrictEqual(await D.checkWords(['CAT'], { fetchFn }), { rejected: [], unverified: true });
});

test('hanging fetch resolves unverified after timeout', async () => {
  const fetchFn = () => new Promise(() => {});
  const started = Date.now();
  const res = await D.checkWords(['CAT'], { fetchFn, timeoutMs: 20 });
  assert.deepStrictEqual(res, { rejected: [], unverified: true });
  assert.ok(Date.now() - started < 1000);
});

test('duplicate words are fetched once', async () => {
  let calls = 0;
  await D.checkWords(['CAT', 'cat', 'CAT'], { fetchFn: async () => { calls++; return okResp; } });
  assert.strictEqual(calls, 1);
});
