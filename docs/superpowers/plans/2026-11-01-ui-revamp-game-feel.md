# UI Revamp, Game Feel and Broadcast Projector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole app in the banner's "Sportsfest Pop" look with a light/dark switch, and add the game-feel layer (turn pill, four celebration tiers, VS intro and coin toss, dramatic result screens, sounds) plus a broadcast projector view with an auto-director and a host pin.

**Architecture:** Visual changes live in CSS and markup and keep every existing element id. Each new behaviour is its own small file. Decision logic is pure and unit-tested (UMD modules loaded by both the browser and Node): the turn pill state, the celebration tier, the clock and data changes in `match.js`, and the director. The DOM modules render from that logic. The room, game and scoring architecture (`Store.mutateRoom` around pure `Match` functions) is unchanged.

**Tech Stack:** vanilla HTML/CSS/JS with no build, Google Fonts (Archivo Black, Inter), Web Audio API, Firebase RTDB v8, Node `node --test`, and the raw-CDP browser harness in `.superpowers/e2e/`.

**Spec:** `docs/superpowers/specs/2026-11-01-ui-revamp-game-feel-design.md`. Read it first. The approved mockups it lists are the visual reference: `.superpowers/brainstorm/103-1793532112/content/*.html`.

## Global Constraints

- No build step and no npm packages. External assets only from `https://fonts.googleapis.com` (Archivo Black, Inter) and the existing Firebase CDN.
- **Keep every element id and `data-*` attribute used by the code and the E2E harness:**
  - player and room: `#statusLine #turnClock #matchClock #sideA #sideB #board-container #rack #playBtn #recallBtn #passBtn #resignBtn #rejectBox #noticeBox #lastMove #hostBar #liveRoot #tossLine #stopWatching #leaveSeat #readyBtn #startBtn #watchCount #finalStandings #joinStandings #correctBtn #voidFinalBtn`
  - join and host dashboard: `#joinForm #joinCode #joinName #hostPw #hostLogin #teamList #teamName #addTeam #standings #roomList #newRoom #nrA #nrB #nrLen #nrCustom #nrError #nrCreated #nrCode #lockBtn #bigScreenBtn #resetPlayground`
  - projector: `#bigStand #bigLive #bigRecent`
  - attributes: `[data-claim] [data-watch] [data-host] [data-seat] [data-room] [data-walkover] [data-void] [data-correct] [data-remove] [data-rename] [data-act] [data-r] [data-c] [data-i] [data-bigclock]`
- **Tokens** (spec §4.1):
  - brand: `--navy #0b1f4d`, `--blue #1446a0`, `--sky #2e7cf6`, `--red #e1251b`, `--yellow #ffc20e`, `--green #00a651`, `--cream #f6e7c1`
  - light: bg `#ffffff`, surface `#f2f5fc`, text `#0b1f4d`, muted `#5b6b8c`
  - dark: bg `#0a1430`, surface `#13224a`, text `#eef2ff`, muted `#9fb0d6`
  - premium squares: 3W red, 2W and ★ yellow (navy text), 3L green, 2L sky. Tiles are always cream with navy letters.
- **Contrast rule:** a light background gets dark text and a dark background gets light text, on every pill, chip, badge and card. Everything meets WCAG AA (4.5:1 for normal text, 3:1 for large text and UI) in both themes.
- **Storage keys:** `scrabble.theme` (`'light'|'dark'`), `scrabble.sound` (`'1'` = on; default off).
- **Fixed values:**

  | Constant | Value |
  |---|---|
  | `Match.INTRO_MS` | `5000` |
  | `Match.CELEBRATE_MS` | `[0, 2600, 2600, 3000, 4500]` (indexed by tier) |
  | Tier thresholds | 15 / 25 / 40 / 60, or any bingo = tier 4 |
  | Director rotation | 20000 ms |
  | Director minimum dwell | 8000 ms |
  | Round-start window | 10000 ms |
  | Winner card | 8000 ms |
  | Drama window | 60000 ms |
  | Last-10-seconds pill | ≤ 10000 ms |

- **Fixed copy:**

  | Where | Text |
  |---|---|
  | Celebration titles | `Not Bad!`, `Cool!`, `Awesome!`, `IMPOSSIBLE!!!` |
  | Leave button | `Leave` |
  | Leave confirm | `Leave the game? Your team (<TEAM>) loses this match.` |
  | Leave result reason | `<player> left the game` |
  | Turn pill | `Your turn`, `<name>'s turn`, `⏸ Paused`, `⚖️ Waiting for host`, `⚖️ Waiting for host decision`, `Get ready` |
  | Sudden-death pill | `⚡ Sudden death · round N/3 · <who>` |
  | Coin caption (`#tossLine`) | `🪙 Coin toss: <TEAM> goes first` |
  | Result headline | `<TEAM> wins` (it may be shown uppercase with CSS) |

- **Accessibility:**
  - `prefers-reduced-motion: reduce` disables shake, flash, confetti, rays, the coin flip and slides, and turns them into fades.
  - At most one flash per scene.
  - Sound is off until the user turns it on.
