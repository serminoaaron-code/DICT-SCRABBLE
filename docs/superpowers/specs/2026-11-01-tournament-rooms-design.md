# DICT Scrabble: Fixture Rooms & Team Standings (Design)

**Date:** 2026-11-01  ·  **Branch:** `feat/tournament-scoring`  ·  **Status:** Draft, awaiting approval  ·  **Deadline:** ready by **Tue 2026-11-03** (see §13)

Decisions the user made are stated plainly. Decisions the designer (Claude) made are marked **[call]**, and the user can reverse any of them.

---

## 1. Intent

DICT is running a sportsfest in the style of school intramurals. Each **team** (for example a regional office) sends one **representative** per sport. This app is the **Scrabble** event.

The app today is built around an open matchmaking queue, 4 servers and a knockout bracket. It never records a winner, so team scores can't be tracked. This redesign turns it into a simple **fixture-room** tool:

- The **host** schedules fixtures. Each fixture is a **room** with a code: Team A's player against Team B's player, in a single timed game.
- The **winner's team gets 1 point and the loser's team gets 0.** Team standings update live, on every screen and on a projector view.
- Players get in and out easily. They can refresh or reconnect without getting stuck, and they never need the host's help just to play.

**Why now:** the tournament needs reliable win/loss records per team. The current code can't produce them: it has no winner field, it can create duplicate matches, it leaves abandoned games hanging, and it locks out players who refresh.

**Success looks like:** on tournament day the host runs the whole event from the dashboard. Every finished room adds exactly one point to exactly one team. No one has to open the Firebase console or browser dev tools to fix anything.

## 2. Goals / Non-goals / Anti-goals

**Goals**
1. The host creates fixture rooms (Team A vs Team B, match length) and shares a short code.
2. Players join with the code and their name, take their team's seat, play one timed game, and get a clear result.
3. Each final room produces exactly one result. Team standings are calculated from those results and update live.
4. The host has full control during the event: start, pause, award a win, remove a player, correct or void a result.
5. Fair-play signals (a player leaving the screen) **warn the host**. The host decides what to do.
6. It works on phones and laptops, for players at the venue and remote players alike.
7. A big-screen standings view for a projector.

**Non-goals (explicitly out of scope)**
- Infrastructure: Firebase security rules, real authentication, hosting changes, a dev/staging Firebase project. These belong to DevOps. The host password stays the existing client-side constant.
- Cheat-proofing. Racks and game state can be read in the browser's dev tools, and that's accepted for this event.
- Best-of-N series, brackets, 4-player games, individual standings, overall sportsfest points across sports.
- Blank tiles and tile exchange. The current tile set has no blanks, and players can pass instead.
- Moving to a framework, TypeScript or a build step.

**Anti-goals (failure even if it "works")**
- A result counted twice, missing, or credited to the wrong team.
- A player stuck: locked out after a refresh, or left in a game whose opponent vanished, with no way forward.
- The host having to hand-edit data, or being swamped by automatic penalties they didn't choose.
- A heavy page: anything needing a build step, or too slow on GitHub Pages or a phone.

## 3. Constraints

- **Stack (fixed):** vanilla HTML/CSS/JS, **Firebase Realtime Database v8 SDK** (CDN), hosted on **GitHub Pages**. No bundler and no `package.json` needed to run the app.
- **Firebase project is shared** with the DICT chess app (`dict-chess-tournament`). The new data must live under its own root (see §6) and must not touch existing paths.
- **No dev database.** Local testing writes to production. Any destructive host action needs explicit confirmation.
- **Connection limit:** the free Firebase plan allows 100 simultaneous connections. *Handoff to DevOps:* confirm the plan against expected attendance (players + spectators + projector).
- Keep the current visual identity: wood and cream Scrabble theme, DICT colours, existing CSS variables.

## 4. Roles

