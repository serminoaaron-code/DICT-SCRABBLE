# Desktop Landscape In-Match Layout (#9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On windows at least 1024×560 and wider than tall, the in-match screen shows the board as a large square on the left and a 420px game panel on the right. Phones stay exactly as they are.

**Architecture:**
- A new pure UMD module, `js/layout.js` (global `Layout`), holds the switch rule (`isLandscape`) and the board-size maths (`boardPx`). It also has one small DOM helper, `fitStage`, which places a celebration or intro stage over the board.
- `view-room.js` wraps the right-hand pieces in a `.live-panel`. That wrapper is `display: contents` on phones, so the phone flex order is untouched. In landscape it is the panel.
- `fitBoard()` gains a landscape branch that sizes the board and its letters.
- `celebrate.js` and `scenes.js` take an optional `areaEl` (the board). In landscape they put their stage on it, at board scale.

**Tech Stack:** Vanilla JS in plain `<script>` tags, CSS custom properties and a media query, Node ≥18 `node:test`. No build step.

**Spec:** `docs/superpowers/specs/2026-11-02-desktop-landscape-design.md` (approved 2026-11-02).

## Global Constraints

- The landscape rule is exactly `(min-width: 1024px) and (min-height: 560px) and (orientation: landscape)`. CSS and `Layout.QUERY` must use this same string.
- The panel is 420px wide, rack tiles and 🔀 are 44px on one row, and the action buttons are a little taller than on phones.
- Phones change in no way: the 360×640 fit (no scroll, everything visible) holds exactly as today.
- In landscape the page never scrolls. The board stays put, and the panel scrolls inside itself if the host controls don't fit.
- Text meets WCAG AA in both themes: light backgrounds take dark text, dark backgrounds take light text.
- Layout only: no Firebase writes, no rule, timing or permission changes.
- The projector (`?view=scoreboard`), lobby, join page, result screen and dashboard don't change.
- Reduced motion behaves as today.
- Commits get no `Co-Authored-By` trailer.

## Review Focus

1. **Resize or rotate across the threshold mid-turn,** with 2 tiles placed and a tile selected. Nothing is lost, and the board re-sizes at once with no leftover inline width from the other layout. Covered by the Task 4 E2E (resize 1366 → 900 → 1366).
2. **The host with the control bar in landscape at 1366×640.** The page doesn't scroll and the panel scrolls itself. Covered by the Task 4 E2E (host page `scrollHeight` check and `.live-panel` scroll check).
3. **The sticky playground bar (local runs only) takes about 30px off the height.** The board is sized from its real top edge in the window, not a fixed header guess. Covered by Task 1 (`boardPx` takes `top`) and the Task 4 E2E (the playground bar is on in every local run).
4. **A celebration that starts in one layout while the window switches to the other.** No error, and the overlay still ends on time; its position may stay where it started. Covered by the Task 4 E2E (console-error check after a resize during a tier-1 celebration).
5. **Spectator and host see no rack.** The panel has no empty rack gap. Board size is the same as a player's. Covered by the Task 4 E2E (spectator board size equals the player's, ±2px).

---

### Task 1: `Layout` pure module

**Files:**
- Create: `js/layout.js`, `tests/layout.test.js`
- Modify: `index.html` (script tag after `js/roomlist.js`)

**Interfaces:**
- Produces:
  - `Layout.QUERY = '(min-width: 1024px) and (min-height: 560px) and (orientation: landscape)'`
  - `Layout.PANEL_PX = 420`, `Layout.GAP_PX = 20`, `Layout.MARGIN_PX = 12`
  - `Layout.isLandscape(w: number, h: number) -> boolean`, true when `w >= 1024 && h >= 560 && w > h`
  - `Layout.boardPx({ vw, vh, top, left, minPx = 220 }) -> number`. It returns `floor(max(minPx, min(vh - top - MARGIN_PX, vw - left - GAP_PX - PANEL_PX - MARGIN_PX)))`.
  - `Layout.landscapeNow() -> boolean`. It uses `matchMedia(QUERY)` when available, else `isLandscape(innerWidth, innerHeight)`. Browser only, so it isn't unit-tested.
  - `Layout.fitStage(overlayEl, areaEl) -> boolean` (DOM, see Task 3; Task 1 only stubs the export as part of the module).

- [ ] **Step 1: Write the failing tests** (`tests/layout.test.js`)
  - `isLandscape`: `(1366, 640)` → true; `(1024, 560)` → true; `(1023, 700)` → false; `(1366, 559)` → false; `(800, 1280)` → false (portrait tablet); `(915, 412)` → false (phone landscape); `(600, 600)` → false (not wider than tall)
  - `boardPx({ vw: 1366, vh: 640, top: 60, left: 30 })` → `568` (limited by height)
  - `boardPx({ vw: 1920, vh: 950, top: 60, left: 30 })` → `878`
  - `boardPx({ vw: 1024, vh: 900, top: 60, left: 30 })` → `542` (limited by width: 1024 − 30 − 20 − 420 − 12)
  - `boardPx({ vw: 1024, vh: 560, top: 400, left: 30 })` → `220` (the floor)
  - `QUERY` is the exact string above.