- **Phone fit:** on a 360×640 viewport, a seated player in a normal turn sees the header, score bar, pill, full board, rack and actions with **no vertical or horizontal scroll**, in both themes, with the PLAYGROUND bar showing.
- Tests: `node --test "tests/*.test.js"` must stay green (currently 80). Every E2E scenario in `.superpowers/e2e/` must pass at the end of each task that touches the UI. Change only the text expectations this plan changes; each change is listed in its task.
- Work on `feat/ui-revamp`, commit at the end of every task, no `Co-Authored-By`.

## Review Focus

1. **Refreshing during a celebration or the intro:** the celebration never replays, and the intro shows only its remaining part, never from the start once the clocks have begun. (Task 8 test `detect ignores the first snapshot`; Task 9 test `introRemaining`.)
2. **The opponent plays quickly during a celebration, so two moves arrive close together:** both celebrations play one after the other, and both scores are correct. (Task 8 test `queue plays moves in order`.)
3. **Dark mode on every pill, badge and button:** nothing is unreadable, including the result-screen score pill. (Task 13 E2E `contrast AA in both themes`.)
4. **A 360×640 phone with the PLAYGROUND bar and 40-character names:** no scrolling or overflow on the game screen. (Task 3 E2E `fits 360x640`.)
5. **A pinned room finishes while highlights from other rooms are queued:** the projector shows the winner card, plays the queued highlights, and returns to AUTO instead of staying on the dead room. (Task 11 test `pinned room finishing returns to auto after winner card`.)

---

## File Structure

| File | Responsibility |
|---|---|
| `css/style.css` | **Rewritten:** tokens, light/dark via `html[data-theme]`, Pop components, layouts, reduced-motion base |
| `css/fx.css` (new) | Keyframes and styles for celebrations, intro/coin, round start, result scenes, broadcast transitions |
| `js/theme.js` (new, UMD `Theme`) | `resolve()` (pure) plus the header switch |
| `js/sound.js` (new, global `Sound`) | Web Audio tones, the sound switch, vibration |
| `js/pill.js` (new, UMD `Pill`) | `state(room, mySeat, now)`, pure turn-pill state |
| `js/celebrate.js` (new, UMD `Celebrate`) | `tierFor`, `detect` (pure), `show` and the queue (DOM) |
| `js/scenes.js` (new, global `Scenes`) | VS intro + coin, round start, result scenes (DOM), plus the pure `introRemaining` |
| `js/director.js` (new, UMD `Director`) | Pure auto-director |
| `js/engine.js` | Adds `celebrationTier` |
| `js/match.js` | Adds `INTRO_MS`, `CELEBRATE_MS`, the intro offset, the start guard, the celebration delay, `lastMove.bingo`, `bestMove` |
| `js/store.js` | Adds `setPinned` / `watchPinned` |
| `js/view-room.js`, `js/view-host.js`, `js/ui.js`, `js/view-scoreboard.js`, `index.html` | New markup and hooks (ids kept) |
| `tests/theme.test.js`, `tests/pill.test.js`, `tests/celebrate.test.js`, `tests/scenes.test.js`, `tests/director.test.js` (new); `tests/engine.test.js`, `tests/match.test.js` | Unit tests |
| `.superpowers/e2e/revamp.js` (new) | New browser checks (git-ignored harness) |

**Script order in `index.html`:** Firebase CDN → `engine.js` → `match.js` → `dictionary.js` → `env.js` → `pill.js` → `celebrate.js` → `director.js` → `store.js` → `ui.js` → `theme.js` → `sound.js` → `scenes.js` → `view-host.js` → `view-room.js` → `view-scoreboard.js` → `app.js`.

**UMD pattern:** the same as `engine.js`. Modules that need other modules use `typeof require === 'function' ? require('./x.js') : root.X`.

---

## Phase A: Look and layout

### Task 1: Design tokens, fonts, theme switch, header

**Files:**
- Create: `js/theme.js`, `tests/theme.test.js`
- Modify: `css/style.css` (token layer and base), `index.html` (fonts and header), `js/app.js` (call `Theme.init()` and `Sound` placeholder wiring)

**Interfaces:**
- **Produces:**
  - `Theme.resolve(stored: 'light'|'dark'|null|undefined, prefersDark: boolean) → 'light'|'dark'`
  - browser-only: `Theme.init()` sets `document.documentElement.dataset.theme` from storage or the media query; `Theme.toggle()` switches and saves `scrabble.theme`; `Theme.current()`
  - Header buttons: `#themeToggle` and `#soundToggle`. The sound button is wired in Task 7; until then it only toggles `scrabble.sound` and its icon (🔇/🔊).

- [ ] **Step 1: Write failing tests** in `tests/theme.test.js`:
  - `stored choice wins`: `resolve('dark', false) === 'dark'`, `resolve('light', true) === 'light'`
  - `falls back to the device setting`: `resolve(null, true) === 'dark'`, `resolve(undefined, false) === 'light'`
  - `ignores junk`: `resolve('blue', true) === 'dark'`
