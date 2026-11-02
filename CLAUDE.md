# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**DICT Digital Scrabble Sportsfest 2026** is the Scrabble event of an intramurals-style DICT sportsfest. Each team sends one representative. The host creates **fixture rooms**: Team A vs Team B, one timed game, joined with a short code. The winner's team gets **+1** and the loser **0**, and team standings update live. Spectators can watch any room, and `?view=scoreboard` is a big-screen broadcast view for a projector: an auto-director features live rooms, plays the same scenes and celebrations at broadcast scale, and respects a host pin.

Design and plan: `docs/superpowers/specs/2026-11-01-tournament-rooms-design.md`, `docs/superpowers/plans/2026-11-01-tournament-rooms.md`.

**Scope:** work in this repo means improving the game: gameplay, rules, scoring and UI. Infrastructure is out of scope: Firebase rules and project setup, auth, hosting, environment and secrets belong to a separate DevOps owner. If a game change depends on infrastructure, mention it in one line as a handoff.

Upstream: `https://github.com/serminoaaron-code/DICT-SCRABBLE`. There is no CI.

> 🚀 **Merging into `main` deploys to GitHub Pages.** `main` auto-deploys to https://serminoaaron-code.github.io/DICT-SCRABBLE/ within a minute or two. That site isn't the final tournament page yet, so merges to `main` are safe during ongoing development — but it does use the **real** tournament data (`scrabble/`), so before merging, run the unit tests and test in the local playground. Never open the deployed site to test: it always uses the real tournament data. Locally, never add `?db=live` unless the user asks. To roll back, revert the PR on GitHub, which redeploys the previous version. Once a tournament is actually running from this deploy, merge only when no rooms are live, and have everyone refresh afterwards (there's no build step or hot-reload, so a tab left open keeps running the old JS against the new data). **Git workflow:** don't commit to `main` directly. Create a feature branch (`feat/…`, `fix/…`, `docs/…`) and merge into `main` through a pull request. Don't add `Co-Authored-By` trailers to commits.

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

Script load order (in `index.html`): `theme.js → sound.js → scenes.js` (in `<head>`, so the theme applies before first paint) `→ engine.js → match.js → dictionary.js → env.js → pill.js → celebrate.js → director.js → rack.js → roomlist.js → store.js → ui.js → view-host.js → view-room.js → view-scoreboard.js → app.js`.

