# Batch 5: emoji taunts and easier celebrations — design

Feature request #11 (emoji taunts), plus a tuning change to the celebration tiers. Mockup: `.superpowers/brainstorm/…/taunts-and-tiers.html` (option **B** chosen). Branch: `feat/emoji-taunts`.

## Why

- **Taunts:** the two players sit apart (often in different rooms), and the game has no way to react to each other. Three playful, animated emojis let them tease each other live, and the audience on the big screen gets to see it. This is a sportsfest: it's meant to be fun.
- **Easier tiers:** with the current thresholds (15 / 25 / 40 / 60), casual players rarely see anything above "Not Bad!". The user wants players to hit the tiers often and feel satisfied.

## Goals

1. **Three taunts, our own:** **Angry**, **LOL** and **Crying**. They're animated faces drawn in code (inline SVG + CSS animation), with no GIF or image files and no third-party emoji art. They move the whole time they're on screen.
2. **Spammable, with a 10 s cooldown per player.** After a player sends any taunt, that player can't send another for 10 s.
3. **Live only (the user's rule):** no history, no log, nothing replayed. A refresh or a late join shows no old taunt. The room only ever holds each seat's *latest* taunt, overwritten by the next one.
4. **Everyone in the room sees it:** the other player, the sender (as confirmation), spectators, the host's room view and the big screen (for the room on screen).
5. **Easier celebration tiers:** `Not Bad!` 8+, `Cool!` 15+, `Awesome!` 25+, `IMPOSSIBLE!!!` 40+, and any bingo is still always `IMPOSSIBLE!!!`. Plays under 8 keep the small "+N" float.

## Non-goals

- No chat, no typed messages, no other emojis, no sound for taunts (the sound effects stay as they are).
- No taunt history, counters or statistics.
- Spectators and the host can't send taunts: only the two seated players.
- No change to how celebrations look or how long each tier lasts (`CELEBRATE_MS` stays `[1000, 2600, 2600, 3000, 4500]`).

## Anti-goals (a failure even if it "works")

- A taunt that **blocks play**: covering the rack, the action buttons or the board for taps, or delaying a turn clock.
- A taunt **replaying** after a refresh, or showing up again later.
- Taunts that let a client write anything else in the room (scores, racks, turn), or that break a move by racing with it.
- The name of any app or game the idea came from appearing anywhere in the repo. (The name isn't written here on purpose; it's checked before the PR.)

## How it works (decided)

### Sending (option B from the mockup)

- A small round **😀 button** joins the action row (`Play word · Recall · Pass · 😀 · ⋯`), on phones and on desktop alike. Recall may show only its icon on narrow phones so the row still fits at 360px.
- Tapping 😀 opens a small pop-up above it with the three faces. Tapping a face sends it and closes the pop-up. Tapping outside, or 😀 again, closes it without sending.
- During the cooldown, the 😀 button is greyed and shows the seconds left (a small yellow badge, as in the mockup), and the pop-up doesn't open.
- The button shows only for a seated player, and only while the game screen is up and the VS intro is over (`live`, `suddenDeath`, `hostDecision`, paused or in an appeal). It's hidden in the lobby, on the result screen, for spectators and for the host.
- It works whether or not it's your turn.

### Data and writes

- Stored inside the room: `rooms/<CODE>/taunts/<A|B>: { e: 'angry' | 'lol' | 'cry', at }`. There's one entry per seat, overwritten by the next taunt, so the room never grows.
- The write goes through the core rule: `Store.mutateRoom(code, r => Match.taunt(r, seat, emoji, { now }))`.
- `Match.taunt` is a pure function with a unit test, like every other mutator. It returns `null` (rejected) unless:
  - the status is one of `live`, `suddenDeath`, `hostDecision`, and the VS intro is over (`now >= clock.startedAt`; my call, builder check);
  - the seat is `A` or `B`;
  - the emoji is one of the three ids;
  - and the seat's previous taunt is at least 10 s old (`TAUNT_COOLDOWN_MS = 10000`).
- The cooldown is checked in the transaction too, not only in the button, so two quick taps from one device, or two devices on one seat, can't beat it.
- A taunt's transaction can run at the same moment as a play or pass. `mutateRoom` already handles that: the transaction re-runs on fresh data, and `Match.taunt` touches only `taunts`, so a move is never lost. A taunt that fails just doesn't show; no toast.

### Showing it

- Every room view (players, spectators, host) shows a taunt when it **arrives**: `taunts.<seat>.at` is newer than the last one this view saw. The first render after loading the room only sets the baseline, so a refresh or late join shows nothing (the same rule as the celebrations).
- **Window:** a taunt older than 3 s when it arrives (a slow connection) is skipped.
- **Look:** the face pops out of the **sender's side of the score bar**, wiggles in its own animation for about **2.5 s**, then fades. A small name tag shows who sent it. It never takes taps (`pointer-events: none`) and sits under the celebration overlays.
- **Size and place (my call, builder check):** the face sits **on the score bar**, centred on the sender's name and score, at about 1.5× the bar's height (about 56px on a phone). It may hang a little below the bar, but it never covers the rack or the action row, and covers at most the board's top edge. Otherwise an opponent could hide part of my board for a quarter of my turn, every 10 s. In the desktop layout the same applies to the score bar in the right-hand panel: it stays off the pill, the rack and the buttons.
- Both seats can show a taunt at the same time, one on each side. A new taunt from the same seat replaces that seat's current one.
- **Big screen:** shown only for the room on screen, bigger, under the sender's team name in the top bar, and only on the normal room view: never over the intro, round-start or winner scenes (my call, builder check). Taunts from other rooms are ignored: never a corner card or a cut.
- **Reduced motion:** the face fades in and out without shaking or bouncing; the information is the same.
- **Screen readers:** a polite status line, e.g. "Maria: LOL".

### Easier tiers

- `ScrabbleEngine.celebrationTier(total, bingo)`: 4 if bingo or total ≥ 40; 3 if ≥ 25; 2 if ≥ 15; 1 if ≥ 8; otherwise 0.
- Everything that uses tiers follows from that one function:
  - the celebrations;
  - the turn delay (`CELEBRATE_MS[tier]`);
  - the big screen's highlight cut (Awesome! and up, so now at 25+);
  - the last-move tier chip.
- Rooms already in progress pick up the new tiers from their next play.
- **Accepted trade-off:** the match clock keeps running during celebrations, so with more of them a 5-minute match fits a few fewer moves. The big screen cuts to rooms more often.

## Edge cases

- **Players, spectators, host:** only seated players send; all room viewers and the big screen show.
- **Several clients writing at once:** each taunt is a transaction around `Match.taunt`, so a play and a taunt at the same moment both land. The cooldown is enforced in the transaction.
- **Refresh or disconnect mid-turn:** after a reload the cooldown follows the room data (the last `at` for my seat), so a refresh doesn't reset it. No old taunt replays.
- **Host window closed:** taunts don't depend on the host.
- **Phone width (360px):** the action row with 😀 must fit on one line. The pop-up must stay on screen, and so must the floating face.

## Left to the builder

- The exact SVG drawings and keyframes. Follow the mockup's look: Angry is an orange-red face that shakes with steam puffs; LOL is a yellow face rocking with tears squirting; Crying is a yellow face sobbing with tear streams.
- Exact sizes, the name tag style and the pop-up style. Use the theme tokens and meet WCAG AA in both themes.
- Where the pure helpers live (for example `Taunt.due(...)` / a `taunt.js` module or inside `match.js` + `pill.js`), as long as the rules above have unit tests.