| Role | How they get it | Can do |
|---|---|---|
| **Host** | Enters the host password (existing mechanism) | Manage teams, create and manage rooms, all in-room controls, correct/void results, reset the tournament |
| **Player** | Enters a room code + name, picks a free team seat | Ready up, play their own turns, resign |
| **Spectator** | Enters a room code and picks "Just watch", or clicks a room in a public list **[call]** | Watch the board, scores and clock. Can't see racks. |
| **Big screen** | Opens `?view=scoreboard` (no password) | Read-only standings and live rooms |

## 5. User flows

### 5.1 Host: set up teams
- The dashboard's Teams panel: add team names and rename them.
- A team that already appears in any room **can't be deleted**, only renamed **[call]**. Rooms store the team ID, so a rename shows everywhere.

### 5.2 Host: create a fixture room
- Inputs: **Team A**, **Team B** (must be different), **match length** (host picks, e.g. 5 / 10 / 15 / custom minutes), optional **label** ("Tonight 7 PM").
- Output: a **room code** such as `K7Q-42M`: 6 characters from an unambiguous alphabet (no 0/O/1/I/L), shown with a dash **[call]**.
- The host may create several rooms in advance. Each stays in **Waiting** until used.
- The same pair of teams may meet more than once if the host creates another room. The app doesn't prevent it; the host owns the schedule **[call]**.

### 5.3 Join a room (player or spectator)
1. Open the site → **Join a room** → enter the code and a display name.
2. The room shows "NCR vs Region IV-A" with three buttons: **Play for NCR**, **Play for Region IV-A**, **Just watch**. A player seat that's already taken is greyed out.
3. Taking a seat is first come, first served, and atomic: two people can't hold the same seat.
4. No email or registration. **The device remembers the seat** (browser `localStorage`), so a refresh or reopening the link puts the player back in their seat automatically.
5. If a player switches devices, the host uses **Remove player** to free the seat, and the player joins again.

### 5.4 Room lobby → start
- Everyone in the room sees both seats (name + Ready badge), the host, and the number of spectators.
- Both players press **Ready**. Then the host presses **Start**. The match clock begins at Start, using Firebase **server time**.
- **First move: a random coin toss at Start.** Everyone sees "Coin toss: NCR goes first". The same seat starts each sudden-death round.
- The host can **Remove player** from a seat at any time before the game is final.
- **No-show:** on a room that is still Waiting, the host can choose each time between:
  - **Walkover:** the host picks the team that showed up. That team gets +1, recorded with reason `walkover`.
  - **Void:** nobody scores, and the host can create a new room to reschedule.

### 5.5 Live game
- Shown to everyone: team names, player names, scores, the **match clock** and the **turn clock**.
- Shown only to each player: their own 7-tile rack, plus Play / Recall / Pass / Resign.
- **Turn clock: 60 seconds.** When it runs out, the turn **passes automatically**. There's no penalty for passing (the old "3 passes = disqualified" rule is removed **[call]**).
- **The match clock ends the game.** When it reaches 0, the higher score wins.
  - **Moves already in progress:** a move submitted after time-up is rejected **[call]**.
- **Tie at time-up → sudden death.** Play continues turn by turn. After each full round (both players have had one turn), if the scores differ, the leader wins.
  - **[call] Cap:** after 3 sudden-death rounds still tied, the game goes to **Host decision** and the host uses **Award win**.
- **Early end:** if the bag is empty and a player uses their last tile, the game ends immediately and the higher score wins **[call]**. A tie here also goes to sudden death.
- **Resign:** the other side wins immediately.
- **Disconnection:** the clock keeps running. Everyone sees "Maria disconnected". The host decides whether to **Pause** (both clocks freeze) or **Award win** to the other side. Nothing is decided automatically.

### 5.6 Fair play
- When a player's page is hidden (tab switch, app switch, phone call) during a live game, a **screen-leave** count goes up for that player.
- The host sees it on the dashboard room card and inside the room ("Maria left the screen 2×"). **No automatic penalties.**

