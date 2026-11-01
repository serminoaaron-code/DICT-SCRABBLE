# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**DICT Digital Scrabble Sportsfest 2026** is a browser-based, real-time multiplayer Scrabble tournament app for the DICT sportsfest. Players register with an email and display name, queue for matches (2-player or 4-player), and play on a shared 15×15 board. Spectators can watch live games. A host/admin can run the tournament: start a grace period, lock registration, set the length, generate a knockout bracket, and reset a server.

**Scope:** work in this repo means improving the game: gameplay, rules, scoring and UI. Infrastructure is out of scope: Firebase rules and project setup, auth, hosting, environment and secrets belong to a separate DevOps owner. If a game change depends on infrastructure, mention it in one line as a handoff.

Upstream: `https://github.com/serminoaaron-code/DICT-SCRABBLE`. There is no CI. **Git workflow:** don't commit to `main` directly. Create a feature branch (`feat/…`, `fix/…`, `docs/…`) and merge into `main` through a pull request. Don't add `Co-Authored-By` trailers to commits.

## Tech stack

| Layer | Technology |
|---|---|
| UI | Plain HTML + CSS (custom properties in `:root`) + vanilla ES2017+ JavaScript, all inline in `index.html` |
| DOM helpers | jQuery 3.6.0 (loaded from CDN, but the code uses `document.getElementById` throughout; jQuery is effectively unused) |
| Backend / realtime sync | Firebase **Realtime Database**, **v8 namespaced SDK** 8.10.1 (`firebase.database()`, `ref().on(...)`). Not the v9 modular API. |
| Word validation | Public Free Dictionary API: `https://api.dictionaryapi.dev/api/v2/entries/en/<word>` |
| Assets | `banner.png` (header image; hidden via `onerror` if it's missing) |
| Build / package manager / tests / lint | **None.** There is no `package.json`, bundler, test suite or linter. |

## Running locally

No build step. Serve the folder over HTTP and open it in a browser:

```bash
python -m http.server 8000      # then open http://localhost:8000/
# or: npx serve .
```

Opening `index.html` directly via `file://` mostly works, but a local server is closer to how it's deployed. To test multiplayer, open several browser windows or profiles. Each one is a separate client, and matchmaking needs 2 (or 4) players with status `searching` on the **same server tab**.

The host password is the constant `HOST_ADMIN_PASSWORD` in `index.html`. It is checked only on the client.

> ⚠️ The app connects to the **live production Firebase database** (the project is `dict-chess-tournament`, shared with the DICT chess tournament app). Local testing writes real data. "Reset Server Data" erases `matches`, `settings` and `bracket` for the selected server. Check with the user before running destructive host actions against production.

## Architecture

Everything is in `index.html`, in this order: `<style>` → markup (panels) → one `<script>` block split into sections by `// ====` banner comments. Main sections:

1. **Scrabble engine**: `LETTER_VALUES`, `INITIAL_TILE_DISTRIBUTION` (98 tiles, no blanks), `PREMIUM_GRID` (15×15 of `tw|dw|tl|dl|center|''`), and `class ScrabbleGame` (board, racks, scores, turn order, passes, disqualification, serialization).
2. **Dictionary validation**: `validateEnglishWord()` (fails *open*: if the network call errors, the word is accepted) and `extractWordFromPlacements()`.
3. **Firebase init + multi-server**: `getServerPath(subpath)` prefixes every DB path with `server_${currentServerId}/`. Server 1 is labelled "Tournament"; Servers 2–4 are "Casual". `switchServer()` detaches and re-binds all listeners.
4. **Realtime listeners** (`bindServerListeners`): the in-memory mirrors `globalSettings`, `allPlayers`, `allMatches` and `tournamentBracket` are refreshed from DB events, and each event triggers a re-render. **The UI is always derived from these mirrors.** To change behaviour, write to Firebase and let the listener re-render; don't mutate the DOM directly.
5. **Fair-play**: a `visibilitychange` listener counts tab switches during a live match. 3 strikes forfeit the match.
6. **Player entry / lobby / matchmaking**: email is the identity key (`checkReturningPlayer`, `registerPlayer`). `attemptAutoMatchmaking()` runs on *whichever client* sees enough `searching` players. It creates the match and sets those players to `in-game` in one multi-path `db.ref().update()`.
7. **Gameplay**: `setupMatch` → `renderPlayerCards` / `renderScrabbleBoard` / `renderPlayerRack`. Tiles placed this turn live in `tempBoardPlacements` until `submitWordMove()` or `recallTempTiles()`. Turn timer: 60s, client-side (`resetTurnTimer`).
8. **Spectator mode**: `spectateMatch`, `syncSpectatorBoard`. Racks are hidden in the UI.
9. **Bracket + host controls + leaderboard**: `kickoffTournament`, `startGracePeriod`, `toggleRegistrationLock`, `resetTournamentData`, `renderBracketView`, `updateLeaderboard`.

### Realtime Database schema (per server)

```
server_<1..4>/
  settings/   { playerMode: '2P'|'4P', registrationLocked, tournamentStarted, tournamentEnded,
                tournamentEndTime (ms epoch), graceTimerEnd (ms epoch) }
  players/<playerId>   { name, email, status: 'idle'|'searching'|'in-game', online, joinedAt }
  matches/<matchId>    { playerIds[], playerNames[], numPlayers, status: 'Live'|'Completed',
                         gameState: <JSON string>, strikes[], createdAt, lastMoveAt, forfeitReason? }
  bracket/             { stages: [{ name, matches: [{ p1, p2, p1Score?, p2Score? }] }] }
```

`playerId` = `'player_' + random`. `matchId` = `'match_' + push().key`. `players/<id>/online` is set to `false` through `onDisconnect()`.

### Game state sync model

- The client whose turn it is computes the whole new state on its own machine and writes `matches/<id>/gameState` as a JSON string (`ScrabbleGame.getStateString()`). Other clients compare strings in `syncGameState` and reload when the string differs. **There is no server-side validation.** The game trusts the clients, and every rack is in the shared state.
- Many timers run separately on each client: turn timer, grace timer, tournament timer. Any client that notices a deadline has passed may write the result to `settings`.

## Known gaps and bugs (verified in code; check before relying on these features)

- **Tile bag isn't synced.** `getStateString()` stores only `tileBagCount`, and `loadStateString()` never restores `tileBag`. When a client draws tiles, it draws from its own freshly shuffled full bag, so the 98-tile distribution isn't kept.
- **`PREMIUM_GRID` row 7 has 14 cells, not 15.** The `''` after `'center'` is missing, so the right-edge triple-word square shifts and column 14 is undefined (it renders as normal).
- **Move validation is minimal.** It checks only that tiles are in a straight line, then looks up the placed letters joined in order. It doesn't check for gaps, for connection to existing tiles, for the centre square on the first move, or for cross-words. Scoring (`calculatePlacementScore`) counts only newly placed tiles, not existing tiles that are part of the word.
- **`offerDraw()` is called by the "Offer Draw" button but never defined**, so clicking it throws a `ReferenceError`.
- **Leaderboard** counts only `played`. `points`, `wins`, `draws` and `losses` are never filled in, and matches don't record a winner except as text in `forfeitReason`.
- **The bracket is display-only.** It isn't connected to matchmaking or results. Stages use `Array(n).fill({...})`, so every match in a stage shares one object. For bracket size ≥ 8, the first stage gets `bracketSize/2` matches.
- **No natural game end.** A game ends only when all but one player is disqualified (3 consecutive passes or 3 tab strikes), someone resigns, or a forfeit happens. It doesn't end when the bag empties.
- Line 1 of `index.html` is a stray `<a_file_has_been_created ...>` wrapper tag left over from AI-generated output, with no closing tag. Browsers ignore it, but it's not valid HTML.

## Conventions when editing

- Keep the single-file structure unless the user asks to split it. Put new code in the matching `// ====` section.
- Use the Firebase **v8** API style (`db.ref(path).on/once/update/set`). Always build paths with `getServerPath()` so servers stay isolated.
- Pass any user-supplied string (names, emails, match labels) through `escapeHtml()` before putting it in `innerHTML`.
- Use the CSS custom properties in `:root` (`--scrabble-*`, `--dict-*`, `--sq-*`) rather than new hard-coded colours. The mobile breakpoint is `max-width: 768px`.
