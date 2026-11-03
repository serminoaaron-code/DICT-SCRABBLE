# Bottom-to-top words Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A vertical word that only makes sense read bottom→top (VERIFY placed as Y-F-I-R-E-V top to bottom) is accepted, scores exactly as today, and is shown everywhere as the dictionary word; right→left stays invalid.

**Architecture:** The engine marks each vertical word with its bottom→top reading (`back`). The playing client checks both readings with the dictionary and sends the chosen display spelling with the play; `Match.applyPlay` accepts only the board reading, its exact reverse for a vertical word, or both (`word` + `alt`), so no client can write other text. Every display reads `Engine.shownWord(w)` ("VERIFY", or "STOP/POTS" when both readings are words). The board and the score are never touched.

**Tech Stack:** vanilla JS (UMD modules), Node ≥18 `node:test`, Firebase RTDB v8 (unchanged), the CDP E2E harness in `.superpowers/e2e/`.

**Spec:** agreed in chat on 2026-11-03 from the QA ticket (no separate spec doc). The ticket's acceptance criteria:
1. Left→right words are accepted and scored. 2. Top→bottom words are accepted and scored. 3. Bottom→top words are accepted and scored. 4. Right→left words are rejected and score nothing. 5. Valid bottom→top words are shown with their proper spelling. 6. The displayed word matches the recognized dictionary word. 7. The board placement is unchanged. 8. The calculated score is unchanged whatever the direction. 9. Existing validation and scoring are unaffected.

Decisions made with the user:
- **Both readings are words** (STOP top→bottom, POTS bottom→top): shown as **`STOP/POTS`**, top→bottom first; one word, one score. The IMPOSSIBLE!!! letter-tile row spells only the first reading; every text line shows `STOP/POTS`.
- **Cross-words** follow the same rule: any vertical word (main or cross) may read bottom→top; horizontal words never read right→left.
- **Dictionary slow/down** for a word with no confirmed reading: accepted as `unverified` (as today), shown as the board reads it.
- **Host-approved appeal:** shown as the board reads it.
- The rejection sheet and the How to play page say: **"Words read left→right, top→bottom or bottom→top."**

## Global Constraints

- No build step, no packages; files keep their UMD wrapper.
- Firebase: never write `undefined` — `alt` is set only when present (omit the key otherwise).
- Every room write stays a `Store.mutateRoom` transaction around a pure `Match` function.
- User strings into `innerHTML` go through `UI.escapeHtml` / `esc` (the shown word included).
- Hint copy exactly: `Words read left→right, top→bottom or bottom→top.`
- Stored move words stay `{ word, score }` plus optional `alt`; `back` is never stored.
- Commit messages without `Co-Authored-By`.

## Review Focus

1. **A tampered client sends a reversed spelling for a horizontal word** (right→left, e.g. TAC for CAT) → refused; stored as the board reading. (Task 2 test `spellings: right-to-left is never accepted`.)
2. **A one-tile play that makes only a vertical cross-word**, read bottom→top → accepted, shown reversed. (Task 1 test `single tile vertical word gets back`, Task 3 test `checkPlay: cross-word reads bottom-to-top`.)
3. **A vertical palindrome** (e.g. NOON / "TOT") → no `back`, no `alt`, never "TOT/TOT". (Task 1 test `palindrome has no back`.)
4. **Rooms written before this change** (words without `alt`) and the appeal panel → shown exactly as before. (Task 1 test `shownWord without alt is the word`, Task 4 tests.)
5. **Forward reading unverified, reverse confirmed** → accepted, verified, shown reversed; **forward confirmed, reverse unverified** → verified, forward only. (Task 3 tests.)

---

### Task 1: Engine — the bottom→top reading and the shown word

**Files:**
- Modify: `js/engine.js` (`findWords` ~190, `scoreMove` ~220, exports ~239)
- Test: `tests/engine.test.js`

**Interfaces:**
- Produces: `scoreMove(...).words[i]` = `{ word, score }` for horizontal words and vertical palindromes; `{ word, score, back }` for a vertical word whose bottom→top reading differs (`back` = `word` reversed). `findWords` results also carry `dir: 'H'|'V'`.
- Produces: `ScrabbleEngine.shownWord(w) -> string`: `w.alt ? w.word + '/' + w.alt : String(w.word || '')`.
- Produces: `ScrabbleEngine.READ_HINT = 'Words read left→right, top→bottom or bottom→top.'`

