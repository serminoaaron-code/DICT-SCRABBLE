# Fixture Rooms & Team Standings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the open-matchmaking Scrabble app with host-created fixture rooms (one team's representative vs another's, in a single timed game) that record exactly one win per finished room and show live team standings.

**Architecture:** All game rules live in pure, Node-testable modules (`engine.js` for Scrabble rules, `match.js` for room state transitions). Every Firebase write is a Realtime Database `transaction()` whose update function is one of those pure `match.js` functions, so the guards that keep results exactly-once are unit-tested. Thin view modules render from live Firebase data. There is still no build step.

**Tech Stack:** Vanilla HTML/CSS/JS (plain `<script>` tags), Firebase Realtime Database v8.10.1 namespaced SDK (CDN), Free Dictionary API, Node ≥18 built-in test runner (`node --test`) for tests only. Hosted on GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-01-tournament-rooms-design.md`. Read it before starting any task. Section references (§) below point into it.

## Global Constraints

- No build step, no `package.json`, no npm dependencies. Node is used only to run tests: `node --test "tests/*.test.js"` (quote the glob so it works in PowerShell and bash).
- Firebase **v8.10.1** namespaced API (`firebase.database()`, `ref().transaction()`), loaded from `https://www.gstatic.com/firebasejs/8.10.1/`. Reuse the existing `firebaseConfig` object from `index.html` verbatim.
- All app data lives under **`scrabble/`**. Never read or write `server_1..4/`.
- **Firebase storage rules:**
  - Never write `undefined`: use `null` or leave the key out.
  - Never store arrays that contain `null`. The board is a sparse map keyed `"r_c"`, e.g. `{"7_7":"A"}`.
  - Firebase deletes empty arrays and objects, so **always pass reads through `Match.normalizeRoom()`**.
