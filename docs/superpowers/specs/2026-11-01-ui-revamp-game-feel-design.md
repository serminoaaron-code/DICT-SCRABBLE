# DICT Scrabble: UI revamp, game feel and broadcast projector (Design)

**Date:** 2026-11-01 · **Branch:** `feat/ui-revamp` · **Status:** Approved 2026-11-01
**Mockups:** these were approved in the brainstorming companion and are saved, git-ignored, under `.superpowers/brainstorm/103-1793532112/content/`:
- `look-a-light-dark.html`
- `turn-pill-compact.html`
- `celebrate-tiers-v2.html`
- `projector-broadcast.html`
- `intro-coin-winner-v2.html`

They are the visual reference for this document.

Decisions the user made are stated plainly. Decisions the designer (Claude) made are marked **[call]**.

---

## 1. Intent

The game rules, rooms and scoring already work. This is about how the app **looks and feels** on tournament night:
- **Players** should find it sleek, intuitive and fun, the kind of app that makes people say *"I should've joined Scrabble"*.
- **The crowd** in the hall should have a **broadcast-style projector view**, like an esports or online chess stream, that follows the action across several simultaneous rooms.

The design theme is the event banner (`banner.png`): DICT royal blue and navy, sportsfest red, yellow and green, bold geometric circles and shapes, cream Scrabble tiles, and a chunky headline font. The reference vibe is a tournament broadcast (Gotham Chess thumbnails, LoL finals), upgraded and on-brand.

The app is single-use for the DICT sportsfest. There's no hard deadline pressure.

## 2. Goals / Non-goals / Anti-goals

**Goals**
1. A **"Sportsfest Pop"** visual style (light) across *every* screen: join, lobby, game, result, host dashboard and projector.
2. A **☀️/🌙 dark-mode switch** and an accessibility bundle (§4).
3. A game screen that fits a **360×740 phone without scrolling**, with a compact **turn pill**.
4. **Four-tier word celebrations** in a separate module, with a count-up score.
5. A **VS intro and a 3D coin toss** before every match.
6. A **dramatic winner screen**, and a respectful result screen for the other player.
7. A **broadcast projector view** with an **auto-director** that switches between rooms, and a **host pin**.

**Non-goals**
- 3D / Three.js. That's the next project (P2), and it will plug into the projector view built here.
- Tailwind, shadcn or any CSS framework or build step.
- Changing game rules, scoring or tournament results, apart from the small data additions in §7.

**Anti-goals (failure even if it "works")**
- Breaking the tested game logic, or anything that changes who wins.
- A board that no longer fits or is hard to tap on a phone.
- Celebrations or intros that **block play** or cost a player time on the clock.
- Rapid flashing, surprise sounds in an office, or unreadable text in either mode (e.g. white text on a white pill).

## 3. Constraints

- **Stack:** vanilla HTML/CSS/JS, plain `<script>` tags, no build, GitHub Pages, Firebase RTDB v8. External assets only from Google Fonts (CSS) and existing CDNs.
- **Keep every existing element `id` and `data-*` attribute** that the code and the browser test scenarios use: `#board-container`, `#rack`, `#playBtn`, `#passBtn`, `#recallBtn`, `#resignBtn`, `#statusLine`, `#lastMove`, `#matchClock`, `#turnClock`, `#sideA/#sideB`, `[data-claim]`, `[data-host]`, `[data-room]`, `#hostBar`, `#standings`, `#finalStandings`, `#joinStandings` and so on. Restyle them, and wrap them if needed, but don't rename them. Where an element moves (e.g. Resign goes into a menu), its `id` stays.
- All existing unit tests (80) and the browser scenarios must still pass. New pure logic gets unit tests.
- Mobile first. Breakpoints are 480 px for phones, 900 px for the dashboard stacking, and the projector's 16:9 at ≥1280 px.

## 4. Visual system

