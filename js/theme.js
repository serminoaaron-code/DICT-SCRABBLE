// Light/dark theme: pure resolution logic plus the browser-only glue that
// applies it to <html data-theme> and remembers the choice in localStorage.
// Loads as a browser global (Theme) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Theme = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const STORAGE_KEY = 'scrabble.theme';

  // Pure: the stored device choice wins; otherwise fall back to the device's
  // own light/dark setting. Anything else stored (unset, or junk) is treated
  // as "no choice made".
  function resolve(stored, prefersDark) {
    if (stored === 'light' || stored === 'dark') return stored;
    return prefersDark ? 'dark' : 'light';
  }

  function readStored() {
    try {
      return root.localStorage ? root.localStorage.getItem(STORAGE_KEY) : null;
    } catch (e) {
      return null;
    }
  }

  function writeStored(theme) {
    try {
      if (root.localStorage) root.localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) { /* storage unavailable (private mode, etc.) */ }
  }

  function prefersDarkScheme() {
    try {
      return !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (e) {
      return false;
    }
  }

  function apply(theme) {
    if (root.document && root.document.documentElement) {
      root.document.documentElement.dataset.theme = theme;
    }
  }

  // Sets document.documentElement.dataset.theme from the stored choice or
  // the device setting. Call once on boot.
  function init() {
    const theme = resolve(readStored(), prefersDarkScheme());
    apply(theme);
    return theme;
  }

  function current() {
    if (root.document && root.document.documentElement && root.document.documentElement.dataset.theme) {
      return root.document.documentElement.dataset.theme;
    }
    return resolve(readStored(), prefersDarkScheme());
  }

  // Flips the theme, applies it and remembers it for next time.
  function toggle() {
    const next = current() === 'dark' ? 'light' : 'dark';
    apply(next);
    writeStored(next);
    return next;
  }

  return { resolve, init, current, toggle };
});
