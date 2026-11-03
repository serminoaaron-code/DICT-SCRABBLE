# 3–4 player rooms and the roulette wheel: design

QA feature request #2 / #2.1, 2026-11-03. Brainstormed with the user. They picked from the visual companion mockups (`.superpowers/brainstorm/multi-20261103111306/content/`: `scorebar.html` → **B**, `roulette.html` → **A**, `result.html` → **A**).

## Why

Today every fixture room is one team representative against another: seats A and B, a coin toss, and +1 to the winner. The sportsfest also wants rooms where **3 or 4 teams play one game together**. The host chooses the size per room, and **2-player rooms stay exactly as they are**.

## The ticket's acceptance criteria (binding)

1. The system supports 2-player, 3-player and 4-player match configurations.
2. Hosts can dynamically assign participants when creating a room.
3. Duplicate participant assignments are prevented.
4. The scoreboard and match introduction screen dynamically display all participants.
5. Each participant has independent score tracking.
6. Turn rotation and timers correctly accommodate all participants.
7. Two-player matches retain the existing coin toss mechanism.
8. Three-player and four-player matches use roulette to randomly determine the first turn.
9. Host Controls support all participating players.
10. Match results correctly display individual scores and determine the winner, including tied results.
11. All updated screens remain responsive and readable on large displays.
12. Existing 2-player functionality remains fully operational without regression.

## Goals

- The host picks **2, 3 or 4 players** and assigns **one team per seat**, with no team twice.
- One shared board and bag. Each player has a rack, a score and a turn, and turns rotate around the seats.
- The game screen, intro, result screen, host dashboard and projector show every participant, and stay readable from a 360px phone up to the projector.
- **2-player rooms keep today's look and behaviour**: the A-vs-B score bar, VS intro, coin toss, result screen, and swap-style Correct result. Rooms created before this change keep working.

## Non-goals

- More than 4 players, teams of several players in one seat, or partner play.
- Changes to the Scrabble rules, scoring, tile bag, turn clock (1 minute), celebrations, taunts or dictionary.
- A different points system. It stays **+1 for the winner, 0 for everyone else**.
- Automatic match-length changes for bigger rooms. The host chooses the length, as today.

## Anti-goals (a failure even if it "works")

- Any regression in 2-player rooms, visual or behavioural (AC 12).
- Screens that disagree about whose turn it is, who went first, or who won. Every viewer must see the same thing.
- A result recorded twice, or a seat that can act out of turn, when several clients write at once.

## Decisions made with the user

### Rules

- **Turn order:** the roulette picks the first player. Turns then go to the **next seat in seat order** (A → B → C → D → A …), skipping seats that are out.
- **Winner:** only the **highest score** wins (+1). Every other team in the room gets 0. In the standings that's **1 win** for the winner and **1 loss for each other team** (a 4-player room adds 1 win and 3 losses).
- **Ending** (time up, or the bag runs out and a player goes out): the highest score among the players still in wins.
- **Tie at the top → sudden death between only the tied players.**
  - Each tied player gets one turn per round, in seat order.
  - After each full round, if one of them leads, they win.
  - After each full round, **only the players still level at the top stay in**. A tied player who falls behind (A and B still level, C behind) is **out** too, like the players who weren't tied. The round count **keeps counting** and doesn't restart when the group shrinks.
  - After `SUDDEN_DEATH_MAX_ROUNDS` (3) rounds still tied, the status becomes `hostDecision` and the host decides, as today.
  - Sudden death starts with the first tied seat at or after `firstSeat`. In 2-player rooms that is `firstSeat`, as today *(my call)*.
  - The **players who weren't tied are out**: they have lost, but they stay in the room to watch. Their rack is hidden, they get no turns or clock, and their column shows a calm **"OUT"** tag with their final score. They can still send emoji taunts.
- **A player who leaves mid-game (Resign)** loses and is out. The game **goes on** for the others and their turns are skipped. If only one player is left, that player wins.
  - **Their tiles leave the game.** They are not returned to the bag, so the bag and the others' draws don't change.
  - A seat the host frees with **Remove** mid-game keeps its turns, which time out and pass, as today in 2-player rooms *(my call)*.
- **Ties lower down** (e.g. 2nd and 3rd on the same score) share a place on the result screen. They don't matter for points.

### Screens (the user's mockup picks)

- **Score bar, 3–4 players: B, one row in seat order.** One column per seat (team chip, player name, score). The column on turn is highlighted, the match clock sits above the row, and names shorten with "…" on a phone. 3 players means 3 wider columns. The seats stay in a fixed order and the highlight moves. 2-player rooms keep today's bar.
- **Who goes first, 3–4 players: A, roulette wheel.** After a "4-WAY" (or "3-WAY") intro showing all the team names, a wheel with one slice per seat in the seat colours spins, slows under a pointer, and lands on the first player: "**<TEAM> GOES FIRST!**". This replaces the VS screen and coin toss **only** in 3–4 player rooms.
- **Result, 3–4 players: A, podium.** The gold winner hero stays as today. Other seated players see the calm blue "well played" version, and spectators the neutral one. Below it is a **podium** for 1st, 2nd and 3rd, then a line for 4th. Tied places share a step. Best word and reason line as today.
  - Order *(my call)*: the **recorded winner is always 1st**, even when Award win, Correct result or a host decision picked someone without the top score. The rest are ordered by score. Players who **left** (resigned) come after the players who stayed, with a small "left" tag.
  - A **walkover** (no game played) shows only the winner hero, with no podium.

