# DICT-SCRABBLE

**DICT Digital Scrabble Sportsfest 2026**: the Scrabble event of the DICT sportsfest, played in the browser.

Each team sends one representative. The host sets up **fixture rooms** of **2, 3 or 4 players** (for example *NCR vs Region IV-A, 10 minutes*, or a 4-way match) and shares a short room code. The players join with the code and play one timed game while their teams watch. **The team with the highest score gets 1 point, every other team 0.** Team standings update live.

## Features

- **Fixture rooms with codes:** the host picks 2, 3 or 4 teams (one per seat) and the match length, then shares a code like `K7Q-42M`.
- **Easy in, easy out:**
  - Players join with just the code and their name, then tap a free seat.
  - A refresh, or reopening the link, puts them back in their seat.
  - Spectators join with the same code and pick "Just watch".
  - A player whose phone dies can take their seat back on another device once the host frees it.
- **Waiting screen (lobby):** a tile per seat (team, player, connected dot, Ready), **YOU** on your own seat, a "2 of 4 ready" bar, and **Start** for the host once everyone is ready.
- **Timed games:**
  - The host sets the match clock, and each turn has a 60-second limit.
  - When time runs out, the highest score wins.
  - A tie at the top goes to sudden death between the tied players only (in 3–4 player rooms the others are out and watch). After 3 tied rounds, the host decides.
- **3–4 player rooms:**
  - A **roulette wheel** picks who goes first (2-player rooms keep the coin toss), and turns go around the table.
  - A player who leaves the game is out and their tiles leave the game; the others play on, and the last one left wins.
  - The result screen shows a **podium**.
- **Real Scrabble rules:**
  - A shared tile bag; every tile shows its points.
  - The first word covers the centre star, and every later word must connect to tiles already on the board.
  - Words read left→right, top→bottom or bottom→top. A word spelled upward is shown as the real word (`VERIFY`), and a word that reads both ways shows both (`STOP/POTS`).
  - Side words are scored too, and bonus squares count only under newly placed tiles. Using all 7 tiles in one move adds a 50-point bonus.