- [ ] **Step 1: Write the failing tests** in `tests/engine.test.js`:
  - `vertical word gets back`: `E.scoreMove({}, [P(5,7,'Y'),P(6,7,'F'),P(7,7,'I'),P(8,7,'R'),P(9,7,'E'),P(10,7,'V')])` → `m.ok`, `m.words[0].word === 'YFIREV'`, `m.words[0].back === 'VERIFY'`.
  - `back keeps the score`: the same play's `m.total` equals the score computed in the test from `LV` and `E.PREMIUM_GRID` for Y,F,I,R,E,V on rows 5–10 of column 7 (as the cross-words test does) — i.e. the tiles where they are, not the reversed letters.
  - `horizontal word has no back`: `'back' in E.scoreMove({}, [P(7,6,'C'),P(7,7,'A'),P(7,8,'T')]).words[0]` is `false` (the existing `deepStrictEqual` CAT/CATS/RETAINS tests stay as they are and must still pass).
  - `palindrome has no back`: vertical `T,O,T` through the centre → no `back` key.
  - `single tile vertical word gets back`: board `{ '6_7': 'A', '8_7': 'E' }`, play `[P(7,7,'T')]` → `words[0]` is `{ word: 'ATE', score: <as today>, back: 'ETA' }`.
  - `cross-words: only vertical ones get back`: the existing BE/BA/ET board → `BE` has no `back`, `BA.back === 'AB'`, `ET.back === 'TE'`.
  - `shownWord`: `E.shownWord({ word: 'STOP', alt: 'POTS' }) === 'STOP/POTS'`; `shownWord without alt is the word`: `E.shownWord({ word: 'CAT', score: 5 }) === 'CAT'`; `E.shownWord({}) === ''`.
  - `READ_HINT` equals the exact copy above.

- [ ] **Step 2: Run** `node --test tests/engine.test.js` → the new tests FAIL (`back` undefined, `shownWord is not a function`).

- [ ] **Step 3: Implement.** `findWords` adds `dir` (main = `direction`, cross = the other); `scoreMove` maps each word to `{ word, score }` and adds `back` only when `dir === 'V'` and the reversed string differs. Add and export `shownWord` and `READ_HINT`.

- [ ] **Step 4: Run** `node --test "tests/*.test.js"` → all PASS.

- [ ] **Step 5: Commit** `feat(engine): vertical words carry their bottom-to-top reading`

---

### Task 2: Match — store the display spelling, safely

**Files:**
- Modify: `js/match.js` (`playCore` ~265, `applyPlay` ~286, `resolveAppeal` ~359)
- Test: `tests/match.test.js`

**Interfaces:**
- Consumes: `scoreMove` words with optional `back` (Task 1).
- Produces: `Match.applyPlay(room, seat, placements, { now, expectedMoveCount, unverified = false, spellings = null })`. `spellings` is an array aligned with `prepareMove(...).words`; each entry `{ word, alt? }`.
- Produces: stored `game.lastMove.words[i]` and `game.bestMove.words[i]` = `{ word, score }` or `{ word, score, alt }`. Never `back`, never `alt: undefined`.

Rules for entry `i` (board reading `f = w.word`, `b = w.back`):
- `{ word: f }` → `{ word: f, score }`
- `{ word: b }` (only if `b`) → `{ word: b, score }`
- `{ word: f, alt: b }` (only if `b`) → `{ word: f, score, alt: b }`
- anything else, a missing entry, or `spellings` absent / wrong length → `{ word: f, score }`.