## My calls (the user saw these in the playback and approved them)

- **Seat colours:** A blue and B red (as today), **C green, D yellow with dark text**. Use the existing tokens (`--blue`/`--sky`, `--red`, `--green`, `--yellow`) and the contrast rule. Every chip and badge must meet WCAG AA in both themes.
- **New-room form:** a **Players: 2 · 3 · 4** choice, then one team dropdown per seat. A team chosen in one seat is disabled in the others, and Create is refused (in the UI and in `Match.createRoom`) unless every seat has a different team. Match length options are unchanged.
- **Lobby:** players claim any free seat (A–D, up to the room's size). The host can start once **every seat** is filled and ready.
- **Intro length:** 3–4 player rooms get a longer intro (about **2 s longer** than `INTRO_MS`, 6500) for the team intro plus the wheel. The first turn's clock waits for it, as today. The result line must stay on screen **at least 2 s** before the clocks start, the same rule as the coin (`Scenes.COIN_RESULT_AT`).
- **Same result on every screen:** the first seat is chosen once in `Match.startMatch` (stored in `game.firstSeat`, as today), and the wheel animation is made to land on that stored seat. Every client and the projector play the same spin from the same data. No client picks its own result.
- **Host controls for every seat:** pause/resume, appeals, fair-play warnings and Remove work per seat.
  - **Award win:** the host picks the winning seat from a list.
  - **Walkover** (before the start): the host picks the winner, and the others lose.
  - **Correct result** (after the end): in 3–4 player rooms the host **picks the new winner** from a list. 2-player rooms keep today's swap.
- **Projector:** the same one-row bar at broadcast scale, the wheel, the podium, the whose-turn ribbon and celebrations for any seat, and taunts on the sender's column. The auto-director's choices don't depend on room size.
- **Dashboard room cards and room lists:** show all the teams ("NCR vs CAR vs IV-A vs BARMM", shortened with "…" as needed) and "+1 <winner>" when final.

## Constraints

- Everything in CLAUDE.md applies:
  - Firebase **v8** API.
  - **Every room write is a `Store.mutateRoom` transaction around a pure `Match` function**, with guards (status, turn, `moveCount`, `turnStartedAt`, `result === null`) so automatic transitions are idempotent and **results are recorded exactly once**.
  - Never write `undefined` or arrays with `null`.
  - Always read through `Match.normalizeRoom`.
  - User strings go through `UI.escapeHtml` and are shown with `Names.short`.
  - Contrast AA in both themes.
  - `prefers-reduced-motion`: the wheel becomes a simple fade to the result, with the same information.
- **Rule logic is test-first** (`superpowers:test-driven-development`) in `match.js` and the other pure modules.
- **Backward compatibility:** a room without a size field is a 2-player room. Existing `teamA`/`teamB`/`teamAName`/`teamBName`, `seats.A/B`, `scores.A/B`, `racks.A/B`, `result.scoreA/scoreB`, `fairPlay`, `taunts` and `presence` values keep their meaning. Seats C and D extend the same shape. Old rooms in the data must still render, count in the standings, and accept host actions.
- **Phones (360px):** the one-row bar fits four columns without horizontal scroll. The wheel and podium fit the phone stage. The desktop landscape `.live-panel` (420px) fits four columns.
- **Automatic transitions** (turn timeout → pass, time-up → result or sudden death) are attempted by seated players and the host, never spectators, as today. With 3–4 seats, any seated player's or the host's ticker may perform them, and the guards make that safe.

## Edge cases the plan must cover

- **Players, spectators, the host:** every role sees the same turn, the same wheel result and the same podium. Spectators and out players never get turn controls.
- **Several clients writing at once:** 3–4 seated players plus the host may all try the same timeout or time-up. Exactly one wins, and the rest are rejected by guards. A taunt racing a play never loses the move (as today).
- **Refresh or disconnect mid-turn:** the player gets their seat back (`scrabble.seat.<CODE>`). If they're away on their turn, the turn clock runs out and the turn passes, then rotation continues. Refreshing during the intro or the wheel doesn't replay or change the result.
- **The host window closed:** the game continues, and players' tickers run the automatic transitions. A sudden death that ends in `hostDecision` waits for the host, as today.
- **Phone width (360px)** for the bar, lobby seat buttons, wheel, podium and host form.
- **Resigning in 3–4 player rooms:** the turn holder resigns (the turn moves on); a non-turn player resigns; resigns until one player is left (that player wins); a resign during sudden death.
- **Out players during sudden death** can't act. Their clocks never run, and they're skipped by rotation and by timeouts.
- **Bag running out** with 3–4 racks (28 tiles dealt at the start of a 4-player room).
- **Old 2-player rooms** with none of the new fields.

## Left to the builder

- The data shape for room size, seats C/D, "out" seats and sudden-death participants, provided the backward-compatibility rule above holds and every field is set (never `undefined`).
- How `Match` generalises seat handling (a seat list per room, the next active seat, the leader among a set of seats). The exact intro timings within the constraints above. The wheel's drawing technique (CSS/SVG). How the podium handles 3 players and shared places.
- Splitting the work into tasks and PRs. A sensible order is rules first, then the lobby/host form, the game screen, the intro, the results and the projector.

## Handoff (infrastructure, one line)

If the Firebase rules validate room shape (seats A/B only, `teamA`/`teamB` only), DevOps will need to allow seats C/D and the new fields before 3–4 player rooms can be written.
