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

  // Checks a play's words (Engine.scoreMove words: { word, back? }). A vertical word (back set) may
  // read top to bottom or bottom to top; both readings are checked at the same time, each string once.
  // spellings (aligned with words) is what Match.applyPlay stores: { word } — the reading that is a
  // word (the board reading first) — or { word, alt: back } when both are. A word is rejected only when
  // every reading is rejected; one with no confirmed reading and an unanswered check is unverified.
  async function checkPlay(words, { fetchFn = (...a) => root.fetch(...a), timeoutMs = 5000 } = {}) {
    const up = s => String(s || '').toUpperCase();
    const unique = [...new Set(words.flatMap(w => (w.back ? [up(w.word), up(w.back)] : [up(w.word)])))];
    const results = await Promise.all(unique.map(s => checkOne(s, fetchFn, timeoutMs)));
    const status = s => results[unique.indexOf(up(s))];
    const out = { rejected: [], unverified: false, spellings: [] };
    for (const w of words) {
      const f = status(w.word);
      const b = w.back ? status(w.back) : null;
      if (f === 'ok' && b === 'ok') out.spellings.push({ word: w.word, alt: w.back });
      else if (f === 'ok') out.spellings.push({ word: w.word });
      else if (b === 'ok') out.spellings.push({ word: w.back });
      else {
        out.spellings.push({ word: w.word });
        if (f === 'rejected' && (b === null || b === 'rejected')) out.rejected.push(up(w.word));
        else out.unverified = true;
      }
    }
    out.rejected = [...new Set(out.rejected)];
    return out;
  }

  return { checkWords, checkPlay };
});
