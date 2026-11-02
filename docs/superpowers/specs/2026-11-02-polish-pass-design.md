# Polish pass: the deferred minor findings — design

One branch, `polish/deferred-minors`. It fixes the "minor" findings deferred by the final reviews of batches 1–5 (PRs #7–#11). The user chose all three groups: **things people see**, **accessibility**, and **code health**. Every item was re-checked on `main` (2026-11-02) and still applies. File:line references are from that check.

## Why

These are small rough edges from five fast feature batches. None blocks a game, but together they make the app feel less finished: glitches people notice, things that are hard for keyboard and screen-reader users, and code that's easy to break later. The tournament date is still open, so now is the time.

## Goals and rules

- Fix each item below as described. **No new features, and no change to rules, scoring or timing.** Every fix is test-first (a unit test where the logic is pure, otherwise a browser check in the git-ignored E2E harness).
- The usual project rules apply: every room write uses `Store.mutateRoom` around a pure `Match` function; user strings never go into `innerHTML`; WCAG AA in both themes; reduced motion; 360px phones; the desktop landscape layout.
- **Anti-goal:** a "polish" that changes how something looks or works beyond the item's own fix. If a fix needs a visible design choice not settled here, the builder makes the smallest one and records it.

## A. Things people see

| # | Now | After |
|---|---|---|
| A1 | Spectators and the host get an empty rack row: an extra 8px gap on phones (6px) and about 10px in the desktop layout (`view-room.js:672-673`). | The whole `.rack-row` is hidden for non-seated viewers. The tile-bag animation is unaffected (seated players only). |
| A2 | After 🔀 Shuffle, a selected tile slides at rack level, then jumps up 5px when the slide ends (`view-room.js:454`, `style.css:293`). | A selected tile slides while staying 5px up: it animates `translate(dx, -5px)` → `translateY(-5px)`. |
| A3 | Desktop: the result screen's "View board" uses the in-game board's font sizes (the rules match `#board-container` everywhere), so its letters come out too big (`style.css:620-622`). | The landscape board font rules apply only to the live board (`.arena > #board-container`). |
| A4 | Desktop: a bingo of 9+ letters in the IMPOSSIBLE!!! scene is wider than the board and spills over the panel (`fx.css:104`, `fx.css:181`). | On the board stage (`.fx-on-board`), the tile size and word width are capped by the stage width (`--fx-w`), not the window's. |
| A5 | Desktop: "✕ Skip", "✕ Skip intro" and "⏸ Paused" sit at the window's top corners, far from the board scene (`celebrate.js:220-224`, `scenes.js:214`, `scenes.js:256`). | When the scene is on the board (`.fx-on-board`), these chips sit inside the board stage's top corners. Phones are unchanged. |
| A6 | Desktop: the bottom buttons' 3px shadow is cut off by the panel edge (`style.css:614`). | The panel has a little padding (4px bottom, 2px sides), so the shadow shows. |
| A7 | Drag-and-drop: when the board redraws mid-drag (an opponent moves, someone joins), the green/red target ring and the rack's make-room gap vanish until the finger moves again (`drag.js:116-168`). | `Drag.attach` returns a `refresh()`. The room view calls it after redrawing while a drag is in progress, so the ring and gap stay. |
| A8 | Drag-and-drop: picking up a placed tile on a 360px phone lifts it about 32px, so it sits partly under the fingertip (`drag.js:104`). | The lift is at least 48px: `Math.max(48, Math.round(h * 0.8 + 16))`. |
| A9 | Pressing Play word (keyboard, or a second finger) while dragging a placed tile submits that tile at its old square (`view-room.js:487-490`). | Play does nothing while a drag is in progress. |
| A10 | The 👜 bag's fade jumps ahead whenever the room redraws mid-deal, so it can vanish before the last tiles leave it. | The bag's animation delay is set once, when the deal starts. |
| A11 | Rare: if a play fails after it briefly showed (the server rejected it), two old tiles can animate as "dealt" and the 🔀 order resets. | The deal only decorates tiles while the rack still matches the refilled rack. Otherwise it stops at once. |
| A12 | Rare, big screen: a highlight that lands during the 0.3 s wipe to another room waits 0.7 s for a word drop that never showed. | The celebration waits for the drop only when the view actually started a drop for that move. |
| A13 | (From the batch-5 review.) A taunt floating over a full-screen scene in the room view. | **Builder check:** the room view has no round-start card (only the projector does, and it already clears taunts), and the turn ribbon sits mid-board, away from the score bar. The VS intro is the only full-screen scene, and taunts can't be sent during it (the A15 fix closes the paused-intro gap). So nothing changes here; a browser check pins that no taunt shows over the intro. (My call.) |
| A14 | The ⋯ menu and the 😀 pop-up can both be open at once and overlap. | Opening one closes the other. |
| A15 | If the host pauses during the VS intro for longer than the intro had left, the 😀 button appears while the game is still paused before its first turn. | No taunts while the intro is frozen by a pause: `Match.taunt` rejects them, and the button stays hidden. |

## B. Accessibility

| # | Now | After |
|---|---|---|
| B1 | "? Bonuses" is an 18px-tall button just above the board. That's below the 24px WCAG 2.2 target size, so a mis-tap on a phone opens a full-screen card during your own timed turn (`style.css:265`). | It looks the same, but its tap area is at least 24px tall (an invisible hit area). |
| B2 | The Bonuses card is `role="dialog"` without `aria-modal`. Focus doesn't move into it, Tab reaches the controls behind it, and focus isn't returned on close (`view-room.js:385-386`, `459-465`). | It gets `aria-modal="true"`. Focus moves to ✕ on open and back to "? Bonuses" on close, and Tab stays inside the card while it's open. |
| B3 | The host's Active / Finished / Void tabs are missing `aria-controls`, the list isn't a tabpanel, and the pager's label sits on a plain div. Every room update rebuilds the tabs and pager, which drops keyboard focus (`view-host.js:83-85`, `190-201`). | Each tab gets `aria-controls="roomList"`, `#roomList` becomes `role="tabpanel"`, and the pager becomes a `<nav aria-label="Pages">`. Arrow keys move focus between tabs, and Enter or Space switches (manual activation, so the list doesn't change on every key press; my call, builder check). Focus returns to the same tab or page button after a rebuild. |

