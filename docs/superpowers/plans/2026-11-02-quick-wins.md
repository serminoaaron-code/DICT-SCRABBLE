# Quick Wins (feature requests #6, #7, #8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rack Shuffle button (#6), a bonus-square helper card (#7) and Active/Finished/Void tabs with pages to the host's room list (#8).

**Architecture:** Two new pure UMD modules carry the logic that can go wrong. `js/rack.js` (global `Rack`) holds the local tile display order. `js/roomlist.js` (global `RoomList`) holds tab filtering and paging. Both are unit-tested in Node. The views (`view-room.js`, `view-host.js`, `ui.js`) only render. Nothing new is written to Firebase: shuffle is local to one device, and the helper card and tabs are UI only.

**Tech Stack:** Vanilla JS in plain `<script>` tags, CSS custom properties, Node ≥18 `node:test`. No build step, no packages.

**Spec:** the Design section below, agreed in chat on 2026-11-02. Mockups are in `.superpowers/brainstorm/972-1793587449/content/batch1-quick-wins.html`; the user picked 6B, 7A and 8B.

## Design (agreed 2026-11-02)

- **#6 Shuffle (6B).**
  - A round 🔀 button sits at the right end of the rack. It re-orders the player's rack tiles with a ~300 ms slide and can be pressed any number of times, on the player's own turn or the opponent's.
  - Only this device changes: no Firebase write, the opponent sees nothing, and a refresh restores the normal order. When the rack's letters change (after a play), the order resets to normal.
  - Tiles placed on the board this turn stay on the board, and a selected tile stays selected.
  - Seated players only. With reduced motion on, tiles swap instantly. A 360px phone fits the button with no horizontal scroll.
- **#7 Bonus helper (7A).**
  - A "? Bonuses" button sits on the right of the caption row under the board. It opens a card listing 3W (whole word ×3), 2W (whole word ×2), 3L (that tile ×3), 2L (that tile ×2), ★ (the first word must cover it; counts as 2W) and +50 (Bingo: all 7 tiles in one play). A footnote reads "Bonuses count only on the turn a tile first covers them."
  - The card closes with ✕, a click outside it, Esc, or the button again, and it never pauses the game.
  - It shows for players, spectators and the host in the room view. It doesn't show on the projector.
- **#8 Host room list (8B).**
  - Tabs read **Active (n) / Finished (n) / Void (n)**.
  - Active holds waiting, live, paused, appeal, suddenDeath and hostDecision rooms. It's the default tab, is never paged, and keeps today's order.
  - Finished (`final`) and Void show 5 per page with ‹ 1 2 3 › and keep today's order (newest created first). A page that empties steps back.
  - Creating a room switches to Active. Card actions are unchanged.

## Global Constraints

- Firebase v8 API only; none of these features writes to Firebase.
- User strings go through `UI.escapeHtml()` before `innerHTML`. The new markup holds no user strings except the existing room cards.
- Colours come from the existing tokens (`--navy`, `--yellow`, `--sq-tw/dw/tl/dl`, `--surface`, `--line`, `--text`, `--muted`). Light backgrounds take dark text and dark backgrounds take light text, meeting WCAG AA in both themes.
- Breakpoints are 900px and 480px. At 360×640 a seated player still sees the whole game screen with no scrolling.
- `prefers-reduced-motion: reduce` means no slide animation.
- New pure modules use the repo's UMD wrapper (copy the one at the top of `js/pill.js`).
- Commits get no `Co-Authored-By` trailer.

## Review Focus

1. **Shuffle while tiles sit on the board this turn.** Those rack slots stay empty (`used`), and Recall returns each letter to its own slot. The test belongs to Task 1 (`Rack.order` keeps server indices) and is checked in Task 5's E2E.
2. **Rack letters change after a play, or a stale order no longer matches the rack length.** The order resets to identity and never points past the rack. Test: `Rack.sync` in Task 1.
3. **Duplicate letters (E, E, E).** Shuffle permutes indices, not letters, so selection and placement still use the right slot. Test: Task 1, `shuffle` on a rack with repeats returns a valid permutation.
4. **Host on Finished page 3 when rooms vanish (Reset, void).** The page clamps to the last page, or to 1 when the tab is empty. Test: `RoomList.view` clamp in Task 2.
5. **The bonus card is open while the room re-renders on every update.** It stays open, and its Esc listener is removed when leaving the room. Checked in Task 5's E2E; the listener cleanup belongs to Task 4 (`detachLive`).

---

### Task 1: `Rack` pure module (display order)