### 5.7 Final
- Everyone sees the winner banner ("🏆 Region IV-A wins · 63–57 · +1 Region IV-A").
- The room locks as **Final**. Players get **Back to start** (no automatic redirect).
- The host can **Correct result** (choose the other winner) or **Void** (the room counts for no one). Both need a confirmation and are recorded with a reason.

### 5.8 Host dashboard (single page, behind password)
Three panels, as in the approved mockup:
1. **Teams**: list, add, rename.
2. **Fixture rooms**: **+ New room**, and every room with its status: *Waiting x/2 · Live mm:ss · Paused · Sudden death · Host decision · Final (+1 Team) · Void*. Fair-play warnings and **"⚖️ Appeal pending"** appear on the card. Clicking a room opens it with the host controls. A Waiting room also has **Walkover** and **Void**.
3. **Standings**: the team table plus **Open big-screen view**.

Also: **Reset tournament** (deletes all teams, rooms and results under the app's root). The host must type `RESET` to confirm **[call]**.

### 5.9 Big-screen view (`?view=scoreboard`)
- Large, auto-updating, no interaction. Team standings, plus the live rooms with team names, scores and match clocks.
- Readable on a projector from the back of a room. Dark background is fine.

### 5.10 Public room list on the start page **[call]**
- The start page shows **Join with code**, plus a read-only list of Live and recent Final rooms, each with a **Watch** button, so spectators don't need codes.
- Player seats can still only be taken with the code.

## 6. Data model (Firebase Realtime Database)

All data lives under a new root, **`scrabble/`** **[call]**. The legacy `server_1..4/` data is left untouched and ignored.

```
scrabble/
  teams/<teamId>:  { name, createdAt }
  rooms/<CODE>:                         # the room code is the key, so joining is a direct lookup
    teamA, teamB                        # team IDs
    teamAName, teamBName                # name snapshot at creation (used if a team is renamed or missing)
    label, matchLengthSec, createdAt
    status: 'waiting' | 'live' | 'paused' | 'suddenDeath' | 'hostDecision' | 'final' | 'void'
    seats:
      A: { name, clientId, ready, online }   # online maintained via onDisconnect
      B: { ... }
    watchers/<clientId>: true            # presence, removed onDisconnect; count shown in room
    clock: { startedAt, endsAt, pausedRemainingMs, turnStartedAt, turnPausedRemainingMs }   # server-time ms
    game:
      board        # 15x15 (letters or null)
      bag          # remaining tiles; shared, so the distribution is preserved
      racks: { A: [...], B: [...] }
      scores: { A, B }
      turn: 'A' | 'B'
      moveCount                          # increases on every play/pass; used to guard writes
      suddenDeath: { startMove, rounds } | null
      lastMove: { seat, type: 'play'|'pass'|'timeout', words: [{word, score}], total, unverified?, at }
      firstSeat: 'A' | 'B'               # coin toss result at Start
      pending: { seat, placements, words, rejectedWords, total, requestedAt } | null   # dictionary appeal awaiting host
    fairPlay: { A: { screenLeaves }, B: { screenLeaves } }
    result: { winner: 'A'|'B', teamId, scoreA, scoreB,
              reason: 'time'|'suddenDeath'|'bagOut'|'resign'|'awarded'|'walkover'|'corrected',
              decidedAt, note? }
```

- Times are **Firebase server timestamps** (`ServerValue.TIMESTAMP`). Clients estimate server time with `.info/serverTimeOffset`.
- `clientId` is a random ID created once per browser and kept in `localStorage`.
- **Standings are never stored.** Every client calculates them from `rooms/*` where `status === 'final'`: wins per `result.teamId`, a loss for the other team, void rooms ignored. Teams on equal points share a rank; the host settles ties outside the app.

## 7. Making writes safe (the core reliability rules)

The app has no server, so correctness comes from **who is allowed to write what**, and from Firebase **transactions**:

| Write | Who | Guard |
|---|---|---|
| Take a seat | Joining player | Transaction on `seats/<A|B>`: succeeds only if empty (or same `clientId`) |
| Play / pass a move | The player whose turn it is | Transaction on `game`: succeeds only if `turn` matches, `moveCount` is unchanged since the move was built, and server time < `endsAt` (or in sudden death) |
| Auto-pass on turn timeout | Any client in the room (player or host) | Transaction: only if `moveCount` and `turnStartedAt` still match. Duplicate attempts are harmless. |
| Ask host (dictionary appeal) | The player whose turn it is | Transaction on `game`: only if `pending` is empty and the same move guards hold. Pauses both clocks. |
| Approve / deny appeal | Host | Transaction: only if `pending` still matches. Applies or discards the move, then resumes the clocks. |
| Start (incl. coin toss), pause, resume, award, remove player, correct, void | Host | Transaction on the room, checking the expected current `status` |
| Walkover / void a no-show | Host | Transaction: only if `status === 'waiting'` |
| Time-up → final / sudden death / host decision | Host's browser **[call]**, with player browsers as a fallback | Transaction on the room: only if `status` is `live` or `suddenDeath` and `result` is empty → **the result is written exactly once** |
| Screen-leave counter | The player | Increment their own `fairPlay` count |

- **[call] Fallback:** if no host browser has the room open when time runs out, either player's browser may make the same guarded "finalize" transaction. The guard makes it safe for several clients to try.
- A host browser that reopens a room which should already have ended finalizes it on load, using the same rule.

## 8. Scrabble rules to fix (engine)

Each game's result now decides a team point, so scoring must be correct and identical for both players:

1. **Shared bag**: the bag lives in room state (§6). This fixes today's bug where each browser draws from its own fresh bag.
2. **Board layout**: fix row 7 of `PREMIUM_GRID` (it has 14 cells; the `''` after `'center'` is missing).
3. **Move validation**:
   - All placed tiles in one row or one column.
   - No gaps in the main word: the gaps may be filled by tiles already on the board.
   - The first move must cover the centre star.
   - Every later move must touch at least one existing tile.
4. **Words formed**: the main word plus every cross-word made by the newly placed tiles (only words of 2 letters or more).
5. **Dictionary**: every word formed is checked with the Free Dictionary API.
   - If the API is unreachable, the move is **accepted but marked `unverified`**, and the host sees an "unverified word" note. It's for information only; the host can't reverse it **[call]**.
   - **If the API rejects a word, the player can appeal to the host.** The free API misses real Scrabble words such as QI, ZA and XU. The player sees "❌ ZA not found" with two buttons:
     - **Recall:** take the tiles back and keep playing.
     - **Ask host:** send an appeal.
   - **During an appeal:**
     - The move is stored as `game.pending` and **both clocks pause**.
     - The tiles show on the board as pending.
     - The host gets a prompt in the room and on the dashboard card: "Juan played ZA (11 pts): Approve / Deny".
   - **Approve:** the move is applied normally. **Deny:** the tiles go back to the player's rack and it's still their turn. The clocks resume either way.
   - Only one pending move at a time. While it's pending, the player can't do anything else.
6. **Scoring**:
   - Each word scores the sum of its letter values. Premium squares count only under **newly placed** tiles, and a word multiplier applies to every word passing through that square.
   - The score for the move is the sum of all words formed.
   - **Bingo:** using all 7 tiles adds **+50** **[call]**.
7. No blanks and no exchange (non-goals). End-of-game rack penalties are **not** applied: the score at the end is final **[call]**.

## 9. What's removed from the current app

- The 4 server tabs
- The open matchmaking queue / "Find opponent"
- The knockout bracket and bracket size
- The 2P/4P selector
- Email registration
- The registration lock and 5-minute grace period
- The overall tournament timer
- Auto-forfeit on 3 tab switches
- Auto-disqualify after 3 passes
- The "Offer Draw" button, which crashes today
- The old "Reset server data" (replaced by "Reset tournament" in §5.8)

## 10. Code organisation **[call]**

Still no build step. Split the single file into a few plain `<script>` files so the rules can be tested:

```
index.html          # markup + styles; loads scripts in order
js/engine.js        # pure Scrabble rules: board, bag, validation, word finding, scoring. No DOM, no Firebase.
js/app.js           # Firebase wiring, room logic, UI rendering, host dashboard, scoreboard view
tests/engine.test.js  # node --test (Node's built-in test runner, no packages)
```

`engine.js` must work both in the browser (as a global) and in Node (`module.exports`) so the tests can load it. **CLAUDE.md must be updated** to reflect the new structure. Its "keep single-file" convention is replaced by this split.

## 11. Verification

- **Automated:** `node --test tests/` covers the engine:
  - placement validation: line, gaps, centre star, connection
  - finding the main word and cross-words
  - scoring with premium squares, multiple words and bingo
  - bag drawing keeps the tile distribution
  - the corrected board layout
- **Manual (2–4 browser windows, against production, using a clearly labelled test room, then Void it):**
  - Create teams → create a room → two players join, ready up → host starts → play several moves → time-up → final result → standings update in every window and on `?view=scoreboard`.
  - A tie at time-up goes to sudden death; after 3 tied rounds it goes to Host decision.
  - Refresh a player mid-game → they're back in their seat with the correct rack.
  - Close a player's tab → disconnect notice shows; host Pause, then Award win.
  - Two windows try to take the same seat at once → only one succeeds.
  - Close the host's window during the last minute → a player's browser finalizes; reopening the host window doesn't create a second result.
  - Correct and Void a result → standings follow.
  - Phone-width layout is playable (tap a rack tile, tap a square).

## 12. Left to the builder

- Exact visual layout and styling within the existing theme, and the mobile breakpoints.
- How to structure `app.js` internally (modules or sections, rendering helpers).
- The room code generator details and collision retry.
- The exact wording of messages and banners.
- Whether the turn clock and match clock tick with one shared interval or separate ones.
- Handling of the legacy `server_1..4/` data (leave it alone; no migration needed).
- Small edge rules, such as Pause during sudden death or an appeal, or whether the host can see racks. Keep them consistent with "host decides".

## 13. Delivery plan (deadline Tue 2026-11-03)

> **Update 2026-11-02:** Tue 2026-11-03 turned out to be a **game test day**, not the tournament, and the tournament date isn't set yet. The plan below is kept as history; the freeze no longer applies.

The work started on Sun 2026-11-01 evening, which leaves about 2 days. The scope is cut into slices so there is always something usable. `main` (the current app on GitHub Pages) stays untouched until the merge.

| Slice | Contents | Target |
|---|---|---|
| **1: Must have** | See the list below. | Mon 11/2 afternoon |
| **Dry run** | 3–4 real people, 2 teams, one full room on production, then Void it. Fix what breaks. | Mon 11/2 evening |
| **2: Nice to have** | Big-screen view (`?view=scoreboard`), Correct result | Mon 11/2 night, only if the dry run passed |
| **Freeze** | Merge to `main` (GitHub Pages deploys), bug fixes only | Tue 11/3 morning |
| **Cut until after the event** | Public room list on the start page (§5.10). Spectators join with the code instead. | — |

**Slice 1 contents:**
- **Engine:** split into its own file with Node tests, shared bag, board layout fix, move validation, cross-words, scoring, bingo.
- **Teams and rooms:** teams, rooms with codes, seats that survive a refresh.
- **Game flow:**
  - ready, start with the coin toss
  - dictionary check with host appeals
  - turn and match clocks on server time
  - time-up decides the result exactly once
  - sudden death with its cap, resign
- **Host controls:** pause, award, walkover, void, remove player.
- **Fair play:** screen-leave warnings to the host.
- **Standings:** the team standings table on the dashboard and on player and spectator screens.

**Fallback on the day:** the host also keeps a simple paper or spreadsheet tally of each room's result as a backup. If the new app fails badly, revert the merge and the old app is back within minutes.
