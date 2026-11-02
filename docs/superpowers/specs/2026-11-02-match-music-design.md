# Match music (8-bit) and the match-end bell — design

Branch `feat/game-help` (the user asked for it in this branch). Listening sample: `.superpowers/spike/music-spike.html` (throwaway). The user picked **B · Tile Rush** for the match and **C · Last Minute** for the final minute.

## Why

A match should feel like a game show. A light, original 8-bit loop under the play adds energy for the players and the audience. A tenser loop at the end builds suspense.

## The decisions (the user's)

- **Every device plays it during a match**: both players, spectators, the host's room view and the big screen. **Each device can mute it.**
- **No copying:** an original tune, generated in code. The two loops are the ones from the sample, unchanged:
  - **Tile Rush** (128 bpm, A-minor arpeggios, bouncy bass, full drums) for the match;
  - **Last Minute** (144 bpm, pulsing bass, sparse lead) for the final minute.
- **A sudden change:** when the match clock reaches its **last 60 seconds**, the music cuts straight from Tile Rush to Last Minute on the next beat, with no crossfade.

### The match-end bell (the user's choice: the ringside bell, no applause)

- When a match ends with a result (`final`), every device on that match plays a **ringside bell**: three quick rings, "ding ding ding". It is the sound from the sample's 🔔 option, synthesised (a struck bell made of a few overtones, sharp attack, long ring).
- **Order:** the music stops first, then the bell plays. On the winner's device, the existing win fanfare (a sound effect, if 🔊 is on) comes after the bell, not on top of it.
- **Plays once per result,** when the change to `final` is seen live (keyed by `result.decidedAt`). A refresh or a late join on the result screen never rings it.
- **No bell for a voided room** *(my call: nothing was won)*.
- **It is a sound effect** (the user's rule): it follows the existing **🔇/🔊 sound-effects switch**, like the tile and turn sounds, **not** the 🎵 music switch. Sound effects are off by default on the game pages, so a phone or laptop rings it only when its 🔊 is on.
- **The big screen** rings it when its featured room ends, as the winner card comes up. The big screen gets its own **🔊 sound-effects switch** next to its 🎵, **on by default** and remembered separately (`localStorage scrabble.sound.bigscreen`), so the hall hears the bell *(my call: today the big screen plays no effects at all)*. The bell is the only effect it plays.

## How it works

### When music plays (my calls are marked)

- **Where:** only on a match screen: the room's live view, and the big screen while it shows a live room. Never on Home, the host dashboard, the lobby, the help page or a result screen.
- **Start:** when the room's clocks start (`now >= clock.startedAt`), so the VS intro and coin toss keep their own moment *(my call)*.
- **Track:**
  - **Last Minute** while the status is `suddenDeath`, or `live` with 60 s or less left on the match clock (`endsAt - now <= 60000`);
  - otherwise **Tile Rush**.
  - **Last Minute** carries on through ⚡ sudden death *(my call: it follows the last minute)*.
  - During a `hostDecision` it stays as it was, but low (as for a pause).
- **Pause and appeal:** while the clock is paused (host pause or appeal), the music fades to a low level and comes back on resume *(my call)*.
- **End:** it stops when the match ends (`final` / `void`), before the result screen, so the winner fanfare and celebration are heard clearly. It also stops when leaving the room view or the big screen.
- **Celebrations:** the music dips for the length of a word celebration (`Celebrate.durationFor(tier)`) so the celebration sounds stand out *(my call)*.

### Mute and loudness

- **A new 🎵 switch** in the header next to 🔇/🔊. It is **on by default**, and the choice is remembered per device (`localStorage scrabble.music`, off only when `'0'`). Its label is "Music on" / "Music off" (`aria-pressed`).
- **The big screen** gets its **own** 🎵 switch next to its ☀️/🌙 button, remembered separately (`localStorage scrabble.music.bigscreen`), so muting a room view on the host's laptop never silences the projector (the user's answer, builder check).
- **Starting the big screen:** nobody touches the projector once it's on the wall, so until its first click it shows a small **"🔊 Click to start music"** chip in a corner. It disappears for good on the first click anywhere on the page (the user's answer, builder check). The chip is AA in both themes and never covers the scores. It isn't shown when the big screen's 🎵 is off.
- **🎵 controls the music tracks only** (the user's rule). Every other sound, including the new match-end bell, is a sound effect under the existing **🔇/🔊** switch, which is unchanged: still off by default on the game pages.
- **Loudness:** quiet, below the sound effects (master gain around 0.12 of full; tuned by ear).
- **Starting:** browsers only allow sound after a tap or click on the page. The music starts on the first gesture, reusing `sound.js`'s gesture handling, and never shows an error before that.

### Building it

- **New UMD module `js/music.js`** (global `Music`):
  - **Pure (unit tests):**
    - `trackFor(room, now)` → `'rush'`, `'tense'` or `null`;
    - `levelFor(room, now)` → `'full'` or `'low'`;
    - `TRACKS` (the two loops as note lists, from the sample);
    - `LAST_MINUTE_MS = 60000`.
  - **Browser only:**
    - `enabled(key)`, `toggle(key)` (music only), where `key` is `'scrabble.music'` (the game pages) or `'scrabble.music.bigscreen'` (the projector);
    - `set(track, level)`, which switches tracks on the next beat;
    - `dip(ms)`, `stop()`.

  It uses its own `AudioContext` or shares `Sound`'s, at the builder's choice, and creates nothing before a user gesture.
- **The room view's 250 ms tick:** `Music.set(Music.trackFor(room, now), Music.levelFor(room, now))`; `renderFinal`, teardown and leaving the room call `Music.stop()`; a word celebration calls `Music.dip(...)`.
- **The bell** is a new effect in `js/sound.js`, `Sound.play('bell')`, next to `turn`, `place` and `win`. On the big screen, `Sound` reads the big screen's own setting (`scrabble.sound.bigscreen`, on by default).
- **The big screen:**
  - music follows the **featured** room;
  - the intro, round start and winner scenes stop it;
  - a highlight dips it;
  - a cut to another room plays that room's track, so the track can change on the cut.

## Edge cases

- **Several devices in one hall** each play their own copy, not in sync. That's accepted: each device can mute, and the big screen is the loud one.
- **A refresh mid-match:** music returns on the first tap.
- **A hidden or background tab:** the browser may keep playing; muting is per device.
- **Reduced motion:** doesn't affect sound.
- **Phones at 360px:** the header must still fit with the extra 🎵 button.

## Non-goals

- No music library or track picker.
- No volume slider in the game (mute only).
- No music on non-match pages.
- No syncing devices.

## Left to the builder

- The exact gain, the dip depth and length, and the fade time for a pause.
- Sharing `Sound`'s `AudioContext` or not.
- The icon style of the 🎵 switch (on and off).