**Files:**
- Create: `js/rack.js`
- Create: `tests/rack.test.js`
- Modify: `index.html` (script tag after `js/director.js`), `CLAUDE.md` (load order, architecture row, TDD file list)

**Interfaces:**
- Produces:
  - `Rack.sync(prev: {key, order}|null, rack: string[]) -> {key: string, order: number[]}`. `key = rack.join(',')`. It returns `prev` unchanged when `prev.key === key && prev.order.length === rack.length`; otherwise it returns `{ key, order: [0..rack.length-1] }`.
  - `Rack.shuffle(order: number[], rng = Math.random) -> number[]`. It returns a new permutation of the same indices. When `order.length >= 2` the result differs from `order` (re-draw up to 10 times, then rotate by one).

- [ ] **Step 1: Write the failing tests** (`tests/rack.test.js`)
  - `sync(null, ['A','B','C'])` → `{ key: 'A,B,C', order: [0,1,2] }`
  - `sync({ key: 'A,B,C', order: [2,0,1] }, ['A','B','C'])` returns the same order `[2,0,1]`
  - `sync({ key: 'A,B,C', order: [2,0,1] }, ['A','B','D'])` → order `[0,1,2]` (letters changed)
  - `sync({ key: 'A,B', order: [1,0,2] }, ['A','B'])` → order `[0,1]` (stale length)
  - `shuffle([0,1,2,3,4,5,6], seededRng)` is a permutation of 0..6, and over 50 calls it never equals its input
  - `shuffle([0,1], () => 0.999)` → `[1,0]`. With 0.999, Fisher–Yates always picks `j = i` and yields the identity every time, so the rotate fallback must run.
  - `shuffle([0])` → `[0]`; `shuffle([])` → `[]`
  - Repeated letters: `sync(null, ['E','E','E'])` then `shuffle` returns a permutation of `[0,1,2]`

- [ ] **Step 2: Run** `node --test tests/rack.test.js`. Expected: FAIL, "Cannot find module '../js/rack.js'".
- [ ] **Step 3: Implement** `js/rack.js` (UMD, global `Rack`, Fisher–Yates with `rng`) and add `<script src="js/rack.js"></script>` after `js/director.js` in `index.html`.
- [ ] **Step 4: Run** `node --test "tests/*.test.js"`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(rack): pure Rack.sync/shuffle for the local tile order`

### Task 2: `RoomList` pure module (tabs + pages)

**Files:**
- Create: `js/roomlist.js`
- Create: `tests/roomlist.test.js`
- Modify: `index.html` (script tag after `js/rack.js`), `CLAUDE.md`

**Interfaces:**
- Produces:
  - `RoomList.PER_PAGE = 5`
  - `RoomList.tabOf(phase: string) -> 'active'|'finished'|'void'`. `'final'` → finished, `'void'` → void, anything else → active.
  - `RoomList.view(sortedRooms: object[], sel: {tab, page}, phaseOf: room => string) -> { tab, counts: {active, finished, void}, items: object[], page: number, pages: number }`. Active: `items` is every active room, `page = pages = 1`. Finished/void: 5 per page, `pages = max(1, ceil(n/5))`, and `page` is clamped to `[1, pages]`. Input order is kept.
  - `RoomList.pageList(page: number, pages: number) -> (number|'…')[]`. It returns 1, the last page and page±1, with `'…'` for each gap.

- [ ] **Step 1: Write the failing tests** (`tests/roomlist.test.js`, using `Match.roomPhase` as `phaseOf` and plain room objects with `status`, `clock`, `game`)
  - `tabOf('live') === 'active'`, and the same for waiting, paused, appeal, suddenDeath and hostDecision; `tabOf('final') === 'finished'`; `tabOf('void') === 'void'`
  - With 2 live, 1 waiting, 12 final and 1 void: `counts` is `{ active: 3, finished: 12, void: 1 }`; active view `items.length === 3, pages === 1`
  - Finished view: page 1 → 5 items, the first 5 in input order; page 3 → 2 items; `pages === 3`
  - Clamp: `{ tab: 'finished', page: 9 }` → `page === 3`; with 0 finished rooms → `page === 1, pages === 1, items: []`
  - `pageList(1, 3)` → `[1, 2, 3]`; `pageList(5, 20)` → `[1, '…', 4, 5, 6, '…', 20]`; `pageList(1, 1)` → `[1]`; `pageList(2, 20)` → `[1, 2, 3, '…', 20]`
- [ ] **Step 2: Run** `node --test tests/roomlist.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `js/roomlist.js` (UMD, global `RoomList`) and add `<script src="js/roomlist.js"></script>` after `js/rack.js`.
- [ ] **Step 4: Run** `node --test "tests/*.test.js"`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(host): pure RoomList tabs + pages`

### Task 3: Host dashboard tabs and pager (#8)

**Files:**
- Modify: `js/view-host.js` (`HostRooms.mount`: panel markup, `renderList`, the room-created handler)
- Modify: `css/style.css` (`.tabs`, `.tab`, `.pager`)

**Interfaces:**
- Consumes: `RoomList.view`, `RoomList.pageList`, `RoomList.PER_PAGE`, and the existing `PHASE_ORDER` comparator in `renderList`.
- Produces: markup the E2E uses. Tabs are `#roomTabs button[data-tab="active|finished|void"]` with `aria-selected`, and the label text is "Active (n)" and so on. Page buttons are `#roomPager button[data-page="N"]` plus ‹/› buttons (`data-page` = page±1, disabled at the ends). The pager is hidden when `pages <= 1`.