- [ ] **Step 1: Write the failing tests** in `tests/match.test.js` (use the file's existing live-room fixture helpers):
  - `spellings: bottom-to-top word is stored as the dictionary word`: play Y,F,I,R,E,V down column 7 through the centre with `spellings: [{ word: 'VERIFY' }]` → `lastMove.words` deepEquals `[{ word: 'VERIFY', score: S }]` where `S` is the score without spellings; `scores.A` and the board (`'5_7': 'Y' … '10_7': 'V'`) unchanged vs. a play without spellings.
  - `spellings: both readings stored as word + alt`: vertical S,T,O,P with `[{ word: 'STOP', alt: 'POTS' }]` → `[{ word: 'STOP', score, alt: 'POTS' }]`; `bestMove.words` the same.
  - `spellings: right-to-left is never accepted`: horizontal C,A,T with `[{ word: 'TAC' }]` → stored `[{ word: 'CAT', score: 10 }]`.
  - `spellings: arbitrary text is refused`: vertical Y…V with `[{ word: '<img src=x>' }]` and with `[{ word: 'VERIFY', alt: 'HELLO' }]` → stored `YFIREV`, no `alt` key.
  - `spellings: wrong length falls back to the board reading`: `spellings: []` and `spellings: [{ word: 'VERIFY' }, { word: 'X' }]` → stored `YFIREV`.
  - `no spellings: unchanged`: the existing `lastMove` deepEqual test (line ~231) still passes untouched; `'back'` never appears in `lastMove.words[0]` for a vertical play.
  - `approved appeal shows the board reading`: `requestAppeal` then `resolveAppeal(room, true, …)` on vertical Y…V → `lastMove.words[0]` is `{ word: 'YFIREV', score }` (no `back`).

- [ ] **Step 2: Run** `node --test tests/match.test.js` → new tests FAIL.

- [ ] **Step 3: Implement** a private `storedWords(words, spellings)` in `match.js` with the rules above; `playCore(room, seat, placements, now, unverified, spellings)` uses it for `lastMove.words` and `bestMove.words`; `applyPlay` passes `spellings` through; `resolveAppeal` passes none.

- [ ] **Step 4: Run** `node --test "tests/*.test.js"` → all PASS.

- [ ] **Step 5: Commit** `feat(match): plays store the dictionary spelling of bottom-to-top words`

---

### Task 3: Dictionary — check both readings, pick the spelling

**Files:**
- Modify: `js/dictionary.js`
- Test: `tests/dictionary.test.js`

**Interfaces:**
- Consumes: `prepareMove(...).words` entries `{ word, score, back? }` (Task 1).
- Produces: `Dictionary.checkPlay(words, { fetchFn, timeoutMs }) -> Promise<{ rejected: string[], unverified: boolean, spellings: Array<{ word, alt? }> }>`. `checkWords` stays as it is (its tests unchanged).

Per word, with `f` = status of `word`, `b` = status of `back` (`null` when no `back`), statuses `'ok' | 'rejected' | 'unverified'`:

| f | b | spelling | effect |
|---|---|---|---|
| ok | ok | `{ word, alt: back }` | — |
| ok | rejected / unverified / null | `{ word }` | — |
| not ok | ok | `{ word: back }` | — |
| rejected | rejected / null | `{ word }` | `word` goes into `rejected` |
| otherwise | | `{ word }` | `unverified = true` |

All unique strings (every `word` and `back`, uppercased) are fetched **in parallel, once each**.

- [ ] **Step 1: Write the failing tests** (fake `fetchFn` keyed on the lowercase word in the URL):
  - `checkPlay: bottom-to-top word is accepted as its reverse`: `[{ word: 'YFIREV', back: 'VERIFY' }]`, only `verify` → 200 → `{ rejected: [], unverified: false, spellings: [{ word: 'VERIFY' }] }`.
  - `checkPlay: both readings`: `[{ word: 'STOP', back: 'POTS' }]`, both 200 → `spellings: [{ word: 'STOP', alt: 'POTS' }]`.
  - `checkPlay: neither reading is rejected`: `[{ word: 'XQZV', back: 'VZQX' }]`, both 404 → `rejected: ['XQZV']`.
  - `checkPlay: right-to-left is not tried`: `[{ word: 'TAC' }]` (no `back`), `tac` 404, `cat` 200 → `rejected: ['TAC']`, and no URL ending `/cat` was requested.
  - `checkPlay: cross-word reads bottom-to-top`: `[{ word: 'CAT' }, { word: 'AB', back: 'BA' }]`, `cat`, `ba` 200, `ab` 404 → `spellings: [{ word: 'CAT' }, { word: 'BA' }]`, `rejected: []`.
  - `checkPlay: forward unverified, reverse confirmed`: `yfirev` → 500, `verify` → 200 → `unverified: false`, `spellings: [{ word: 'VERIFY' }]`.
  - `checkPlay: forward confirmed, reverse unverified`: `stop` → 200, `pots` → throws → `unverified: false`, `spellings: [{ word: 'STOP' }]`.
  - `checkPlay: nothing confirmed and not fully rejected is unverified`: `yfirev` → 404, `verify` → throws → `unverified: true`, `rejected: []`, `spellings: [{ word: 'YFIREV' }]`.
  - `checkPlay: each string fetched once`: `[{ word: 'AB', back: 'BA' }, { word: 'BA', back: 'AB' }]` → exactly 2 fetches.

- [ ] **Step 2: Run** `node --test tests/dictionary.test.js` → new tests FAIL.

- [ ] **Step 3: Implement** `checkPlay` on top of the existing `checkOne`; export it.

- [ ] **Step 4: Run** `node --test "tests/*.test.js"` → all PASS.

- [ ] **Step 5: Commit** `feat(dictionary): check vertical words both ways`

---

### Task 4: Show the shown word everywhere, the hint, and the play wiring

**Files:**
- Modify: `js/view-room.js` (`lastMoveText` ~330, Play handler ~517–531, appeal ~551, reject sheet ~740)
- Modify: `js/celebrate.js` (`detect` ~47; screen-reader line ~204)
- Modify: `js/scenes.js` (`bestWord` ~75)
- Modify: `js/view-scoreboard.js` (last-move line ~338, corner ~385)
- Modify: `js/view-help.js` (player step "Make a word" ~69)
- Test: `tests/celebrate.test.js`, `tests/scenes.test.js`, `tests/help.test.js`

**Interfaces:**
- Consumes: `Engine.shownWord`, `Engine.READ_HINT` (Task 1), `Match.applyPlay(..., { spellings })` (Task 2), `Dictionary.checkPlay` (Task 3).

- [ ] **Step 1: Write the failing tests:**
  - `celebrate.test.js` — `detect keeps alt`: a room whose `lastMove.words` is `[{ word: 'STOP', score: 6, alt: 'POTS' }]` → `detect(...).words[0]` deepEquals `{ word: 'STOP', score: 6, alt: 'POTS' }`; a word without `alt` → no `alt` key.
  - `scenes.test.js` — `bestWord shows both readings`: `bestMove.words = [{ word: 'STOP', score: 6, alt: 'POTS' }]` → `Scenes.bestWord(room).word === 'STOP/POTS'` and `bestWordText` contains `STOP/POTS`; a room with `{ word: 'VERIFY' }` → `'VERIFY'` (export `bestWord` if it isn't exported; `bestWordText` is).
  - `help.test.js` — the player guide's HTML contains `ScrabbleEngine.READ_HINT` (use however that test file already renders a guide).

- [ ] **Step 2: Run** `node --test "tests/*.test.js"` → new tests FAIL.

- [ ] **Step 3: Implement:**
  - `celebrate.detect` copies `alt` when it's a non-empty string; the screen-reader line uses the shown word (`word/alt`); the tile row keeps `words[0].word`.
  - `scenes.bestWord` returns `word: Engine.shownWord(bm.words[0])`.
  - `view-room.lastMoveText`, `view-scoreboard` last-move line and corner: `esc(ScrabbleEngine.shownWord(w))`.
  - Play handler: `const check = await Dictionary.checkPlay(m.words)`; `applyPlay(..., { ..., unverified: check.unverified, spellings: check.spellings })`; the stored `ui.rejected.words` and the appeal's `words` are `m.words.map(w => ({ word: w.word, score: w.score }))` (no `back` in `pending`).
  - Reject sheet: after the "not found in the dictionary." line add `<div class="sheet-hint muted">${esc(ScrabbleEngine.READ_HINT)}</div>` (style with existing tokens only; must pass the AA sweep).
  - Help "Make a word" step text gains the hint sentence (from `ScrabbleEngine.READ_HINT`, not retyped).

- [ ] **Step 4: Run** `node --test "tests/*.test.js"` → all PASS.

- [ ] **Step 5: Browser check in the playground** with a new `.superpowers/e2e/bottomtop.js` (pattern: `t14.js`; `L.startedRoom`, `L.fixture` to set racks/turn, `L.place`, `L.dbRoom`), host + 2 players + spectator + `?view=scoreboard`, at 1366×768 and 360×740. Stub the dictionary in each page (`window.fetch` wrapper: `verify`, `stop`, `pots`, `cat` → 200, everything else 404) so the run doesn't depend on the live API. Checks:
  1. A plays Y,F,I,R,E,V top→bottom through ★ → accepted; board shows Y…V top→bottom; A's score = the engine score; the last-move line on A, B, spectator and host reads `played VERIFY (n)`; the projector line reads `VERIFY`; the DB word is `VERIFY`.
  2. B plays S,T,O,P vertically (connected) → `played STOP/POTS (n)` everywhere; the result screen's best word shows the shown word.
  3. A plays T,A,C right→left horizontally (reads `TAC` left→right) → reject sheet lists `TAC` with the hint; nothing written; score unchanged.
  4. Refresh B mid-game → the last-move line still reads the shown word.
  5. Contrast AA sweep (from `revamp.js`) on the reject sheet in both themes; no horizontal scroll at 360px.

- [ ] **Step 6: Add `BF-30`** to `docs/important-docs/bugs-fixed.md` (rules section, template at the end): "Bottom-to-top words were shown backwards (YFIREV)" with the 4 directions as tester steps, plus the STOP/POTS case.

- [ ] **Step 7: Docs** — `CLAUDE.md`: `engine.js` row mentions `back`, `shownWord`, `READ_HINT`; `dictionary.js` row mentions `checkPlay`; the Firebase section notes `lastMove.words[].alt` / `bestMove.words[].alt` (optional, the second reading).

- [ ] **Step 8: Commit** `feat: show bottom-to-top words as the dictionary word everywhere` (+ the E2E script is local-only under `.superpowers/`, which is git-ignored).
