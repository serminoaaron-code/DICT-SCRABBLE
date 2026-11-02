# DICT-SCRABBLE

**DICT Digital Scrabble Sportsfest 2026**: the Scrabble event of the DICT sportsfest, played in the browser.

Each team sends one representative. The host sets up **fixture rooms** (for example *NCR vs Region IV-A, 10 minutes*) and shares a short room code. The two players join with the code and play one timed game while their teams watch. **The winner's team gets 1 point and the loser's team 0.** Team standings update live.

## Features

- **Fixture rooms with codes:** the host picks the two teams and the match length, then shares a code like `K7Q-42M`.
- **Easy in, easy out:**
  - Players join with just the code and their name.
  - A refresh, or reopening the link, puts them back in their seat.
  - Spectators join with the same code and pick "Just watch".
- **Timed games:**
  - The host sets the match clock, and each turn has a 60-second limit.
  - When time runs out, the higher score wins.
  - A tie goes to sudden death; after 3 tied rounds, the host decides.
- **Real Scrabble rules:**
  - A shared tile bag.
  - The first word covers the centre star, and every later word must connect to tiles already on the board.
  - Side words are scored too, and premium squares count only under newly placed tiles.
  - Using all 7 tiles in one move adds a 50-point bonus.
- **Dictionary check:** words are checked with the [Free Dictionary API](https://dictionaryapi.dev/). If a real word isn't found, the player can **ask the host**, and the clocks pause until the host approves or denies it.
- **The host decides:**
  - **During a game:** pause or resume, award a win, void a room, remove a player.
  - **No-show rooms:** walkover or void.
  - **Fair-play warnings:** when a player leaves the screen, the host gets a warning. There are no automatic penalties.
- **Live team standings:** wins, losses and points on the host dashboard.
- **Result corrections:** the host can correct or void a finished result.
- **Look and feel:** a DICT-branded light/dark theme (☀️/🌙, remembered per device, follows the device by default) with Archivo Black display type and accessible colour tokens.
- **Game feel:**
  - A live **turn pill** always shows whose turn it is, a low-time warning, paused/appeal/sudden-death state, or "Get ready".
  - **Word celebrations:** a quick "+N" for small plays, and four bigger tiers up to a cinematic "IMPOSSIBLE!!!" for a bingo, on every screen (players, spectators, projector) at once.
  - A **VS intro and coin toss** (~5 s) opens every match, naming which team goes first.
  - **Result screens:** a trophy scene for the winner, a respectful "well played" screen for the other player, and a neutral summary for spectators and the host, each with the final board and the best word of the match.
  - **Sound effects** (off by default, remembered per device) and a short "your turn" vibration on phones.
  - `prefers-reduced-motion` turns shake, flash, confetti and spins into simple fades, with the same information.
- **Broadcast projector (`?view=scoreboard`):** an auto-director picks a live room to feature — highlights first, then drama (sudden death, the last minute), then rotation — and plays the same celebrations and result scenes at full-screen scale. The host can **pin** a room to hold the screen there regardless of what else happens. Idle (nothing live) shows full-screen standings and "Next up". Read-only: the projector never writes to Firebase.

## Running locally

No install or build needed:

```bash
python -m http.server 8000
# open http://localhost:8000/        → join page
#      http://localhost:8000/#host   → host dashboard
```

To try a game, open three browser windows: the host and two players. Use a private/incognito window for the second player so it's treated as a different device.

### Local playground

When the page runs locally, it uses a separate **playground** data area (`scrabble_playground/`) instead of the real tournament data. A yellow **🧪 PLAYGROUND** banner shows this. "Local" means `localhost`, `127.0.0.1`, or a `192.168.x.x` / `10.x.x.x` address.

- Play as much as you like. The real tournament (`scrabble/`) is never touched.
- **Reset playground** in the banner wipes all test teams, rooms and results.
- **Test on phones:** run `python -m http.server 8000` and open `http://<your-PC's-IP>:8000/` on a phone on the same Wi-Fi. Find the IP with `ipconfig`. Windows Firewall may ask to allow Python. Phones also get the playground.
- Add `?db=live` to the URL to use the real data from a local copy, e.g. `http://localhost:8000/?db=live#host`. Only do this on purpose.

The deployed GitHub Pages site always uses the real tournament data.

## Tests

The Scrabble rules and the room logic are covered by unit tests that use Node's built-in test runner (Node 18+, no packages):

```bash
node --test "tests/*.test.js"
```

## Project structure

```
index.html            # page shell; loads the scripts below
css/style.css         # all styles
css/fx.css            # celebrations, intro/coin, result screens, broadcast scale
js/theme.js           # light/dark theme (pure + localStorage glue, tested)
js/sound.js           # optional sound effects, off by default (tested)
js/engine.js          # Scrabble rules (pure, tested)
js/match.js           # room state: seats, turns, clocks, results, standings (pure, tested)
js/dictionary.js      # word check with timeout (tested)
js/env.js             # picks the Firebase data area (playground vs live)
js/pill.js            # turn-pill state (pure, tested)
js/celebrate.js       # word celebration overlays (pure parts tested)
js/scenes.js          # VS intro/coin toss, round start, result screens
js/director.js        # auto-director for the projector (pure, tested)
js/store.js           # Firebase connection and safe (transactional) writes
js/ui.js              # shared rendering helpers
js/view-host.js       # host dashboard
js/view-room.js       # join page, lobby, live game, result screen
js/view-scoreboard.js # ?view=scoreboard: the broadcast projector view
js/app.js             # routing, clock ticker, theme/sound toggles
tests/                # unit tests
docs/                 # design, plan and dry-run checklist
```

See [`CLAUDE.md`](CLAUDE.md) for the architecture and data model, and [`docs/dry-run-checklist.md`](docs/dry-run-checklist.md) for the pre-event test script.