- **Dictionary check:** words are checked with the [Free Dictionary API](https://dictionaryapi.dev/). If a real word isn't found, the player can **ask the host**, and the clocks pause until the host approves or denies it.
- **Playing on a phone or a laptop:** tap or **drag** tiles onto the board, 🔀 shuffle your rack, and send an emoji taunt 😀. Laptops get a side-by-side layout (board on the left, scores and rack on the right).
- **The host decides:**
  - **During a game:** pause or resume, award a win, free or remove a player's seat, void a room.
  - **No-show rooms:** walkover or void.
  - **Fair-play warnings:** when a player leaves the screen, the host sees it on that player's row. There are no automatic penalties.
- **Host dashboard:** teams, standings, and fixture rooms in **Active / Finished / Void** tabs. Each room card shows the teams, the status, a **player list** (ready, whose turn, scores, warnings) and a **seat overview**, with the actions in a fixed order: Open room · Pin | Walkover / Correct result | Void.
- **Live team standings:** wins, losses and points, on the dashboard, the join page, result screens and the big screen.
- **Result corrections:** the host can correct or void a finished result, with a reason that stays on record.
- **How to play (`#gamehelp`):** a short illustrated guide for players, the host and spectators.
- **Look and feel:** a DICT-branded light/dark theme (☀️/🌙, remembered per device, follows the device by default), soft bonus-square colours, readable (WCAG AA) colours everywhere, and layouts that work from a 360px phone to a projector.
- **Game feel:**
  - A **VS intro with a coin toss** (2 players) or a **4-WAY intro with a roulette wheel** opens every match.
  - A live **turn pill** and a "YOUR TURN!" ribbon show whose turn it is; the opponent's word drops onto the board tile by tile.
  - **Word celebrations:** a quick "+N" for small plays, and four bigger tiers up to "IMPOSSIBLE!!!" for a bingo, on every screen at once.
  - **Result screens:** a trophy scene for the winner, a respectful screen for the others, a neutral summary for spectators and the host, with the final board and the best word.
  - **Match music** (two original 8-bit loops, 🎵), and **sound effects** (off by default, 🔊) including a ringside bell at the end. On iPhones the sound plays even on silent (iOS 17+).
  - `prefers-reduced-motion` turns shake, flash, confetti and spins into simple fades, with the same information.
- **Broadcast projector (`?view=scoreboard`):** an auto-director picks a live room to feature (highlights first, then drama such as sudden death and the last minute, then rotation) and plays the same scenes and celebrations at full-screen scale. The host can **pin** a room to keep it on screen. With nothing live, it shows full-screen standings and "Next up". Read-only: the projector never writes to Firebase.

## Running locally

No install or build needed:

```bash
python -m http.server 8000
# open http://localhost:8000/            → join page
#      http://localhost:8000/#host       → host dashboard
#      http://localhost:8000/#gamehelp   → How to play
#      http://localhost:8000/?view=scoreboard → big screen
```

To try a game, open one window for the host and one per player. Each player needs a **separate browser identity** (a normal window, an Incognito window, another browser, or a phone): two tabs in the same browser count as the same player.

### Local playground

When the page runs locally, it uses a separate **playground** data area (`scrabble_playground/`) instead of the real tournament data. A yellow **🧪 PLAYGROUND** banner shows this. "Local" means `localhost`, `127.0.0.1`, or a `192.168.x.x` / `10.x.x.x` address.

- Play as much as you like. The real tournament (`scrabble/`) is never touched.
- **Reset playground** in the banner wipes all test teams, rooms and results.
- **Test on phones:** run `python -m http.server 8000` and open `http://<your-PC's-IP>:8000/` on a phone on the same Wi-Fi. Find the IP with `ipconfig`. Windows Firewall may ask to allow Python. Phones also get the playground.
- Add `?db=live` to the URL to use the real data from a local copy, e.g. `http://localhost:8000/?db=live#host`. Only do this on purpose.

The deployed GitHub Pages site always uses the real tournament data.

## Tests

The Scrabble rules, the room logic and the other pure modules are covered by unit tests that use Node's built-in test runner (Node 18+, no packages):

```bash
node --test "tests/*.test.js"
```

## Project structure

```
index.html            # page shell; loads the scripts below
banner.png            # the event banner in the header
css/style.css         # all styles (theme tokens in :root)
css/fx.css            # celebrations, intro / coin / roulette, result screens, broadcast scale
css/help.css          # the How to play page
js/theme.js           # light/dark theme (pure + localStorage glue, tested)
js/sound.js           # optional sound effects, off by default (tested)
js/music.js           # match music, two 8-bit loops (pure parts tested)
js/names.js           # display names: long names end in "…" (tested)
js/scenes.js          # VS / 4-WAY intro, coin toss / roulette, round start, result screens
js/engine.js          # Scrabble rules (pure, tested)
js/match.js           # room state: seats, turns, clocks, results, standings (pure, tested)
js/dictionary.js      # word check with timeout, both readings of a vertical word (tested)
js/env.js             # picks the Firebase data area (playground vs live)
js/pill.js            # turn pill and whose-turn ribbon state (pure, tested)
js/celebrate.js       # word celebration overlays (pure parts tested)
js/taunt.js           # emoji taunts (pure parts tested)
js/director.js        # auto-director for the projector (pure, tested)
js/rack.js            # rack order for shuffle and drag (pure, tested)
js/roomlist.js        # host room tabs, pages and the room card's player list (pure, tested)
js/teamline.js        # the one "TEAM VS TEAM" / 3-4-WAY team line (tested)
js/layout.js          # laptop side-by-side game layout (pure parts tested)
js/drag.js            # drag-and-drop tiles (pure parts tested)
js/store.js           # Firebase connection and safe (transactional) writes
js/ui.js              # shared rendering helpers
js/view-host.js       # host dashboard
js/view-room.js       # join page, seat picker, waiting screen, live game, result screen
js/view-scoreboard.js # ?view=scoreboard: the broadcast projector view
js/view-help.js       # #gamehelp: the How to play page (pure parts tested)
js/app.js             # routing, clock ticker, theme / sound / music toggles
tests/                # unit tests
docs/                 # dry-run checklist, fixed-bugs re-test list, designs and plans
```

See [`CLAUDE.md`](CLAUDE.md) for the architecture and data model, [`docs/dry-run-checklist.md`](docs/dry-run-checklist.md) for the pre-event test script, and [`docs/important-docs/bugs-fixed.md`](docs/important-docs/bugs-fixed.md) for the fixed bugs QA re-tests.