### 4.1 Tokens (CSS custom properties on `:root`)
| Token | Light | Dark |
|---|---|---|
| `--navy` | `#0b1f4d` | same |
| `--blue` (DICT royal) | `#1446a0` | bar `#1b3a85` |
| `--sky` | `#2e7cf6` | same |
| `--red` | `#e1251b` | same |
| `--yellow` | `#ffc20e` | same |
| `--green` | `#00a651` | same |
| `--cream` (tiles) | `#f6e7c1` | same |
| `--bg` | `#ffffff` | `#0a1430` |
| `--surface` | `#f2f5fc` | `#13224a` |
| `--text` | `#0b1f4d` | `#eef2ff` |
| `--muted` | `#5b6b8c` | `#9fb0d6` |
| board grid / empty square | `#dfe7f6` / `#ffffff` | `#0f1d42` / `#1a2c5c` |

- **Premium squares:**
  - 3W = red
  - 2W and ★ = yellow (navy text)
  - 3L = green
  - 2L = sky
- **Tiles** are always cream with navy letters, in both modes.
- **Decorative shapes:** large circles in yellow and red at the screen corners, as in the banner. They're dimmed to ~35% opacity in dark mode.
- **Fonts:** **Archivo Black** for display (titles, scores, celebrations) and **Inter** for UI text, from Google Fonts with system fallbacks.
- **Contrast rule (user):** a light background always gets dark text and a dark background gets light text, on every pill, chip, badge and card. Text and interactive elements meet WCAG AA in both modes.

### 4.2 Theme and accessibility (user, details **[call]**)
- **☀️/🌙 switch** in the header. The default follows the device (`prefers-color-scheme`), and the choice is remembered per device (`localStorage scrabble.theme`). It's applied as `data-theme` on `<html>`.
- **🔇/🔊 sound switch** in the header. Sound is **off by default** and remembered per device (`scrabble.sound`). A short phone **vibration** on "your turn" happens only when sound is on.
- **Reduced motion:** `prefers-reduced-motion` turns off shake, flash, confetti, spinning rays and the coin flip. Scenes become simple fades with the same information.
- **Flashing:** never more than one flash per scene, so nothing flashes three or more times a second.
- **Sounds [call]:** short tones generated with the Web Audio API, with no audio files to load. Each one is under 1 s and quiet:
  - your turn
  - tile placed
  - word accepted
  - one sound per celebration tier
  - VS hit
  - coin land
  - win fanfare

## 5. Screens

### 5.1 Header (all screens)
- A slim header with the DICT banner, which **collapses to a one-line title on phones during a live game**, plus the ☀️/🌙 and 🔇 switches.
- The yellow PLAYGROUND bar stays as it is.

### 5.2 Join page and room lobby
Restyle them to Pop: cards, bold headings, big friendly buttons, team colours (Team A blue, Team B red, consistently everywhere) and the standings card. Behaviour is unchanged.

### 5.3 Game screen (approved, 360×740 fits without scrolling)
From top to bottom:
1. **Header:** one line, plus the switches.
2. **Score bar** (royal blue): `TEAM · Player` and score on each side, with a ▶ on the player whose turn it is. The **match clock** is in the middle.
3. **Turn pill:** one slim line, about 26 px, centred under the score bar.
4. **Board:** the full 15×15.
5. **Rack:** 7 tiles of at least 36 px.
6. **Actions:** **Play word** (wide, red), **Recall**, **Pass**.

**Resign** is renamed **"Leave"** (user) and moves into a small **⋯ menu** so it can't be tapped by accident **[call]**.
- It keeps the `#resignBtn` id and the same behaviour: leaving forfeits the match.
- The confirm dialog says so plainly: *"Leave the game? Your team (NCR) loses this match."*
- Result reason text becomes "<player> left the game" (was "resigned").

**What "fits" means [call]:** the **visible** browser area on a 360-wide phone in Chrome, which is about **360×640** once the address bar is shown, not the full 740.
- The six rows above must fit there for a **seated player in a normal turn**, in both themes, including the yellow PLAYGROUND bar on local runs.
- Temporary boxes become **bottom sheets or overlays** that don't push the board down:
  - `#rejectBox` (the recall/appeal choice)
  - `#noticeBox` (disconnected)
  - `#lastMove` (shown as a one-line caption under the pill, or inside the pill area)
  - the coin-toss line
- **Spectators and the host** may scroll, because the host bar sits below the actions.

**Turn pill states (user):**

