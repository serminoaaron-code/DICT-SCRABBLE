# DICT-SCRABBLE

**DICT Digital Scrabble Sportsfest 2026**: a browser-based, real-time multiplayer Scrabble tournament app.

Players sign in with an email address and display name, queue for a match, and play on a shared 15×15 board. Other people can watch any live game as spectators. A host runs the tournament from an admin panel on the same page.

## Features

- **Real-time multiplayer:** 2-player or 4-player matches, synced live through Firebase Realtime Database
- **Four servers:** Server 1 is for the tournament and Servers 2–4 are for casual play. Each server keeps its own players, matches and settings.
- **Automatic matchmaking:** players click *Find Next Match* and are paired once enough players are searching
- **Scrabble board:** standard premium squares (2L / 3L / 2W / 3W / centre star), standard letter values, 7-tile racks
- **Dictionary check:** words are checked against the [Free Dictionary API](https://dictionaryapi.dev/)
- **Turn timer:** 60 seconds per turn. When time runs out, the turn is passed automatically.
- **Fair-play rules:**
  - Switching tabs during a live match counts as a strike, and 3 strikes forfeit the match
  - 3 passes in a row disqualify the player
- **Spectator mode:** watch any live match; players' racks stay hidden
- **Host admin dashboard** (password-protected):
  - Choose 2-player or 4-player mode
  - Set the bracket size (4 / 8 / 16 / 32)
  - Set how long the tournament runs
  - Open a 5-minute registration grace period
  - Lock or unlock registration
  - Kick off the tournament, which also generates the bracket
  - Reset a server's data
- **Knockout bracket and leaderboard** views

## Tech stack

- Plain HTML, CSS and JavaScript in a single file (`index.html`), with no framework and no build step
- [Firebase Realtime Database](https://firebase.google.com/docs/database), v8 SDK loaded from a CDN
- jQuery 3.6.0, loaded from a CDN
- Free Dictionary API for checking words

## Running locally

No install or build needed. Serve the folder and open it in a browser:

```bash
python -m http.server 8000
# open http://localhost:8000/
```

To try multiplayer, open the page in two or more browser windows or profiles. Register a different player in each window, all on the **same server**. Then unlock the host panel in one window and click **Kickoff Tournament**.

> **Note:** the page connects to the live Firebase database configured in `index.html`. Anything you do locally (registering, playing, resetting a server) changes real data.

## Project structure

```
index.html   # The whole app: styles, markup, game engine, Firebase sync, UI logic
banner.png   # Header banner image
CLAUDE.md    # Detailed architecture notes, data schema and known issues
```

See [`CLAUDE.md`](CLAUDE.md) for the architecture, the Firebase data schema and the list of known gameplay issues.