- [ ] **Step 2: Run** `node --test tests/layout.test.js`. Expected: FAIL, "Cannot find module '../js/layout.js'".
- [ ] **Step 3: Implement** `js/layout.js` with the repo's UMD wrapper (copy from `js/rack.js`). In this task `fitStage` returns `false`. Add `<script src="js/layout.js"></script>` after `js/roomlist.js`.
- [ ] **Step 4: Run** `node --test "tests/*.test.js"`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(layout): pure Layout.isLandscape/boardPx for the desktop in-match layout`

### Task 2: Landscape in-match layout (DOM wrapper, CSS, `fitBoard`)

**Files:**
- Modify: `js/view-room.js` (`buildLive` markup, `fitBoard`, the `update()` call to `fitBoard`)
- Modify: `css/style.css` (in-game `main` width, `.live-panel`, the landscape media query)

**Interfaces:**
- Consumes: `Layout.landscapeNow`, `Layout.boardPx`, `Layout.PANEL_PX`.
- Produces:
  - The DOM. `#liveRoot` children are `#board-container` and `<div class="live-panel" id="livePanel">`, which holds, in this order, `.scorebar`, `.pill-row`, `.caption-row`, `.rack-row`, `#actions`, `#hostBar` and `#liveFoot`. The fixed sheets (`#noticeBox`, `#rejectBox`) and `#bonusBackdrop` stay direct children of `#liveRoot`.
  - The `--cell` CSS variable on `#board-container`, set to the board's px width ÷ 15 in landscape and removed otherwise.

- [ ] **Step 1: Markup.**
  - In `buildLive`, move the score bar, pill row, caption row, rack row, actions, host bar and live foot into `.live-panel`.
  - Keep `#board-container` directly in `#liveRoot`, before the panel.
- [ ] **Step 2: Phone CSS (must render exactly as today).**
  - `.live-panel { display: contents; }`
  - Give the `.arena` flex children explicit `order` values, so the phone column keeps today's sequence: score bar 1, pill 2, caption 3, board 4, rack row 5, actions 6, host bar 7, live foot 8.
- [ ] **Step 3: Landscape CSS** inside `@media` with `Layout.QUERY`:
  - `body.in-game main { max-width: none; }`
  - `.arena { display: grid; grid-template-columns: max-content 420px; column-gap: 20px; justify-content: center; align-items: start; }`
  - `.arena > * { max-width: none; }`
  - `#board-container { grid-column: 1; max-width: none; }`
  - `.live-panel { grid-column: 2; display: flex; flex-direction: column; gap: 10px; max-height: var(--board-px); overflow: auto; }`
  - Inside the panel, the rack row gets `margin-top: auto` so the rack and actions sit at the bottom.
  - `.rack .tile` and `.rack-shuffle` are 44px; the action buttons are `padding: 13px 8px; font-size: 14px`.
  - Board text: `.sq` font-size `calc(var(--cell) * .3)`, `.tile` `calc(var(--cell) * .55)`, `.tile .sub` `calc(var(--cell) * .22)`.
- [ ] **Step 4: `fitBoard(el, ctx)`.**
  - **Landscape** (`Layout.landscapeNow()`), for every viewer:
    - Clear the inline width, read `board.getBoundingClientRect()`, and compute `px = Layout.boardPx({ vw: innerWidth, vh: innerHeight, top: rect.top, left: rect.left })`.
    - Set `board.style.width = px + 'px'`, `board.style.setProperty('--cell', px / 15 + 'px')`, and `#liveRoot` style `--board-px: px + 'px'`.
  - **Otherwise:** remove `--cell` and `--board-px`, then run today's logic unchanged (the seated-only shrink).
  - It already runs on resize, through `ui.onResize`.
- [ ] **Step 5:** Run `node --test "tests/*.test.js"` (all pass). Then commit `feat(room): landscape in-match layout for desktop — board left, panel right`.

### Task 3: Celebrations and the VS intro on the board

**Files:**
- Modify: `js/layout.js` (implement `fitStage`), `js/celebrate.js` (overlay placement + `floatPoints` origin), `js/scenes.js` (`playIntro` takes `opts.areaEl`), `js/view-room.js` (pass `areaEl`), `css/fx.css` (`.fx-on-board`)
- Test: `tests/layout.test.js` (pure part of the stage box)

**Interfaces:**
- Produces:
  - `Layout.stageBox(rect: {left, top, width, height}) -> { left, top, width, height, k }`. Rounded px, with `k = width / 280` (the mockup phone was 280 wide).
  - `Layout.fitStage(overlayEl, areaEl) -> boolean`. When `areaEl` is connected and `Layout.landscapeNow()` is true, it adds the class `fx-on-board`, sets `--fx-left`, `--fx-top`, `--fx-w`, `--fx-h` (px) and `--k` (px) from `stageBox(areaEl.getBoundingClientRect())`, and returns true. Otherwise it returns false and changes nothing.
  - `Celebrate.show(c, { container, scoreEl, mine, areaEl })`: the new optional `areaEl`.
  - `Scenes.playIntro(container, room, now, { onDone, areaEl })`.