- [ ] **Step 1:** Markup. Add `<div class="tabs" id="roomTabs" role="tablist">` above `#roomList` and `<div class="pager hidden" id="roomPager">` below it. Keep `sel = { tab: 'active', page: { finished: 1, void: 1 } }` in the closure. Tab clicks set `sel.tab`, and pager clicks set `sel.page[sel.tab]`. Both call `renderList()`.
- [ ] **Step 2:** Make `renderList()` sort exactly as today, then call `RoomList.view(sorted, { tab: sel.tab, page: sel.page[sel.tab] || 1 }, Match.roomPhase)`. Write the clamped page back into `sel`. Render `items.map(cardHtml)`, the tab counts and the pager from `pageList`. Empty-tab copy: "No active rooms. Create one above." / "No finished rooms yet." / "No void rooms."
- [ ] **Step 3:** After a successful `Store.createRoom`, set `sel.tab = 'active'` and call `renderList()`.
- [ ] **Step 4:** CSS. Tabs are pill buttons: the selected one is `--navy` with white text, the others `--surface` with `--text`. Page buttons are small square buttons, with the current page `--navy` on white. Both wrap at 360px.
- [ ] **Step 5:** Run `node --test "tests/*.test.js"` (all pass). Then commit `feat(host): Active/Finished/Void tabs with pages in the room list`.

### Task 4: Shuffle button and bonus helper in the live room (#6, #7)

