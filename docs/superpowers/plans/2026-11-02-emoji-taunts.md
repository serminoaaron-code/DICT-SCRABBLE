# Emoji Taunts and Easier Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seated players can send one of three animated emoji taunts (Angry, LOL, Crying; 10 s cooldown), which everyone in the room and the big screen sees live. Celebration tiers become easier: 8 / 15 / 25 / 40.

**Architecture:**
- **Room data:** a taunt is each seat's latest `{ e, at }` in `rooms/<CODE>/taunts`, written through `Store.mutateRoom` around a pure `Match.taunt`.
- **New module `js/taunt.js`** (UMD global `Taunt`):
  - pure helpers (`cooldownLeft`, `canSend`, `arrivals`, `box`) with unit tests;
  - browser-only `face` / `show` / `clear`, which draw our own SVG faces animated with CSS.
- **Views:** the room view adds the 😀 button and pop-up, and shows arrivals. The projector shows arrivals for the room on screen.
- **Tiers:** a threshold change in `ScrabbleEngine.celebrationTier`.

**Tech Stack:** vanilla JS (UMD modules, no build step), Firebase RTDB v8 SDK, CSS in `css/fx.css`, Node ≥18 `node --test`, the git-ignored CDP E2E harness in `.superpowers/e2e/`.

**Spec:** `docs/superpowers/specs/2026-11-02-emoji-taunts-design.md`

## Global Constraints

- Tiers: 4 if bingo or total ≥ 40; 3 if ≥ 25; 2 if ≥ 15; 1 if ≥ 8; else 0. `CELEBRATE_MS` is unchanged (`[1000, 2600, 2600, 3000, 4500]`).
- Taunt ids, exactly: `'angry'`, `'lol'`, `'cry'`. Labels: `Angry`, `LOL`, `Crying`.
- `TAUNT_COOLDOWN_MS = 10000`, per seat, checked in `Match.taunt`.
- On-screen time is about 2.5 s (`Taunt.SHOW_MS = 2500`). A taunt that arrives more than `Taunt.LATE_MS = 3000` after its `at` is skipped.
- Live only: the first render of a room view only sets the baseline (nothing shows), and there's no history anywhere.
- A taunt is allowed while the status is `live`, `suddenDeath` or `hostDecision`, the VS intro is over (`now >= clock.startedAt`), the seat is `A` or `B`, and the id is valid.
- Only seated players get the 😀 button. Players, spectators, the host's room view and the big screen (room on screen, normal room view and highlight only) show taunts.
- The faces are inline SVG + CSS keyframes, drawn by us: no image or GIF files, and no third-party emoji art or names. The name of any app or game the idea came from never appears in the repo.
- Every room write uses `Store.mutateRoom` around a pure `Match` function. Never write `undefined`.
- User strings (player names in the tag) go in with `textContent`, never `innerHTML`.
- `pointer-events: none` on the shown face. It covers at most the board's top edge, never the rack or the action row.
- WCAG AA in both themes. Reduced motion means a fade only. The page must fit at 360px with no horizontal overflow.

## Review Focus

1. **A taunt sent just before Play word or Pass from the same device.** Both transactions run, and the move must land. Task 2's unit test pins that `Match.taunt` changes only `taunts`. Task 7's E2E taunts, then plays at once.
2. **A refresh during the cooldown, or within 2.5 s of a taunt.** The cooldown carries on from the room data, and the old taunt doesn't replay (Task 7 E2E).
3. **At 360px the action row with 😀 fits on one line**, and the pop-up and the face stay on screen (Task 7 E2E, width probe).
4. **The pop-up left open when the game ends, a pause starts, or the room view rebuilds.** It closes and nothing throws. The button is hidden on the result screen (Task 7 E2E).
5. **Taunts from both seats at once, or during a celebration or the ribbon.** Both show, one on each side, and neither hides the celebration's title or points (Task 7 E2E).

---