- [ ] **Step 2: Run `node --test "tests/*.test.js"`.** Expected: FAIL, `Cannot find module '../js/theme.js'`.
- [ ] **Step 3: Implement `js/theme.js`.** Rewrite the token layer of `css/style.css`:
  - `:root` brand tokens; `html[data-theme="light"]` and `html[data-theme="dark"]` semantic tokens (`--bg --surface --text --muted --line --sq --gridbg --bar --rack`)
  - premium-square colours, Archivo Black for `h1-h3`/`.disp`/scores, Inter for body
  - the yellow and red corner circles as decorative `body::before`/`::after`
  - Add `<link>` tags to Google Fonts in `index.html`, and `#themeToggle`/`#soundToggle` in the header. Keep the banner image. Existing components should look reasonable in both themes using the tokens; full component restyling is Task 2.
- [ ] **Step 4: Run `node --test "tests/*.test.js"`.** Expected: all PASS.
- [ ] **Step 5: Verify in the browser.** Run every scenario in `.superpowers/e2e/` (`for t in t7 t8 t9 t10 t11 t13 t14 fixes playground minors; do node $t.js; done`). Expected: all PASS. Manually open `http://localhost:8000/` with `python -m http.server 8000`: the theme toggle switches and survives a refresh.
- [ ] **Step 6: Commit:** `feat(ui): design tokens, fonts, light/dark switch`

### Task 2: Pop restyle of join, lobby, host dashboard, final screen

**Files:** Modify `css/style.css`, `js/view-room.js` (join and lobby markup classes only), `js/view-host.js` (markup classes, team chips), `js/ui.js` (`renderStandings` markup classes).

**Interfaces:**
- **Consumes:** Task 1 tokens.
- **Produces:**
  - CSS component classes used by later tasks: `.card`, `.btn` variants (`.btn-primary` red, `.btn-secondary`, `.btn-ghost`), `.chip`, `.chip-a` (team A, blue), `.chip-b` (team B, red), `.pill` (base), `.sheet` (bottom sheet), `.overlay-root`
  - Team A is always blue and Team B always red, everywhere.

- [ ] **Step 1: Restyle** the join page, room choices, lobby seats, host dashboard (teams, room cards, standings, new-room form) and the final screen to Pop (spec §5.2, §5.8, mockup `look-a-light-dark.html`). Markup changes are limited to classes and wrappers; no id changes and no behaviour changes.
- [ ] **Step 2: Verify:**
  - Unit tests PASS.
  - All E2E scenarios PASS.
  - Manually, in both themes, at 360 px and 1280 px: no white-on-white and no dark-on-dark text anywhere.
- [ ] **Step 3: Commit:** `feat(ui): sportsfest pop styling for join, lobby, dashboard, results`

### Task 3: Game screen layout, turn pill, Leave in the ⋯ menu, bottom sheets

**Files:**
- Create: `js/pill.js`, `tests/pill.test.js`
- Modify: `js/view-room.js` (`buildLive`, `update`, `tick`, resign handler), `css/style.css`, `.superpowers/e2e/t10.js` (resign copy)
- E2E: `.superpowers/e2e/revamp.js` (new, first check)

**Interfaces:**
- **Consumes:** `Match.TURN_MS`, `Match.roomPhase`.
- **Produces:**
  - `Pill.state(room, mySeat: 'A'|'B'|'watch'|null, now) → null | { kind, text, ms }`
    - `kind` is one of `'ready'|'you'|'them'|'low'|'paused'|'appeal'|'hostDecision'|'suddenDeath'`
    - `ms` is the turn time to display (null for hostDecision)
  - The pill element **is** `#statusLine`, with `#turnClock` inside it. Class `pill pill-<kind>`.

- [ ] **Step 1: Write failing tests** in `tests/pill.test.js`. Build rooms with `Match.createRoom`, `claimSeat`, `setReady` and `startMatch(room, 1000, () => 0.2, 0)`, so firstSeat is A, startedAt 1000 and turnStartedAt 1000.

  | Test | Setup | Expected |
  |---|---|---|
  | `your turn` | `state(r,'A',21000)` | `{ kind:'you', text:'Your turn', ms:40000 }` |
  | `their turn shows name` | `state(r,'B',21000)` | `kind 'them'`, `text "Maria's turn"` |
  | `spectator sees name` | `state(r,'watch',21000)` | `kind 'them'`, `text "Maria's turn"` |
  | `last ten seconds is low for everyone` | `state(r,'A',51000)` and `state(r,'B',51000)` | `kind 'low'`; texts `'⏱ Your turn'` and `"⏱ Maria's turn"` |
  | `get ready before startedAt` | room with `clock.startedAt=5000`, `turnStartedAt=5000`, `now=3000` | `{ kind:'ready', text:'Get ready', ms:60000 }` |
  | `celebration delay shows full minute` | `turnStartedAt = now + 3000` | `ms === 60000`, `kind 'you'` |
  | `paused` | `pauseClocks(r, 11000)` | `kind 'paused'`, `text '⏸ Paused'`, `ms 50000` |
  | `appeal` | after `requestAppeal` | `kind 'appeal'`, `text '⚖️ Waiting for host'` |
  | `host decision` | `status 'hostDecision'` | `kind 'hostDecision'`, `text '⚖️ Waiting for host decision'`, `ms null` |
  | `sudden death` | after `resolveTimeUp` on a tie | `kind 'suddenDeath'`, text includes `'⚡ Sudden death · round 1/3'` |
  | `not playing` | waiting or final room | `null` |
