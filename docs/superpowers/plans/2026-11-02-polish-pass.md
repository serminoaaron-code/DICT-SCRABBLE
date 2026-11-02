# Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 28 deferred minor findings from batches 1–5 (spec items A1–A15, B1–B3, C1–C9) on one branch, with no change to rules, scoring or timing.

**Architecture:**
- **Pure logic** goes in the UMD modules with unit tests: `match.js`, `taunt.js`, `layout.js`, `drag.js`.
- **DOM and CSS fixes** get browser checks in one new git-ignored E2E script, `.superpowers/e2e/polish.js`. It has one `ONLY=` section per task.
- **Order:** each task writes its section first and watches it fail before fixing.

**Tech Stack:** vanilla JS (UMD, no build step), Firebase RTDB v8, CSS (`style.css`, `fx.css`), `node --test`, the CDP E2E harness.

**Spec:** `docs/superpowers/specs/2026-11-02-polish-pass-design.md`

## Global Constraints

- No new features, and no change to rules, scoring or timing (`CELEBRATE_MS`, `DROP_MS`, `INTRO_MS`, the tiers and the taunt cooldown all stay as they are).
- Every fix is test-first: a unit test for pure logic, otherwise a `polish.js` section seen failing first.
- Room writes only through `Store.mutateRoom` around a pure `Match` function. User strings go in via `textContent`.
- WCAG AA in both themes; reduced motion respected. Phones at 360px and the desktop landscape layout (`Layout.QUERY`) must both keep working.
- A visible design choice the spec doesn't settle: make the smallest one that matches the current look, and ledger it.

## Review Focus

1. **A board redraw mid-drag on a phone (an opponent move, a presence change)** must keep the ring, the make-room gap and the drop working. Task 3's E2E checks it.
2. **The Bonuses card opened by keyboard and closed with Escape, ✕ or the backdrop** must always return focus to "? Bonuses", and Tab never leaves the card while it's open. Task 6's E2E checks it.
3. **A room update while a host's keyboard focus is on a tab or a page button** must keep focus on that same control. Task 6's E2E checks it.
4. **The A5 chip move only applies to the desktop board stage.** Phones, and reduced motion, must keep the old chip places and behaviour. Task 5's E2E checks it.
5. **A rack that changes during the refill deal** (a failed play reverting it) must stop the deal at once without throwing. Task 4's E2E checks it.

---

### Task 1: Taunt rules, written once (C6, C7, C8, C9, A15)

**Files:** `js/match.js`, `js/taunt.js`, `js/view-room.js` (`syncTaunt`), `tests/match.test.js`, `tests/taunt.test.js`

**Interfaces:**
- **New exports:**
  - `Match.TAUNT_STATUSES = ['live', 'suddenDeath', 'hostDecision']`
  - `Match.tauntAllowed(room, seat, now) -> boolean`: all of `taunt`'s guards except the id, with no clone.
- **Updated:**
  - `Match.taunt` calls `tauntAllowed`, and checks the id with `TAUNTS.includes(id)`.
  - `Taunt.IDS === Match.TAUNTS` (the same array).
  - `Taunt.canSend` returns `Match.tauntAllowed(...)`.
  - `Taunt.show` checks `IDS.includes(info.e)`.
  - `syncTaunt` uses `Match.TAUNT_STATUSES`.

- [ ] **Step 1: Failing tests:**
  - `tauntAllowed mirrors taunt's guards without copying the room`: it gives the same true/false as `Match.taunt(...) !== null` for live, cooldown, intro, `'watch'`, final and paused rooms. A frozen room doesn't throw.
  - `taunt: no taunts while the VS intro is frozen by a pause` (A15): pause a room during its intro (`M.pauseClocks(startedRoom-in-intro, t)`, which gives `paused.introRemainingMs > 0`). Then a `now` past the old `startedAt` gives `null`. After `resumeClocks`, the new `startedAt` rules as before.
  - `taunt: inherited object keys are not taunt ids`: `taunt(r, 'A', 'constructor', …)` and `'toString'` give `null`.
  - `taunt then applyPlay on the same room: the play applies and the taunt stays` (C9).
  - In `tests/taunt.test.js`: `Taunt.IDS` is `Match.TAUNTS`, and `Match.TAUNT_STATUSES` is `['live','suddenDeath','hostDecision']`.