| State | Colour | Text |
|---|---|---|
| Your turn | green, soft glow | `● Your turn  0:44` |
| Opponent's turn | calm surface colour (dark text in light mode) | `Juan's turn  0:31` |
| Last 10 s (anyone) | red | `⏱ Your turn  0:08` |
| Paused / appeal / host decision | yellow (navy text) | `⏸ Paused  0:44` / `⚖️ Waiting for host` |
| Sudden death | red outline | `⚡ Sudden death · round 2/3` |

- When it becomes the player's turn, the pill pops once (and vibrates or plays a sound if that's on).
- Spectators and the host see the pill too, with player names.
- The existing `#statusLine` and `#turnClock` content moves into the pill, keeping those ids for compatibility. The pill can *be* `#statusLine` with `#turnClock` inside it.

### 5.4 Word celebrations (approved): module `js/celebrate.js`
- **Tiers** are decided by the move's total points, including side words and the bingo bonus:
  - **under 15:** no overlay, just a small "+N" floating into the score
  - **Not Bad! (15–24):** sky blue, quick pop
  - **Cool! (25–39):** green, pop plus a burst
  - **Awesome! (40–59):** a golden sunburst. Spinning gold rays, a gold title with a shine sweeping across it, twinkling stars and a centre confetti burst. About 3 s.
  - **IMPOSSIBLE!!! (60+ or any 7-tile bingo):** cinematic, about 4.5 s. In order:
    1. The screen goes dark under a blue spotlight.
    2. The **played word's tiles slam in one by one**.
    3. A shockwave ring, one soft flash and a screen shake.
    4. **IMPOSSIBLE!!!** slams in with a red/blue glitch.
    5. The points count up, and a **BINGO +50** stamp lands if it was a bingo.
    6. "**BY <PLAYER> · <TEAM>**" credits the player.
    7. Confetti cannons fire from the bottom corners.
- Under each title, the points **count up from 0**, then **fly into that player's score** in the score bar, which bumps when they land.
- **Who sees it:** both players, spectators, the host, and the projector (§5.7).
- **Trigger:** a client plays a celebration when it sees a room's `game.moveCount` go up and `lastMove.type === 'play'`.
  - It never replays on page load or refresh; the first snapshot only sets the baseline.
  - A pass or timeout has no overlay.
- **Never blocks play.** The overlay is `pointer-events: none`. If two moves arrive during an overlay, they **queue**. Any viewer can tap to dismiss an overlay on their own screen **[call]**.
- **The opponent's turn clock waits for the celebration (user).** When a play earns an overlay tier, the next player's turn starts **after** it:
  - `turnStartedAt = now + CELEBRATE_MS[tier]`, with Not Bad!/Cool! at 2600 ms, Awesome! at 3000 ms and IMPOSSIBLE!!! at 4500 ms. Tier 0 has no delay.
  - The **match** clock keeps running **[call]**. Only the 60-second turn timer waits, so nobody loses turn time to the show.
  - The opponent *may* still play during the celebration if they're quick.
  - Timeouts, pause/resume and sudden-death round counting keep working unchanged, because they're all measured from `turnStartedAt`. The pause snapshot clamps the remaining turn time to at most 60 s.
  - The turn pill shows the full `1:00` (or a "get ready" state) until the delay ends.
- **API [call]:**
  - The tier rule lives in the tested rules layer as `ScrabbleEngine.celebrationTier(total, bingo) → 0..4`, because `match.js` needs it for the turn delay. `Celebrate.tierFor` simply calls it.
  - `Celebrate.show({ tier, total, words, bingo, playerName, teamName, seat }, { container, scoreEl })` handles the DOM.

### 5.5 Match start: VS intro and coin toss (approved, ~5 s)
- **VS intro (~2.6 s):** the Team A panel (blue, top) and the Team B panel (red, bottom) slam in from opposite sides, and the yellow **VS** badge spins in and pulses. A tag shows "ROOM · N MIN MATCH".
- **Coin toss (~2.4 s):** a 3D CSS coin, with Team A's name on the yellow face and Team B's on the red face, flips and lands on `game.firstSeat`, then "**<TEAM> GOES FIRST!**".
- **Every screen shows the same result**, because it comes from room data; the coin isn't random in the browser.
- **The clocks start after the intro (user approved the guess).** `startMatch` sets `clock.startedAt = now + INTRO_MS` (5000), with `endsAt` and `turnStartedAt` counted from `startedAt`. Moves before `startedAt` are rejected (§7).
- **Late arrival or refresh during the intro:** if `serverNow() < startedAt`, play the remaining part of the intro. If not, go straight to the board.
- It also plays on the projector when that room is featured.