- [ ] **Step 2: Run `node --test "tests/*.test.js"`.** Expected: FAIL, the module is missing.
- [ ] **Step 3: Implement `js/pill.js`.** Rebuild the live screen layout per spec §5.3 and mockup `turn-pill-compact.html`:
  - **Collapsed header** during a live game (`body.in-game` hides the banner image).
  - **Score bar:** `#sideA` / `#matchClock` / `#sideB`, team chips, ▶ on the current player.
  - **`#statusLine` pill** under the score bar, rendered from `Pill.state` in `update()` and refreshed in `tick()`. Remove the old status text logic; keep the existing `myTurn` behaviour for enabling buttons.
  - **Board, then rack, then actions:** `#playBtn` (wide, red), `#recallBtn`, `#passBtn`.
  - **⋯ menu button** `#moreBtn` opening a small menu that contains `#resignBtn` labelled **`Leave`**. The confirm text is `Leave the game? Your team (<TEAM>) loses this match.`
  - **The final-screen reason for `resign`** becomes `<player> left the game` (the `REASON_LINE` and resign branch in `renderFinal`).
  - **`#rejectBox` and `#noticeBox`** become bottom sheets (`.sheet`, position fixed bottom) so they don't push the board. `#lastMove` becomes a one-line caption under the pill. `#hostBar` stays below the actions (the host may scroll).
- [ ] **Step 4: Update `.superpowers/e2e/t10.js`:** change `includes('Maria resigned')` to `includes('Maria left the game')`. The resign click must open `#moreBtn` first (`await p.click('#moreBtn')`) wherever `#resignBtn` is clicked (t10).
- [ ] **Step 5: Add `.superpowers/e2e/revamp.js`** with a first check, `fits 360x640`:
  - a seated player on a 360×640 mobile page, in a live room whose team names and player names are 40 characters with no spaces
  - in both themes (`document.documentElement.dataset.theme='dark'`)
  - assert `document.scrollingElement.scrollHeight <= innerHeight + 1` and `scrollWidth <= innerWidth + 1`
  - assert `#statusLine`, `#board-container`, `#rack`, `#playBtn` and `#passBtn` all have `getBoundingClientRect().bottom <= innerHeight`
- [ ] **Step 6: Run unit tests and all E2E scenarios, including `revamp.js`.** Expected: all PASS.
- [ ] **Step 7: Commit:** `feat(game): compact game layout, turn pill, Leave menu, bottom sheets`

---

## Phase B: Data changes

### Task 4: Intro offset and start guard

**Files:** Modify `js/match.js`, `tests/match.test.js`, `js/view-room.js` (the Start call).

**Interfaces:**
- **Produces:**
  - `Match.INTRO_MS = 5000`
  - `Match.startMatch(room, now, rng = Math.random, introMs = 0)`: `clock.startedAt = now + introMs`, `endsAt = startedAt + matchLengthSec*1000`, `turnStartedAt = startedAt`
  - `canAct` rejects when `now < clock.startedAt`, so `applyPlay`, `applyPass` (including timeout) and `requestAppeal` all return null before the start.

- [ ] **Step 1: Write failing tests** in `tests/match.test.js`:
  - `startMatch with intro offsets all clocks`: `startMatch(ready, 1000, constRng(0.2), 5000)` gives `startedAt 6000`, `endsAt 606000`, `turnStartedAt 6000`.
  - `moves are rejected during the intro`: on that room, `applyPlay(r,'A',CAT,{now:5999,expectedMoveCount:0})` → null, while `now:6000` with rack `RACK_CAT` → not null. `applyPass(..., {now:5999,...})` → null.
  - `timeout counts from startedAt`: `applyPass(r,'A',{now: 6000+59999, expectedMoveCount:0, timeout:true, expectedTurnStartedAt:6000})` → null; at `6000+60000` → not null.
- [ ] **Step 2: Run `node --test "tests/*.test.js"`.** Expected: the new tests FAIL. The old `startMatch deals 7 each…` test still passes, because the default offset is 0.
- [ ] **Step 3: Implement.** In `view-room.js`, the Start button calls `Match.startMatch(r, Store.serverNow(), Math.random, Match.INTRO_MS)`.
- [ ] **Step 4: Run all unit tests, then all E2E scenarios.** Expected: PASS. t9, t10, t11 and t14 wait for `Your turn`, which only appears after `startedAt`, so they tolerate the 5 s intro.
- [ ] **Step 5: Commit:** `feat(match): 5 s intro offset before clocks start, moves blocked until start`

### Task 5: Celebration tier, turn delay, `lastMove.bingo`, `bestMove`

**Files:** Modify `js/engine.js`, `js/match.js`, `tests/engine.test.js`, `tests/match.test.js`.

**Interfaces:**
- **Produces:**
  - `ScrabbleEngine.celebrationTier(total: number, bingo: boolean) → 0|1|2|3|4`
  - `Match.CELEBRATE_MS = [0, 2600, 2600, 3000, 4500]`
  - after every play, `turnStartedAt = now + CELEBRATE_MS[tier]`
  - `game.lastMove.bingo` (boolean)
  - `game.bestMove = { seat, words:[{word,score}], total, bingo }`, the highest total so far; ties keep the earlier one. `normalizeRoom` defaults `bestMove` to `null` and `lastMove.bingo` to `false`.