- [ ] **Step 2:** Run `node --test tests/match.test.js tests/taunt.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. In `view-room.js`, `syncTaunt` swaps its local list for `Match.TAUNT_STATUSES`.
- [ ] **Step 4:** Run `node --test "tests/*.test.js"`. Expected: all pass.
- [ ] **Step 5:** Commit `refactor(taunt): one set of taunt rules; no taunts while a paused intro is frozen`.

### Task 2: Layout guards (C1, C2)

**Files:** `js/layout.js`, `tests/layout.test.js`

- [ ] **Step 1: Failing tests:**
  - `QUERY matches the media query in css/style.css`: read `css/style.css` with `fs` and assert it contains `@media ${Layout.QUERY}`.
  - `stageBox / fitStage: a hidden board gives no stage`: add pure `Layout.hasArea(rect) -> boolean` (`rect.width >= 1 && rect.height >= 1`). Then `hasArea({width:0,height:0}) === false` and `hasArea({width:507,height:507}) === true`.
- [ ] **Step 2:** Run `node --test tests/layout.test.js`. Expected: the second test fails (`hasArea` is missing). The first passes now: it guards against future drift.
- [ ] **Step 3:** Implement `hasArea`. `fitStage` returns `false` when `!hasArea(rect)`.
- [ ] **Step 4:** Run `node --test "tests/*.test.js"`. Expected: all pass.
- [ ] **Step 5:** Commit `fix(layout): no 0x0 board stage; the media query test reads the CSS`.

### Task 3: Drag-and-drop (A7, A8, C3, C4) and Play while dragging (A9)

**Files:** `js/drag.js`, `tests/drag.test.js`, `js/view-room.js`, `.superpowers/e2e/polish.js` (section `drag`)

**Interfaces:**
- **New:** `Drag.liftPx(h) -> number`, which is `Math.max(48, Math.round(h * 0.8 + 16))`.
- **Changed:** `Drag.attach(rootEl, hooks)` now returns `{ detach(), refresh() }`, not a function.
  - `refresh()` re-applies the target ring and the rack's make-room shift for the current pointer position while a drag is running. Otherwise it does nothing.
  - `view-room.js` stores the object. It calls `.detach()` where it called the function before, and calls `.refresh()` at the end of `update()` when `ui.drag` is set.

- [ ] **Step 1: Failing unit test** `liftPx: at least 48px above the finger`:
  - `liftPx(20) === 48` (a 360px board tile);
  - `liftPx(44) === 51` (a rack tile, as before for big tiles);
  - `liftPx(60) === 64`.
- [ ] **Step 2: Failing E2E section `drag`** in a new `polish.js`, using the `dragdrop.js` setup: A on a 360px phone, B on a desktop.
  - **(a) A8:** pick up a placed board tile on A. The ghost's bottom is at least 48px above the pointer.
  - **(b) A7:** while dragging over an empty square on A, a fixture changes the room (B's `screenLeaves` +0, any field). After the redraw, the target square still has its ring class and the drop still places the tile.
  - **(c) A9:** while dragging a placed tile, call `#playBtn.click()`. `moveCount` is unchanged, and the drag still drops normally.
  - **(d) C3:** start a drag, release it, then leave the room within 100ms (go to `#`). No console error, and `update` isn't called on the new view (no error and no stale room).
  - **(e) C4:** after a drag ends, the next normal tap on a rack tile selects it, even right away (no swallowed tap).
- [ ] **Step 3:** Run `node --test tests/drag.test.js`, then `ONLY=drag node .superpowers/e2e/polish.js`. Expected: FAIL on (a), (b) and (c). (d) and (e) may already pass; they're regression guards.
- [ ] **Step 4:** Implement:
  - `liftPx`;
  - `refresh()`;
  - `detach` clears `settling` (C3);
  - `swallowClick` is cleared on the next `pointerdown`, not by the 60ms timer (C4);
  - the Play handler returns early while `ui.drag` (A9).