| File | Role |
|---|---|
| `js/theme.js` | **Pure light/dark resolution** (global `Theme`) plus the `<html data-theme>` / `localStorage scrabble.theme` glue: `resolve`, `init`, `current`, `toggle`. Device `prefers-color-scheme` is the fallback when nothing is stored. |
| `js/sound.js` | **Optional sound effects** (global `Sound`), off by default (`localStorage scrabble.sound`): `enabled`, `toggle`, `play(name)` (short Web Audio tones: `turn`, `place`, `accept`, `tier1..4`, `vs`, `coin`, `win`), `buzz()` (a "your turn" vibration), `ready()`, `state()`. The `AudioContext` is created lazily and only after a user gesture (`play()` is silent until then); every gesture resumes a suspended context until it runs. |
| `js/engine.js` | **Pure Scrabble rules** (global `ScrabbleEngine`): letters, tile bag, `PREMIUM_GRID`, board map, `validatePlacement`, `findWords` (main word + cross-words), `scoreMove` (+50 bingo), `celebrationTier` (total/bingo → 0–4), `ERROR_TEXT`. |
| `js/match.js` | **Pure room-state transitions** (global `Match`). Every mutator takes a room and returns a *new* room, or `null` to reject: `claimSeat`, `startMatch` (coin toss, intro offset), `applyPlay`, `applyPass`, `resolveTimeUp`, sudden death, `requestAppeal`/`resolveAppeal`, pause/resume, `resign`/`awardWin`/`walkover`/`voidRoom`/`correctResult`. Also `computeStandings`, `roomPhase`, and the fixed constants `INTRO_MS` and `CELEBRATE_MS` (below). |
| `js/env.js` | `Env.dataRoot()` picks the Firebase data area: playground for local runs, real data when deployed. |
| `js/pill.js` | **Pure turn-pill state** (global `Pill`): `state(room, mySeat, now)` → `{ kind, text, ms }` for the game screen's `#statusLine` (`Your turn`, `<name>'s turn`, `Get ready`, `⏸ Paused`, `⚖️ Waiting for host[ decision]`, sudden death). |
| `js/celebrate.js` | **Word celebrations** (global `Celebrate`): a "+N" float for small plays, four overlay tiers (`Not Bad!` / `Cool!` / `Awesome!` / `IMPOSSIBLE!!!`) with a count-up that flies into the score bar. Pure parts (`tierFor`, `detect`, `createQueue`) are Node-testable; `show`/`clear` touch the DOM. Honors `prefers-reduced-motion` (a calm fade card, no shake/flash/confetti/rays). |
| `js/scenes.js` | **Shared timed scenes** (global `Scenes`), used by both the room and the projector: the VS intro + coin toss, the round-start card, and `renderResult` (winner / respectful / neutral / void result screens). |
| `js/director.js` | **Pure auto-director for the projector** (global `Director`, spec §5.7): `step(state, rooms, pinned, now)` decides which room is featured and which scene plays (intro/round-start/highlight/winner/idle), esports-observer style — highlights first, then drama (sudden death, last 60 s), then rotation with a minimum dwell; a host pin holds the room. |
| `js/rack.js` | **Pure local rack order** (global `Rack`) for the 🔀 Shuffle button: `sync(prev, rack)` (keeps this device's order while the rack's letters are unchanged, else back to normal) and `shuffle(order, rng)` (always a different order). The order is rack indices, never written to Firebase. |
| `js/roomlist.js` | **Pure host room-list tabs + pages** (global `RoomList`): `tabOf(phase)` (Active / Finished / Void), `view(sortedRooms, {tab, page}, phaseOf)` (Active never paged; Finished and Void `PER_PAGE` = 5, page clamped), `pageList(page, pages)`. |
| `js/dictionary.js` | `checkWords()`: 404 = rejected; error/timeout (5 s) = accepted but `unverified`. |
| `js/store.js` | Firebase wiring (global `Store`): watchers, `mutateRoom`, `createRoom`, presence, team CRUD, `serverNow()` (server-time estimate), `setPinned`/`watchPinned` (`<data root>/broadcast/pinned`, a plain set/read — not a room transaction), `local` (localStorage with fallback). |
| `js/ui.js` | Shared rendering: `escapeHtml`, `formatClock`, `renderBoard`, `renderRack` (optional display `order` from `Rack`), `renderStandings`, `toast`, `bonusHelpHtml` (the "? Bonuses" card). |
| `js/view-host.js` | Host login + dashboard (Teams, Fixture rooms with Active / Finished / Void tabs and pages, Standings, Reset, pin). |
| `js/view-room.js` | Join page, room lobby, live game (`RoomLive`), host control bar, result screen, fair-play reporting. |
| `js/view-scoreboard.js` | `?view=scoreboard`: the **projector broadcast view** — `Director` auto-features a live room (or idle standings), plays the shared `Scenes`/`Celebrate` scenes at broadcast scale, and respects a host pin. Read-only: it never writes to Firebase. |
| `js/app.js` | Router (`hashchange`) and the shared 250 ms ticker (`App.onTick`, cleared on every route change); wires the header's theme/sound toggles. |

`engine.js`, `match.js`, `dictionary.js`, `theme.js`, `sound.js`, `pill.js`, `celebrate.js`, `scenes.js`, `director.js`, `rack.js` and `roomlist.js` use a small UMD wrapper so they load both as browser globals and via Node `require` (the tests).

### Visual tokens and contrast (`css/style.css`, `css/fx.css`)
- Brand and theme colours are CSS custom properties on `:root` and the `html[data-theme="light"|"dark"]` blocks (`--navy`, `--blue`, `--sky`, `--red`, `--yellow`, `--green`, `--cream`; `--bg`, `--surface`, `--text`, `--muted`). Use these, not new hard-coded colours.
- **Contrast rule:** a light background always gets dark text and a dark background gets light text, on every pill, chip, badge, button and card. Everything meets **WCAG AA** in both themes — 4.5:1 for normal text, 3:1 for large text/UI (≥ 24px, or ≥ 18.66px bold). A scripted check (`contrast AA in both themes` in `.superpowers/e2e/revamp.js`) sweeps every `.pill, .chip, .badge, button, .card` on the join page, lobby, game screen, result screen and dashboard, in both themes. An element behind its own gradient/image backdrop (the result hero's fixed, hand-checked colours) is exempt from this sweep.
- `prefers-reduced-motion: reduce` turns off shake, flash, confetti, spinning rays and the coin flip; scenes become simple fades with the same information. Never more than one flash per scene.
- `Match.INTRO_MS` (`6500`) delays the first turn after `startMatch` for the VS intro + coin toss (VS 2.6 s, coin flip 1.9 s, then "<TEAM> GOES FIRST!" holds 2 s; `Scenes.COIN_RESULT_AT`). `Match.CELEBRATE_MS` (`[0, 2600, 2600, 3000, 4500]`, indexed by celebration tier) delays the start of the next turn's clock, so the celebration never costs the next player turn time (every overlay is gone by then; `Celebrate.durationFor(tier)`). It does not block moves: the opponent may still play during the celebration.

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
  broadcast/pinned: CODE | null   # host's pin for the projector (Store.setPinned/watchPinned); not room state
```

- `game.lastMove.bingo` (bool) and `game.bestMove` (`{ seat, words, total, bingo }`, the highest-scoring play so far) let clients and the projector pick a celebration tier and the result screen's "best word" line without recomputing. Rooms created before this existed simply lack them; the UI falls back to a total-only tier check and hides "best word".
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
| Rules or room logic (`engine.js`, `match.js`, `dictionary.js`, `pill.js`, `celebrate.js`, `director.js`, `theme.js`, `sound.js`, `rack.js`, `roomlist.js`) | `superpowers:test-driven-development`: write the failing test in `tests/` first |
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
- Use the CSS custom properties in `:root` (`--navy`, `--blue`, `--sky`, `--red`, `--yellow`, `--green`, `--cream`, `--bg`, `--surface`, `--text`, `--muted`, `--sq-*`) rather than new hard-coded colours — see "Visual tokens and contrast" above. Breakpoints: 900px (dashboard stacks) and 480px (phone).
- Fair play only **warns** the host (screen-leave counter); there are no automatic penalties. "Host decides" is the rule for disputes: appeals, walkover/void, award win.