- [ ] **Step 1: Write failing tests:**
  - engine `celebrationTier boundaries`: `(14,false)→0`, `(15,false)→1`, `(24,false)→1`, `(25,false)→2`, `(39,false)→2`, `(40,false)→3`, `(59,false)→3`, `(60,false)→4`, `(5,true)→4`
  - match `turn delay follows the tier`:
    - CAT for 10 points at `now 5000` → `turnStartedAt === 5000`
    - a play worth 46 (board/rack fixture as in the existing CQZ appeal test: C,Q,Z across the centre = 46) at `now 5000` → `turnStartedAt === 8000`
  - match `lastMove records bingo` (the RETAINS fixture from the engine test): `lastMove.bingo === true`
  - match `bestMove keeps the highest and the earlier tie`: plays of 10, then 46, then 46 → `bestMove.total 46`, with `bestMove.seat` from the first 46
  - match `pause during a celebration delay keeps at most a full turn`: `pauseClocks` when `turnStartedAt = now + 3000` → `clock.paused.turnRemainingMs === 60000`
- [ ] **Step 2: Run `node --test "tests/*.test.js"`.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - `endTurn(r, seat, now, wentOut, delayMs = 0)`.
  - `playCore` computes the tier with `Engine.celebrationTier(m.total, m.bingo)` and passes `CELEBRATE_MS[tier]`.
  - `pausedSnapshot` clamps `turnRemainingMs` to `[0, TURN_MS]`.
- [ ] **Step 4: Run all unit tests, then E2E t10 and t11.** Expected: PASS. In t11 the approved CQZ (46) delays B's turn by 3 s; the test waits for `Your turn`.
- [ ] **Step 5: Commit:** `feat(match): celebration tiers delay the next turn; record bingo and best move`

### Task 6: Host pin for the big screen

**Files:** Modify `js/store.js`, `js/view-host.js` (room cards), `js/view-room.js` (host bar). Extend `.superpowers/e2e/revamp.js`.

**Interfaces:**
- **Produces:**
  - `Store.setPinned(code: string|null) → Promise`, writing `${ROOT}/broadcast/pinned`
  - `Store.watchPinned(cb(code|null)) → unsubscribe`
  - Buttons:
    - dashboard cards for live or waiting rooms: `[data-pin="CODE"]`, labelled `📌 Pin to big screen` or `Unpin`
    - host bar: `[data-host="pin"]`
  - Only one room can be pinned; pinning another replaces it.

- [ ] **Step 1: Add an E2E check** to `revamp.js`, `pin persists and shows on cards`:
  - Host pins room R1 from the dashboard. `Store.watchPinned` in a second page reports `R1`, and the card shows `Unpin`.
  - Pinning R2 replaces it.
  - Unpinning gives `null`.
- [ ] **Step 2: Run it.** Expected: FAIL (no `[data-pin]`).
- [ ] **Step 3: Implement the store functions and buttons.**
- [ ] **Step 4: Run it, plus all scenarios.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(host): pin a room to the big screen`

---

## Phase C: Scenes and feel

### Task 7: Sound module

**Files:** Create `js/sound.js`. Modify `js/app.js` (wire `#soundToggle`). Extend `revamp.js`.

**Interfaces:**
- **Produces:**
  - `Sound.enabled() → boolean`, `Sound.toggle() → boolean`
  - `Sound.play(name)`, where `name` is one of `'turn','place','accept','tier1','tier2','tier3','tier4','vs','coin','win'`. It's a no-op when disabled.
  - `Sound.buzz()` calls `navigator.vibrate(120)` only when enabled.
  - Tones are synthesised with `AudioContext` oscillators, each under 1 s with gain ≤ 0.2. The context is created lazily on the first `toggle()` to satisfy autoplay rules.
- [ ] **Step 1: Add an E2E check**, `sound off by default and persists`:
  - On a fresh context, `Sound.enabled() === false` and `#soundToggle` shows 🔇.
  - After a click and a refresh, it's `true` and shows 🔊.
  - Calling every `Sound.play(name)` throws nothing.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** Hook calls:
  - `Sound.play('turn')` + `Sound.buzz()` when the pill changes to `kind 'you'`
  - `'place'` when a tile is placed
  - `'accept'` after a committed play