- [ ] **Step 5:** Run the unit tests and `ONLY=drag`. Expected: all pass. Also run `node .superpowers/e2e/dragdrop.js`. Expected: PASS.
- [ ] **Step 6:** Commit `fix(drag): ring survives a redraw, 48px lift, Play waits for the drop, timers cleaned up`.

### Task 4: Game screen polish (A1, A2, A10, A11, A13 check, A14, C5)

**Files:** `js/view-room.js`, `css/style.css`, `polish.js` (section `room`)

- [ ] **Step 1: Failing E2E section `room`:**
  - **A1:** on the spectator's and the host's room view, `.rack-row` is hidden (`offsetParent === null`). On a player's view it's shown.
  - **A2:** on a player, select a rack tile, press 🔀, and sample the selected tile's `getBoundingClientRect().top` every 30ms during the 300ms slide. It never goes more than 1px below its selected (−5px) position.
  - **A10:** during a refill deal, force a room redraw at about 300ms. Then `.rack-bag`'s animation `currentTime` keeps increasing (no jump of more than 400ms).
  - **A11:** set `ui.lastUsed` / `lastRack` as in the turn-moments refill check. Fixture the refilled rack, then within 200ms fixture the rack back to the old letters. No `.tile-dealt` remains after 300ms, and nothing throws.
  - **A13:** during the VS intro on a phone, no `.taunt` is in the DOM. A fixture taunt with `at` = now during the intro is rejected by `Match.taunt`, so the check is that nothing shows.
  - **A14:** open ⋯ then 😀: the ⋯ menu closes. Open 😀 then ⋯: the 😀 pop-up closes.
  - **C5:** a rejected appeal clears `ui.lastUsed` (the playground `__room` hook).
- [ ] **Step 2:** Run `ONLY=room node .superpowers/e2e/polish.js`. Expected: FAIL on A1, A2, A10, A11, A14 and C5. The A13 check passes (a regression guard).
- [ ] **Step 3: Implement:**
  - **A1:** toggle `hidden` on `.rack-row` with `!isSeat(seat)`.
  - **A2:** a selected tile's shuffle keyframes use `translate(dx, -5px) → translateY(-5px)`.
  - **A10:** set `.rack-bag`'s delay only when `ui.refill` starts.
  - **A11:** store the refilled rack's key in `ui.refill`, and drop `ui.refill` when the current rack no longer matches it.
  - **A14:** each opener closes the other.
  - **C5:** clear `lastUsed` / `lastRack` when an appeal of mine is rejected.
- [ ] **Step 4:** Run `ONLY=room` and the unit tests. Expected: PASS. Also run `turnmoments.js` and `taunts.js`. Expected: PASS.
- [ ] **Step 5:** Commit `fix(room): no empty rack row for viewers, steady shuffle and deal, one pop-up at a time`.

### Task 5: Desktop layout and scenes (A3, A4, A5, A6)

**Files:** `css/style.css`, `css/fx.css`, `js/celebrate.js`, `js/scenes.js`, `polish.js` (section `desktop`)

- [ ] **Step 1: Failing E2E section `desktop`** (A at 1366×768 landscape, plus a phone):
  - **A3:** on the result screen's "View board", `.tile` font-size is under 15px, the same as on the phone layout (14px).
  - **A4:** a fixture IMPOSSIBLE!!! play of `QUIZZICAL` (9 letters, bingo flag on): every `.fx-tile` and `.fx-word` rect stays inside the board's rect (±2px).
  - **A5:**
    - in landscape, during a celebration `.fx-skip` is inside `.fx-stage`'s rect;
    - during the VS intro, "✕ Skip intro" is inside the stage;
    - during a host pause in the intro, "⏸ Paused" is inside the stage;
    - on the phone, the chips keep their old place (window top-right).
  - **A6:** `.live-panel`'s `scrollHeight - clientHeight === 0`, and the action buttons' bottom plus 3px is at or above the panel's bottom inner edge.
