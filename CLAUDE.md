# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**DICT Digital Scrabble Sportsfest 2026** is the Scrabble event of an intramurals-style DICT sportsfest. Each team sends one representative. The host creates **fixture rooms**: Team A vs Team B, one timed game, joined with a short code. The winner's team gets **+1** and the loser **0**, and team standings update live. Spectators can watch any room, and `?view=scoreboard` shows a big-screen standings view for a projector.

Design and plan: `docs/superpowers/specs/2026-11-01-tournament-rooms-design.md`, `docs/superpowers/plans/2026-11-01-tournament-rooms.md`.

**Scope:** work in this repo means improving the game: gameplay, rules, scoring and UI. Infrastructure is out of scope: Firebase rules and project setup, auth, hosting, environment and secrets belong to a separate DevOps owner. If a game change depends on infrastructure, mention it in one line as a handoff.

Upstream: `https://github.com/serminoaaron-code/DICT-SCRABBLE`, served by GitHub Pages. There is no CI. **Git workflow:** don't commit to `main` directly. Create a feature branch (`feat/…`, `fix/…`, `docs/…`) and merge into `main` through a pull request. Don't add `Co-Authored-By` trailers to commits.

## Tech stack

| Layer | Technology |
|---|---|
| UI | Plain HTML + CSS (`css/style.css`, theme variables in `:root`) + vanilla JavaScript in plain `<script>` tags. **No build step, no `package.json`.** |
| Realtime sync | Firebase **Realtime Database**, **v8 namespaced SDK** 8.10.1 from the CDN (`firebase.database()`, `ref().transaction()`). Not the v9 modular API. |
| Word check | Free Dictionary API `https://api.dictionaryapi.dev/api/v2/entries/en/<word>` |
| Tests | Node ≥18 built-in runner, no packages |

## Commands

```bash
python -m http.server 8000              # run locally → http://localhost:8000/
node --test "tests/*.test.js"           # all unit tests (quote the glob; works in bash and PowerShell)
node --test tests/match.test.js         # one file
node --test --test-name-pattern="sudden death" "tests/*.test.js"   # tests matching a name
```

Routes: `#` = join page · `#room=CODE` = room · `#host` = host dashboard (password is the `HOST_ADMIN_PASSWORD` constant in `js/view-host.js`, client-side only).

**Data areas (`js/env.js`):**
- **Local runs use the playground**, `scrabble_playground/`, and show a yellow banner with **Reset playground**. "Local" means `localhost`, `127.0.0.1`, a LAN IP or `file://`.
- **The deployed site uses `scrabble/`**, the real tournament data.
- `?db=live` / `?db=playground` overrides the automatic choice.
- Both areas live in the Firebase project `dict-chess-tournament`, which is shared with the chess app. There's no offline emulator: it would need Java + firebase-tools, which isn't set up.
- **Reset tournament** (host) and **Reset playground** delete everything under the *current* area.
- Never use `?db=live` for testing unless the user asks.

## Architecture

Script load order (in `index.html`): `engine.js → match.js → dictionary.js → store.js → ui.js → view-host.js → view-room.js → app.js`.

| File | Role |
|---|---|
| `js/engine.js` | **Pure Scrabble rules** (global `ScrabbleEngine`): letters, tile bag, `PREMIUM_GRID`, board map, `validatePlacement`, `findWords` (main word + cross-words), `scoreMove` (+50 bingo), `ERROR_TEXT`. |
| `js/match.js` | **Pure room-state transitions** (global `Match`). Every mutator takes a room and returns a *new* room, or `null` to reject: `claimSeat`, `startMatch` (coin toss), `applyPlay`, `applyPass`, `resolveTimeUp`, sudden death, `requestAppeal`/`resolveAppeal`, pause/resume, `resign`/`awardWin`/`walkover`/`voidRoom`/`correctResult`. Also `computeStandings` and `roomPhase`. |
| `js/env.js` | `Env.dataRoot()` picks the Firebase data area: playground for local runs, real data when deployed. |
| `js/dictionary.js` | `checkWords()`: 404 = rejected; error/timeout (5 s) = accepted but `unverified`. |
| `js/store.js` | Firebase wiring (global `Store`): watchers, `mutateRoom`, `createRoom`, presence, team CRUD, `serverNow()` (server-time estimate), `local` (localStorage with fallback). |
| `js/ui.js` | Shared rendering: `escapeHtml`, `formatClock`, `renderBoard`, `renderRack`, `renderStandings`, `toast`. |
| `js/view-host.js` | Host login + dashboard (Teams, Fixture rooms, Standings, Reset). |
| `js/view-room.js` | Join page, room lobby, live game (`RoomLive`), host control bar, final screen, fair-play reporting. |
| `js/app.js` | Router (`hashchange`) and the shared 250 ms ticker (`App.onTick`, cleared on every route change). |

`engine.js`, `match.js` and `dictionary.js` use a small UMD wrapper so they load both as browser globals and via Node `require` (the tests).

### The core rule: every room write is a transaction around a pure `Match` function

```js
Store.mutateRoom(code, r => Match.applyPlay(r, seat, placements, { now: Store.serverNow(), expectedMoveCount }))
```