- [ ] **Step 4: Run all checks.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(fx): optional sounds and vibration, off by default`

### Task 8: Celebration overlays

**Files:**
- Create: `js/celebrate.js`, `css/fx.css`, `tests/celebrate.test.js`
- Modify: `index.html`, `js/view-room.js` (trigger on room updates)
- Extend: `revamp.js`

**Interfaces:**
- **Consumes:** `ScrabbleEngine.celebrationTier`, `game.lastMove.{type,seat,words,total,bingo}`, `Sound.play('tier'+n)`.
- **Produces:**
  - `Celebrate.TITLES = ['', 'Not Bad!', 'Cool!', 'Awesome!', 'IMPOSSIBLE!!!']`
  - `Celebrate.tierFor({ total, bingo }) → 0..4`, which delegates to the engine
  - `Celebrate.detect(prevMoveCount: number|null, room) → null | { tier, total, words, bingo, seat, playerName, teamName, moveCount }`
    - Returns null when `prevMoveCount` is null (the first snapshot), when `moveCount` didn't increase, or when `lastMove.type !== 'play'`.
    - Tier 0 is still returned, so the caller can float "+N".
  - `Celebrate.show(c, { container, scoreEl, mine: boolean })` adds to a FIFO queue. Each item plays in turn:
    - **tier 0:** "+N" floats into `scoreEl`
    - **tiers 1–2:** pop + burst + count-up
    - **tier 3:** golden sunburst (rays, gold glint title, stars, centre confetti)
    - **tier 4:** the cinematic sequence from spec §5.4 / mockup `celebrate-tiers-v2.html`
  - The overlay root has `pointer-events: none`, with a **`✕ Skip`** button (`.fx-skip`, `pointer-events: auto`, top-right) that ends the current item.
  - The points count up, then fly into `scoreEl`, which bumps.
  - Reduced motion uses a fade card with the title, points and word, and no shake, flash, confetti or rays.
  - `Celebrate.clear()` empties the queue, for route changes.

- [ ] **Step 1: Write failing tests** in `tests/celebrate.test.js`:
  - `detect ignores the first snapshot`: `detect(null, roomAfterPlay) === null`
  - `detect returns the move when moveCount increases`: `detect(0, roomAfterCAT)` → `{ tier:0, total:10, seat:'A', playerName:'Maria', teamName:'NCR' }`
  - `detect ignores passes and timeouts`
  - `detect ignores an unchanged moveCount`
  - `queue plays moves in order` (pure part): `Celebrate.createQueue()` returns `{ push(item), shift() → item|undefined, size() }`. Push two detected moves (10 points then 46 points) and they `shift()` back in that order. `show()` uses this queue internally.
- [ ] **Step 2: Run `node --test "tests/*.test.js"`.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `view-room.js`, keep `state.ui.lastSeenMove` (null until the first live render). On each room update:
  - call `Celebrate.detect`
  - if it returns something, call `Celebrate.show(c, { container: el.querySelector('#liveRoot'), scoreEl: el.querySelector('#side'+c.seat+' .score'), mine: c.seat === mySeat })`
  - then update `lastSeenMove`
  - Call `Celebrate.clear()` in teardown.
- [ ] **Step 4: Add E2E checks:**
  - `celebration plays on every screen`: play a fixture word worth ≥ 40 → `.fx-tier-3` appears on both players and the spectator within 2 s
  - `no replay after refresh`: refresh the spectator → no `.fx-tier-*` element for 3 s
- [ ] **Step 5: Run all unit tests and E2E scenarios.** Expected: PASS.
- [ ] **Step 6: Commit:** `feat(fx): four-tier word celebrations with count-up score`

### Task 9: VS intro, coin toss, round start

**Files:**
- Create: `js/scenes.js`, `tests/scenes.test.js`
- Modify: `css/fx.css`, `index.html`, `js/view-room.js`, `.superpowers/e2e/t9.js` (only if the toss text check needs it; `#tossLine` must still contain `Coin toss`)

**Interfaces:**
- **Produces:**
  - `Scenes.introRemaining(room, now) → number`: `max(0, clock.startedAt - now)`. Pure, and exported for Node through a guarded `module.exports`.
  - `Scenes.playIntro(container, room, now)`: if `introRemaining > 0`, plays the VS + coin scene (mockup `intro-coin-winner-v2.html`) **from the matching point in time**:
    - elapsed = `INTRO_MS - remaining`
    - VS occupies 0–2600 ms and the coin 2600–5000 ms
    - the coin lands on `game.firstSeat`
    - shows `#tossLine` with `🪙 Coin toss: <TEAM> goes first`
    - removes itself at `startedAt`
  - `Scenes.roundStart(container, rooms: room[])` (~5000 ms): all matchups (`A vs B` lines) slam in under the title `ROUND STARTING`.

- [ ] **Step 1: Write failing tests** in `tests/scenes.test.js`:
  - `introRemaining before, during, after`: with `startedAt 6000`, `now 1000` → 5000; `now 4000` → 2000; `now 7000` → 0
- [ ] **Step 2: Run `node --test "tests/*.test.js"`.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `view-room.js`, the first live render and the waiting → live transition call `Scenes.playIntro(el.querySelector('#liveRoot'), room, Store.serverNow())`. This replaces the old 3-second toss text.
- [ ] **Step 4: Add E2E checks:**
  - `intro delays the first turn`: right after Start, `#statusLine` shows `Get ready` and `#tossLine` contains `Coin toss`. After 5 s it shows `Your turn` (on the first seat).
  - `refresh mid-intro resumes`: refresh 2 s after Start → the intro shows for about 3 s more, not 5.
- [ ] **Step 5: Run unit tests and all E2E scenarios.** Expected: PASS.
- [ ] **Step 6: Commit:** `feat(fx): VS intro and 3D coin toss before each match`

### Task 10: Result scenes