- [ ] **Step 2:** Run `ONLY=desktop node .superpowers/e2e/polish.js`. Expected: FAIL on A3, A4, A5 and A6.
- [ ] **Step 3: Implement:**
  - **A3:** scope the landscape font rules to `.arena > #board-container`.
  - **A4:** under `.fx-on-board`, use `var(--fx-w)` in place of `100vw` / `92vw` for the tier-4 tile size and `.fx-word`.
  - **A5:** when the overlay has `.fx-on-board`, append the skip and paused chips to `.fx-stage` and position them inside its top corners.
  - **A6:** add `padding: 0 2px 4px` to `.live-panel` in the landscape media query.
- [ ] **Step 4:** Run `ONLY=desktop`. Expected: PASS. Run `landscape.js`, `revamp.js` and `qa-pass1.js`, one at a time. Expected: PASS.
- [ ] **Step 5:** Commit `fix(desktop): result board text, long bingos, Skip/Paused on the board, button shadows`.

### Task 6: Accessibility (B1, B2, B3)

**Files:** `css/style.css`, `js/view-room.js`, `js/view-host.js`, `polish.js` (section `a11y`)

- [ ] **Step 1: Failing E2E section `a11y`:**
  - **B1:** "? Bonuses": `elementFromPoint` at 3px above and 3px below its visible box still returns the button (a hit area of at least 24px). Its visible box height is unchanged at 18px.
  - **B2:**
    - Open by `#bonusBtn.click()`: `document.activeElement` is `.bonus-close`, and `#bonusCard` has `aria-modal="true"`.
    - Tab 5 times (`Input.dispatchKeyEvent` Tab): focus stays inside `#bonusCard`.
    - Escape: the card is closed and focus is on `#bonusBtn`. The same holds after closing with ✕ and after a backdrop click.
  - **B3** (host dashboard with 6+ rooms for paging):
    - each tab has `aria-controls="roomList"`, and `#roomList` has `role="tabpanel"`;
    - the pager is a `nav` with `aria-label="Pages"`;
    - with focus on the Finished tab, ArrowRight moves focus to Void without switching the list, and Enter switches;
    - with focus on page button 2, a room update (fixture: rename a room label) leaves focus on page button 2.
- [ ] **Step 2:** Run `ONLY=a11y node .superpowers/e2e/polish.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. For **B1**, use a transparent `::before` pseudo-element extending the hit area to at least 24px; the visible look stays the same.
- [ ] **Step 4:** Run `ONLY=a11y`. Expected: PASS. Run `quickwins.js` and `revamp.js` (the contrast sweep). Expected: PASS.
- [ ] **Step 5:** Commit `fix(a11y): bigger Bonuses tap area, a real Bonuses dialog, host tabs for keyboards and screen readers`.

### Task 7: Big screen (A12) and wrap-up

**Files:**
- Modify: `js/view-scoreboard.js`, `CLAUDE.md` (the `Drag.attach` return shape, `Match.tauntAllowed` / `TAUNT_STATUSES`, `Layout.hasArea`).
- Add to: `docs/important-docs/bugs-fixed.md` (one grouped entry, **BF-28**, with re-test steps for the most visible items: A1, A5, A7, A9, A14, B1, B2).
- Test: `polish.js` (section `projector`).

- [ ] **Step 1: Failing E2E section `projector`:**
  1. Feature room 1, then make room 2's tier-3 play land during the wipe (fixture right after a cut is triggered).
  2. Measure the gap from the cut to `.fx-overlay`.
  3. Expected: the celebration starts within 300ms of the board swap, without waiting 700ms.
- [ ] **Step 2:** Run `ONLY=projector`. Expected: FAIL.
- [ ] **Step 3:** In `mountScene`, delay by `Match.DROP_MS` only when `st.drop` matches the featured room and the move's `moveCount`. Otherwise the delay is 0, even if `d.move.dropped`.
- [ ] **Step 4:** Run the full `polish.js`. Expected: `POLISH E2E PASS`. Then run each other suite in the foreground, one at a time: `taunts`, `turnmoments`, `qa-pass1`, `dragdrop`, `quickwins`, `landscape`, `revamp`. Expected: each PASS.
- [ ] **Step 5:** Update `CLAUDE.md` and `bugs-fixed.md` (BF-28), then commit `docs: polish pass notes and QA re-test entry`.
