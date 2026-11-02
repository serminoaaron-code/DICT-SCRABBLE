# Match Music and the Match-End Bell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Original 8-bit match music on every match screen (Tile Rush, then Last Minute for the final 60 s and sudden death) with a 🎵 switch, plus a ringside-bell sound effect when a match ends.

**Architecture:**
- **Music:** a new UMD module `js/music.js`, with pure rules (`trackFor` / `levelFor` / settings) that have unit tests, and a small Web Audio sequencer that plays the sample's two loops.
- **Sound:** `js/sound.js` gains a per-page settings key (the big screen's own default-on key) and a `bell` effect.
- **Wiring:** the room view and the projector call `Music.set(...)` on their ticks and ring the bell on the change to `final`.

**Tech Stack:** vanilla JS (UMD, no build step), Web Audio API, `node --test`, the CDP E2E harness.

**Spec:** `docs/superpowers/specs/2026-11-02-match-music-design.md`

## Global Constraints

- **Tracks:**
  - **Tile Rush** (128 bpm) and **Last Minute** (144 bpm), using the exact note lists from `.superpowers/spike/music-spike.html`;
  - **Last Minute** plays when `status === 'suddenDeath'`, or `live` with `endsAt - now <= 60000` (`LAST_MINUTE_MS`);
  - the change is a hard cut on the next beat.
- **When music plays:**
  - only on a match screen (the live room view, or the big screen showing a live room), from `now >= clock.startedAt`;
  - it stops on `final` / `void`, on leaving, and on the big screen's intro, round-start and winner scenes;
  - it plays at the low level while paused (`clock.paused`), in an appeal, or in `hostDecision`;
  - it dips during a word celebration.
- **🎵 is music only:**
  - game pages use `scrabble.music`, which is on unless `'0'`;
  - the big screen uses its own `scrabble.music.bigscreen`, also on unless `'0'`.
- **The bell is a sound effect:** `Sound.play('bell')` follows 🔇/🔊.
  - Game pages keep `scrabble.sound`, off by default.
  - The big screen uses `scrabble.sound.bigscreen`, on unless `'0'`.
  - It rings once per result (keyed by `result.decidedAt`), only when seen live; never on void.
  - The win fanfare plays after it.
- **Starting:** no sound before a user gesture. Until the first click, the big screen shows a "🔊 Click to start music" chip (only when its 🎵 is on), which is AA in both themes.
- **Loudness:** music master gain about 0.12 (quieter than the effects); no errors before a gesture.
- **Phones:** at 360px the header still fits with the 🎵 button.

## Review Focus

1. **A refresh on the result screen, or a late join, never rings the bell**, and a void never rings it. Task 3's E2E checks it.
2. **Muting 🎵 mid-match stops the music at once**, and unmuting resumes the right track; the choice survives a refresh. Task 3's E2E checks it.
3. **A host pause, then resume, during the last minute** brings back Last Minute (not Tile Rush), and the low level while paused. Task 2's unit tests and Task 3's E2E check it.
4. **The host's laptop:** muting the room view's 🎵 doesn't change the big screen's 🎵 (separate keys). Task 4's E2E checks it.
5. **The big screen cutting between rooms:** the track follows the featured room (the last minute in one room, Tile Rush in another), and the winner card stops the music and rings the bell once. Task 4's E2E checks it.

---

### Task 1: `Sound` — a per-page settings key and the bell

**Files:** `js/sound.js`, `tests/sound.test.js` (new)

**Interfaces:**
- Produces `Sound.useKey(key: string, defaultOn: boolean)`. It switches the storage key and default for this page; `enabled()` / `toggle()` then use it.
  - Stored `'1'` means on, `'0'` means off, and missing means `defaultOn`.
  - `toggle()` writes `'1'` or `'0'`. The game pages' existing behaviour, with key `scrabble.sound`, default off and a missing value meaning off, is unchanged.
- Produces `Sound.PRESETS.bell`: three rings 0.32 s apart. Each ring is four partials at 880 Hz × `[1, 2.76, 5.4, 8.93]` with gains `[0.5, 0.25, 0.14, 0.07]`, an exponential decay of about `1.4 / √ratio` s, and `decay: 'exp'`. `playPreset` supports `decay: 'exp'`.
- Exports `PRESETS` for tests.

- [ ] **Step 1: Failing tests** in `tests/sound.test.js`, with a stub `globalThis.localStorage` (a Map-backed `getItem` / `setItem` / `removeItem`):
  - `enabled: off by default for the game pages`;
  - `useKey: the big screen's own key, on by default; '0' turns it off; toggle writes '0'/'1' on that key and leaves scrabble.sound alone`;
  - `bell: three rings 0.32 s apart, four partials each` (`PRESETS.bell.length === 12`, start times `0`, `0.32`, `0.64`, every note `decay === 'exp'`).
- [ ] **Step 2:** Run `node --test tests/sound.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `node --test "tests/*.test.js"`. Expected: all pass.
- [ ] **Step 5:** Commit `feat(sound): a per-page settings key and the ringside bell`.

### Task 2: `Music` — the rules (pure)

**Files:** `js/music.js` (new, UMD; global `Music`), `tests/music.test.js` (new), `index.html` (load `music.js` after `sound.js`)

**Interfaces:**
- **Constants:** `Music.LAST_MINUTE_MS = 60000`; `Music.TRACKS = { rush: { bpm: 128, lead, bass, drums }, tense: { bpm: 144, … } }`, copied from the sample.
- **`Music.trackFor(room, now) -> 'rush' | 'tense' | null`:**
  - `null` unless the status is `live`, `suddenDeath` or `hostDecision`, the clock exists and `now >= clock.startedAt`;
  - `'tense'` when `suddenDeath`; when `live` with `remaining <= 60000`, where `remaining` = `clock.paused ? paused.matchRemainingMs : endsAt - now`; and when `hostDecision` follows sudden death (`game.suddenDeath` exists);
  - else `'rush'`.
- **`Music.levelFor(room, now) -> 'full' | 'low'`:** `'low'` when the clock is paused, `game.pending` is set, or the status is `hostDecision`; else `'full'`.
- **Settings:** `Music.useKey(key)`, `Music.enabled()`, `Music.toggle()`. The default key is `scrabble.music`; on unless `'0'`.

- [ ] **Step 1: Failing tests:**
  - `trackFor: nothing before the clocks start, outside a match, or after it`: waiting, final, void and the intro give `null`;
  - `trackFor: Tile Rush, then Last Minute for the final 60 s`: `endsAt - now` of 60001 gives rush and 60000 gives tense;
  - `trackFor: Last Minute through sudden death and a host decision after it`;
  - `trackFor: a pause in the last minute keeps Last Minute` (`matchRemainingMs: 30000`), and a pause earlier keeps rush;
  - `levelFor: low while paused, in an appeal or a host decision`;
  - `settings: on by default; toggle writes '0'/'1'; the big screen key is separate`;
  - `TRACKS: 32 eighth-steps per loop, the sample's bpm`.
- [ ] **Step 2:** Run `node --test tests/music.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the pure part. The browser-only part is in Task 3.
- [ ] **Step 4:** Run `node --test "tests/*.test.js"`. Expected: all pass.
- [ ] **Step 5:** Commit `feat(music): the match music rules`.

### Task 3: The music player, the 🎵 switch and the room view

**Files:** `js/music.js` (browser part), `index.html` (a `#musicToggle` button next to `#soundToggle`), `js/app.js` (wire the toggle like sound), `js/view-room.js`, `css/style.css` (if the header needs it at 360px), `.superpowers/e2e/music.js` (new)

**Interfaces:**
- **`Music.set(track | null, level)`:**
  - `null` stops;
  - a different track switches on the next beat (a hard cut);
  - the level fades over about 300 ms;
  - it does nothing until the first user gesture (it uses its own lazily created `AudioContext`, started on `pointerdown` / `keydown`, like `sound.js`).
- **Also:** `Music.dip(ms)`, `Music.stop()`, and `Music.status() -> { track, level, playing: boolean }` (read-only, for checks).
- **Room view:**
  - the tick calls `Music.set(Music.enabled() ? Music.trackFor(room, now) : null, Music.levelFor(room, now))`;
  - `celebrateNewMove` calls `Music.dip(Celebrate.durationFor(tier))` for tiers 1 to 4;
  - `renderFinal`, the room teardown and the `render()` reset call `Music.stop()`.
- **The bell:**
  - `renderFinal`, when it sees a live change to `final` (the live view was showing and `result.decidedAt` hasn't rung on this view yet), stops the music, then calls `Sound.play('bell')`;
  - the winner's existing `Sound.play('win')` waits about 1 s after the bell;
  - never on `void`, and never on a first render that is already final.

- [ ] **Step 1: Failing E2E** `music.js`, with a stub on each page that records `Sound.play` calls, plus reads of `Music.status()`:
  - after a click on the live game, B's music plays `rush` at `full`;
  - a fixture `endsAt = now + 55000` gives `tense` within 1 s;
  - pause gives `low`, and resume (still in the last minute) gives `tense` at `full`;
  - 🎵 off stops at once (`playing` false); after a refresh the button still says off and nothing plays; 🎵 on plays again;
  - a fixture `final` gives `playing` false, and `Sound.play` was called once with `'bell'` on each page with 🔊 on (A, B, the spectator); a refresh of B on the result screen gives no `'bell'`;
  - a second room fixtured to `void` gives no `'bell'`;
  - at 360px the header fits (no sideways scroll);
  - no console errors.
- [ ] **Step 2:** Run `node .superpowers/e2e/music.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `music.js`, then `revamp.js`, `taunts.js` and `turnmoments.js`, one at a time. Expected: each PASS.
- [ ] **Step 5:** Commit `feat(music): match music on the game screen, the 🎵 switch and the end-of-match bell`.

### Task 4: The big screen

**Files:** `js/view-scoreboard.js`, `css/style.css` (the click chip), `music.js` (section `big`)

**Interfaces:**
- On show: `Music.useKey('scrabble.music.bigscreen')` and `Sound.useKey('scrabble.sound.bigscreen', true)`. Restore the game pages' keys on teardown.
- **Its own buttons:** 🎵 and 🔊 next to `#bigTheme` (`#bigMusic`, `#bigSound`), each showing its own state.
- **Click chip:** `#bigStart`, "🔊 Click to start music", shown while 🎵 is on and before the page's first gesture; removed on the first `pointerdown` / `keydown`.
- **Tick:**
  - when the scene is `room` or `highlight` and the featured room is live: `Music.set(trackFor(featured), levelFor(featured))`;
  - when the scene is `intro`, `roundStart`, `winner` or `idle`: `Music.stop()`;
  - a highlight calls `Music.dip(CELEBRATE_MS[tier])`.
- **The winner scene** for a room whose result the page saw happen live: `Sound.play('bell')` once (keyed by room code plus `decidedAt`).

- [ ] **Step 1: Failing E2E section `big`:**
  - the chip shows before a click and goes after one;
  - the music follows the pinned room (Tile Rush, then Last Minute after a fixture `endsAt`);
  - the room view's 🎵 off on the same browser leaves the big screen's 🎵 on, and the reverse;
  - a `final` gives the winner card, the music stopped, and one `'bell'`;
  - the big screen's 🔊 starts on (its own key), and turning it off means no `'bell'` next time.
- [ ] **Step 2:** Run `ONLY=big`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `ONLY=big`, then `revamp.js` (projector sections and the contrast sweep). Expected: PASS.
- [ ] **Step 5:** Commit `feat(music): the big screen plays the match music and rings the bell`.

### Task 5: Docs and the full run

**Files:**
- `CLAUDE.md`:
  - the `music.js` row and the script order;
  - the `sound.js` row (`useKey`, `bell`);
  - the header's 🎵;
  - the big screen's own keys and chip.
- `js/view-help.js`, host step 7: one sentence, "Click the big screen once to start its music."

- [ ] **Step 1:** Update the docs and the help text. In `help.js`, the check that host step 7 mentions starting the music fails first.
- [ ] **Step 2:** Run `node --test "tests/*.test.js"`, then every E2E suite one at a time: `music`, `help`, `leftovers`, `polish`, `taunts`, `turnmoments`, `dragdrop`, `qa-pass1`, `quickwins`, `landscape`, `revamp`, `ghost`. Expected: each PASS.
- [ ] **Step 3:** Commit `docs: match music and the end-of-match bell`.