**Files:** Modify `js/scenes.js`, `css/fx.css`, `js/view-room.js` (`renderFinal`), plus `.superpowers/e2e/t10.js`, `t14.js`, `fixes.js`, `minors.js` (case-insensitive "wins").

**Interfaces:**
- **Consumes:** `room.result`, `game.bestMove`, `Celebrate.TITLES`.
- **Produces:**
  - `Scenes.resultViewer(room, mySeat) → 'winner'|'other'|'neutral'` (pure, tested)
  - `Scenes.renderResult(container, room, viewer)` renders the spec §5.6 scene into the final screen, keeping `#finalHost`, `#finalStandings`, `#board-container` (behind a `View board` toggle) and `#backBtn`:
    - **winner:** trophy, team slam, counting scores, `+1 TEAM` stamp, ⭐ best word (when `bestMove` exists: `⭐ Best word: WORD · N pts (<tier title>)`), confetti
    - **other:** calm blue, `<TEAM> wins · well played`, 🤝, no confetti, light score pill with dark text
    - **neutral:** spectators and the host, `<TEAM> wins`, with confetti
    - **void:** grey card with the void reason
  - The reason line keeps the existing copy, plus the new `left the game`.

- [ ] **Step 1: Write failing tests:**
  - `resultViewer`: winner seat → `'winner'`; the other seat → `'other'`; `'watch'` or null → `'neutral'`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Play `Sound.play('win')` for the winner. Reduced motion means no rays and no confetti.
- [ ] **Step 4: Update the E2E text checks** that look for `TEST-A wins` / `TEST-B wins` to compare case-insensitively: `/test-a wins/i.test(document.body.innerText)`.
- [ ] **Step 5: Add an E2E check**, `result contrast`: on the other player's result screen, in both themes, the computed text colour on the score pill has a contrast ratio of at least 4.5 against its background. Compute the ratio in-page from `getComputedStyle`.
- [ ] **Step 6: Run all unit tests and E2E scenarios.** Expected: PASS.
- [ ] **Step 7: Commit:** `feat(fx): dramatic winner screen and respectful result screens`

---

## Phase D: Broadcast projector

### Task 11: Director (pure)

**Files:** Create `js/director.js`, `tests/director.test.js`.

**Interfaces:**
- **Consumes:** `Celebrate.detect` (for highlights), `Match.roomPhase`.
- **Produces:**
  - `Director.init() → state`
  - `Director.step(state, rooms: {code: room}, pinned: string|null, now) → state`, a new state object
  - `state` holds:
    - `featured: code|null`
    - `scene: 'room'|'intro'|'roundStart'|'highlight'|'winner'|'idle'`
    - `sceneUntil: ms`
    - `since: ms` (when the featured room was last switched to)
    - `queue: event[]`
    - `corner: null | { code, move, until }`
    - `seen: { code: { moveCount, status, startedAt } }`
    - `ignoredPin: code|null`
    - `roundCodes: code[]` (for the roundStart scene)
    - `move` (the celebration payload for a highlight)
  - **Events** come from diffing `rooms` against `state.seen`:
    - `start`: first seen with `status` live and `now < startedAt`
    - `highlight`: `Celebrate.detect` tier ≥ 3
    - `end`: status changed to `'final'`
    - The first call only records `seen`, without events, except for `start` of rooms still in their intro.
  - **Rules, in order:**
    1. A scene that's still running (`now < sceneUntil`) keeps going, and new events join `queue`. Highlights go ahead of other queued events.
    2. **Pinned room:** if `pinned`, it isn't `ignoredPin`, and that room exists and isn't final:
       - `featured = pinned`
       - highlights from other rooms set `corner` (until now + 4000) instead of cutting away
       - the pinned room's own events play as scenes
    3. **Round start:** two or more `start` events whose `startedAt` are within 10000 ms of each other → `scene 'roundStart'` for 5000 ms with `roundCodes`, then `featured` = the first code.
    4. A single `start` → `scene 'intro'` until its `startedAt`.
    5. `highlight` → `scene 'highlight'` with `featured` = its room, for `CELEBRATE_MS[tier]` (+300 ms).
    6. `end` → `scene 'winner'` for 8000 ms. If it was the pinned room, set `ignoredPin = pinned`.
    7. **No live rooms** → `scene 'idle'`.
    8. **Otherwise** `scene 'room'`:
       - if `now - since ≥ 20000`, rotate to the next live room
       - **drama rooms** (status `suddenDeath`, or `endsAt - now ≤ 60000`) come first; otherwise round-robin by code order
       - never switch more often than every 8000 ms, except for events

- [ ] **Step 1: Write failing tests** in `tests/director.test.js`. Use small room factories (`live(code, {moveCount, startedAt, endsAt, status, lastMove})`):
  - `first step records state without events`
  - `idle when nothing is live`
  - `rotates after 20 s and not before`
  - `prefers drama rooms when rotating`
  - `highlight cuts immediately and queues a second highlight`
  - `single start plays intro until startedAt`
  - `rooms starting within 10 s get one roundStart`
  - `winner card for 8 s on end`
  - `pinned room stays featured; other highlights go to corner`
  - `pinned room finishing returns to auto after winner card` (Review Focus 5): the pinned room ends while other highlights are queued → winner scene, then the queued highlights, then rotation, and `featured` never goes back to the finished room
  - `minimum dwell of 8 s between rotations`