- All times are **server-estimated milliseconds** from `Store.serverNow()` (`Date.now() + .info/serverTimeOffset`).
- Every user-supplied string (team names, player names, labels, words) goes through `UI.escapeHtml()` before it is put into `innerHTML`.
- Keep the existing wood/cream theme: copy the `:root` CSS variables from the current `index.html` into `css/style.css`. The page must be playable at 360px width using tap-to-select-tile, tap-to-place.
- Host password: keep the existing client-side constant `HOST_ADMIN_PASSWORD = '1101'` unchanged (this is out of scope, owned by DevOps).
- Fixed values:

  | Constant | Value |
  |---|---|
  | `TURN_MS` | `60000` |
  | `SUDDEN_DEATH_MAX_ROUNDS` | `3` |
  | `BINGO_BONUS` | `50` |
  | `RACK_SIZE` | `7` |
  | Room code alphabet | `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (6 characters, displayed `XXX-XXX`) |
  | Dictionary timeout | `5000` ms |

- Remove the unused jQuery `<script>` tag.
- Work on branch `feat/tournament-scoring`. Commit at the end of every task. **No `Co-Authored-By` trailers.**
- Modules use this pattern so they load both as a browser global and as a Node `require`:
  ```js
  (function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.NAME = api;
  })(typeof globalThis !== 'undefined' ? globalThis : this, function (root) { /* ... */ return api; });
  ```
  `match.js` gets the engine with `typeof require === 'function' ? require('./engine.js') : root.ScrabbleEngine`.

## Review Focus

1. **Refresh or reopen mid-game, especially on a phone:** the player is back in their own seat, with their own rack, and it's still their turn if it was. (Task 3 test `claimSeat allows same clientId to rejoin a live room`; Task 9 manual check.)
2. **Host window closed when the match clock hits 0:** a player's browser records the result, and a later `resolveTimeUp` (host reopening) changes nothing. (Task 4 test `resolveTimeUp on a final room returns null`; Task 10 manual check.)
3. **Dictionary API hangs instead of failing:** after 5 s the move is accepted as `unverified`, and the player is not stuck on "Checking…". (Task 6 test `hanging fetch resolves unverified after timeout`.)
4. **Placing more copies of a letter than the rack holds** (two `E` tiles from a rack with one `E`): the move is rejected. (Task 4 test `prepareMove rejects letters not in rack (multiset)`.)
5. **HTML or very long text in team or player names:** it's shown as literal text, the layout doesn't break, and names are capped at 40 characters. (Task 7 manual check with `<b>NCR</b>` and a 60-character name.)

---

## File Structure

| File | Responsibility |
|---|---|
| `index.html` | **Rewritten.** Containers for the views, CDN scripts, then the `js/*.js` files in dependency order. No inline game logic. |
| `css/style.css` | All styles (theme variables moved from the old `index.html`). |
| `js/engine.js` | Pure Scrabble rules: constants, bag, board map, placement validation, word finding, scoring. Global `ScrabbleEngine`. |
| `js/match.js` | Pure room-state transitions and standings. Each function returns a **new** room, or `null` to reject. Global `Match`. |
| `js/dictionary.js` | `checkWords()` against the Free Dictionary API with a timeout. Global `Dictionary`. |
| `js/store.js` | Firebase setup, server time, client ID, watchers, `mutateRoom` transactions, team CRUD, presence, reset. Global `Store`. |
| `js/ui.js` | Shared rendering helpers: `escapeHtml`, `formatClock`, board, rack, standings table, toast. Global `UI`. |
| `js/view-host.js` | Host login and dashboard (teams, rooms, standings, reset). Global `HostView`. |
| `js/view-room.js` | Join page, room lobby, live game, final screen. Player, spectator and host modes. Global `RoomView`. |
| `js/view-scoreboard.js` | *(Slice 2)* Big-screen standings. Global `ScoreboardView`. |
| `js/app.js` | Boot, routing (`#host`, `#room=CODE`, `?view=scoreboard`, default = join page), session storage keys, the shared 250 ms clock ticker. |
| `tests/engine.test.js`, `tests/match.test.js`, `tests/dictionary.test.js` | Node tests. |

**Session keys (localStorage):**
- `scrabble.clientId`: a random 16-character string.
- `scrabble.seat.<CODE>`: `'A'`, `'B'` or `'watch'`.
- `scrabble.name`: the last name used.
- `scrabble.host`: `'1'` once unlocked.

**Room object (normalized, as `match.js` sees it):** this is spec §6 with these decisions:
- `game.board` is a `{ "r_c": letter }` map.
- Host pause and appeal pause are both stored as `clock.paused = { by: 'host'|'appeal', matchRemainingMs, turnRemainingMs }` (or `null`). The spec's `'paused'` status is *derived* (see `roomPhase`), not stored. `status` is one of `'waiting'|'live'|'suddenDeath'|'hostDecision'|'final'|'void'`.

---

## Slice 1: must have (target Mon 11/2 afternoon)

### Task 1: Engine foundations (constants, bag, board map) + test harness

**Files:**
- Create: `js/engine.js`
- Test: `tests/engine.test.js`

**Interfaces:**
- **Produces:**
  - Constants: `LETTER_VALUES`, `TILE_DISTRIBUTION`, `PREMIUM_GRID` (15×15 of `'tw'|'dw'|'tl'|'dl'|'center'|''`), `BOARD_SIZE = 15`, `CENTER = {r:7,c:7}`, `RACK_SIZE = 7`, `BINGO_BONUS = 50`
  - `createBag(rng = Math.random) → string[]`: 98 shuffled letters
  - `drawTiles(bag, n) → { drawn: string[], bag: string[] }`: pure; draws from the end; draws fewer than `n` if the bag runs short
  - `key(r, c) → "r_c"`
  - `getTile(board, r, c) → string|null`
  - `applyPlacements(board, placements) → newBoard` (`placements: [{r, c, letter}]`)
  - `rackHas(rack, letters) → boolean`: multiset check
  - `removeFromRack(rack, letters) → string[]`

- [ ] **Step 1: Write the failing tests** in `tests/engine.test.js` (`const E = require('../js/engine.js'); const test = require('node:test'); const assert = require('node:assert');`):
  - `PREMIUM_GRID is 15x15 and symmetric`:
    - every row has length 15
    - `PREMIUM_GRID[r][c] === PREMIUM_GRID[c][r] === PREMIUM_GRID[14-r][c]` for all r, c
    - `PREMIUM_GRID[7][14] === 'tw'`, `PREMIUM_GRID[7][7] === 'center'`
    - the counts are tw 8, dw 16, tl 12, dl 24
  - `createBag has 98 tiles matching TILE_DISTRIBUTION`: count each letter and compare with `TILE_DISTRIBUTION`.
  - `createBag is shuffled by rng`: two different seeded rngs give different orders.
  - `drawTiles is pure and draws from the end`:
    - `drawTiles(['A','B','C'], 2)` → `{drawn:['C','B'], bag:['A']}`
    - the input array is unchanged
    - `drawTiles(['A'], 3).drawn` has length 1
  - `applyPlacements returns a new board map`: applying `[{r:7,c:7,letter:'A'}]` to `{}` gives `{'7_7':'A'}`, and the input is unchanged.
  - `rackHas checks multiplicity`:
    - `rackHas(['E','A'], ['E','E']) === false`
    - `rackHas(['E','E','A'], ['E','E']) === true`
    - `removeFromRack(['E','A','E'], ['E'])` gives `['A','E']`
- [ ] **Step 2: Run `node --test "tests/*.test.js"`.** Expected: FAIL with `Cannot find module '../js/engine.js'`.
- [ ] **Step 3: Implement `js/engine.js` with the UMD wrapper (global `ScrabbleEngine`).**
  - Copy `LETTER_VALUES` and `INITIAL_TILE_DISTRIBUTION` (renamed `TILE_DISTRIBUTION`) verbatim from the old `index.html`.
  - Copy `PREMIUM_GRID` and fix row 7 to `['tw','','','dl','','','','center','','','','dl','','','tw']`.
  - Shuffle with Fisher–Yates using `rng`.
- [ ] **Step 4: Run `node --test "tests/*.test.js"`.** Expected: all PASS.
- [ ] **Step 5: Commit:** `git add js/engine.js tests/engine.test.js && git commit -m "feat(engine): constants, shared bag and board map with tests"`

### Task 2: Engine move validation, word finding, scoring

**Files:**
- Modify: `js/engine.js`
- Test: `tests/engine.test.js`

**Interfaces:**
- **Consumes:** Task 1 helpers.
- **Produces:**
  - `validatePlacement(board, placements) → { ok: true, direction: 'H'|'V' } | { ok: false, error }`, where `error` is one of `'EMPTY'|'OUT_OF_BOUNDS'|'OCCUPIED'|'DUPLICATE_SQUARE'|'NOT_IN_LINE'|'GAP'|'FIRST_MOVE_CENTER'|'NOT_CONNECTED'|'NO_WORD'`.
    - A single tile picks the direction that forms a word of 2 or more letters, preferring `'H'`.
    - On an empty board the main word must be 2 or more letters (`NO_WORD`) and must cover `CENTER`.
  - `findWords(board, placements, direction) → [{ word, cells: [{r, c, letter, isNew}] }]`: the main word first, then each cross-word of 2 or more letters through a new tile.
  - `scoreMove(board, placements) → { ok, error?, words: [{word, score}], total, bingo }`: validates, finds words, scores them.
    - Letter and word premiums apply only under new tiles.
    - A word multiplier applies to every word passing through that square.
    - `bingo = placements.length === 7`, adding `BINGO_BONUS` to `total`.
  - `ERROR_TEXT`: a map from error code to a short player-facing message, e.g. `FIRST_MOVE_CENTER` → `"First word must cover the ★ centre square."`.

- [ ] **Step 1: Write the failing tests.** Use helper `P = (r,c,letter) => ({r,c,letter})`.

  | Test | Board | Placements | Assert |
  |---|---|---|---|
  | `first move must cover centre` | `{}` | `P(0,0,'A'),P(0,1,'T')` | `error 'FIRST_MOVE_CENTER'` |
  | `first move single tile is NO_WORD` | `{}` | `P(7,7,'A')` | `error 'NO_WORD'` |
  | `tiles must be in one line` | `{}` | `P(7,7,'A'),P(8,8,'T')` | `'NOT_IN_LINE'` |
  | `gap not filled by board is rejected` | `{}` | `P(7,6,'C'),P(7,8,'T')` | `'GAP'` |
  | `gap filled by existing tile is ok` | `{'7_7':'A'}` | `P(7,6,'C'),P(7,8,'T')` | `ok`, `direction 'H'`, word `CAT` |
  | `later move must connect` | `{'7_7':'A','7_8':'T'}` | `P(0,0,'G'),P(0,1,'O')` | `'NOT_CONNECTED'` |
  | `occupied square rejected` | `{'7_7':'A'}` | `P(7,7,'B')` | `'OCCUPIED'` |
  | `CAT on centre scores double word` | `{}` | `P(7,6,'C'),P(7,7,'A'),P(7,8,'T')` | `total 10` (C3+A1+T1 = 5, ×2 for centre) |
  | `premium only under new tiles` | `{'7_6':'C','7_7':'A','7_8':'T'}` | `P(7,9,'S')` | word `CATS`, `total 6` |
  | `cross-words are found and scored` | `{'7_7':'A','7_8':'T'}` | `P(6,7,'B'),P(6,8,'E')` | words include `BE`, `BA`, `ET`; `total` = their sum, computed by hand in the test from `LETTER_VALUES` and `PREMIUM_GRID` |
  | `bingo adds 50` | `{}` | 7 tiles `R,E,T,A,I,N,S` at `(7,4)`…`(7,10)` | `bingo === true`, `total ===` word score + 50 |

  - For `premium only under new tiles`: (7,9) has no premium (check it), so the score is 3+1+1+1 = 6.
  - For the bingo test: its expected word score is hand-computed in the test. Cells (7,4) and (7,10) are `''`, and (7,7) is `center`, so the score is (1+1+1+1+1+1+1)×2 = 14, and `total` is 64.
- [ ] **Step 2: Run `node --test "tests/*.test.js"`.** Expected: the new tests FAIL (`validatePlacement is not a function`).
- [ ] **Step 3: Implement** `validatePlacement`, `findWords`, `scoreMove` and `ERROR_TEXT` in `js/engine.js`.
  - To find a word, walk from the anchor in the negative direction while `getTile` (board or new tile) is present, then collect cells in the positive direction.
  - Connection check: some new tile is next to an existing tile, *or* the main word contains an existing tile.
- [ ] **Step 4: Run `node --test "tests/*.test.js"`.** Expected: all PASS.
- [ ] **Step 5: Commit:** `git commit -am "feat(engine): placement validation, cross-words and scoring"` (add the test file if it isn't tracked yet).

### Task 3: Match: room creation, codes, seats, ready, start (coin toss)

**Files:**
- Create: `js/match.js`
- Test: `tests/match.test.js`

**Interfaces:**
- **Consumes:** `ScrabbleEngine.createBag`, `drawTiles`, `RACK_SIZE`.
- **Produces** (every mutator returns a new room or `null`, never mutating its input):
  - `CODE_ALPHABET`, `TURN_MS = 60000`, `SUDDEN_DEATH_MAX_ROUNDS = 3`
  - `generateRoomCode(rng) → 'K7Q42M'` (6 characters from the alphabet)
  - `formatCode(code) → 'K7Q-42M'`
  - `normalizeCode(input) → 'K7Q42M'` (uppercase; strips spaces and dashes)
  - `createRoom({ code, teamA, teamB, teamAName, teamBName, label, matchLengthSec, now }) → room`
    - `status: 'waiting'`
    - `seats: {A:null, B:null}`, `clock: null`, `game: null`, `result: null`
    - `fairPlay: {A:{screenLeaves:0}, B:{screenLeaves:0}}`, `createdAt: now`
    - throws `Error('SAME_TEAM')` if `teamA === teamB`
  - `normalizeRoom(raw) → room`: fills every missing field Firebase may have dropped:
    - `seats.A/B` default to `null`
    - in `game` (when present): `board` → `{}`, `bag` → `[]`, `racks.A/B` → `[]`, `scores.A/B` → `0`, `pending` → `null`, `suddenDeath` → `null`, `lastMove` → `null`
    - `clock.paused` → `null`
    - `fairPlay.*.screenLeaves` → `0`
    - `watchers` → `{}`
  - `claimSeat(room, seat, { name, clientId }) → room|null`:
    - rejected if `status` is `final` or `void`
    - rejected if the seat is held by a different `clientId`
    - the same `clientId` may always reclaim (rejoin)
    - sets `{ name: name.slice(0,40), clientId, ready: false, online: true }`; on rejoin, `ready` and `online: true` are kept
  - `setReady(room, seat, clientId, ready) → room|null`: only in `waiting`, and only by the holder.
  - `removePlayer(room, seat) → room|null`: rejected if `final`/`void`; sets the seat to `null`.
  - `startMatch(room, now, rng) → room|null`: requires `waiting` and both seats `ready`.
    - Creates `game`:
      - `board {}`
      - bag from `createBag(rng)`; A then B draws 7
      - `scores {A:0, B:0}`
      - `firstSeat`: `rng() < 0.5 ? 'A' : 'B'`; `turn = firstSeat`
      - `moveCount 0`, `pending null`, `suddenDeath null`, `lastMove null`
    - Sets `clock = { startedAt: now, endsAt: now + matchLengthSec*1000, turnStartedAt: now, paused: null }` and `status 'live'`.

- [ ] **Step 1: Write the failing tests** in `tests/match.test.js`. Use a seeded rng helper `seq(...vals)` that returns the values in turn.
  - `generateRoomCode uses only the safe alphabet`: 200 codes, each matching `/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/`.
  - `normalizeCode/formatCode round trip`: `normalizeCode(' k7q-42m ') === 'K7Q42M'`, and `formatCode('K7Q42M') === 'K7Q-42M'`.
  - `createRoom rejects same team`: `assert.throws(..., /SAME_TEAM/)`.
  - `normalizeRoom restores dropped empties`: a raw room whose `game` has no `board`, `bag` or `racks` → `board` deep-equals `{}`, `racks.A` deep-equals `[]`, `pending === null`.
  - `claimSeat first come first served`: A is claimed by `c1`, then `claimSeat(room,'A',{clientId:'c2'})` returns `null`.
  - `claimSeat allows same clientId to rejoin a live room`: after start, `claimSeat(room,'A',{name:'Maria',clientId:'c1'})` is not null and `game.racks.A` is unchanged.
  - `claimSeat rejected on final/void room`.
  - `startMatch requires both ready`: returns `null` if B is not ready.
  - `startMatch deals 7 each, sets clocks and coin toss`:
    - with `now = 1000`, `matchLengthSec 600` and a rng whose toss value is 0.7
    - `racks.A.length === 7`, `racks.B.length === 7`, `bag.length === 84`
    - `clock.endsAt === 601000`, `game.firstSeat === 'B'`, `game.turn === 'B'`
- [ ] **Step 2: Run `node --test "tests/*.test.js"`.** Expected: FAIL (`Cannot find module '../js/match.js'`).
- [ ] **Step 3: Implement these functions in `js/match.js`** (UMD, global `Match`). Use `structuredClone` (or JSON clone) to copy the input.
- [ ] **Step 4: Run `node --test "tests/*.test.js"`.** Expected: all PASS.
- [ ] **Step 5: Commit:** `git add js/match.js tests/match.test.js && git commit -m "feat(match): rooms, codes, seats and coin-toss start"`

### Task 4: Match: plays, passes, timeouts, time-up, sudden death, bag-out

**Files:**
- Modify: `js/match.js`
- Test: `tests/match.test.js`

**Interfaces:**
- **Consumes:** `ScrabbleEngine.scoreMove`, `applyPlacements`, `drawTiles`, `rackHas`, `removeFromRack`; Task 3 room shape.
- **Produces:**
  - `prepareMove(room, seat, placements) → { ok, error?, words, total, bingo }`
    - `error` is `'NOT_YOUR_TURN'`, `'NOT_IN_RACK'`, `'PENDING'`, or any engine error.
    - Pure check with no clocks; it's what the UI calls before the dictionary.
  - `applyPlay(room, seat, placements, { now, expectedMoveCount, unverified = false }) → room|null`
    - **Guards:**
      - `status` is `live` or `suddenDeath`
      - `clock.paused === null`
      - `turn === seat`
      - `moveCount === expectedMoveCount`
      - `pending === null`
      - if `status === 'live'`, `now < clock.endsAt`
      - `prepareMove` is ok
    - **Effects:**
      - Board updated, tiles removed from the rack, refill from the bag up to 7, score added.
      - `lastMove = { seat, type: 'play', words, total, unverified, at: now }`
      - `moveCount + 1`, turn switches, `clock.turnStartedAt = now`
      - Then `afterTurn()`.
  - `applyPass(room, seat, { now, expectedMoveCount, timeout = false, expectedTurnStartedAt }) → room|null`
    - Same status, paused and turn guards.
    - If `timeout`, it also requires `clock.turnStartedAt === expectedTurnStartedAt` and `now >= turnStartedAt + TURN_MS`.
    - `lastMove.type` is `'pass'` or `'timeout'`. Then `afterTurn()`.
  - `resolveTimeUp(room, now) → room|null`
    - **Guards:** `status 'live'`, `clock.paused === null`, `now >= clock.endsAt`, `result === null`.
    - If scores differ → `finalize(room, leader, 'time', now)`.
    - If tied → `status 'suddenDeath'`, `game.suddenDeath = { startMove: moveCount, rounds: 0 }`, `turn = firstSeat`, `clock.turnStartedAt = now`.
  - `finalize(room, winnerSeat, reason, now) → room`
    - Sets `status 'final'` and `result = { winner, teamId, scoreA, scoreB, reason, decidedAt: now }`.
    - `teamId` is `teamA`/`teamB` according to `winnerSeat`.
    - `scoreA`/`scoreB` come from `game?.scores ?? 0`.
  - Internal `afterTurn(room, now)`, called after every play or pass:
    1. **Bag-out:** if a play just emptied the mover's rack and the bag is empty → `finalize` with reason `'bagOut'` if the scores differ; otherwise enter sudden death as `resolveTimeUp` does.
    2. **Sudden death:** if `status === 'suddenDeath'` and `(moveCount - startMove) % 2 === 0` → `rounds += 1`. If the scores now differ → `finalize(leader, 'suddenDeath')`. Else if `rounds >= SUDDEN_DEATH_MAX_ROUNDS` → `status 'hostDecision'`.

- [ ] **Step 1: Write the failing tests.** Use a fixture helper `liveRoom({ racks, board, bag, scores, turn, status })` built from `createRoom` + `startMatch`, then overridden.
  - `prepareMove rejects letters not in rack (multiset)`: rack `['E','A','T','S','R','N','O']`, placing `E` at (7,6) and (7,7) → `error 'NOT_IN_RACK'`.
  - `applyPlay applies score, refills rack, switches turn`: CAT on centre from A's rack → `scores.A === 10`, `racks.A.length === 7`, `turn === 'B'`, `moveCount === 1`.
  - `applyPlay rejected on wrong turn, stale moveCount, after endsAt, while paused, while pending`: each returns `null`.
  - `applyPass timeout requires 60s and matching turnStartedAt`: at `turnStartedAt + 59999` → `null`; at `+60000` → `lastMove.type === 'timeout'`, turn switched; a second identical call on the result → `null` (`turnStartedAt` changed).
  - `resolveTimeUp picks the higher score`: scores A 20, B 15 → `status 'final'`, `result.winner 'A'`, `result.reason 'time'`, `result.teamId === room.teamA`.
  - `resolveTimeUp on a final room returns null`: call it again on the output → `null`.
  - `resolveTimeUp before endsAt returns null`.
  - `tie at time-up enters sudden death with firstSeat to move`: scores 10/10, `firstSeat 'B'` → `status 'suddenDeath'`, `turn 'B'`, `suddenDeath.rounds 0`.
  - `sudden death ends when a full round leaves a leader`: from sudden death, B plays (+5) and A passes → `final`, winner B, reason `'suddenDeath'`.
  - `sudden death goes to hostDecision after 3 tied rounds`: 6 passes → `status 'hostDecision'`.
  - `bag-out ends the game`: empty bag, A's rack `['A','T']`, A plays both → `final`, reason `'bagOut'` (when A leads after the play).
- [ ] **Step 2: Run `node --test "tests/*.test.js"`.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement the functions above in `js/match.js`.**
- [ ] **Step 4: Run `node --test "tests/*.test.js"`.** Expected: all PASS.
- [ ] **Step 5: Commit:** `git commit -am "feat(match): plays, passes, timeouts, time-up and sudden death"`

### Task 5: Match: appeals, pause, host decisions, fair play, standings, phase

**Files:**
- Modify: `js/match.js`
- Test: `tests/match.test.js`

**Interfaces:**
- **Consumes:** Task 4 `applyPlay` (core logic shared, with the pause/endsAt guards bypassed for appeals), `finalize`.
- **Produces:**
  - `requestAppeal(room, seat, placements, { now, expectedMoveCount, words, rejectedWords, total }) → room|null`
    - Same guards as `applyPlay`, except the dictionary.
    - Sets `game.pending = { seat, placements, words, rejectedWords, total, requestedAt: now }`.
    - Pauses: `clock.paused = { by: 'appeal', matchRemainingMs: endsAt - now, turnRemainingMs: TURN_MS - (now - turnStartedAt) }`.
  - `resolveAppeal(room, approve, { now }) → room|null`
    - Requires `pending`.
    - Resumes the clocks first (see `resumeClocks`).
    - **Approve:** applies the pending play exactly as `applyPlay`, skipping the `endsAt` check.
    - **Deny:** clears `pending`; it's still the same player's turn, with the remaining turn time.
  - `pauseClocks(room, now, by = 'host') → room|null`
    - Requires `live` or `suddenDeath` and not already paused.
    - Stores the remaining ms as `requestAppeal` does.
  - `resumeClocks(room, now) → room|null`
    - Requires paused.
    - Sets `endsAt = now + matchRemainingMs`, `turnStartedAt = now - (TURN_MS - turnRemainingMs)`, `paused = null`.
  - `resign(room, seat, now) → room|null`: allowed in `live`/`suddenDeath`/`hostDecision`; `finalize(other(seat), 'resign')`.
  - `awardWin(room, seat, now) → room|null`: allowed in `live`/`suddenDeath`/`hostDecision`, paused or not; reason `'awarded'`.
  - `walkover(room, seat, now) → room|null`: only `waiting`; reason `'walkover'`, scores 0/0.
  - `voidRoom(room, now) → room|null`: from any status except `void`; sets `status 'void'`, keeps `result` for the record, adds `voidedAt`.
  - `correctResult(room, now) → room|null`: only `final`; flips `winner`/`teamId`, reason `'corrected'`. *(Used by Slice 2 UI.)*
  - `recordScreenLeave(room, seat) → room|null`: only `live`/`suddenDeath`; increments `fairPlay[seat].screenLeaves`.
  - `computeStandings(teams, rooms) → [{ teamId, name, wins, losses, points, rank }]`
    - `teams` is `{ id: { name } }` and `rooms` is `{ code: room }`.
    - Only `status 'final'` rooms count. The winner gets +1 win and +1 point; the other team gets +1 loss.
    - Teams with no games are listed with zeros.
    - Sorted by points desc, then name asc. Equal points share a rank (1, 1, 3).
    - A room whose team was deleted uses `teamAName`/`teamBName`.
  - `roomPhase(room) → 'waiting'|'live'|'paused'|'appeal'|'suddenDeath'|'hostDecision'|'final'|'void'`
    - `'appeal'` when `game.pending`; `'paused'` when `clock.paused?.by === 'host'`; otherwise `status`.

- [ ] **Step 1: Write the failing tests:**
  - `appeal pauses clocks and blocks other moves`: after `requestAppeal`:
    - `roomPhase === 'appeal'`
    - `applyPass(...)` → `null`
    - `resolveTimeUp(room, endsAt + 1)` → `null`
  - `approve applies the pending move after resuming`: request at `now = 100000` with `endsAt 400000`, approve at `now = 160000` → score added, `turn` switched, `clock.endsAt === 460000`, `pending === null`.
  - `deny returns turn with remaining turn time`: request 20 s into the turn, deny 30 s later → `turn` unchanged, `now - turnStartedAt === 20000`, `pending === null`.
  - `host pause and resume shift endsAt`: pause at t, resume at t+90000 → `endsAt` +90000; `roomPhase` is `'paused'` in between.
  - `walkover only from waiting`: on a waiting room `walkover(room,'A',now)` → `result.reason 'walkover'`, `result.teamId === teamA`; on a live room → `null`.
  - `resign gives the other seat the win`.
  - `void excludes the room from standings`.
  - `computeStandings counts wins, losses and shared ranks`:
    - teams T1, T2, T3, T4
    - finals: T1 beats T2, T3 beats T4, T1 beats T3; one void room T2 vs T4
    - expected: T1 2-0 rank 1; T3 1-1 rank 2; T2 0-1 rank 3; T4 0-1 rank 3
  - `correctResult flips the winner`.
  - `recordScreenLeave increments only during live play`.
- [ ] **Step 2: Run `node --test "tests/*.test.js"`.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement the functions above in `js/match.js`.**
- [ ] **Step 4: Run `node --test "tests/*.test.js"`.** Expected: all PASS.
- [ ] **Step 5: Commit:** `git commit -am "feat(match): appeals, pause, host decisions, fair play and standings"`

### Task 6: Dictionary module

**Files:**
- Create: `js/dictionary.js`
- Test: `tests/dictionary.test.js`

**Interfaces:**
- **Produces:** `checkWords(words, { fetchFn = root.fetch, timeoutMs = 5000 } = {}) → Promise<{ rejected: string[], unverified: boolean }>`
  - One request per unique word, in parallel: `https://api.dictionaryapi.dev/api/v2/entries/en/<lowercased word>`.
  - HTTP 404 → word rejected.
  - 2xx → accepted.
  - Network error, timeout or any other status → that word is accepted and `unverified = true`.
  - Implement the timeout with `Promise.race` against a timer, so a hanging fetch can't block. Also pass an `AbortController` signal when one is available.

- [ ] **Step 1: Write the failing tests** with fake `fetchFn`s:
  - `404 rejects a word`: the fake returns `{status:404, ok:false}` for `zz` and `{status:200, ok:true}` otherwise → `rejected` deep-equals `['ZZ']` (rejected words reported uppercase), `unverified === false`.
  - `network error marks unverified, not rejected`.
  - `hanging fetch resolves unverified after timeout`: the fake returns `new Promise(() => {})`, with `timeoutMs: 20` → resolves `{ rejected: [], unverified: true }`.
  - `duplicate words are fetched once`: count the calls.
- [ ] **Step 2: Run `node --test "tests/*.test.js"`.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement `js/dictionary.js`** (UMD, global `Dictionary`).
- [ ] **Step 4: Run `node --test "tests/*.test.js"`.** Expected: all PASS.
- [ ] **Step 5: Commit:** `git add js/dictionary.js tests/dictionary.test.js && git commit -m "feat: dictionary check with timeout and unverified fallback"`

### Task 7: App shell, Store, host login, Teams panel

**Files:**
- Rewrite: `index.html`
- Create: `css/style.css`, `js/store.js`, `js/ui.js`, `js/app.js`, `js/view-host.js`

**Interfaces:**
- **Consumes:** `Match.normalizeRoom`, `Match.computeStandings`.
- **Produces:**
  - **`Store` (Firebase calls):**
    - `init()`
    - `serverNow() → number`
    - `clientId() → string`
    - Watchers (each returns an unsubscribe function):
      - `watchTeams(cb(teamsObj))`
      - `watchRooms(cb(roomsObj normalized))`
      - `watchRoom(code, cb(room|null))`
    - `addTeam(name) → Promise<id>` (push key)
    - `renameTeam(id, name)`
    - `deleteTeam(id)`
    - `mutateRoom(code, fn) → Promise<{ committed: boolean, room: room|null }>`
    - `createRoom(opts) → Promise<code>`
    - `setPresence(code, seat|null) → unsubscribe`
    - `resetTournament() → Promise`
  - **`UI` (shared rendering):**
    - `escapeHtml(s)`
    - `formatClock(ms) → 'm:ss'` (never negative)
    - `toast(msg, kind)`
    - `renderStandings(el, standings)`
    - `renderBoard(el, board, { temp = [], pending = null, onSquare })`
    - `renderRack(el, rack, { selectedIndex, usedIndices, onTile })`
  - **`App`:**
    - `App.go(route)`
    - `App.isHost() → boolean`
    - `App.onTick(fn)`: registers a callback on one shared 250 ms interval

**`mutateRoom` must be implemented exactly like this.** Returning `null` for a not-yet-cached value lets Firebase retry with the server value; returning `undefined` aborts the transaction.

```js
function mutateRoom(code, fn) {
  return db.ref(`scrabble/rooms/${code}`).transaction(cur => {
    if (cur === null) return null;
    const next = fn(Match.normalizeRoom(cur));
    return next === null ? undefined : next;
  }).then(r => ({ committed: r.committed && r.snapshot.exists(), room: r.snapshot.exists() ? Match.normalizeRoom(r.snapshot.val()) : null }));
}
```

- **`createRoom`:** transaction on `scrabble/rooms/<generateRoomCode()>`; write only if `cur === null`. Retry up to 5 new codes if the transaction doesn't commit.
- **Seat presence:** `scrabble/rooms/<code>/seats/<seat>/online`, set to `true`, with `onDisconnect().set(false)`.
- **Watcher presence:** `scrabble/rooms/<code>/watchers/<clientId>`, set to `true`, with `onDisconnect().remove()`.
- **Routes:**
  - `#host`: the host view. Shows the password box until `scrabble.host === '1'`.
  - `#room=CODE`: the room view.
  - `?view=scoreboard`: the scoreboard (Slice 2; placeholder text for now).
  - Default: the join page.
- **Header** (every view): `banner.png` with `onerror` hide, the title "DICT Digital Scrabble Sportsfest 2026", a link to Host and a Leave/Home link.
- **Host dashboard (this task):**
  - Teams panel: list, add (max 40 characters, no duplicate names ignoring case), rename inline, and delete. Delete is only offered when no room references the team (spec §5.1).
  - Standings panel: `renderStandings` fed by `computeStandings(teams, rooms)`.
  - Reset tournament button: a `prompt` that requires typing `RESET` exactly.
  - Lock host button: clears `scrabble.host`.

- [ ] **Step 1: Write the shell.**
  - Rewrite `index.html`: CDN scripts (firebase-app, firebase-database), then `js/engine.js`, `js/match.js`, `js/dictionary.js`, `js/store.js`, `js/ui.js`, `js/view-host.js`, `js/view-room.js` (an empty stub `window.RoomView = { show(){} }` for now), and `js/app.js` last.
  - Move the theme CSS into `css/style.css`. Remove all legacy game code and the jQuery tag.
- [ ] **Step 2: Implement `Store`, `UI`, `App` routing/ticker, and the host login + Teams + Standings + Reset in `view-host.js`.**
- [ ] **Step 3: Verify.**
  - Run `node --test "tests/*.test.js"`. Expected: all PASS (nothing in Node changed).
  - Run `python -m http.server 8000` and open `http://localhost:8000/#host` in **two** windows.
  - Expected:
    - There are no console errors.
    - A wrong password is rejected, and `1101` unlocks.
    - Adding teams `TEST-A` and `TEST-B` in window 1 appears in window 2 within about 1 s, and both are listed in Standings at 0-0.
    - Renaming updates both windows.
    - The team names `<b>NCR</b>` and a 60-character name render as literal text, truncated to 40 characters (Review Focus #5).
    - Refreshing stays unlocked.
    - Lock host returns to the password box.
- [ ] **Step 4: Commit:** `git add -A index.html css js && git commit -m "feat: app shell, Firebase store, host login and teams panel"`

### Task 8: Host Rooms panel (create, list, walkover/void)

**Files:**
- Modify: `js/view-host.js`, `css/style.css`

**Interfaces:**
- **Consumes:** `Store.createRoom`, `Store.watchRooms`, `Store.mutateRoom`, `Match.walkover`, `voidRoom`, `roomPhase`, `formatCode`, `UI.formatClock`, `App.onTick`.
- **Produces:** the dashboard Rooms panel. A room card opens `#room=CODE` (the host sees host controls there, built in Task 11).

- **New room form:**
  - Team A and Team B selects; they must differ, and an inline error shows otherwise.
  - Match length select: 5 / 10 / 15 minutes, or custom 1–60.
  - Optional label, max 40 characters.
  - On create: a toast with the formatted code and a **Copy code** button (`navigator.clipboard.writeText`, with a fallback that selects the text).
- **Room cards:**
  - Sorted with live rooms first, then waiting, then final, then void; newest first within each.
  - Each shows teams, code, label, phase badge and seats (x/2).
  - **Live clock:** remaining time = `endsAt - serverNow()`, ticking via `App.onTick`. When paused, it shows `matchRemainingMs`.
  - Final rooms show "+1 TEAM", and the reason when it isn't `time`.
  - Fair-play warning when `screenLeaves > 0`: "⚠️ {name} left the screen {n}×".
  - "⚖️ Appeal pending" when the phase is `appeal`.
- **Waiting-room actions:**
  - **Walkover → Team A / Team B**, after a confirm naming the team.
  - **Void**, after a confirm.

- [ ] **Step 1: Implement the form, the cards and the actions.**
- [ ] **Step 2: Verify** (two host windows; use the `TEST-` teams from Task 7). Expected:
  - Creating `TEST-A vs TEST-B, 5 min` shows a `XXX-XXX` code in both windows.
  - Same-team creation is blocked.
  - Walkover → TEST-A makes the card Final, "+1 TEST-A", and Standings shows TEST-A 1-0, TEST-B 0-1.
  - Voiding that room returns Standings to 0-0.
  - Running `node --test "tests/*.test.js"` still passes.
- [ ] **Step 3: Commit:** `git commit -am "feat(host): fixture room creation, room list, walkover and void"`

### Task 9: Join page + room lobby (seats, ready, start, spectators, rejoin)

**Files:**
- Rewrite stub: `js/view-room.js`
- Modify: `css/style.css`

**Interfaces:**
- **Consumes:**
  - `Match.normalizeCode`, `claimSeat`, `setReady`, `startMatch`, `removePlayer`, `roomPhase`, `formatCode`
  - `Store.watchRoom`, `mutateRoom`, `setPresence`, `watchTeams`
  - `App.isHost`
- **Produces:**
  - `RoomView.showJoin()`
  - `RoomView.show(code)`
  - Internal `state = { code, room, mySeat: 'A'|'B'|'watch'|null }`, reused by Tasks 10 and 11.

- **Join page:**
  - Fields: room code (accepts `k7q 42m`) and name (prefilled from `scrabble.name`, max 40). **Find room**.
  - An unknown code shows "Room not found".
  - Otherwise it shows "{TeamA} vs {TeamB}" and three buttons: **Play for {TeamA}**, **Play for {TeamB}**, **Just watch**. A seat held by someone else is disabled ("Taken by {name}").
  - Claiming a seat:
    1. `mutateRoom(claimSeat)`
    2. on commit, store `scrabble.seat.<CODE>` and go to `#room=CODE`
    3. if not committed, show "Seat was just taken" and re-render
- **Opening `#room=CODE`:**
  - If `scrabble.seat.<CODE>` is `A` or `B`, re-claim through `claimSeat` with the same clientId; this is the rejoin. If it's rejected (host removed you), clear the key and show the join choices.
  - If the key is `'watch'`, join as a watcher.
  - If there's no key and the user is the host, use host mode with no seat.
  - If there's no key and the user isn't the host, show the join choices for this code.
- **Lobby (waiting):**
  - Both seat rows show the name, an online dot and a Ready badge; the host is shown; "👁️ n watching".
  - The player's own seat has a **Ready / Not ready** toggle.
  - The host sees **Start match**, disabled until both are ready, plus **Remove** on each occupied seat (with a confirm).
- **Start:** after `startMatch` commits, every client shows "Coin toss: {Team} goes first" for 3 s, then the live screen (Task 10). For this task the live screen can be the placeholder "Live".

- [ ] **Step 1: Implement the join page, rejoin logic, lobby, ready, start, remove and presence.**
- [ ] **Step 2: Verify** with three windows (host, player A, player B; use an incognito window for B so it gets a different clientId) and a fourth as spectator. Expected:
  - The code is accepted in lowercase with a space.
  - Taken seats are disabled.
  - Start is disabled until both are Ready.
  - After Start, all four windows show the same coin toss.
  - Refreshing player A's window puts A back in seat A automatically (Review Focus #1).
  - Closing B's window turns B's online dot off in the others within about 5 s.
  - The host's Remove on A frees the seat, and A's window shows the join choices again.
  - Spectator count changes as the watcher joins and leaves.
- [ ] **Step 3: Commit:** `git commit -am "feat(room): join by code, seats with rejoin, lobby, ready and start"`

### Task 10: Live game: playing, dictionary, clocks, time-up, final screen

**Files:**
- Modify: `js/view-room.js`, `css/style.css`

**Interfaces:**
- **Consumes:**
  - `Match.prepareMove`, `applyPlay`, `applyPass`, `requestAppeal`, `resolveTimeUp`, `resign`, `roomPhase`, `TURN_MS`
  - `ScrabbleEngine.ERROR_TEXT`
  - `Dictionary.checkWords`
  - `UI.renderBoard`, `renderRack`, `formatClock`
  - `Store.mutateRoom`, `serverNow`
  - `App.onTick`
- **Produces:** the live and final screens for players and spectators. Host controls come in Task 11.

- **Layout:**
  - **Score bar:** `{TeamA} · {nameA} {scoreA}`, `⏱ match clock`, `{TeamB} · {nameB} {scoreB}`. The current turn is highlighted, with a turn clock under it.
  - **Board:** `renderBoard`. **Rack:** only for the seated player.
  - **Buttons:** **Play**, **Recall**, **Pass** (with a confirm) and **Resign** (with a confirm).
  - **Last move line:** "Juan played CAT, ACT (12)". It adds "· unverified" when `unverified`, and "Maria passed" or "Maria ran out of time".
  - **Status line:** shows "Sudden death: round {rounds+1} of 3" during sudden death, and "Waiting for host decision" during `hostDecision`.
- **Placing tiles:** tap a rack tile, then tap an empty square. Tap a temporary tile to return it. Temporary placements are kept in memory only.
- **Play flow:**
  1. `prepareMove`; on error, `toast(ERROR_TEXT[error])`.
  2. The button shows "Checking…", then `checkWords(words.map(w => w.word))`.
  3. If nothing is rejected → `mutateRoom(r => applyPlay(r, seat, placements, { now: serverNow(), expectedMoveCount: room.game.moveCount, unverified }))`.
     - Not committed → toast "Move not accepted (time up or state changed)" and recall.
  4. If something is rejected → show "❌ {words} not found" with **Recall** and **Ask host**.
     - **Ask host** → `mutateRoom(requestAppeal(...))`. While the phase is `appeal`, the player sees "Waiting for host…" and the input is disabled.
- **Ticker** (`App.onTick`), for player seats and the host only; spectators never write:
  - If the phase is `live` or `suddenDeath`, not paused, and `serverNow() >= turnStartedAt + TURN_MS` → `mutateRoom(applyPass(..., { timeout: true, expectedTurnStartedAt, expectedMoveCount }))`. Use a per-`turnStartedAt` flag so each client tries only once.
  - If the phase is `live` and `serverNow() >= endsAt` → `mutateRoom(r => resolveTimeUp(r, serverNow()))`, attempted once per room.
- **Clocks render** from `endsAt` and `turnStartedAt` (or from `paused` values), so every window shows the same time.
- **Final screen:** "🏆 {Team} wins", "{nameA} {scoreA} – {scoreB} {nameB}", "+1 {Team}", plus a reason line for resign, awarded, walkover, bagOut or suddenDeath, and a **Back to start** button. No auto-redirect. Void shows "This room was voided".

- [ ] **Step 1: Implement the live and final screens, the play flow and the ticker.**
- [ ] **Step 2: Verify** with host + A + B (incognito) + spectator, in a room with **custom 2 minutes**. Expected:
  - The first move off centre is rejected with the centre message.
  - Playing `CAT` across the centre scores 10 on both players' screens and the spectator's.
  - A's rack refills to 7.
  - A nonsense word such as `XQZ` (if the rack allows) shows "not found" with Recall and Ask host.
  - Leaving a turn idle passes it after 60 s, logged once (not twice) even though three clients are watching.
  - At 0:00 the result appears in every window; the host dashboard shows "+1" and the standings update.
  - Repeat with the **host window closed** before 0:00: a player window records the result, and reopening the host shows the same single result (Review Focus #2).
  - Repeat ending tied (both pass every turn) → sudden death, then "Waiting for host decision" after 3 rounds.
  - Resign → the other team wins.
  - A 360px-wide window (phone emulation) can place tiles by tapping.
  - Run `node --test "tests/*.test.js"`: PASS.
- [ ] **Step 3: Commit:** `git commit -am "feat(room): live play with dictionary, clocks, time-up and final screen"`

### Task 11: Host in-room controls, appeals, fair-play warnings, disconnect notices

**Files:**
- Modify: `js/view-room.js`, `css/style.css`

**Interfaces:**
- **Consumes:** `Match.pauseClocks`, `resumeClocks`, `resolveAppeal`, `awardWin`, `voidRoom`, `recordScreenLeave`, `roomPhase`; Task 9/10 `state`.
- **Produces:** the host control bar in the room view, and the player screen-leave reporting.

- **Host control bar** (only when `App.isHost()`; visible in the live, appeal, suddenDeath and hostDecision phases):
  - **Pause / Resume**.
  - **Award win → {TeamA} / {TeamB}**, with a confirm naming the team.
  - **Void**, with a confirm.
  - The host sees the board and scores but not the racks.
- **Appeal prompt** (host, phase `appeal`): "⚖️ {name} played {words with scores} ({total} pts). Not found: {rejectedWords}", with **Approve** and **Deny**, each calling `mutateRoom(r => resolveAppeal(r, approve, { now: serverNow() }))`.
  - Pending tiles are drawn on the board with a dashed outline for everyone.
- **hostDecision banner** (host): "Still tied after 3 sudden-death rounds. Award the win:" with two buttons.
- **Fair play:**
  - The player's window listens to `visibilitychange`. When `document.hidden` and the phase is `live` or `suddenDeath` → `mutateRoom(r => recordScreenLeave(r, mySeat))`.
  - The host bar shows "⚠️ {name} left the screen {n}×" for each seat with n > 0. No other effect.
- **Disconnect notice** (everyone): when a seated player's `online === false` during play → "{name} disconnected". The host bar adds a hint: "Pause to wait, or Award win".

- [ ] **Step 1: Implement the host bar, the appeal prompt, the hostDecision banner, fair-play reporting and disconnect notices.**
- [ ] **Step 2: Verify** (host + A + B incognito, 5-minute room). Expected:
  - Pause freezes both clocks in all windows, and Resume continues from the same time.
  - A rejected word → Ask host → the host sees the prompt and the players' clocks are frozen.
    - **Approve** applies the score and passes the turn.
    - On a second appeal, **Deny** returns the tiles to the rack and it's still the same player's turn.
  - Switching tabs on A's window shows "⚠️ … left the screen 1×" on the host bar and the dashboard card, and nothing else happens.
  - Closing B shows "disconnected"; the host's Award win → TEST-A finalizes with reason "awarded".
  - Run `node --test "tests/*.test.js"`: PASS.
- [ ] **Step 3: Commit:** `git commit -am "feat(room): host controls, dictionary appeals, fair-play warnings"`

### Task 12: Docs + dry-run checklist

**Files:**
- Modify: `CLAUDE.md`, `README.md`
- Create: `docs/dry-run-checklist.md`

- [ ] **Step 1: Update `CLAUDE.md`:**
  - Replace the architecture, schema, "Known gaps" and "keep single-file" sections with the new module layout, the `scrabble/` schema, the rule that every write is a `mutateRoom` around a pure `Match` function, the Firebase storage rules from Global Constraints, and the test command.
  - Keep the scope, git workflow and Superpowers sections.
- [ ] **Step 2: Update `README.md`:** features (fixture rooms, team standings, host dashboard), how to run, how to run the tests, project structure.
- [ ] **Step 3: Write `docs/dry-run-checklist.md`:** the manual checks from Tasks 7–11, as one ordered script for the Monday-evening dry run with 3–4 people. Start it with "use teams prefixed TEST- and void or reset afterwards", and end it with "Void all test rooms and delete TEST- teams (or Reset tournament before the event)".
- [ ] **Step 4: Verify:** run `node --test "tests/*.test.js"` (PASS). Check that every file path named in `CLAUDE.md` exists (`ls` them).
- [ ] **Step 5: Commit:** `git commit -am "docs: update CLAUDE.md and README for fixture rooms; add dry-run checklist"`

---

## Slice 2: optional (Mon 11/2 night, only if the dry run passed)

### Task 13: Big-screen scoreboard view

**Files:**
- Create: `js/view-scoreboard.js`
- Modify: `index.html` (load script), `js/app.js` (route `?view=scoreboard`), `css/style.css`, `js/view-host.js` (**Open big-screen view** button → `window.open('?view=scoreboard')`)

**Interfaces:**
- **Consumes:** `Store.watchTeams`, `watchRooms`, `Match.computeStandings`, `roomPhase`, `UI.renderStandings`, `UI.formatClock`, `App.onTick`.
- **Produces:** `ScoreboardView.show()`.

- **Layout:** dark full-screen, no header links, nothing interactive.
  - **Left:** team standings in large type (rank, team, W-L, points).
  - **Right:** live rooms (teams, scores, match clock, a "Sudden death" or "Paused" tag).
  - **Footer:** the last 5 finals ("+1 {Team}").
  - It must be readable at 1280×720 from a distance. Minimum body font is 28px.
- [ ] **Step 1: Implement the view and the route.**
- [ ] **Step 2: Verify:** open `?view=scoreboard` alongside a live test room. Scores and the clock update live, and a final result moves the standings within about 1 s. There's no password prompt and no console errors.
- [ ] **Step 3: Commit:** `git commit -am "feat: big-screen scoreboard view"`

### Task 14: Correct result (host)

**Files:**
- Modify: `js/view-host.js`, `js/view-room.js`

**Interfaces:**
- **Consumes:** `Match.correctResult` (Task 5), `Store.mutateRoom`.
- **Produces:**
  - **Correct result** on final room cards and in the room's final screen (host only): a confirm "Give the win to {other team} instead?", then `correctResult`.
  - **Void** is also available on final rooms.
- [ ] **Step 1: Implement it.**
- [ ] **Step 2: Verify:** after a test final, Correct result swaps "+1" to the other team and the standings follow in every window. Void removes it from the standings.
- [ ] **Step 3: Commit:** `git commit -am "feat(host): correct or void a final result"`

---

## Not in this plan (cut until after the event, per spec §13)

- The public room list on the start page (§5.10).
