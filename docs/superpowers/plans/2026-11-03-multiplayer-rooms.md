# 3–4 player rooms and the roulette wheel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The host can create 2-, 3- or 4-player fixture rooms. 3–4 player rooms rotate turns around the seats, pick the first player with a roulette wheel, settle ties with sudden death between the tied players only, and end on a podium. 2-player rooms are unchanged.

**Architecture:**
- All rules live in `js/match.js` as pure, test-first functions built on a per-room seat list (`Match.seatsOf(room)`).
- New fields (`players`, seats C/D, `game.out`, sudden-death participants) are written **only for 3–4 player rooms**. A 2-player room's stored state stays byte-for-byte what it is today.
- Views stop hard-coding `['A','B']` and render one column, slice or podium step per seat. 2-player rooms keep their current markup paths.

**Tech Stack:** vanilla JS (UMD modules, no build), Firebase RTDB v8 (`Store.mutateRoom` transactions), Node ≥18 `node:test`, the CDP E2E harness in `.superpowers/e2e/`.

**Spec:** `docs/superpowers/specs/2026-11-03-multiplayer-rooms-design.md`. Read it first: it holds the user's rules, the mockup picks (score bar **B**, wheel **A**, podium **A**) and the edge-case list.

## Global Constraints

- **2-player rooms:** same stored shape, same copy, same screens. Every existing test passes unchanged, except where a task names a test it changes and says why.
- **Rooms without `players`** are 2-player rooms (`Match.seatsOf` → `['A','B']`).
- **Never write `undefined`** and never store arrays containing `null`. Optional fields are omitted, not set to `undefined`. Empty objects and arrays come back through `Match.normalizeRoom` (`game.out` → `{}`, `suddenDeath.played` → `[]`).
- **Writes:** every room write is `Store.mutateRoom(code, r => Match.<fn>(r, …))`. Guards make automatic transitions idempotent, and a result is recorded exactly once.
- **Text:** user strings go through `UI.escapeHtml` / `esc` (or `textContent`) and are shown with `Names.short`, keeping the full name in `title`.
- **Seat colours:**
  - A: `--blue` + white text. B: `--red` + white text (as today).
  - **C: `--green` + `--navy` text. D: `--yellow` + `--navy` text.**
  - Fixed in both themes. Every chip, badge and pill passes WCAG AA in both themes.
- **Constants:**
  - `Match.INTRO_MS` stays `6500`. New `Match.INTRO_MULTI_MS` = `8500`.
  - Wheel result shows at `Scenes.WHEEL_RESULT_AT` = `6000` (≥ 2 s before the clocks start).
  - `SUDDEN_DEATH_MAX_ROUNDS` stays `3`. The turn clock stays `TURN_MS` (60 s).
- **Reduced motion:** the wheel becomes a fade to the result. The podium has no rising animation. Never more than one flash per scene.
- **Layout:** phone 360px and the 420px `.live-panel` fit 4 columns with no horizontal page scroll.
- **Commits:** on branch `feat/multiplayer-rooms`, no `Co-Authored-By`.

## Review Focus

1. **A 2-player room created before this branch, read after it**, with no `players`, no `game.out` and `suddenDeath` = `{ startMove, rounds }`. It renders, plays, enters and leaves sudden death, and counts in the standings exactly as before. (Task 1 `normalizeRoom: old 2-player room unchanged`, Task 2 `2-player sudden death state shape unchanged`.)
2. **Four clients and the host all firing the same turn timeout or time-up** in a 4-player room. Exactly one write commits; the others return `null`. (Task 2 `timeout twice in a 4-player room: second is rejected`, `resolveTimeUp twice: second is rejected`.)
3. **An out seat** (resigned, or knocked out in sudden death) tries to play, pass or time out. Rejected: the turn never lands on it. (Task 2 `out seats are skipped and cannot act`.)
4. **Refreshing during the roulette**: the same wheel, the same landing seat and the same remaining time, on every screen. (Task 3 `wheelTurns lands every seat under the pointer`; Task 6 E2E reload mid-wheel.)
5. **Deleting a team that sits in seat C or D** of a live room. Refused, like A/B today. (Task 4 E2E check.)

---

### Task 1: Match — the seat model, room creation, seats, start

