// Word checks against the Free Dictionary API.
// 404 = rejected; network error, timeout or other status = accepted but unverified.
// Loads as a browser global (Dictionary) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Dictionary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
  const TIMEOUT = Symbol('timeout');

  async function checkOne(word, fetchFn, timeoutMs) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(TIMEOUT), timeoutMs); });
    try {
      const res = await Promise.race([
        fetchFn(API + encodeURIComponent(word.toLowerCase()), controller ? { signal: controller.signal } : undefined),
        timeout
      ]);
      if (res === TIMEOUT) {
        if (controller) controller.abort();
        return 'unverified';
      }
      if (res.status === 404) return 'rejected';
      return res.ok ? 'ok' : 'unverified';
    } catch (err) {
      return 'unverified';
    } finally {
      clearTimeout(timer);
    }
  }

  async function checkWords(words, { fetchFn = (...a) => root.fetch(...a), timeoutMs = 5000 } = {}) {
    const unique = [...new Set(words.map(w => String(w).toUpperCase()))];
    const results = await Promise.all(unique.map(w => checkOne(w, fetchFn, timeoutMs)));
    return {
      rejected: unique.filter((w, i) => results[i] === 'rejected'),
      unverified: results.includes('unverified')
    };
  }

  return { checkWords };
});