### 5.6 Result screens (approved)
- **Winner's phone:**
  - a trophy drops in, and the team name slams onto spinning gold rays,
  - final scores count up, and a **"+1 TEAM"** stamp lands,
  - **⭐ best word of the match** (word, points and tier name),
  - confetti,
  - buttons: **View board** and **Back to start**.
- **Other player's phone:** the same layout in calm blue, "TEAM WINS · WELL PLAYED" with 🤝 and no confetti. The score pill is light with dark text (contrast rule).
- **Spectators and host:** the neutral version, "TEAM WINS", with confetti **[call]**. The host keeps Correct/Void controls below it.
- **Void:** a calm grey card with the void reason.
- **Reason line:** resign, walkover, awarded, sudden death, tiles out and corrected (with note) are shown as today.

### 5.7 Projector broadcast view (approved): replaces `?view=scoreboard`
- **16:9 layout:**
  - **top score bar:** teams, players, live scores, a big **VS**, the match clock and the turn pill
  - **big live board** of the featured room; the newest tiles glow
  - **right panel:** team standings and a **Last move** card
  - **lower-third:** "● LIVE · ROOM CODE · A vs B"
  - **mode badge:** **🔁 AUTO** or **📌 PINNED BY HOST**
  - **bottom ticker:** the scores of every other live room, scrolling; the featured room in yellow
- Pop style, light by default, with the ☀️/🌙 switch available.
- **Auto-director (user: automatic with host pin):**
  1. **Highlight cut:** an Awesome! or IMPOSSIBLE!!! in any room cuts to that room, with a swipe transition, and plays the celebration full-screen.
  2. **Drama preference:** when choosing the next room, prefer rooms in sudden death or in the last 60 s of the match clock.
  3. **Rotation:** every ~20 s, with at least 8 s on a room.
  4. **Match start:** when a single room starts, cut to it for the VS intro and coin toss, unless a pin is active.
     - **Several rooms starting together (user):** rooms whose `startedAt` falls within ~10 s of each other get **one combined "ROUND STARTING" scene** instead (~5 s). All the matchups slam in together ("NCR vs IV-A · CAR vs VII · …"), then the screen cuts to the first room.
     - Intros are never replayed late. A room whose `startedAt` has already passed just joins the rotation.
  5. **Match end:** show that room's winner card for ~8 s, then continue.
  6. **Nothing live:** a full-screen standings view plus "**Next up**", the waiting rooms with their team names.
  7. **Simultaneous events** are queued, never dropped. Highlights come before rotation.
- **Host pin (user):**
  - The dashboard room cards and the room host bar get **"📌 Pin to big screen"** / **"Unpin"**.
  - While pinned, the projector stays on that room. Highlights from other rooms show as a small corner card ("🔥 IMPOSSIBLE!!! in ROOM X") instead of cutting away **[call]**.
  - When a pinned room finishes, the projector shows its winner card and then **ignores** that pin, going back to AUTO. The projector never writes; the host can unpin any time **[call]**.
- **Director logic is pure and unit-tested [call]:** `js/director.js` (UMD) with `Director.decide(state, rooms, events, now) → { featured, scene, queue }`, so the rules above are testable without a browser.

### 5.8 Host dashboard
- Restyled to Pop: cards, team-colour chips and clearer status badges.
- New: the **📌 Pin** buttons, and an **"Open big screen"** button that opens the projector view.
- Behaviour is otherwise unchanged.

## 6. Code organisation [call]