**Files:**
- Modify: `js/match.js` (constants, `isRoomRecord`, `createRoom`, `normalizeRoom`, `claimSeat`, `withTeamNames`, `startMatch`, exports)
- Test: `tests/match.test.js`

**Interfaces:**
- Produces:
  - `Match.ALL_SEATS = ['A','B','C','D']`.
  - `Match.seatsOf(room) -> string[]`: `ALL_SEATS.slice(0, room.players || 2)`.
  - `Match.teamOf(room, seat) -> string` (team id): `room['team' + seat]`.
  - `Match.teamNameOf(room, seat) -> string`: `room['team' + seat + 'Name']`, falling back to `'Team ' + seat`.
  - `Match.isSeat(room, s) -> boolean`.
  - `Match.INTRO_MULTI_MS = 8500`.
  - `Match.introMsFor(room) -> number`: `INTRO_MS` for 2 seats, `INTRO_MULTI_MS` for 3–4.
- `Match.createRoom({ code, teamA, teamB, teamC?, teamD?, teamAName, teamBName, teamCName?, teamDName?, players = 2, label, matchLengthSec, now })`:
  - `players` must be 2, 3 or 4, else throw `'BAD_PLAYERS'`.
  - Every seat in `seatsOf` needs a non-empty team id, else throw `'MISSING_TEAM'`.
  - Any duplicate team id throws `'SAME_TEAM'`.
  - For 2 players the returned object is **exactly** today's.
  - For 3–4 it adds `players`, `teamC`/`teamCName` (and `teamD`/`teamDName`), and `seats`/`fairPlay` entries for every seat.
- `normalizeRoom` restores per-seat defaults (`seats`, `fairPlay`, `taunts`, `racks`, `scores`) over `seatsOf(r)` and `game.out = g.out || {}`. `teamCName`/`teamDName` default to `''` only when that seat exists.
- `claimSeat` returns `null` for a seat not in `seatsOf(room)`.
- `startMatch(room, now, rng, introMs)`:
  - Requires every seat in `seatsOf` ready.
  - Deals one rack per seat in seat order.
  - Sets `scores` for every seat.
  - `firstSeat`: 2 seats keeps `rng() < 0.5 ? 'A' : 'B'` (same rng call order as today). 3–4 seats picks `seats[Math.floor(rng() * n)]`.
- `withTeamNames` refreshes every seat's name.

- [ ] **Step 1: Write the failing tests** in `tests/match.test.js` (new section `// ---------- 3–4 player rooms: seat model ----------`):
  - `seatsOf / teamNameOf / introMsFor`:
    - an old room `{ teamA, teamB }` → `seatsOf` = `['A','B']`
    - `{ players: 4 }` → `['A','B','C','D']`
    - `teamNameOf({ teamCName: 'IV-A' }, 'C') === 'IV-A'`; `teamNameOf({}, 'D') === 'Team D'`
    - `introMsFor` 2 → 6500, 3 → 8500
  - `createRoom: 2 players is unchanged`: `deepStrictEqual` against a literal of today's object (no `players` key).
  - `createRoom: 4 players`: `players: 4`; `seats` = `{ A:null, B:null, C:null, D:null }`; `teamC`, `teamDName` present; `fairPlay` has C and D.
  - `createRoom: duplicates and gaps are refused`:
    - `teamC === teamA` throws `SAME_TEAM`
    - `players: 3` without `teamC` throws `MISSING_TEAM`
    - `players: 5` throws `BAD_PLAYERS`
  - `normalizeRoom: old 2-player room unchanged`: today's createRoom output round-trips with no `C`/`D` keys anywhere and no `players`.
  - `normalizeRoom: 4-player room restores dropped empties`: racks/scores/fairPlay/taunts for C and D; `game.out` = `{}`.
  - `claimSeat: C only exists in 3–4 player rooms`: `null` on a 2-player room; works on a 3-player room.
  - `startMatch: 4 players`: four 7-tile racks; bag length = 98 − 28; scores A–D = 0. `constRng(0.8)` → `firstSeat === 'D'`; `constRng(0.3)` → `'B'`.
  - `startMatch: needs every seat ready`: one unready seat → `null`.
  - `startMatch: 2 players is unchanged`: the existing startMatch tests pass untouched.

- [ ] **Step 2: Run** `node --test tests/match.test.js` → the new tests FAIL (`seatsOf is not a function`, …).