- [ ] **Step 2: Run `node --test "tests/*.test.js"`.** Expected: FAIL.
- [ ] **Step 3: Implement `js/director.js`.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(broadcast): pure auto-director with tests`

### Task 12: Broadcast projector view

**Files:** Rewrite `js/view-scoreboard.js`. Modify `css/style.css` and `css/fx.css`. Extend `.superpowers/e2e/revamp.js` (`t13.js` must still pass).

**Interfaces:**
- **Consumes:**
  - `Director`, `Store.watchRooms`, `Store.watchTeams`, `Store.watchPinned`
  - `Celebrate.show` (full-screen, `mine:false`), `Scenes.playIntro`, `Scenes.roundStart`, `Scenes.renderResult` (`'neutral'`)
  - `UI.renderBoard`, `Pill.state(room,'watch',now)`, `Match.computeStandings`
- **Produces:** the `?view=scoreboard` page:
  - **top score bar:** both teams and players, scores, **VS**, `[data-bigclock="CODE"]` match clock, pill
  - **featured board** `#bigBoard`, with the newest tiles glowing from `lastMove.words[].cells[].isNew`
  - **right column:** standings `#bigStand`, rows like `1  NCR  3-0  3`; and the last-move card `#bigLastMove`
  - **lower-third** `#bigLower`: `● LIVE · ROOM <CODE> · A vs B`
  - **mode badge** `#bigMode`: `🔁 AUTO` or `📌 PINNED BY HOST`
  - **ticker** `#bigLive`: every live room as `A sa – sb B · m:ss`, each with `[data-bigclock]`; the featured one is highlighted
  - **recent results** `#bigRecent`: `+1 TEAM (a–b)`, the last 5
  - **corner card** `#bigCorner` for highlights while pinned
  - **swipe transition** when `featured` changes
  - `Director.step` runs on room updates and on `App.onTick`, and its scene is rendered: `room` / `intro` / `roundStart` / `highlight` / `winner` / `idle` (standings + "Next up" listing waiting rooms)

- [ ] **Step 1: Add E2E checks** to `revamp.js`:
  - `projector cuts to a highlight in another room`: two live rooms, the projector featuring room 1; a fixture play worth ≥ 40 in room 2 → within 2 s `#bigLower` contains room 2's code and a `.fx-tier-3` is visible
  - `projector stays on a pinned room`: pin room 1; a highlight in room 2 → `#bigLower` keeps room 1 and `#bigCorner` shows room 2
  - `idle shows Next up`: no live rooms and one waiting room → the text `Next up` and the waiting room's teams
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Keep `#bigStand`, `#bigLive`, `#bigRecent` and `[data-bigclock]` semantics, so the `t13.js` regexes still match:
  - `/TEST-A\s+1-0\s+1/`
  - `#bigLive` holds live rooms only
  - `+1 TEST-A (12–7)`
- [ ] **Step 4: Run all unit tests and every E2E scenario.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(broadcast): esports-style projector view with auto-director and pin`

---

## Phase E: Finish

### Task 13: Accessibility pass, docs, full regression

**Files:** Modify `css/*.css` as needed, `CLAUDE.md`, `README.md`, `docs/dry-run-checklist.md`. Extend `revamp.js`.

- [ ] **Step 1: Add E2E checks:**
  - `contrast AA in both themes`: for every visible `.pill, .chip, .badge, button, .card` on the join page, lobby, game screen, result screen and dashboard, in light and dark, the contrast between text colour and the nearest non-transparent background is ≥ 4.5 (≥ 3 for text ≥ 18.66 px bold or 24 px)
  - `reduced motion`: with `Emulation.setEmulatedMedia({features:[{name:'prefers-reduced-motion', value:'reduce'}]})`, a tier-4 celebration creates **no** `.confetti` and no element with the `fx-shake` class
  - `theme persists`: toggle to dark, refresh → `data-theme="dark"`
- [ ] **Step 2: Run.** Fix any failures in CSS. Expected: PASS.
- [ ] **Step 3: Update the docs:**
  - **`CLAUDE.md`:** the new files and modules, `Pill`/`Celebrate`/`Scenes`/`Director`/`Theme`/`Sound`, the token rule, the contrast rule, `INTRO_MS`/`CELEBRATE_MS`, `broadcast/pinned`, and the rollout rule from spec §8 (merge when no rooms are live; everyone refreshes). Also soften the "merging to `main` deploys to production" note: the deploy isn't the final tournament page yet.
  - **`README.md`:** the feature list.
  - **`docs/dry-run-checklist.md`:**
    - celebration tiers on phones and the projector
    - the VS intro and coin toss
    - the result screens
    - the projector auto-director and pin
    - dark mode
    - sound on and off
- [ ] **Step 4: Full regression.** Run `node --test "tests/*.test.js"` (all PASS), then every scenario `t7 t8 t9 t10 t11 t13 t14 fixes playground minors revamp`, each PASS.
- [ ] **Step 5: Commit:** `docs+a11y: contrast and motion checks, docs for the revamp`