**Files:**
- Modify: `js/ui.js` (`renderRack` gains `order`; new `bonusHelpHtml()`)
- Modify: `js/view-room.js` (`buildLive` markup and handlers, the rack part of `update`, `detachLive`)
- Modify: `css/style.css` (`.rack-row`, `.rack-shuffle`, caption row button, `.bonus-*`, 480px rack sizes)
- Modify: `.superpowers/e2e/live-helpers.js` (`place`: click the found tile's own `data-i`, not its DOM position)

**Interfaces:**
- Consumes: `Rack.sync`, `Rack.shuffle` (Task 1).
- Produces:
  - `UI.renderRack(el, rack, { selectedIndex, usedIndices, onTile, order })`. `order` is an array of rack indices with identity as the default. Tiles render in `order`, and each keeps `data-i` = its rack index, so `onTile`, `selectedIndex` and `usedIndices` keep using rack indices.
  - `UI.bonusHelpHtml() -> string`. The card body uses swatches with the board's own `.sq.tw/.dw/.tl/.dl/.center` classes, the labels from `LABELS`, and `+${ScrabbleEngine.BINGO_BONUS}`.
  - DOM ids: `#shuffleBtn` (`aria-label="Shuffle tiles"`), `#bonusBtn` (`aria-expanded`), `#bonusCard` (`role="dialog"`, `aria-label="Bonus squares"`, holding `.bonus-close`).

- [ ] **Step 1: Shuffle.**
  - Markup: wrap `#rack` in `<div class="rack-row">` followed by `<button id="shuffleBtn" class="rack-shuffle">🔀</button>`.
  - In `update`, set `ui.rackOrder = Rack.sync(ui.rackOrder, g.racks[seat])` and pass `order: ui.rackOrder.order`. Toggle `hidden` on `#shuffleBtn` together with `#rack`, and disable the button when fewer than 2 tiles are left unplaced.
  - The click handler records every `#rack .tile` rect keyed by `data-i`, sets `ui.rackOrder = { key: ui.rackOrder.key, order: Rack.shuffle(ui.rackOrder.order) }` and calls `update()`. Then it slides each tile from its old x with `el.animate([{ transform: 'translateX(dx px)' }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' })`, skipping the slide when `matchMedia('(prefers-reduced-motion: reduce)')` matches. No sound.
  - Add `ui.rackOrder: null` to the `Object.assign(ui, …)` reset in `buildLive`.
- [ ] **Step 2: Bonus helper.**
  - Change the caption row to `<div class="caption-row"><span class="caption-text"><span id="tossLine"></span><span id="lastMove"></span></span><button id="bonusBtn" class="caption-btn" aria-expanded="false" aria-controls="bonusCard">? Bonuses</button></div>`.
  - Add a backdrop `<div class="bonus-backdrop hidden" id="bonusBackdrop">` holding `<div class="card bonus-card" id="bonusCard" role="dialog" aria-label="Bonus squares">` with a heading, a ✕ `.bonus-close` button and `UI.bonusHelpHtml()`, inside `#liveRoot`.
  - The button toggles the card. A click on the backdrop outside the card closes it, ✕ closes it, and Esc closes it through `ui.onKey`, a `document` keydown listener added in `buildLive` and removed in `detachLive`.
  - `update()` must not touch the card, so it stays open across re-renders.
- [ ] **Step 3: CSS.**
  - `.rack-row { display:flex; gap:6px; align-items:center; width:100%; max-width:560px }` and `.rack-row .rack { flex:1; min-width:0 }`.
  - `.rack-shuffle` is a 36px round `--yellow` button with `--navy` text. Inside the `@media (max-width:480px)` block, set rack padding and gap so that 7×36px tiles plus the button fit in 344px.
  - The caption row becomes `display:grid; grid-template-columns: 1fr auto`. The text keeps its ellipsis, and `.caption-btn` is a 16px-high pill (`--surface` / `--text` / `--line` border).
  - `.bonus-backdrop` is fixed and covers the viewport with `rgba(11,31,77,.45)`; the card is centred with `max-width: 340px`. Swatches reuse the `.sq.*` colours. Everything is AA in both themes.
- [ ] **Step 4:** Update `live-helpers.place` to read the matching tile's `dataset.i` and click `.tile[data-i=that]`.
- [ ] **Step 5:** Run `node --test "tests/*.test.js"` (all pass). Then commit `feat(room): rack shuffle button and bonus-square helper`.

### Task 5: Verify in the browser (E2E) and docs

**Files:**
- Create: `.superpowers/e2e/quickwins.js` (git-ignored; same harness as `revamp.js`, own server on 127.0.0.1:8765, playground, `TEST-` data only, cleaned up)
- Modify: `CLAUDE.md` (architecture rows for `rack.js` and `roomlist.js`, load order, TDD list; `ui.js` row mentions `bonusHelpHtml`)

- [ ] **Step 1:** Write the scenario. It must check each of the following:
  1. **Shuffle order.** Phone player A at 360×640 shuffles 5 times, and the DOM letter order changes each time while the multiset of letters is unchanged.
  2. **Local only.** The DB rack (`L.dbRoom`) is unchanged, and player B's screen is unchanged.
  3. **Placed tiles.** A places 2 tiles and shuffles; those slots stay `used`. Recall makes them reappear with the right letters.
  4. **Phone fit.** No horizontal or vertical scroll at 360×640 in either theme (reuse `MEASURE` from `revamp.js`).
  5. **Bonus card.** `#bonusBtn` opens the card, which shows 3W/2W/3L/2L/★/+50. A fixture move re-renders the room and the card is still open. Esc closes it, and outside-click and ✕ also close it. A spectator sees the button. The projector page has no `#bonusBtn`.
  6. **Host tabs.** Create 7 rooms and finish 6 by fixture (`Match.resign`). Finished (6) shows page 1 with 5 cards and page 2 with 1 card. Void one finished room: the counts update, and page 2 empties and steps back to page 1. Creating a room switches to Active.
  7. **Contrast.** The AA check passes on the new controls in both themes (reuse `PJ_CONTRAST`-style math on `.tabs button, .pager button, .rack-shuffle, .caption-btn, .bonus-card`).
  8. **Console.** There are no console errors.
- [ ] **Step 2:** Run `node .superpowers/e2e/quickwins.js`. Expected: `QUICKWINS E2E PASS`.
- [ ] **Step 3:** Re-run the existing `node .superpowers/e2e/revamp.js` (rack, fit and contrast checks). Expected: `REVAMP … PASS`.
- [ ] **Step 4:** Commit `docs: CLAUDE.md for rack.js, roomlist.js and the bonus helper`.
