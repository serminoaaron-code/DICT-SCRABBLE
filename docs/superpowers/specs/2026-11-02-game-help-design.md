# "How to play" page (#gamehelp) + the polish leftovers — design

Branch `feat/game-help`. Mockup: `.superpowers/brainstorm/…/game-help.html`. The user approved it ("Proceed") and added: **"make it accessible for mobile view also."**

## Why

Players, hosts and spectators arrive with no briefing. A help page inside the game explains each role in plain steps, with friendly visuals that look like the real screens, so nobody needs a walkthrough on tournament day. The same branch also clears the small leftovers deferred by the polish pass.

## Part 1 — the help page

### What it is

- A new route, **`#gamehelp`**, linked in the header next to **Home** and **Host**. Its link text is **"How to play"**, or **"Help"** on phones narrower than 480px so the header still fits (my call).
- A role can be opened directly: `#gamehelp=player`, `#gamehelp=host`, `#gamehelp=watch`. Plain `#gamehelp` opens **player**, and an unknown role also opens player.
- It's a static page that reads no game data from Firebase. It follows the site's ☀️/🌙 theme (CSS tokens only). ("Offline" isn't a goal: the page loads with the app like every other page; builder check.)
- **A seated player during their live game** (the user's answer, builder check): the header link opens the help page **in a new browser tab** (`target="_blank"`, `rel="noopener"`). The game tab stays open, so they stay connected and their seat and clocks are untouched. Switching tabs still counts as leaving the screen (the host is warned), like any other tab. Everyone else, and a seated player outside a live game (lobby, result screen), opens it in the same tab.

### Layout (option A from the mockup, my call: the user didn't pick, and it suits phones best)

1. **Hero:** H-E-L-P tiles that drop in, the title **How to play**, and one line: "One player per team, one timed game per match. The winner's team gets +1."
2. **Quick facts:** 4 chips:
   - "⏱ 1-minute turns";
   - "🕑 5 / 10 / 15-minute matches (or a custom length)" (the host's form also has Custom…; builder check: the code wins over the mockup text);
   - "🏆 +1 for the winning team";
   - "📖 English words only".
3. **Role picker:** three cards, 🎮 **I'm a player**, 🛠️ **I'm the host**, 👀 **I'm watching**. Picking one shows only that role's steps and updates the URL (`#gamehelp=<role>`) without adding a history entry. Each role has its own accent colour: green, yellow, sky.
4. **Steps:** numbered cards, each with a heading, a **mini picture** built from the game's own pieces, and 1–2 short sentences. The pieces are cream tiles, the coloured bonus squares, the real button colours, the pill, and the big-screen bar. Each role ends with one 💡 tip.

### The content (as in the mockup)

- **Player:**
  1. join with the code and your name;
  2. take your seat, press Ready;
  3. coin toss;
  4. make a word: tap a tile then a square, or drag it; the first word covers ★, later words touch existing tiles;
  5. ✅ Play word / ↩ Recall / ⏭ Pass / 🔀;
  6. 1-minute turns, which pass when time runs out, plus the match clock;
  7. bonus squares 2L / 3L / 2W / 3W / ★, "? Bonuses", and the +50 bingo for all 7 tiles;
  8. word not found: ↩ Recall or ⚖️ Ask host;
  9. celebrations (Not Bad! 8+, Cool! 15+, Awesome! 25+, IMPOSSIBLE!!! 40+ **or any bingo**) and 😀 taunts 😠😂😭, once every 10 s;
  10. win: the higher score at the end gives +1; a tie goes to ⚡ sudden death, up to 3 rounds, then the host decides.

  Tip: "keep the game on screen (leaving warns the host); you can refresh any time and you'll be put back in your seat."
- **Host:**
  1. log in on Host (the password comes from the organizers; **never shown**);
  2. add the teams;
  3. create a match room (Team vs Team, length) and give the code to the two players;
  4. Start when both are ready;
  5. keep it fair: ⏸ Pause, Award win, Void, Free seat, and ⚠️ screen-leave warnings; you decide disputes;
  6. word appeals: the game pauses until you Approve or Deny;
  7. the big screen: open the big-screen link on the projector; it follows live rooms by itself, and 📌 Pin holds one room;
  8. the Active / Finished / Void tabs; standings update by themselves.

  Tip: "you can close the host page during a game — the players' screens keep the clocks running."
- **Spectator:**
  1. open the room (same code, on Home);
  2. 👁️ Just watch;
  3. enjoy: words drop in, celebrations play, taunts pop up;
  4. or the big screen.

  Tip: "Stop watching / take a seat if a seat is free."
- **Numbers come from the code**, so the page never drifts from the rules:
  - the turn length (`Match.TURN_MS`);
  - the tier thresholds: a new `ScrabbleEngine.TIER_MIN = [0, 8, 15, 25, 40]`, which `celebrationTier` also uses;
  - the bingo bonus (`ScrabbleEngine.BINGO_BONUS`);
  - the taunt cooldown (`Match.TAUNT_COOLDOWN_MS`);
  - the sudden-death rounds (`Match.SUDDEN_DEATH_MAX_ROUNDS`).

  The 5/10/15 match lengths match the host's form.
- The "big screen link" is shown as a real link to `?view=scoreboard` (opens in a new tab).

### Mobile and accessibility (the user's addition)

- **Phones at 360px:**
  - one column and no horizontal scroll;
  - the role picker becomes a compact row of three (icon plus a one-word label: Player / Host / Watch) so the steps start high on the screen;
  - text at least 14px;
  - every tap target at least 44px tall;
  - the mini pictures wrap or shrink and never overflow.
- **Desktop:** a centred column, at most about 1000px wide; the steps sit in a responsive grid (cards at least 280px wide).
- **Screen readers and keyboards:**
  - one `h1`, an `h2` per role and an `h3` per step;
  - the role picker is a real tablist (`role="tab"`, `aria-selected`, `aria-controls`), where the arrow keys move focus and Enter or Space picks (as in the host tabs);
  - the mini pictures are decorative (`aria-hidden`), and the step text says everything they show;
  - the steps are an ordered list.
- **Reduced motion:** the tiles and the coin don't animate.
- **Contrast:** WCAG AA in both themes. This includes the coloured step numbers and chips: light backgrounds get dark text.

### Non-goals

No search, no video, no translations, no editing the page from the host dashboard.

## Part 2 — the polish leftovers (deferred by PR #13's review)

| # | Now | After |
|---|---|---|
| L1 | No visible keyboard focus anywhere (`button { outline: none }`). | `:focus-visible` shows a clear ring on buttons, links, inputs, selects and tabs. It has 3:1 contrast against what's around it in both themes: dark navy in the light theme, yellow in the dark theme. It never shows on mouse or touch taps. |
| L2 | A second finger on Play while dragging abandons the drag, and Play can then submit once the tile has flown back. | Play is ignored for 500ms after a drag ends or is abandoned. |
| L3 | Host pager: Next or Previous reaching the last or first page loses keyboard focus (the button becomes disabled). | Focus falls back to the current page's button (`[aria-current="page"]`). |
| L4 | Opening or closing the Bonuses card can scroll the page (`focus()`). | `focus({ preventScroll: true })`. |
| L5 | `syncTaunt` repeats the status, intro and frozen-intro checks. | A pure `Match.tauntWindow(room, now)` (game screen up, intro over, not frozen) is used by both `tauntAllowed` and `syncTaunt`. |
| L6 | `drag.js`'s header comment still says `attach()` returns `detach()`. | It says it returns `{ detach, refresh }`. |
| L7 | After a redraw mid-drag, the rack's make-room gap visibly slides back in (150ms). | Re-applied after a redraw, the gap appears at once, without the slide. It still slides while the finger moves. |

## Edge cases

- **Who uses the help page:** players, hosts and spectators alike, signed in or not.
- **From inside a game:** a seated player in a live game gets the help page in a new tab (above). From a lobby or the result screen, or as a spectator, it's a normal route change, and Back returns to the room; a seated player keeps their seat (localStorage), as with Home.
- **Projector:** the big screen (`?view=scoreboard`) never shows the help link.
- **Narrow screens:** at 360px the header with the new link must still fit.

## Left to the builder

- The exact CSS and the mini-picture markup. Match the mockup and reuse the existing classes and tokens.
- Where the content lives: `js/view-help.js`, with a small pure part (`roleOf(hash)`) that has a unit test.
- The focus-ring colours (L1), within the contrast rule.
