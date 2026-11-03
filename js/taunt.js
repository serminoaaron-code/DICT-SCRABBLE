// Emoji taunts (batch 5): three of our own animated faces (Angry, LOL, Crying), drawn as inline SVG and
// moved by CSS (css/fx.css). Live only: the room keeps each seat's latest taunt (Match.taunt), and a
// view shows one only when it arrives, never on its first render (a refresh or late join shows nothing).
//
// Pure parts (Node-testable): IDS, LABELS, SHOW_MS, LATE_MS, cooldownLeft, canSend, arrivals, box.
// DOM parts: face, show, clear. Nothing touches the DOM at load time.
// Loads as a browser global (Taunt) or a Node module.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Taunt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const Match = typeof require === 'function' ? require('./match.js') : root.Match;

  const IDS = Match.TAUNTS; // one list, owned by Match
  const LABELS = { angry: 'Angry', lol: 'LOL', cry: 'Crying' };
  const SHOW_MS = 2500; // on screen
  const LATE_MS = 3000; // a taunt arriving later than this (slow connection) is skipped

  // ---------- pure ----------

  // ms until `seat` may taunt again (0 = now), from the room data, so a refresh keeps the cooldown.
  function cooldownLeft(room, seat, now) {
    const last = room && room.taunts && room.taunts[seat];
    return last ? Math.max(0, last.at + Match.TAUNT_COOLDOWN_MS - now) : 0;
  }

  // The same rule as Match.taunt (status, intro over and not frozen, seat, cooldown), without copying the room.
  function canSend(room, seat, now) {
    return Match.tauntAllowed(room, seat, now);
  }

  // What this view should show now. seen = { A, B, … } (last `at` per seat of the room) or null on the
  // first render, which only sets the baseline. Returns the new seen and the taunts to show, A first.
  function arrivals(seen, room, now) {
    const t = (room && room.taunts) || {};
    const SEATS = Match.seatsOf(room);
    const next = {};
    const show = [];
    for (const s of SEATS) {
      const cur = t[s] || null;
      next[s] = cur ? cur.at : null;
      if (!seen || !cur) continue;
      const prev = seen[s];
      if ((prev === null || prev === undefined || cur.at > prev) && now - cur.at <= LATE_MS) show.push({ seat: s, e: cur.e, at: cur.at });
    }
    if (seen) for (const s of SEATS) if (next[s] === null && seen[s] !== undefined) next[s] = seen[s];
    return { seen: next, show };
  }

  // Where the face goes: on the score bar, centred on the sender's side, `scale` x the bar's height
  // (about 66px on a phone). Kept inside the window. Whole px.
  function box(sideRect, barRect, vw, scale = 1.5) {
    const size = Math.max(44, Math.min(160, Math.round(barRect.height * scale)));
    const mid = sideRect.left + sideRect.width / 2;
    const left = Math.round(Math.max(0, Math.min(vw - size, mid - size / 2)));
    const top = Math.round(barRect.top + barRect.height / 2 - size / 2);
    return { left, top, size };
  }

  // ---------- DOM ----------

  const doc = () => root.document;
  const reducedMotion = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Static markup (no user text): our own faces, after the approved mockup.
  const SVG = {
    angry: '<g class="tf-an-face"><circle class="tf-an-red" cx="50" cy="55" r="38" fill="#ff6a3d"/>'
      + '<path d="M28 40 L44 47" stroke="#2b0a00" stroke-width="6" stroke-linecap="round"/><path d="M72 40 L56 47" stroke="#2b0a00" stroke-width="6" stroke-linecap="round"/>'
      + '<circle cx="38" cy="54" r="5" fill="#2b0a00"/><circle cx="62" cy="54" r="5" fill="#2b0a00"/>'
      + '<path d="M36 76 Q50 64 64 76" stroke="#2b0a00" stroke-width="6" fill="none" stroke-linecap="round"/></g>'
      + '<circle class="tf-an-steam" cx="20" cy="22" r="7" fill="#d4d8e0"/><circle class="tf-an-steam tf-s2" cx="80" cy="22" r="7" fill="#d4d8e0"/>',
    lol: '<g class="tf-lol-face"><circle cx="50" cy="52" r="38" fill="#ffcc33"/>'
      + '<path d="M30 44 Q37 36 44 44" stroke="#3a2600" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M56 44 Q63 36 70 44" stroke="#3a2600" stroke-width="5" fill="none" stroke-linecap="round"/>'
      + '<path d="M30 58 Q50 86 70 58 Z" fill="#7a1f00"/><path d="M38 72 Q50 80 62 72" fill="#ff7a8a"/>'
      + '<circle class="tf-lol-tear" style="--dx:-12px" cx="26" cy="50" r="5" fill="#5ec8ff"/><circle class="tf-lol-tear tf-r" style="--dx:12px" cx="74" cy="50" r="5" fill="#5ec8ff"/></g>',
    cry: '<g class="tf-cry-face"><circle cx="50" cy="52" r="38" fill="#ffcc33"/>'
      + '<path d="M30 46 Q37 52 44 46" stroke="#3a2600" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M56 46 Q63 52 70 46" stroke="#3a2600" stroke-width="5" fill="none" stroke-linecap="round"/>'
      + '<path d="M36 74 Q43 66 50 72 Q57 66 64 74" stroke="#3a2600" stroke-width="5" fill="none" stroke-linecap="round"/>'
      + '<path class="tf-cry-stream" d="M37 52 L35 88" stroke="#5ec8ff" stroke-width="6" stroke-linecap="round"/><path class="tf-cry-stream" d="M63 52 L65 88" stroke="#5ec8ff" stroke-width="6" stroke-linecap="round"/>'
      + '<circle class="tf-cry-drop" cx="35" cy="90" r="4" fill="#5ec8ff"/><circle class="tf-cry-drop tf-r" cx="65" cy="90" r="4" fill="#5ec8ff"/></g>'
  };

  function face(id) {
    const d = doc();
    if (!d || !IDS.includes(id)) return null;
    const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'tf tf-' + id);
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = SVG[id];
    return svg;
  }

  const shown = {}; // seat -> { el, timer }

  function removeSeat(seat) {
    const cur = shown[seat];
    if (!cur) return;
    clearTimeout(cur.timer);
    cur.el.remove();
    delete shown[seat];
  }

  // Shows `info` = { seat, e, name } on the score bar: anchorEl = the sender's side, barEl = the bar.
  // opts.scale (default 1.5). Fixed on document.body (not inside the 520px game column), never takes taps,
  // replaces this seat's face still on screen and removes itself after SHOW_MS. Returns false without anchors.
  function show(anchorEl, barEl, info, opts = {}) {
    const d = doc();
    if (!d || !anchorEl || !barEl || !info || !IDS.includes(info.e)) return false;
    const b = box(anchorEl.getBoundingClientRect(), barEl.getBoundingClientRect(), root.innerWidth || 0, opts.scale || 1.5);
    removeSeat(info.seat);
    const wrap = d.createElement('div');
    wrap.className = 'taunt taunt-' + info.seat + (reducedMotion() ? ' fx-reduced' : '');
    wrap.setAttribute('aria-hidden', 'true'); // screen readers hear the view's lasting #tauntLive region instead (Taunt.text)
    Object.assign(wrap.style, { left: b.left + 'px', top: b.top + 'px', width: b.size + 'px', height: b.size + 'px' });
    wrap.appendChild(face(info.e));
    if (info.name) {
      const tag = d.createElement('div');
      tag.className = 'taunt-tag';
      tag.textContent = info.name;
      wrap.appendChild(tag);
    }
    d.body.appendChild(wrap);
    shown[info.seat] = { el: wrap, timer: setTimeout(() => removeSeat(info.seat), SHOW_MS) };
    return true;
  }

  function clear() { for (const s of Object.keys(shown)) removeSeat(s); }

  // What screen readers hear for a taunt, e.g. "Maria: LOL" (set on a view's lasting polite live region).
  const text = (name, e) => (name || '') + ': ' + (LABELS[e] || '');

  return { IDS, LABELS, SHOW_MS, LATE_MS, cooldownLeft, canSend, arrivals, box, text, face, show, clear };
});
