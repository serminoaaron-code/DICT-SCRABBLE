# Turn moments (#10, #3, #4): design

**Date:** 2026-11-02 · **Status:** approved in chat · **Mockups:** `.superpowers/brainstorm/785-1793598618/content/turn-moments.html` (picks 10A, 3A, 4A)

## Why

A move currently lands abruptly. The new tiles just appear, the rack silently has new letters, and the only sign that the turn has passed is the small pill changing. Players asked for three game-feel moments after every move. They run in a fixed order and never cost anyone turn time.

## The three moments

**#10: the word drops in (pick A).**
- When a play arrives from the other seat, each newly placed tile drops onto its square from above with a small bounce, about 0.12 s apart.
- A yellow glow then sweeps along the word.
- About 0.7 s in total (`DROP_MS`, below).
- Shown to the opponent, spectators, the host in the room view, and the projector (featured room).
- **Not** shown to the player who made the play: they placed the tiles themselves.

**#3: the rack refills (pick A).**
- On the screen of the player who just played, only the rack slots their play used get new tiles.
- Each new tile flies out of a tile-bag icon by the rack face-down and flips face-up into its slot, staggered.
- About 0.9 s in total.
- It plays while the celebration plays.
- Nobody else sees racks, so nobody else sees this.

**#4: whose turn it is (pick A, ribbon).**
- When the turn passes, a band sweeps across the middle of the screen and away, in about 1.2 s:
  - **The player whose turn it now is:** a green band, **"YOUR TURN!"**.
  - **The player who just moved:** a navy band, **"<NAME>'S TURN"**, using the opponent's player name (or team name when there is no player name) through `Names.short` (25 characters + "…").
  - **Spectators and the host:** a navy band, **"<TEAM>'S TURN"**.
  - **The projector:** the same band at broadcast size for the featured room only.
- The ribbon plays after a pass and after a turn timeout too, with no drop or celebration before it.
- The existing pill pop, "turn" sound and vibration happen at the same moment as the ribbon.

## The order, and turn time

After a play: **drop (#10) → the existing celebration (any tier, including the tier-0 "+N" float) → ribbon (#4)**.

The next player's turn clock starts when the ribbon starts:
- `Match.applyPlay` already delays the next `turnStartedAt` by `CELEBRATE_MS[tier]`.
- It now delays it by `DROP_MS + CELEBRATE_MS[tier]`, with a new constant `Match.DROP_MS` (700). This is a rules-level timing change, so it gets unit tests.
- A play that ends the game (bag out, last sudden-death move) has no next turn: the drop and celebration play over the result as today, and there is no ribbon.

On the screen that celebrates (opponent, spectators, host, projector), the celebration starts after `DROP_MS`.

The projector director's highlight scene must account for the drop. Today it is `HIGHLIGHT_PAD_MS + CELEBRATE_MS[tier]`, and it gets the extra `DROP_MS`, so a highlight never cuts away mid-celebration.

The player who just played sees no drop. Their celebration starts at once, as today, and their "Juan's turn" ribbon plays when the opponent's clock starts. That is `DROP_MS + CELEBRATE_MS[tier]` after the play on every screen, so everyone sees the ribbon at the same moment, give or take network delay.

## Decisions from the builder check (our calls)

1. **Small plays (tier 0) also get their time.** The "+N" float lasts about 1 s, but `CELEBRATE_MS[0]` is 0 today, so the ribbon and the clock would start in the middle of the float.
   - `Match.CELEBRATE_MS[0]` becomes **1000**, so the next clock starts `DROP_MS + 1000` (1.7 s) after a small play. This is a rules timing change, with tests.
   - The result-screen delay for a game-ending small play uses the same value.
2. **When the ribbon fires.**
   - On every screen the ribbon fires when the room's `turnStartedAt` (server time) is reached for a new turn. On the opponent's screen it may overlap the last moment of the celebration by the network delay, which is fine.
   - "Once" is keyed by **`turn` + `turnStartedAt`**, not by `moveCount` alone, so entering sudden death (which doesn't change `moveCount`) also gets a ribbon.
   - The ribbon's text depends only on `game.turn`: "YOUR TURN!" for that seat, otherwise "<NAME>'S TURN". If the bag running out on a tie hands the turn back to the player who just moved, they correctly see "YOUR TURN!".
   - When the room has just entered sudden death, the ribbon carries a small "⚡ SUDDEN DEATH" line above the main text.
3. **The refill keeps your tiles where they are (on your device only).**
   - After your play, the unused tiles stay in their current places, including a Shuffle or drag order, and the drawn tiles go into the emptied slots.
   - This changes `Rack.sync`, which today resets the order whenever the letters change: it now maps the old order onto the new rack.
   - The server rack is unchanged. A refresh or another device shows the server order.
4. **Projector.**
   - The drop plays only for the featured room, when the move arrives.
   - A highlight that cuts in later from another room, or plays late from the queue, shows the board as it is (no replayed drop), then the celebration.
   - The ribbon plays only when the featured room's new turn starts while no highlight or other scene is running. A late ribbon is skipped, not queued.
   - For tier 0–2 moves on the featured room: the drop, then the ribbon at `turnStartedAt`.
   - The director's highlight length gets `DROP_MS` only when the drop actually plays in that scene, that is, a highlight for the room already featured.

## Rules that must hold

- **Blocking:** nothing blocks the board except the celebration overlay that exists today. The drop and the ribbon never stop a tap or drag (`pointer-events: none`). The opponent may act as soon as their clock starts.
- **Once only:** each moment plays once per move (`moveCount`). Re-renders (every room update redraws the board and rack), presence changes and celebrations must not replay or cut short a drop, refill or ribbon.
- **Refresh and late join:** a refresh, a late join or a spectator arriving mid-game plays nothing for moves that happened before. This is the same baseline rule as `Celebrate.detect`.
- **Overlap:** a second move arriving while a moment is still playing finishes or skips the old moment cleanly. Nothing is left on screen and nothing is stuck.
- **Paused and appeals:** a host pause or an appeal never shows a ribbon. The ribbon plays when the turn really passes. A host Resume that restarts the clock doesn't count as a pass.
- **Reduced motion:** no drop, flip, slide or sweep. Tiles simply appear, the ribbon is a short fade-in and fade-out card, and its sound and vibration stay as today.
- **Layouts:** phone (360px) and desktop landscape both look right. On the board the drop and glow follow the board's size.
- **Contrast:** AA in both themes. Green band with navy text, navy band with white text.
- **Names:** names in the ribbon go through `Names.short` and stay on one line.

## Non-goals

- No change to scoring, rules or what anyone may do. The only rules change is the extra `DROP_MS` before the next turn clock.
- No new sounds. The ribbon reuses the existing "turn" sound and vibration, and the drop reuses the "place" sound once at most.
- The lobby, result screen and host dashboard are unchanged.

## Left to the builder

- Exact easing, bounce and glow look within the timings above, following the mockups.
- Where the tile-bag icon sits next to the rack, in both layouts.
- How "once per move" is tracked. A `moveCount` key in the view's `ui` state is the obvious way.
- Whether the drop animates the real tiles after a render, or a temporary copy layer over the board.
