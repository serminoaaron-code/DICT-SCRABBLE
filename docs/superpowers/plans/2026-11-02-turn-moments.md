# Turn Moments (#10 drop, #3 refill, #4 ribbon) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- After an opponent's play, their word drops onto the board (#10).
- After your own play, your rack refills with tiles dealt from the bag (#3).
- When the turn passes, a ribbon says whose turn it is (#4).
- All of it is chained with the existing celebrations, so watching never costs turn time.

**Architecture:**
- **Pure logic, unit-tested:**
  - new constants in `match.js`
  - `Rack.refill` (on-screen tile order after a play)
  - `Pill.ribbon` / `Pill.ribbonDue` (what the ribbon says and when)
  - `Celebrate.newCells` / `Celebrate.stagger` (which tiles drop, and their timing)
  - one `Director` change
- **Views:** `view-room.js` and `view-scoreboard.js` render the moments.
- **DOM pieces:** `Scenes.ribbon` and the `Celebrate.show` start delay.
- **Re-renders:** the room view redraws the board and rack on every update. Animations use CSS keyframes with an `animation-delay` worked out from each moment's start time, so a redraw resumes the animation where it was instead of restarting it.

**Tech Stack:** Vanilla JS, CSS keyframes and Web Animations, `node:test`. No libraries.

**Spec:** `docs/superpowers/specs/2026-11-02-turn-moments-design.md` (approved 2026-11-02; read the "Decisions from the builder check" section too).

## Global Constraints

- Values from the spec:
  - `Match.DROP_MS = 700`
  - `Match.CELEBRATE_MS = [1000, 2600, 2600, 3000, 4500]` (tier 0 was 0)
  - after a play the next `turnStartedAt = now + DROP_MS + CELEBRATE_MS[tier]`
- Firebase writes are unchanged except that timing value. No new data is stored.
- **Nothing new blocks a tap or drag.** The drop, refill and ribbon are all `pointer-events: none`.
- **Once only:** each moment plays once.
  - The drop and refill are keyed by `moveCount`.
  - The ribbon is keyed by `turn@turnStartedAt`.
  - A refresh or late join replays nothing older than 1.5 s.
- **Reduced motion:** tiles appear without moving and the ribbon is a fade. The ribbon's sound and vibration stay as today.
- **Names** in the ribbon go through `Names.short` and stay on one line.
- **Contrast:** AA in both themes. Green band with navy text, navy band with white text.
- **Layouts:** the 360×640 phone fit and the desktop landscape layout stay intact.
- **Shell:** use the PowerShell tool on this machine; the user's antivirus flagged Git Bash.
- **Commits:** no `Co-Authored-By` trailer.

## Review Focus

1. **The room re-renders (presence, clock, opponent) during a drop or refill.** The animation continues from where it was and doesn't restart or vanish. E2E (Task 9) forces a re-render mid-drop and checks the tile's computed animation time keeps advancing.
2. **Your play's room update arrives before the transaction's promise resolves.** Firebase fires the local event first, so the refill must still see which tiles were used. The used indices are recorded before `mutateRoom` is called (Task 6), and E2E (Task 9) checks the refill.
3. **Two moves arrive close together, or a move lands mid-ribbon.** Nothing is left on screen and the newest moment wins. Task 7 wires `Scenes.clearRibbon`, and Task 5 keys the drop to the newest `moveCount`.
4. **Pause, appeal, or the host's resume.** No ribbon appears, because `Pill.ribbon` returns null when paused or an appeal is pending. A resume that moves `turnStartedAt` produces a new key, but `ribbonDue` only fires within 1.5 s of `at` after a real turn change. Covered by unit tests in Task 3.
5. **A projector highlight cutting in from another room.** No drop, and the celebration starts at once. Director unit test in Task 8.

---

### Task 1: Timing constants (rules)

**Files:** `js/match.js`, `js/celebrate.js` (`FALLBACK_CELEBRATE_MS`, the tier-0 comment), `tests/match.test.js`, `tests/celebrate.test.js`

**Interfaces:** Produces `Match.DROP_MS = 700` (exported) and `Match.CELEBRATE_MS[0] = 1000`.

- [ ] **Step 1: Failing tests.**
  - In `match.test.js`, change the expectations:
    - the CAT play (10 pts, tier 0) at `now 5000` now gets `turnStartedAt 6700`, at lines 229 and 419
    - the sudden-death tier-1 case gets `5000 + 700 + 2600 = 8300`, at line 344
  - Add a test: `M.DROP_MS === 700 && M.CELEBRATE_MS[0] === 1000`.
  - In `celebrate.test.js` (around line 111), update the tier-0 comment. Keep `durationFor(0) <= CELEBRATE_MS[0]`, and assert the new value.
- [ ] **Step 2:** Run `node --test tests/match.test.js tests/celebrate.test.js`. Expected: FAIL on the new values.
- [ ] **Step 3:** Implement:
  - In `match.js`, add `const DROP_MS = 700;` and set `CELEBRATE_MS[0] = 1000`.
  - In `applyPlay`, call `endTurn(r, seat, now, wentOut, DROP_MS + CELEBRATE_MS[tier])` and export `DROP_MS`.
  - In `celebrate.js`, set `FALLBACK_CELEBRATE_MS[0] = 1000` and update the comment above `durationFor`.
- [ ] **Step 4:** Run `node --test "tests/*.test.js"`. Expected: all pass. Update any other expectation that hard-coded the old delay, and record it in the ledger.
- [ ] **Step 5:** Commit `feat(match): DROP_MS before the next turn; tier-0 plays get 1 s for their float`.

### Task 2: `Rack.refill` (the on-screen order after your play)

**Files:** `js/rack.js`, `tests/rack.test.js`

**Interfaces:** Produces `Rack.refill(prev: {key, order}, prevRack: string[], rack: string[], used: number[]) -> {key, order, fresh: number[]} | null`.
- `K` is the old indices not in `used`, ascending. The server keeps these letters first, in order. The check is `rack[j] === prevRack[K[j]]` for every `j`; otherwise it returns `null`.
- `D` is the new indices from `K.length` to `rack.length - 1`, the tiles drawn from the bag.
- `order` walks `prev.order`:
  - a kept old index becomes its new index;
  - a used old index takes the next index from `D` and adds it to `fresh`;
  - if `D` runs out (the bag was empty), that position is dropped.
- Any indices left in `D` are appended and added to `fresh`.
- `key = rack.join(',')`.

- [ ] **Step 1: Failing tests:**
  - Shuffled `prev.order` `[2,0,1,3]` over `[A,B,C,D]` (shown as C A B D) with `used [1]` (B) and new rack `[A,C,D,X]` gives `{ order: [1,0,3,2], fresh: [3] }`. The screen shows C A X D, with X in B's old slot.
  - Identity order with `used [0,2]` keeps B and D in their places and puts the drawn tiles in slots 0 and 2.
  - With duplicates (E, E, A), using one E still gives a valid permutation with both letters present.
  - With an empty bag (fewer drawn than used), the order is shorter, and `fresh` is only what was drawn.
  - A mismatch (the letters don't match the kept letters) returns `null`.
  - The input is not mutated.
- [ ] **Step 2:** Run it and expect FAIL. **Step 3:** Implement. **Step 4:** Run all tests and expect a pass. **Step 5:** Commit `feat(rack): Rack.refill keeps your tiles in place and fills the used slots`.

### Task 3: `Pill.ribbon` / `Pill.ribbonDue`

**Files:** `js/pill.js`, `tests/pill.test.js`

**Interfaces:**
- `Pill.ribbon(room, mySeat) -> null | { key, at, mine, text, sudden }`.
  - It returns null without a game, when the status isn't `live` or `suddenDeath`, when `clock.paused`, or when `game.pending`.
  - `key` is `` `${turn}@${turnStartedAt}` ``, and `at` is `turnStartedAt`.
  - `mine` is `mySeat === turn`.
  - `text`:
    - `'YOUR TURN!'` when it's `mine`;
    - for the other seated player, `` `${Names.short(<turn seat's player name> || <turn team name>).toUpperCase()}'S TURN` ``;
    - for spectators and the host (`mySeat` not A or B), the turn team name the same way.
  - `sudden` is `status === 'suddenDeath'`.
- `Pill.RIBBON_WINDOW_MS = 1500`.
- `Pill.ribbonDue(info, lastKey, now) -> boolean` is `!!info && info.key !== lastKey && now >= info.at && now - info.at < RIBBON_WINDOW_MS`.

- [ ] **Step 1: Failing tests:**
  - Player A on A's turn gets `YOUR TURN!`.
  - Player A on B's turn gets `JUAN'S TURN`.
  - A spectator gets the team name, upper case.
  - A 40-character name gets 25 characters plus "…".
  - The result is null when paused, when an appeal is pending, and on `final`.
  - `sudden` is true in sudden death.
  - `ribbonDue`: false before `at`; true at `at`; false 1600 ms after; false when the key equals `lastKey`.
- [ ] **Step 2–4:** FAIL, then implement, then all pass. **Step 5:** Commit `feat(pill): Pill.ribbon — whose-turn text and when it is due`.

### Task 4: `Celebrate.newCells`, `Celebrate.stagger`, and a start delay for `Celebrate.show`

**Files:** `js/celebrate.js`, `tests/celebrate.test.js`; the projector's `newCells` in `js/view-scoreboard.js` is replaced by `Celebrate.newCells`

**Interfaces:**
- `Celebrate.newCells(lastMove) -> [{r, c}]` returns the unique `isNew` cells from `lastMove.words[].cells`, sorted by `r`, then `c`. It returns `[]` for a pass or timeout, or when there are no cells.
- `Celebrate.stagger(n, totalMs, eachMs) -> number[]` gives start delays: `step = n > 1 ? min(120, (totalMs - eachMs) / (n - 1)) : 0`, and `delays[i] = round(i * step)`.
- `Celebrate.show(c, { …, delayMs })`. When `delayMs > 0`, the score is held at once (as today), and the item is queued only after `delayMs`. `clear()` cancels pending delays.

- [ ] **Step 1: Failing tests:**
  - `newCells` with a play whose `cells` include old tiles (`isNew: false`) and duplicates across words returns the unique new cells in order.
  - `newCells` with a pass returns `[]`.
  - `stagger(1, 700, 450)` is `[0]`.
  - `stagger(3, 700, 450)` is `[0, 120, 240]`, because 120 is the cap.
  - `stagger(7, 700, 450)`'s last element is at most 250.
- [ ] **Step 2–4:** FAIL, then implement, then all pass. The `delayMs` part of `show` is browser-only and is covered by the Task 9 E2E. **Step 5:** Commit `feat(fx): newCells, stagger and a start delay for celebrations`.

### Task 5: #10 The opponent's word drops in (room view)

**Files:** `js/view-room.js` (`celebrateNewMove`, `update`), `css/fx.css`

**Interfaces:** Consumes `Celebrate.newCells`, `Celebrate.stagger`, `Match.DROP_MS`, and `Celebrate.show(…, { delayMs })`.
- When `celebrateNewMove` sees a new `lastMove` of type `play` from the **other** seat (spectators and the host count every move as "other"), it sets `ui.drop = { moveCount, cells: Celebrate.newCells(lm), at: performance.now() }`. It calls `Celebrate.show` with `delayMs: Match.DROP_MS`. The mover's own celebration keeps `delayMs: 0`, and no drop is recorded.
- After `UI.renderBoard` in `update()`: while `performance.now() - ui.drop.at < Match.DROP_MS + 600` and `ui.drop.moveCount === g.moveCount`, it adds the class `tile-drop` to each cell's `.tile`, with `animation-delay` set to `` `${delays[i] - elapsed}ms, ${DROP_MS - 150 - elapsed}ms` ``. That delay is negative once started, so a redraw resumes the animation. `delays` is `Celebrate.stagger(n, DROP_MS, 450)`. After that window it stops adding the class.
- CSS:
  - `@keyframes tile-drop` goes from `translateY(-120%) scale(1.35)`, `opacity: 0`, to a 4% overshoot, then to `none`, over 450 ms.
  - `@keyframes word-glow` is a yellow box-shadow pulse, 500 ms.
  - `.tile.tile-drop { animation: tile-drop 450ms cubic-bezier(.2,1.4,.4,1) both, word-glow 500ms ease both; }`
  - Under reduced motion, `.tile.tile-drop { animation: none }`.
- **A play that ends the game:** the result screen hides the board, so there's no drop and no added delay. `renderFinal` is unchanged.
- [ ] **Steps:**
  1. Implement.
  2. Run `node --test "tests/*.test.js"`, which must all pass.
  3. Do a quick headless check: start a room, play a fixture word as B, and on A check that `.tile-drop` appears on exactly the new cells.
  4. Commit `feat(room): the opponent's word drops onto the board`.

### Task 6: #3 The rack refills (room view)

**Files:** `js/view-room.js` (Play button handler, appeal request, `update` rack part, markup), `css/style.css`

**Interfaces:** Consumes `Rack.refill`.
- **Recording the used tiles:**
  - Before `Store.mutateRoom` in the Play handler, it sets `ui.lastUsed = ui.temp.map(t => t.rackIndex)` and `ui.lastRack = room.game.racks[seat].slice()`.
  - It clears both if the play isn't committed.
  - The appeal request does the same, and they're cleared when the host rejects it.
- **In `update()`, before `Rack.sync`:** when the rack's letters changed and `ui.lastUsed` is set, it tries `Rack.refill(ui.rackOrder, ui.lastRack, rack, ui.lastUsed)`.
  - On success: `ui.rackOrder = result`, `ui.refill = { fresh: result.fresh, at: performance.now(), moveCount }`, and `ui.lastUsed = null`.
  - Otherwise: `Rack.sync` as today, with no animation.
- **Markup:** `<span class="rack-bag" aria-hidden="true">👜</span>` is absolutely positioned inside `.rack-row` (it takes no layout space) and is visible only while `ui.refill` runs.
- **While `performance.now() - ui.refill.at < 1100`:**
  - Each fresh tile gets the class `tile-dealt`, with `--fx` / `--fy` set to the bag's centre minus the tile's centre, and a negative `animation-delay` from `Celebrate.stagger(n, 900, 500)`.
  - `@keyframes tile-dealt` goes from `translate(var(--fx), var(--fy)) rotateY(180deg) scale(.6)`, `opacity: 0`, to `none`, over 500 ms.
  - Under reduced motion there's no animation.
- [ ] **Steps:**
  1. Implement.
  2. Run the unit tests, which must all pass.
  3. Do a quick headless check without the dictionary:
     - On A's page, set `ui.lastUsed` / `ui.lastRack` as the Play handler would, via `window.__room.ui`. That test hook exposes the live `ui` object, and only when `Store.ROOT` is the playground area, i.e. `/_playground$/`. It's never exposed on the real tournament data.
     - Apply the play by fixture (`Match.applyPlay`).
     - The rack shows `tile-dealt` on exactly 2 tiles, and the other 5 keep their places.
  4. Commit `feat(room): your rack refills with tiles dealt from the bag`.

### Task 7: #4 The whose-turn ribbon (room view)

**Files:** `js/scenes.js` (`ribbon`, `clearRibbon`), `js/view-room.js` (`tick`), `css/fx.css`

**Interfaces:** Consumes `Pill.ribbon`, `Pill.ribbonDue`, `Pill.RIBBON_WINDOW_MS`.
- **`Scenes.ribbon(container, { text, mine, sudden })`:**
  - It removes any current ribbon, then adds `.turn-ribbon` (`fixed`, `z-index: 9450`, `pointer-events: none`, `aria-live` polite text).
  - The band is `.tr-band`: green with navy text when `mine`, otherwise navy with white text.
  - With `sudden`, a small "⚡ SUDDEN DEATH" line sits above the main text.
  - It removes itself after 1200 ms.
  - `@keyframes tr-sweep` slides from `translateX(-110%)` to `none` at 15%, holds to 65%, then slides to `translateX(110%)` at 100%, over 1200 ms. Under reduced motion it's a 1200 ms fade.
- **`Scenes.clearRibbon()`** removes it. `view-room` `teardown`/`renderFinal` call it.
- **In `view-room` `tick()`:** if `Pill.ribbonDue(info, ui.ribbonKey, Store.serverNow())`, it calls `Scenes.ribbon(liveRoot, info)` and then sets `ui.ribbonKey = info.key`, where `info = Pill.ribbon(room, mySeat)`.
- **Text:** the band text uses `textContent` (no HTML).
- [ ] **Steps:**
  1. Implement.
  2. Run the unit tests, which must all pass.
  3. Do a quick headless check: after a fixture move, A gets a green "YOUR TURN!" band within 1.5 s of `turnStartedAt`, and B gets the navy "MARIA'S TURN".
  4. Commit `feat(room): a ribbon shows whose turn it is`.

### Task 8: Projector: drop, highlight timing, ribbon

**Files:** `js/director.js`, `tests/director.test.js`, `js/view-scoreboard.js`

**Interfaces:**
- **`Director`:** a highlight for the room that is **already featured** when it plays lasts `CELEBRATE_MS[tier] + HIGHLIGHT_PAD_MS + Match.DROP_MS`. A highlight that switches rooms keeps `CELEBRATE_MS[tier] + HIGHLIGHT_PAD_MS`. The scene stores `move.dropped = true|false`, so the view knows whether to delay.
- **`view-scoreboard` `renderBoard`:**
  - When the featured room's `moveCount` grew by exactly 1 since the last render of the **same** room and `lastMove.type === 'play'`, it gives the new tiles `tile-drop` with the stagger delays.
  - `st.drop = { code, moveCount, at }` survives later redraws.
  - When the room changed, it shows the `bp-new` glow only, as today.
- **`mountScene`:** a highlight with `d.move.dropped` gets `Celebrate.show(…, { delayMs: Match.DROP_MS })`.
- **Ribbon:** in the projector tick, when the scene is neither `intro`, `roundStart`, `highlight` nor `winner`, and `Pill.ribbonDue(Pill.ribbon(room, null), st.ribbonKey, now)` holds for the featured room, it calls `Scenes.ribbon(stage, info)`. The broadcast size comes from `body.bigscreen` CSS.
- [ ] **Step 1: Failing director tests:**
  - A tier-3 move in the featured room gives a highlight of `CELEBRATE_MS[3] + 300 + DROP_MS` and `move.dropped === true`.
  - A tier-3 move in another room (cut-in) gives `CELEBRATE_MS[3] + 300` and `dropped === false`.
  - Update `HL3`/`HL4` in the test file where needed.
- [ ] **Steps 2–4:**
  1. FAIL.
  2. Implement `director.js`, then all tests pass.
  3. Implement `view-scoreboard`.
- [ ] **Step 5:** Commit `feat(projector): word drop, drop-aware highlights and the turn ribbon`.

### Task 9: Browser checks (E2E) and docs

**Files:** create `.superpowers/e2e/turnmoments.js` (git-ignored; same harness and rules: port 8765, `TEST-` data only, relative to existing playground rooms). Modify `CLAUDE.md` (`DROP_MS`, `CELEBRATE_MS[0]`, `Rack.refill`, `Pill.ribbon`, `Celebrate.newCells`/`stagger`/`show delayMs`, `Scenes.ribbon`).

- [ ] **Step 1: Scenario.** Use A on a 1366 laptop, B on a 360 phone, a spectator and the projector. It must check each of the following:
  1. **Turn delay:** a fixture play by A of 10 points sets `turnStartedAt = at + 1700`; a 44-point play sets `+ 3700`, checked from the room data.
  2. **Drop:** on B, exactly the new cells get `tile-drop`. On A (the mover) none do.
  3. **Drop across a redraw:** forcing a redraw mid-drop (a presence write) keeps `tile-drop` on the new tiles, and their `getAnimations()[0].currentTime` keeps increasing.
  4. **Celebration delay:** B's celebration overlay appears about 700 ms after the drop starts, at least 500 ms after the move.
  5. **Ribbon wording:** B gets "YOUR TURN!" (green) within 1.5 s of `turnStartedAt`; A gets the navy band with B's name, at most 25 characters plus "…"; the spectator gets the team name.
  6. **Paused:** a host pause shows no ribbon, and Resume doesn't produce one either.
  7. **Refill:** A plays 2 tiles through the UI (or a fixture that mimics the play, with `ui.lastUsed` set the same way). Exactly 2 tiles get `tile-dealt`, and the other 5 keep their on-screen positions, using `data-i` → letter.
  8. **Refresh:** reloading B during a turn replays nothing older than 1.5 s.
  9. **Reduced motion:** with it emulated (`Emulation.setEmulatedMedia` `prefers-reduced-motion`), there's no `tile-drop` animation running, and the ribbon is a fade.
  10. **Projector:**
      - the featured room's move drops in;
      - a tier-3 cut-in from another room gets no drop;
      - the ribbon shows for the featured room.
  11. **Contrast:** AA for `.tr-band` in both themes.
  12. **Console:** no console errors.
- [ ] **Step 2:** Run `node .superpowers/e2e/turnmoments.js`. Expected: `TURNMOMENTS E2E PASS`. Take screenshots with `SHOTS` and review them.
- [ ] **Step 3:** Run `qa-pass1.js`, `dragdrop.js`, `quickwins.js`, `landscape.js` and `revamp.js`, which must all PASS. Update any of their timing expectations that depended on the old tier-0 delay, and record each in the ledger.
- [ ] **Step 4:** Update `CLAUDE.md`, then commit `docs: CLAUDE.md for turn moments`.