- [ ] **Step 3: Implement** the Interfaces above. Replace every internal `SEATS` use in these functions with `seatsOf(room)`. Keep `isRoomRecord` as today (A and B always exist).

- [ ] **Step 4: Run** `node --test "tests/*.test.js"` → all PASS.

- [ ] **Step 5: Commit** `feat(match): 3-4 player seat model (players, seats C/D, roulette first seat)`

---

### Task 2: Match — rotation, endings, sudden death, resign, host decisions, standings, ranking

**Files:**
- Modify: `js/match.js` (`other` users, `leader`, `endTurn`, `enterSuddenDeath`, `resolveTimeUp`, `finalize`, `resign`, `awardWin`, `walkover`, `correctResult`, `computeStandings`, new helpers, exports)
- Test: `tests/match.test.js`

**Interfaces:**
- Consumes: Task 1's `seatsOf`, `teamOf`, `teamNameOf`.
- Produces:
  - `Match.activeSeats(room) -> string[]`: `seatsOf` minus `Object.keys(game.out)`.
  - `Match.nextSeat(room, seat) -> string`: the next seat after `seat` in `ALL_SEATS` order that is active (and, during sudden death, in `suddenDeath.seats`), wrapping. For 2 seats it equals today's `other(seat)`.
  - `game.out`: `{ [seat]: 'left' | 'sd' }`. Written only in 3–4 player rooms.
  - `game.suddenDeath` for 3–4 player rooms: `{ startMove, rounds, seats: [...], played: [...] }`. For 2-player rooms it stays `{ startMove, rounds }` on entry. `seats` defaults to `activeSeats` and `played` to `[]` when absent.
  - `finalize` writes `scoreA`/`scoreB` as today, plus `scoreC`/`scoreD` for rooms that have those seats.
  - `Match.correctResult(room, now, note = '', toSeat = null)`:
    - 2-player: `toSeat` is optional, defaults to the other seat, and gives today's result.
    - 3–4 player: `toSeat` must be a room seat other than the current winner, else `null`.
  - `Match.awardWin(room, seat, now)` and `Match.walkover(room, seat, now)`: `null` for a seat not in `seatsOf(room)`.
  - `Match.ranking(room) -> Array<{ seat, score, place, left }>`:
    - The recorded winner is first (place 1).
    - Then the others who didn't leave, by score descending, with equal scores sharing a place. Places continue 2, 3…
    - Then `left` seats by score, places continuing.
    - Scores come from `result.score<Seat>` when final, else `game.scores`.
  - `computeStandings`: the winner gets a win and +1; **every other seat** in `seatsOf(room)` gets a loss.

**Rules to implement** (from the spec):
- **`endTurn(r, seat, …)`:** `g.turn = nextSeat(r, seat)`.
- **Bag-out** (`wentOut && status === 'live'`) **and `resolveTimeUp`:** `top` = the max score over `activeSeats`; `leaders` = the active seats with `top`.
  - One leader → `finalize(leader, 'bagOut' | 'time')`.
  - Several leaders → sudden death:
    - 3–4 players: mark the non-leader active seats `out: 'sd'`; `suddenDeath = { startMove: moveCount, rounds: 0, seats: leaders, played: [] }`.
    - `turn` = the first leader at or after `firstSeat` in `ALL_SEATS` order (2-player: `firstSeat`, as today). `turnStartedAt` as today.