### Task 1: Easier celebration tiers

**Files:** `js/engine.js` (`celebrationTier` and its comment), `tests/engine.test.js`, `tests/celebrate.test.js`, `tests/match.test.js`, `tests/director.test.js`

**Interfaces:** Produces `ScrabbleEngine.celebrationTier(total, bingo)` with the new thresholds. Every caller is unchanged.

- [ ] **Step 1: Failing test.** In `tests/engine.test.js`, add `celebrationTier: easier thresholds 8 / 15 / 25 / 40`:
  - boundaries `7→0, 8→1, 14→1, 15→2, 24→2, 25→3, 39→3, 40→4`;
  - `celebrationTier(3, true) === 4`.
  
  In `tests/celebrate.test.js`, update `tierFor delegates to the engine` to the same boundaries. The old-room case becomes `tierFor({ total: 39 }) === 3`.
- [ ] **Step 2:** Run `node --test tests/engine.test.js tests/celebrate.test.js`. Expected: FAIL.
- [ ] **Step 3:** Change the thresholds in `celebrationTier`, and update its comment to `8/15/25/40`.
- [ ] **Step 4:** Run `node --test "tests/*.test.js"`. Expected: only tests that hard-code tier-dependent values fail. Update each to the new tier:
  - **`tests/director.test.js`:** the `played(room, 40)` fixture (19 uses) meant "Awesome!/tier 3". Change those to `played(room, 30)`, fix the comment on the `played` factory, and leave the 60s.
  - **`tests/match.test.js`:** `turnStartedAt` expectations whose test play changes tier. Recompute each as `now + DROP_MS + CELEBRATE_MS[newTier]`.
  
  Ledger every edited test. Expected after: all pass.
- [ ] **Step 5:** Commit `feat(rules): easier celebration tiers (8 / 15 / 25 / 40)`.

### Task 2: `Match.taunt`, the room-data rule

**Files:** `js/match.js`, `tests/match.test.js`

**Interfaces:**
- Produces:
  - `Match.TAUNTS = ['angry', 'lol', 'cry']`;
  - `Match.TAUNT_COOLDOWN_MS = 10000`;
  - `Match.taunt(room, seat, id, { now }) -> room | null`;
  - `normalizeRoom` now always gives `room.taunts = { A: null | { e, at }, B: null | { e, at } }`.
- **Allowed statuses:** `['live', 'suddenDeath', 'hostDecision']`. This is its own list: `PLAYING` lacks `hostDecision`.

- [ ] **Step 1: Failing tests** in `tests/match.test.js`, using `liveRoom()` and `startedRoom()`:
  - `taunt: sets the seat's latest taunt and nothing else`: `Match.taunt(r, 'A', 'lol', { now: T })` gives `taunts.A = { e: 'lol', at: T }`, and `taunts.B` stays `null`. With `taunts` deleted from both rooms, the result `deepStrictEqual`s the input. The input isn't mutated (frozen input).
  - `taunt: the next one from the same seat overwrites (no history)`: after two taunts 10 s apart, `taunts.A` is the second one and there's no other key.
  - `taunt: 10 s cooldown per seat`: an A taunt at T, then A at `T + 9999` gives `null`, and A at `T + 10000` is accepted. B at `T + 1` is accepted (the cooldown is per seat).
  - `taunt: rejected outside the game screen`:
    - status `waiting`, `final` or `void` gives `null`;
    - during the intro (`now < clock.startedAt`) gives `null`;
    - `hostDecision` is accepted;
    - a paused clock is accepted.
  - `taunt: rejects a bad seat or id`: `'watch'`, `'host'` and `'x'` as the seat give `null`; `'smile'` and `undefined` as the id give `null`.
  - `normalizeRoom: taunts default to { A: null, B: null }`, and a stored `{ A: { e, at } }` keeps A and gives `B: null`.