| File | Change |
|---|---|
| `css/style.css` | Rewritten around the tokens in §4. Light and dark through `[data-theme]`. Reduced-motion rules. |
| `css/fx.css` (new) | Keyframes and styles for celebrations, intro, coin, winner and broadcast transitions |
| `js/celebrate.js` (new, UMD) | `tierFor` (pure, tested) plus `show()` (DOM) and the queue |
| `js/intro.js` (new) | VS intro, coin toss and winner/result scenes, reused by the room view and the projector |
| `js/sound.js` (new) | Web Audio tones, the 🔇 switch and vibration |
| `js/theme.js` (new) | The ☀️/🌙 switch and its stored setting |
| `js/director.js` (new, UMD) | Pure auto-director logic (tested) |
| `js/view-scoreboard.js` | Becomes the broadcast view, using the director and the scenes above |
| `js/view-room.js`, `js/view-host.js`, `js/ui.js` | New layout and markup (ids kept), celebration and intro hooks, pin buttons |
| `js/match.js`, `js/store.js` | Small data additions (§7) |
| `index.html` | Google Fonts link and the new script tags |

## 7. Data changes (all small)
- **`clock.startedAt`** is set `INTRO_MS = 5000` in the future by `startMatch`. `endsAt = startedAt + matchLengthSec*1000`, and `turnStartedAt = startedAt`. Plays, passes, appeals and timeouts are rejected while `now < startedAt`.
- **`game.lastMove.bingo`** (boolean) is added in `playCore`, so clients can pick the tier without recomputing.
- **`game.bestMove`** = `{ seat, words: [..], total, bingo }`, the highest-scoring play so far, updated in `playCore`. Ties keep the earlier move **[call]**.
- **`<data root>/broadcast/pinned`** (the root comes from `Env.dataRoot()`, so it's the playground or live data) = room code or null. It's written by the host through a small `Store.setPinned(code|null)`. It's a plain set, not a room transaction, because it isn't room state.
- **The celebration delay** in `endTurn` (§5.4): `turnStartedAt = now + CELEBRATE_MS[tier]` after a play.
- **`startMatch(room, now, rng, introMs = 0)`:** the intro offset is a parameter that defaults to 0, so the existing tests keep passing. The app passes `INTRO_MS`.

## 8. Things that must not change
- Who wins, scoring, timers (except for the intro offset and the celebration turn delay), seats, presence, transactions, standings, and the playground and live data areas.

### Rollout [call]
- Build on `feat/ui-revamp` and merge when it's verified. Lower-risk parts land first in the plan (theme, layout, pill), then the data changes (intro offset, celebration delay, bestMove), then the director.
- **Merge or deploy only when no rooms are live**, and have everyone refresh before the next round. A tab still running old code would ignore the new intro and celebration guards.
- Rooms created before the deploy simply lack `bestMove` and `lastMove.bingo`. The result screen then hides the "best word" line, and the tier falls back to a total-only check.
- Every behaviour covered by the existing tests and the QA list (`docs/important-docs/bugs-fixed.md`).

## 9. Verification
- **Unit tests (Node):**
  - `Celebrate.tierFor` boundaries: 14 → 0, 15 → 1, 24 → 1, 25 → 2, 39 → 2, 40 → 3, 59 → 3, 60 → 4, and a bingo at any total → 4
  - `startMatch` intro offset
  - moves rejected before `startedAt`
  - timeouts measured from `startedAt`
  - `lastMove.bingo`
  - `bestMove` updates and ties
  - `Director.decide` rules: highlight first, drama preference, rotation timing and minimum dwell, pin behaviour, winner card, idle "Next up", queueing
- **Browser scenarios:** all existing ones still pass, plus new checks:
  - the game screen at 360×740 has no vertical or horizontal scroll, in both themes
  - a celebration plays on all screens after a move and not after a refresh
  - the intro delays the first turn clock
  - the projector cuts to a highlight
  - the projector stays on a pinned room
  - the theme and sound switches persist
- **Contrast check:** scripted, in both themes, on the turn pill, score pills, badges and buttons.
- **Manual:** a real phone in both themes, a projector at 1280×720, and "Reduce motion" turned on.

## 10. Settled during the builder review [call]
- New tile highlights on the projector use `lastMove.words[].cells[].isNew`, which already exists, so no new data is needed.
- The new browser checks use the existing raw-CDP harness in `.superpowers/e2e/`, with no test packages.

## 11. Left to the builder
- Exact easing, durations within ±20% of the stated ones, and particle counts. They should feel like the approved mockups.
- How the CSS is organised internally and how class names are chosen, keeping the ids in §3.
- What the sounds sound like (short, quiet, pleasant).
- The ⋯ menu's exact look.
- Ticker speed and lower-third details.