- **During sudden death, after each play, pass or timeout by `seat`:**
  - Add `seat` to `played` (3–4 players only; 2-player rooms keep today's `(moveCount - startMove) % 2 === 0` check and write no `played`).
  - When every seat in `suddenDeath.seats` has played, the round is over:
    - `rounds += 1`.
    - Leaders among `suddenDeath.seats`. One leader → `finalize(leader, 'suddenDeath')`.
    - Otherwise (3–4 players) the non-leaders become `out: 'sd'`, `seats = leaders`, `played = []`.
    - If `rounds >= SUDDEN_DEATH_MAX_ROUNDS` → `status = 'hostDecision'`.
  - `turn` = `nextSeat` among the remaining sudden-death seats.
- **`resign(room, seat, now)`:**
  - The seat must be in `activeSeats`.
  - If only one active seat would remain → `finalize(thatSeat, 'resign', now)`, the same result as today for 2 players.
  - Otherwise (3–4 players): `out[seat] = 'left'`, `racks[seat] = []` (tiles leave the game, the bag is unchanged).
    - Remove `seat` from `suddenDeath.seats` and `played` if present.
    - If `turn === seat` → `turn = nextSeat`, `turnStartedAt = now`.
    - If in sudden death and every remaining seat has now played → evaluate the round as above.
- **`awardWin` in `hostDecision`:** any room seat may be awarded (the UI lists `suddenDeath.seats` first). The status guards are unchanged.

- [ ] **Step 1: Write the failing tests** (section `// ---------- 3–4 player rooms: rules ----------`). Use a helper `live4(over)`: a started 4-player room (`constRng(0.8)` → first D), racks set to `RACK_CAT` copies.
  - `rotation goes around the seats from the first player`: D plays CAT → turn A; A passes → B; B passes → C; C passes → D.
  - `out seats are skipped and cannot act`:
    - B resigns (not on turn) → `out.B === 'left'`, `racks.B` = `[]`, bag length unchanged.
    - Rotation A → C. `applyPlay`/`applyPass` by B → `null`.
  - `resign on your own turn passes the turn`: turn A, A resigns → turn B, `turnStartedAt === now`.
  - `last player left wins`: B, C, D resign in turn → `final`, winner A, reason `resign`, `scoreA..scoreD` present.
  - `2-player resign is unchanged`: the existing resign test passes untouched.
  - `time up: highest score wins`: scores A40 B20 C10 D5, `now >= endsAt` → winner A, reason `time`, `result.scoreC === 10`.
  - `time up: tie at the top → sudden death between the tied only`:
    - A30 B30 C10 D30, firstSeat C.
    - → `suddenDeath.seats` = `['A','B','D']`; `out.C === 'sd'`; turn = D (the first tied seat at or after C).
  - `sudden death: a player who falls behind is out; the count keeps going`:
    - From the previous state, D, A and B each pass in turn. Before B's pass the test sets `game.scores` to A35 B30 D35, as if D and A had scored.
    - → round 1 over: `seats` = `['A','D']`, `out.B === 'sd'`, `rounds === 1`.
    - Round 2: the scores are set so D leads, then D and A pass → D wins, reason `suddenDeath`.
  - `sudden death: 3 tied rounds → hostDecision`: three rounds where every seat passes → `status === 'hostDecision'`, `rounds === 3`.
  - `sudden death: resign mid-round`: seats `['A','B','D']`, A played, then B resigns → the round isn't over until D plays; after D, it's evaluated over `['A','D']`.
  - `2-player sudden death state shape unchanged`: the existing `{ startMove: 4, rounds: 0 }` `deepStrictEqual` (line ~288) passes untouched; after one move there is no `played` key.
  - `bag out in a 4-player room`: bag empty, D plays its last tiles → highest active score wins (or sudden death on a tie).
  - `timeout twice in a 4-player room: second is rejected`: `applyPass(…, { timeout: true, expectedTurnStartedAt })` applied to the same room twice in a row → the second returns `null`.
  - `resolveTimeUp twice: second is rejected`.
  - `awardWin / walkover: any seat of the room, never a foreign seat`:
    - 4-player `awardWin(r, 'C')` works.
    - 2-player `awardWin(r, 'C')` → `null`.
    - `walkover(r4, 'D')` → `final`, winner D.
  - `correctResult in a 4-player room needs a target seat`:
    - Without `toSeat` → `null`.
    - `toSeat` = the winner → `null`.
    - `toSeat: 'C'` → winner C, `teamId === teamC`, reason `corrected`, `originalReason` kept.
  - `computeStandings: a 4-player room gives 1 win and 3 losses`: winner team W1 L0 P1; the other three W0 L1.
  - `ranking: winner first, ties share, leavers last`:
    - Final, winner B (awarded) with A50 B20 C20 D60, D left → `[B:1, A:2, C:3, D:4 left]`.
    - Equal C/A scores share a place: A20 C20 → places `2, 2`, next `4`.

- [ ] **Step 2: Run** `node --test tests/match.test.js` → the new tests FAIL.

- [ ] **Step 3: Implement** the rules and Interfaces above. Keep 2-player code paths producing identical objects. Prefer one general path with "write only when 3–4" branches over a parallel implementation.

- [ ] **Step 4: Run** `node --test "tests/*.test.js"` → all PASS (the existing 2-player tests untouched).

- [ ] **Step 5: Commit** `feat(match): 3-4 player turns, endings, sudden death, resign, host decisions, ranking`

---

### Task 3: Pure display helpers for N seats (pill, taunt, celebrate, scenes)

**Files:**
- Modify: `js/pill.js` (`nameOf`, `ribbon`), `js/taunt.js` (`SEATS`, `arrivals`), `js/celebrate.js` (`detect` team name), `js/scenes.js` (pure parts: `hasResult`, `resultViewer`, `resultReason`, `teamFull`, timing constants, new `wheelTurns`, `introPhase`)
- Test: `tests/pill.test.js`, `tests/taunt.test.js`, `tests/celebrate.test.js`, `tests/scenes.test.js`

**Interfaces:**
- Consumes: `Match.seatsOf`, `Match.teamNameOf`, `Match.isSeat`, `Match.INTRO_MULTI_MS`.
- Produces:
  - `Scenes.WHEEL_RESULT_AT = 6000`, `Scenes.MULTI_TEAMS_MS = 2600`, `Scenes.WHEEL_SPIN_MS = 3400`.
  - `Scenes.wheelTurns(seats, firstSeat, spins = 5) -> number` (degrees, clockwise). Slice `i` covers `[i·360/n, (i+1)·360/n)` clockwise from the top, so `(wheelTurns + centre_i) % 360 === 0` puts the first seat's centre under the top pointer.
  - `Scenes.resultReason(room)`: 3–4 player `resign` → `'Everyone else left the game'`. 2-player copy unchanged.
  - `Taunt.arrivals` iterates `Match.seatsOf(room)`.
  - `Pill.ribbon` treats any room seat as seated and names the turn seat's team via `teamNameOf`.
  - `Celebrate.detect` uses `teamNameOf`.

- [ ] **Step 1: Write the failing tests:**
  - `scenes.test.js`:
    - `wheelTurns lands every seat under the pointer`: for n = 3 and 4 and every seat, `(wheelTurns(seats, s) + (i + .5) * 360 / n) % 360 === 0` and `wheelTurns >= 5 * 360`.
    - `the wheel result stays at least 2 s`: `Match.INTRO_MULTI_MS - Scenes.WHEEL_RESULT_AT >= 2000` and `Scenes.MULTI_TEAMS_MS + Scenes.WHEEL_SPIN_MS === Scenes.WHEEL_RESULT_AT`.
    - `resultViewer: seat C wins, A sees other, D sees other, watch neutral`.
    - `resultReason: 4-player resign` → the new copy. The 2-player resign test passes untouched.
  - `taunt.test.js`: `arrivals sees a taunt from seat C` (a 3-player room with `taunts.C`).
  - `pill.test.js`: `ribbon names seat D's team for a spectator`, and `seat C is seated` (`mine` true when `mySeat === turn === 'C'`).
  - `celebrate.test.js`: `detect names the team of seat C`.

- [ ] **Step 2: Run** `node --test "tests/*.test.js"` → the new tests FAIL.

- [ ] **Step 3: Implement** with the Interfaces above. Replace each `seat === 'A' ? teamAName : teamBName` in these files with `Match.teamNameOf`, loaded like `scenes.js` loads its libraries (`lib('Match', './match.js')` or the module's existing pattern).

- [ ] **Step 4: Run** `node --test "tests/*.test.js"` → all PASS.

- [ ] **Step 5: Commit** `feat: pill, taunts, celebrations and scene helpers for 3-4 seats (wheel math)`

---

### Task 4: Host dashboard — new-room form, room cards, walkover / correct pickers, team protection, seat chips

**Files:**
- Modify: `js/view-host.js` (`teamName`, form markup ~68–71, `fillSelects`, `newRoom.onsubmit`, `cardHtml`, the `#roomList` click handler, `renderTeams` used-team set)
- Modify: `css/style.css` (`.chip-c`, `.chip-d` next to `.chip-a`/`.chip-b`; the form row)

**Interfaces:**
- Consumes: `Match.createRoom` (Task 1), `Match.seatsOf`, `Match.teamOf`, `Match.teamNameOf`, `Match.walkover`, `Match.correctResult(…, toSeat)` (Task 2).

Behaviour:
- **Form:** a **Players: 2 · 3 · 4** segmented control (default 2), then one select per seat (`#nrA`–`#nrD`, labelled "Team A"…"Team D"; C/D hidden for fewer players).
  - A team picked in one visible select is `disabled` in the others.
  - Submit refuses missing or duplicate teams with a toast ("Choose a team for every seat." / "Each seat needs a different team.").
  - Then `Store.createRoom({ players, teamA…, teamAName… })`. The confirmation line joins the team names with " vs ".
- **Room card:**
  - Team chips for every seat, separated by "vs".
  - "seats N/<players>".
  - Fair-play warnings per seat.
  - Final status "+1 <winner> · <scores joined with '–' in seat order>".
- **Walkover (waiting):** 2 players keep the two buttons. 3–4 players get one "Walkover…" button that opens a small picker of the seats (buttons "+1 <team>").
- **Correct result (final):** 2 players keep "Give the win to <other>". 3–4 players open a picker of the non-winner seats → `Match.correctResult(r, now, note, toSeat)`.
- **Team delete protection** counts every seat's team.
- Every confirm or toast that names "both" or "other" uses seat-aware copy only in 3–4 player rooms.

- [ ] **Step 1: Run** `node --test "tests/*.test.js"` → PASS (baseline; this task is DOM-only and is verified in the browser, Step 3).
- [ ] **Step 2: Implement** as above.
- [ ] **Step 3: Browser check** (playground, `.superpowers/e2e/multi-host.js`, pattern `t14.js` with `H.hostLogin`, `H.addTeams`):
  1. Create a 4-player room with four TEST teams: the card shows 4 chips and "seats 0/4". `players === 4` in the DB.
  2. A duplicate team is impossible (the option is disabled), and a forced duplicate (`select.value` set by script) is refused with the toast.
  3. A 2-player room is created exactly as before (DB object has no `players`).
  4. Deleting a team used in seat D is refused.
  5. Walkover picker → winner D, the standings show D's team +1 and the other three a loss.
  6. Correct-result picker → winner C.
  7. Contrast sweep (`CONTRAST_SWEEP` from `revamp.js`) on the dashboard in both themes passes, including the C/D chips.
  8. At 360px there's no horizontal scroll.
- [ ] **Step 4: Commit** `feat(host): create 3-4 player rooms; walkover and correct-result pickers`

---

### Task 5: Room view — join, lobby, one-row score bar, out tags, host bar, start

**Files:**
- Modify: `js/view-room.js` (`SEATS` → per room; `chip`/`versusHtml`; `nameOf`, `teamOf`, `playerOf`, `isSeat`; `renderChoices`; `renderLobby`; Start uses `Match.introMsFor(room)`; `buildLive` score bar; `update` loop; Leave confirm copy; `RoomLive.updateHost` notices / award / free-seat; `RoomLive.updateFinalHost` correct picker; `renderFinal` result key)
- Modify: `css/style.css` (`.scorebar.multi` and its columns; phone rules near `:659`; `.side.out`)

**Interfaces:**
- Consumes: Task 1–2 `Match` API; Task 3 `Pill`/`Taunt`/`Celebrate`.

Behaviour:
- **Join and lobby:** one "Play for <team>" button per seat. The lobby lists every seat. Copy: 3–4 players → "All players are ready." / "Start unlocks when all players are ready."; 2-player copy unchanged. Start calls `Match.startMatch(r, now, rng, Match.introMsFor(r))`.
- **Score bar, 3–4 players (mockup B):**
  - `.scorebar.multi`: a top row with the match clock, then `grid-template-columns: repeat(n, minmax(0, 1fr))`.
  - One `.side` per seat, `#side<Seat>`, in seat order: chip, player name (`Names.short` + `title`), score.
  - `.turn` highlights the seat on turn. `.out` dims the column and shows an "OUT" tag (`out: 'sd'`) or "LEFT" tag (`out: 'left'`) with the score kept.
  - No left/right mirroring. 2-player rooms keep today's markup and classes exactly.
- **Out players** have no rack, no Play/Pass/Shuffle and no turn pill "Your turn". The pill reads "You're out — watching". The 😀 taunt button stays.
- **Leave confirm:** 3–4 players → "Leave the game? Your team (<team>) loses; the others play on."
- **Host bar:**
  - Disconnect notice joins names "A, B and C".
  - Fair-play per seat.
  - `hostDecision`: one "Award win → <team>" button per **sudden-death seat**.
  - "Award win" during play: 3–4 players → one "Award win…" picker.
  - Free-seat per seat.
- **Final host:** the 3–4 player Correct result picker (same as Task 4).
- **Result key** (`renderFinal`): built from every seat's `score<Seat>`.

- [ ] **Step 1: Run** `node --test "tests/*.test.js"` → PASS (baseline).
- [ ] **Step 2: Implement** as above.
- [ ] **Step 3: Browser check** (`.superpowers/e2e/multi-room.js`):
  - Setup: host + 4 players (A desktop 1366×768, B phone 360×740 mobile, C, D) + a spectator, using a `startedRoom4` helper written in the script on the pattern of `L.startedRoom`.
  1. All four see the one-row bar with 4 columns. The highlight is on the stored `firstSeat` after the intro. No horizontal scroll at 360px and in the 420px landscape panel.
  2. The turn rotates: fixture racks, each player plays or passes in turn, and the highlight and pill follow on every screen.
  3. B resigns while it's C's turn: B's column shows LEFT, B has no rack or buttons, and the rotation skips B.
  4. Fixture: tie at time-up between A and D → sudden death. C is OUT and watching. Only A/D get turns. The host bar's Award lists A and D after 3 tied rounds.
  5. Refresh C mid-game → back in the seat, same state.
  6. Two-window race: with the host window **closed**, a turn times out and exactly one pass is written (moveCount +1 once).
  7. Contrast sweep on the lobby and game screen in both themes.
- [ ] **Step 4: Commit** `feat(room): 3-4 player lobby, one-row score bar, out players, host controls`

---

### Task 6: Scenes — the 3/4-WAY intro + roulette wheel, round start, the podium

**Files:**
- Modify: `js/scenes.js` (`playIntro`: branch on `seatsOf(room).length > 2`; new `buildWheel` / `startWheel`; `setTossLine` copy "🎡 Roulette: <team> goes first"; `roundStart` rows; `renderResult` podium; void copy "any team")
- Modify: `css/fx.css` (`.in-multi`, `.in-wheel`, `.in-ptr`, podium `.res-podium`, `.res-step`, `.res-fourth`, C/D colours; reduced-motion rules)

**Interfaces:**
- Consumes: `Scenes.wheelTurns`, `WHEEL_RESULT_AT`, `MULTI_TEAMS_MS`, `WHEEL_SPIN_MS` (Task 3), `Match.ranking` (Task 2), `Match.introMsFor`.

Behaviour:
- **Intro, 3–4 players:**
  - `0 – MULTI_TEAMS_MS`: "3-WAY" / "4-WAY" with every team name in its seat colour.
  - Then the wheel: an inline SVG or `conic-gradient` with one slice per seat in seat order, a team label per slice and a pointer at the top. It spins with ease-out over `WHEEL_SPIN_MS` to `Scenes.wheelTurns(seats, firstSeat)`.
  - At `WHEEL_RESULT_AT`: "<TEAM> GOES FIRST!" until the clocks start.
  - Resumes by elapsed time like the coin, so a refresh mid-spin shows the right point and the same landing. `holdIntro` freezes it on pause.
  - Reduced motion: no spin, the wheel already at the landing angle, then the result fades in.
  - The screen-reader line lists every team.
  - 2-player rooms keep `buildVs` + `buildCoin` untouched.
- **Round start (projector):** rows list every team of a room ("A vs B vs C").
- **Result, 3–4 players (mockup A):**
  - The hero is unchanged (gold winner / calm "other" / neutral).
  - Below it, a podium from `Match.ranking(room)`: places 2-1-3 on steps (1 tallest, centre), 4th on a line below, shared places on the same step height, "left" tag for leavers.
  - A walkover shows no podium.
  - Projector scale via the existing `.bp-winner` rules.
  - 2-player rooms keep the score pill.

- [ ] **Step 1: Run** `node --test "tests/*.test.js"` → PASS (baseline; the wheel math is already tested in Task 3).
- [ ] **Step 2: Implement** as above.
- [ ] **Step 3: Browser check** (extend `multi-room.js`):
  1. Every window shows the 4-WAY names, then the wheel landing on the stored `firstSeat`. The tilt of the wheel element at the end equals `wheelTurns` (mod 360) in each window.
  2. Reload one window at ~4 s → it resumes mid-spin and lands on the same seat at the same time.
  3. Reduced motion (`Emulation.setEmulatedMedia` `prefers-reduced-motion: reduce`): no spin, the result is shown.
  4. Final 4-player room → the podium shows the ranking order on players, spectator and projector. The recorded winner is on the top step after an award. The walkover shows no podium.
  5. A 2-player room still shows VS + coin and the score pill (screenshot check against the existing flow).
  6. Contrast sweep on the result screen (hero exempt as today).
- [ ] **Step 4: Commit** `feat(scenes): 3/4-way intro with the roulette wheel, podium result`

---

### Task 7: Projector — top bar, lobby card, lists, lower third

**Files:**
- Modify: `js/view-scoreboard.js` (`TEMPLATE` top bar → built per room; `teamName` → `Match.teamNameOf`; `renderRecent`, `renderNext`, `renderTicker` key and text, `renderTop`/`tickTop`, `renderBoard` lobby card, `renderLower`)
- Modify: `css/style.css` (`.bp-top.multi`, `.bp-lb-c/-d`, `.bp-nx-teams` for N, `.bp-score` per seat)

Behaviour:
- **3–4 player rooms on the big screen:** the top bar is the one-row layout at broadcast scale (clock in the middle top, N columns, turn highlight, OUT/LEFT).
- **Lists:** waiting lobby card, Next up, ticker and recent results list every team and score in seat order ("NCR 140 · CAR 120 · IV-A 95 · BARMM 80", "+1 NCR").
- **Lower third:** "ROOM X · A vs B vs C vs D" (with `Names.short`).
- 2-player rooms render exactly as today. The director is unchanged.

- [ ] **Step 1: Run** `node --test "tests/*.test.js"` → PASS (baseline).
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Browser check** (extend `multi-room.js` with a 1920×1080 `?view=scoreboard` page, host pin):
  1. Top bar with 4 columns, the turn highlight following play, taunts on the sender's column.
  2. A highlight/celebration from seat C.
  3. Winner scene with the podium.
  4. A 2-player room pinned afterwards renders the old top bar.
  5. The projector contrast check (`PJ_CONTRAST` from `revamp.js`) passes.
- [ ] **Step 4: Commit** `feat(projector): 3-4 player rooms on the big screen`

---

### Task 8: How to play copy, docs, regression run

**Files:**
- Modify: `js/view-help.js` (player and host guides: "2–4 players", the roulette for 3–4, "When all players are ready", host "Pick 2, 3 or 4 teams")
- Test: `tests/help.test.js`
- Modify: `CLAUDE.md` (project overview "Team A vs Team B" → "2–4 teams"; `match.js` row: seat helpers, `ranking`, `INTRO_MULTI_MS`; `scenes.js` row: wheel + podium; Firebase data block: `players`, `teamC/teamD`, `game.out`, `suddenDeath.seats/played`, `result.scoreC/scoreD`; the room-write examples unchanged)
- Modify: `docs/dry-run-checklist.md` (a 3–4 player section mirroring the 2-player one)

- [ ] **Step 1: Write the failing test** `help: the guides mention 2–4 players and the roulette`: `Help.guides(Help.facts()).player.steps.join('')` includes `roulette`, and `.host.steps.join('')` includes `2, 3 or 4`.
- [ ] **Step 2: Run** `node --test tests/help.test.js` → FAIL.
- [ ] **Step 3: Update** the copy and the docs.
- [ ] **Step 4: Run** `node --test "tests/*.test.js"` → all PASS. Then **2-player regression**: run the existing E2E scripts that cover 2-player flows (`node .superpowers/e2e/turnmoments.js`, `taunts.js`, `landscape.js`, `quickwins.js`, `t14.js`, `bottomtop.js`, `revamp.js`). Each must end with its "passed" line. Any failure is debugged (systematic-debugging), never skipped.
- [ ] **Step 5: Commit** `docs: 3-4 player rooms in How to play, CLAUDE.md and the dry-run checklist`