## C. Code health (no visible change)

| # | Item | Fix |
|---|---|---|
| C1 | `tests/layout.test.js` compares `Layout.QUERY` with a copied string, not the CSS. | The test reads `css/style.css` and asserts it contains `@media ${Layout.QUERY}`. |
| C2 | `Layout.fitStage` builds a 0×0 stage for a hidden board. | Return `false` when the board rect is under 1px wide. |
| C3 | `Drag.detach` leaves a settle timer that can call `update()` on another room's view up to 400ms later. | `detach` clears it. |
| C4 | Swallowing the click after a drag relies on a 60ms timer. | Clear the swallow on the next `pointerdown` instead. |
| C5 | `lastUsed` / `lastRack` aren't cleared when the host rejects an appeal (harmless). | Clear them on a rejected appeal. |
| C6 | Taunt ids are checked with plain object lookups, so `constructor` from hand-edited data passes. | Check with `IDS.includes`. |
| C7 | `Taunt.canSend` deep-copies the room 4 times a second per seated player. | A pure `Match.tauntAllowed(room, seat, now)` guard, used by both `Match.taunt` and `Taunt.canSend`, with no copy. |
| C8 | The taunt statuses and ids are written in `match.js`, `taunt.js` and `view-room.js`. | Export them once from `Match` (`TAUNT_STATUSES`, `TAUNTS`) and reuse them. |
| C9 | No unit test covers a taunt followed by `applyPlay` on the same room. | Add it. The play still applies, and the taunt stays. |

## Out of scope

Anything not listed. Any new idea found while fixing goes in the PR description as a suggestion, not into this branch.

## Left to the builder

- The exact CSS for B1's hit area and A5's chip placement. Match the current look.
- Splitting the work into commits and tasks.
- The test style for each item, as long as each has a test that failed first.