`mutateRoom` runs a Firebase `transaction()`. It never throws: if the SDK aborts the transaction (Error `set`/`maxretry`, which happens when this same client writes an overlapping path while a transaction is in flight), it retries once and then resolves `{ committed: false }`. The `Match` function's guards (status, turn, `moveCount`, `turnStartedAt`, `result === null`) make every write idempotent and race-safe. Several browsers may try the same automatic transition (turn timeout, time-up) and only one wins. **Results are recorded exactly once.** Put new game logic in `match.js` with a unit test, then call it through `mutateRoom`. Don't write room data any other way.

Automatic transitions (turn timeout → pass, match time-up → result or sudden death) are attempted by **seated players and the host**, never spectators, from the ticker in `view-room.js`.

### Firebase data (`scrabble/`)

```
scrabble/
  teams/<pushId>: { name, createdAt }
  rooms/<CODE>:   { code, teamA, teamB, teamAName, teamBName, label, matchLengthSec, createdAt,
                    status: 'waiting'|'live'|'suddenDeath'|'hostDecision'|'final'|'void',
                    seats: { A|B: { name, clientId, ready } },
                    presence: { <clientId>: 'A'|'B'|'watch'|'host' },     # onDisconnect remove
                    clock: { startedAt, endsAt, turnStartedAt, paused: {by:'host'|'appeal', matchRemainingMs, turnRemainingMs} },
                    game: { board: {"r_c": letter}, bag[], racks{A,B}, scores{A,B}, firstSeat, turn, moveCount,
                            pending (appeal), suddenDeath {startMove, rounds}, lastMove },
                    fairPlay: { A|B: { screenLeaves } },
                    result: { winner, teamId, scoreA, scoreB, reason, decidedAt }, voidedAt }
```

- "Paused" and "appeal" are **derived** by `Match.roomPhase()` from `clock.paused` and `game.pending`; they aren't stored statuses.
- Standings are **never stored**. They're computed from `final` rooms by `Match.computeStandings`.
- **Firebase storage rules:**
  - Never write `undefined`.
  - Never store arrays containing `null`. The board is a sparse map for this reason.
  - Firebase drops empty arrays and objects, so **always pass reads through `Match.normalizeRoom()`** (`Store` watchers already do).
- The device remembers its seat in localStorage (`scrabble.seat.<CODE>`, `scrabble.clientId`), so a refresh puts the player back in their seat.
- The legacy `server_1..4/` data from the old app is ignored.

## Required workflow: Superpowers first, code second

This project uses the **Superpowers** plugin (`superpowers@claude-plugins-official`). It's enabled in `.claude/settings.json`, so teammates are prompted to install it. Don't go straight from a one-line request to code changes. Invoke the matching Superpowers skill **before** reading code, asking clarifying questions or editing:

| Situation | Skill(s) to use, in order |
|---|---|
| New feature, change in game rules or behaviour, UI addition | `superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:executing-plans` (or `superpowers:subagent-driven-development` for plans whose tasks are independent of each other) |
| Bug, unexpected behaviour, desync between clients | `superpowers:systematic-debugging`: reproduce it, find the root cause and state it before proposing a fix. No guess-and-patch. **After the fix, add a QA re-test entry to `docs/important-docs/bugs-fixed.md`** (template at the end of that file; plain-language steps a playtester can follow). |
| Starting a feature branch | `superpowers:using-git-worktrees` (or at least `git switch -c feat/…` off `main`) |
| Rules or room logic (`engine.js`, `match.js`, `dictionary.js`) | `superpowers:test-driven-development`: write the failing test in `tests/` first |
| Before saying anything is done or fixed | `superpowers:verification-before-completion`: unit tests, plus the browser (2+ windows for multiplayer). Show the evidence. |
| Work is finished | `/security-review`, then `superpowers:requesting-code-review`, then `superpowers:finishing-a-development-branch` to open the PR |
| Responding to PR feedback | `superpowers:receiving-code-review` |

**Edge cases every brainstorm and plan must cover:**
- players, spectators and the host
- several clients writing to Firebase at the same time
- a player refreshing or disconnecting mid-turn
- the host window being closed
- phone-width screens (360px)

**Scope of the security review:** game-level problems only:
- Unescaped user input in `innerHTML` (XSS)
- Clients writing state they shouldn't (scores, other players' racks, turn order)
- Race conditions between clients

Infrastructure findings (Firebase rules, auth, hosting) belong to DevOps. Note them as a one-line handoff.

## Conventions when editing

- Firebase **v8** API style only. All paths under `scrabble/`.
- User-supplied strings (team names, player names, labels, words) go through `UI.escapeHtml()` before they're put into `innerHTML`. Names are capped at 40 characters.
- Use the CSS custom properties in `:root` (`--scrabble-*`, `--dict-*`, `--sq-*`) rather than new hard-coded colours. Breakpoints: 900px (dashboard stacks) and 480px (phone).
- Fair play only **warns** the host (screen-leave counter); there are no automatic penalties. "Host decides" is the rule for disputes: appeals, walkover/void, award win.
