// Chooses the Firebase data area. Local runs (localhost, LAN IPs, file://) use a separate
// playground area so testing never touches real tournament data. ?db=live|playground overrides.
// Loads as a browser global (Env) or a Node module.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Env = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LIVE = { root: 'scrabble', playground: false };
  const PLAYGROUND = { root: 'scrabble_playground', playground: true };

  function isLocalHost(hostname) {
    const h = String(hostname || '').replace(/^\[|\]$/g, '');
    if (h === '' || h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
    return /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  }

  function dataRoot(hostname, search) {
    const db = new URLSearchParams(search || '').get('db');
    if (db === 'live') return Object.assign({}, LIVE);
    if (db === 'playground') return Object.assign({}, PLAYGROUND);
    return Object.assign({}, isLocalHost(hostname) ? PLAYGROUND : LIVE);
  }

  return { dataRoot };
});