- [ ] **Step 1: Failing test.** `stageBox({ left: 30.4, top: 60, width: 568, height: 568 })` → `{ left: 30, top: 60, width: 568, height: 568, k: 568 / 280 }`. Run it and expect FAIL (not a function).
- [ ] **Step 2: Implement** `stageBox` and `fitStage`, then run the tests (all pass).
- [ ] **Step 3: Celebrate.**
  - In `overlay()`, call `root.Layout && root.Layout.fitStage(ov, opts.areaEl)` before the existing `--fx-top` code, and skip that code when it returns true.
  - In `floatPoints`, when `opts.areaEl` exists and `Layout.landscapeNow()` is true, start the float from the centre of `areaEl` instead of `container`.
- [ ] **Step 4: Scenes.** In `playIntro`, after creating `ov`, call `root.Layout && root.Layout.fitStage(ov, opts.areaEl)`.
- [ ] **Step 5: view-room.** Pass `areaEl: el.querySelector('#board-container')` to `Celebrate.show` (in `celebrateNewMove` and `renderFinal`'s ending celebration) and to `Scenes.playIntro` (in `syncIntro`).
- [ ] **Step 6: fx.css.** Add `.fx-on-board > .fx-stage { left: var(--fx-left); top: var(--fx-top); width: var(--fx-w); height: var(--fx-h); right: auto; bottom: auto; }` and `.fx-on-board .fx-stage > .fx-content { top: 0; }`. The inline `--k` overrides the overlay's capped `--k`.
- [ ] **Step 7:** Run `node --test "tests/*.test.js"` (all pass). Then commit `feat(fx): celebrations and the VS intro sit on the board in landscape`.

### Task 4: Browser checks (E2E) and docs

**Files:**
- Create: `.superpowers/e2e/landscape.js` (git-ignored, same harness as `quickwins.js`: own server on 127.0.0.1:8765, playground, `TEST-` data only, counts relative to existing rooms, cleanup in `finally`)
- Modify: `CLAUDE.md` (architecture row for `js/layout.js`, load order, the UMD list, the TDD list; `view-room.js` row mentions the landscape layout; Visual tokens section mentions the 1024×560 landscape query)

- [ ] **Step 1: Write the scenario.** Viewports are set with `Emulation.setDeviceMetricsOverride` through `page.send`. It must check each of the following:
  1. **Laptop size.** Player A at 1366×640 has a square board ≥ 560px, left of the panel (`board.right < panel.left`), and no horizontal or vertical scroll. The rack tiles are 44px, and the rack and actions sit inside the window.
  2. **Big screen.** At 1920×950 the board is ≥ 860px.
  3. **Below the threshold.** At 1000×700 the stacked layout returns: the board sits above the rack (`board.bottom <= rack.top`).
  4. **Phone.** At 360×640 (mobile) there is no scroll, and the board, rack and actions are inside the window, as in `revamp.js` `MEASURE`.
  5. **Spectator.** At 1366×640 the spectator's board is the same size as A's (±2px), and there's no rack row.
  6. **Host.** At 1366×640 the host's page `scrollHeight <= innerHeight + 1`, and `.live-panel` `scrollHeight >= clientHeight`. That is, any overflow scrolls inside the panel.
  7. **Mid-turn resize.** A places 2 tiles and selects a third, then resizes 1366 → 1000 → 1366. Two `.tile.temp` remain, one `.selected`, and the board is ≥ 560px again.
  8. **Tier-1 celebration.** A fixture play with `lastMove.total = 22`, `moveCount + 1` and a matching `lastMove` shape (copy `revamp.js` `pjPlay`) runs on A at 1366. `.fx-overlay.fx-on-board` exists, and the `.fx-stage` rect equals the board rect (±2px).
  9. **Tier-0 float.** A small play (`total = 6`) makes a `.fx-float` whose start point is inside the board rect.
  10. **VS intro.** On a fresh room started at 1366, the `.fx-intro .fx-stage` rect equals the board rect (±2px).
  11. **Contrast.** AA in both themes for `.live-panel` text and buttons (reuse the `quickwins.js` `CONTRAST` helper).
  12. **Console.** No console errors, including after a resize during a celebration.
- [ ] **Step 2:** Run `node .superpowers/e2e/landscape.js`. Expected: `LANDSCAPE E2E PASS`.
- [ ] **Step 3:** Run `node .superpowers/e2e/quickwins.js` and `node .superpowers/e2e/revamp.js`. Expected: `QUICKWINS E2E PASS` and `REVAMP E2E PASS` (phone fit, contrast and celebrations unchanged).
- [ ] **Step 4:** Update `CLAUDE.md`, then commit `docs: CLAUDE.md for the desktop landscape layout (layout.js)`.