- [ ] **Step 2:** Run `node --test tests/match.test.js`. Expected: FAIL (`Match.taunt` isn't a function).
- [ ] **Step 3:** Implement it in `js/match.js`, export the three names, and add `taunts` to `normalizeRoom`.
- [ ] **Step 4:** Run `node --test "tests/*.test.js"`. Expected: all pass.
- [ ] **Step 5:** Commit `feat(match): Match.taunt - each seat's latest taunt, 10 s cooldown`.

### Task 3: `js/taunt.js`: pure helpers and the three faces

**Files:**
- Create: `js/taunt.js` (UMD like `celebrate.js`) and `tests/taunt.test.js`.
- Modify:
  - `index.html`: add `<script src="js/taunt.js"></script>` right after `celebrate.js`;
  - `css/fx.css`: the face and pop-in styles;
  - `CLAUDE.md`: the script order, the file table, the UMD list and the TDD list.

**Interfaces:**
- Consumes: `Match.taunt`, `Match.TAUNTS`, `Match.TAUNT_COOLDOWN_MS` (Task 2).
- Produces:
  - **Constants:** `Taunt.IDS`, `Taunt.LABELS = { angry: 'Angry', lol: 'LOL', cry: 'Crying' }`, `Taunt.SHOW_MS = 2500`, `Taunt.LATE_MS = 3000`.
  - `Taunt.cooldownLeft(room, seat, now) -> ms ≥ 0`, which is `max(0, at + COOLDOWN - now)`, or 0 with no taunt.
  - `Taunt.canSend(room, seat, now) -> bool`, which is `Match.taunt(room, seat, 'lol', { now }) !== null`.
  - `Taunt.arrivals(seen, room, now) -> { seen: { A, B }, show: [{ seat, e, at }] }`:
    - `seen` holds the last `at` per seat;
    - when `seen === null` (first render), `show` is `[]` and `seen` takes the room's values;
    - an entry shows when its `at` is greater than `seen[seat]` and `now - at <= LATE_MS`;
    - `show` is ordered A then B.
  - `Taunt.box(sideRect, barRect, vw, scale = 1.5) -> { left, top, size }`:
    - `size = clamp(round(barRect.height * scale), 44, 160)`;
    - centred on the side horizontally (clamped to `[0, vw - size]`) and on the bar vertically;
    - whole px.
  - **Browser only:**
    - `Taunt.face(id) -> SVGElement`: the animated face, class `tf tf-<id>`.
    - `Taunt.show(anchorEl, barEl, info, opts)`:
      - `info = { seat, e, name }`; `opts = { scale, container }`;
      - draws a fixed `.taunt` with `.tf` and a `.taunt-tag` holding the name (via `textContent`);
      - it has `role="status"` and an `aria-label` of `"<name>: <Label>"`;
      - it replaces the same seat's taunt still on screen, and removes itself after `SHOW_MS`.
    - `Taunt.clear()`.

- [ ] **Step 1: Failing tests** in `tests/taunt.test.js`:
  - `cooldownLeft`: no taunt gives 0; at T, now `T + 4000` gives 6000; now `T + 12000` gives 0.
  - `canSend`: mirrors `Match.taunt`'s guard (live room after the intro → true; during the cooldown, during the intro, `'watch'` or a final room → false).
  - `arrivals`:
    - the first render is a baseline: `show: []`;
    - a new A taunt shows;
    - the same `at` again doesn't;
    - a taunt 3001 ms old when it arrives is skipped, but `seen` still advances;
    - A and B together show both, A first.
  - `box`:
    - `box({ left: 10, top: 90, width: 150, height: 40 }, { left: 8, top: 88, width: 344, height: 44 }, 360)` gives `{ left: 52, top: 77, size: 66 }`;
    - a side at the right edge is clamped so `left + size <= vw`;
    - `scale 0.9` gives a smaller size.
- [ ] **Step 2:** Run `node --test tests/taunt.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the pure parts, then the browser parts.
  - **Faces:** follow the mockup. Angry is an orange-red face, shaking, with steam puffs. LOL is a yellow face rocking, with squirting tears. Crying is a yellow face sobbing, with running tear streams.
  - **CSS** in `fx.css`: `.taunt` is fixed, `pointer-events: none` and `z-index: 9650`. That sits above `.scorebar`'s 9600 lift during a celebration (so it stays on the bar), below the flying points (9700), and over the ribbon (9450, mid-board, which never overlaps the bar).
  - **Animation:** a pop-in, then a fade-out over `SHOW_MS`.
  - **Reduced motion:** opacity only, and the faces' own keyframes are off.
  - `.taunt-tag` is navy with white text, AA.
- [ ] **Step 4:** Run `node --test "tests/*.test.js"`. Expected: all pass.
- [ ] **Step 5:** Commit `feat(taunt): Taunt module - cooldown, arrivals, placement and the three animated faces`.

### Task 4: Room view: the 😀 button and pop-up (sending)

**Files:** `js/view-room.js`, `css/style.css`

**Interfaces:** Consumes `Taunt.canSend`, `Taunt.cooldownLeft`, `Taunt.face`, `Taunt.LABELS`, `Match.taunt`.

- [ ] **Step 1: Markup.**
  - Add `<button id="tauntBtn" class="secondary taunt-btn" aria-label="Send a taunt" aria-haspopup="true" aria-expanded="false">😀<span class="taunt-cd hidden"></span></button>` between `#passBtn` and `.more-wrap`.
  - Add `<div class="taunt-pop hidden" id="tauntPop" role="menu">` with three `<button role="menuitem" data-taunt="<id>" aria-label="Send <Label>">` buttons, each filled with `Taunt.face(id)` when the room view is built.
- [ ] **Step 2: Behaviour.**
  - **Visibility:** `#tauntBtn` shows only when `ctx.state.mySeat` is `A` or `B`, the room is not final or void, and the VS intro is over.
  - **Button state:** in `update()` and on every tick, it's disabled while `!Taunt.canSend(room, seat, now)`. During the cooldown, `.taunt-cd` shows `Math.ceil(cooldownLeft / 1000)`.
  - **Opening:** clicking toggles `#tauntPop` and its `aria-expanded`. It never opens while disabled.
  - **Sending:** clicking a face closes the pop-up, then calls `Store.mutateRoom(ctx.code, r => Match.taunt(r, seat, id, { now: Store.serverNow() }))`. No toast on failure.
  - **Closing:** the pop-up closes on an outside click, on Escape, when it becomes disabled, and on teardown or `renderFinal`.
  - **360px:** on phones narrower than 380px, `#recallBtn` shows only `↩` (its label in a `span` hidden by CSS), so the action row fits on one line.
- [ ] **Step 3:** Run `node --test "tests/*.test.js"`. Expected: all pass. The browser checks are in Task 7.
- [ ] **Step 4:** Commit `feat(room): the 😀 taunt button and pop-up`.

### Task 5: Room view: showing taunts (players, spectators, host)

**Files:** `js/view-room.js`

**Interfaces:** Consumes `Taunt.arrivals`, `Taunt.box`, `Taunt.show`, `Taunt.clear`.

- [ ] **Step 1:** In `renderLive` after `celebrateNewMove`, add `showTaunts(el, room, ctx)`:
  - `const a = Taunt.arrivals(ui.tauntSeen ?? null, room, Store.serverNow()); ui.tauntSeen = a.seen;`
  - Reset `ui.tauntSeen` to `undefined` when the room view is (re)built, so the first render is a baseline.
  - For each item in `a.show`, call `Taunt.show(el.querySelector('#side' + seat), el.querySelector('.scorebar'), { seat, e, name }, { container: el.querySelector('#liveRoot') })`.
  - `name` is the sender's player name via `Names.short`.
- [ ] **Step 2:** `Taunt.clear()` at both teardown sites, next to `Scenes.clearRibbon()`.
- [ ] **Step 3:** Run `node --test "tests/*.test.js"`. Expected: all pass.
- [ ] **Step 4:** Commit `feat(room): taunts pop out of the sender's side of the score bar`.

### Task 6: Big screen

**Files:** `js/view-scoreboard.js`, `css/fx.css`

- [ ] **Step 1:** In `render()`, for the room on screen (`st.shown`):
  - `Taunt.arrivals` with `st.tauntSeen`, reset to `null` whenever `st.shown` changes (`showRoom`), so a cut never replays one;
  - show only when `st.dir.scene` is `'room'` or `'highlight'`;
  - anchor `.bp-side[data-side=<seat>]`, bar `#bigTop`, `scale: 0.9`, container `stage`, and `name` = the team name;
  - taunts from other rooms are ignored.
- [ ] **Step 2:** `Taunt.clear()` in `showRoom` when the room changes, and at teardown.
- [ ] **Step 3:** Run `node --test "tests/*.test.js"`. Expected: all pass.
- [ ] **Step 4:** Commit `feat(projector): taunts for the room on screen`.

### Task 7: Browser checks and docs

**Files:**
- Create: `.superpowers/e2e/taunts.js`, using the same harness and rules as `turnmoments.js`: port 8765, `TEST-` data only, `ONLY=` sections and `SHOTS`.
- Modify: `CLAUDE.md` (the room-data diagram gains `taunts: { A|B: { e, at } }`, plus the Taunt row and the tiers) and `docs/important-docs/bugs-fixed.md` (no entry: this is a feature).

- [ ] **Step 1: Scenario.** Use A on a 1366 laptop, B on a 360 phone, a spectator, the host's room view and the projector (pinned):
  1. B has `#tauntBtn` and the spectator and host don't. During the VS intro the button is hidden.
  2. B opens the pop-up and sends LOL. Within 1 s, `.taunt` shows on A, the spectator, the host and the projector, positioned over `#sideB` (projector: `.bp-side[data-side=B]`). Its tag reads "JUAN" (or the team on the projector), and it's gone after about 2.5 s.
  3. B's button shows the countdown and is disabled. A second taunt sent through `Store.mutateRoom` within 10 s isn't committed.
  4. A refresh of B during the cooldown keeps the button disabled. A refresh of A within 2.5 s of a taunt shows no `.taunt`.
  5. B sends a taunt, then plays a word right away (fixture or `L.place` + Play). The play lands (`moveCount` +1) and the taunt shows.
  6. A and B taunt in the same second: two `.taunt`s, one on each side.
  7. A taunt during a celebration: the face stays above the score bar and doesn't cover `.fx-title`.
  8. At 360px, nothing is wider than the screen with the pop-up open (the qa-pass1 width probe). The face and pop-up are on screen.
  9. Reduced motion: the face's own animations don't run.
  10. Contrast: the `.taunt-tag` text is AA in both themes.
  11. The game ends with the pop-up open: the result screen shows no `#tauntBtn` and no errors.
  12. No console errors.
- [ ] **Step 2:** Run `node .superpowers/e2e/taunts.js`. Expected: `TAUNTS E2E PASS`. Take screenshots with `SHOTS` and review them.
- [ ] **Step 3:** Re-run `turnmoments.js`, `qa-pass1.js`, `dragdrop.js`, `quickwins.js`, `landscape.js` and `revamp.js`, one at a time in the foreground (the PC runs low on memory). Update tier-dependent expectations from Task 1, for example the turn-moments fixtures whose totals change tier. Ledger each one.
- [ ] **Step 4:** Grep the repo (excluding `.git` and `.superpowers`) for the name of the app or game the idea came from. Expected: no matches.
- [ ] **Step 5:** Commit `docs: CLAUDE.md for taunts and the new tiers`.
