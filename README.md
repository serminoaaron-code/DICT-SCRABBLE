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
- **Live team standings:** wins, losses and points on the host dashboard, plus a big-screen view for a projector (`?view=scoreboard`).
- **Result corrections:** the host can correct or void a finished result.

## Running locally

No install or build needed:

```bash
python -m http.server 8000
# open http://localhost:8000/        → join page
#      http://localhost:8000/#host   → host dashboard
```

To try a game, open three browser windows: the host and two players. Use a private/incognito window for the second player so it's treated as a different device.

> **Note:** there's no separate test database. Local runs use the live Firebase data under `scrabble/`. Use team names starting with `TEST-`, and void or delete them afterwards.

## Tests

The Scrabble rules and the room logic are covered by unit tests that use Node's built-in test runner (Node 18+, no packages):

```bash
node --test "tests/*.test.js"
```

## Project structure

```
index.html            # page shell; loads the scripts below
css/style.css         # all styles
js/engine.js          # Scrabble rules (pure, tested)
js/match.js           # room state: seats, turns, clocks, results, standings (pure, tested)
js/dictionary.js      # word check with timeout (tested)
js/store.js           # Firebase connection and safe (transactional) writes
js/ui.js              # shared rendering helpers
js/view-host.js       # host dashboard
js/view-room.js       # join page, lobby, live game, final screen
js/app.js             # routing and clock ticker
tests/                # unit tests
docs/                 # design, plan and dry-run checklist
```

See [`CLAUDE.md`](CLAUDE.md) for the architecture and data model, and [`docs/dry-run-checklist.md`](docs/dry-run-checklist.md) for the pre-event test script.
