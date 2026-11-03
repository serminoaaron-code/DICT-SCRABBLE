# Fixed bugs: QA re-test list

Every bug we've fixed is listed here with steps to **try to make it happen again**. During playtesting, QA follows the steps and records whether the bug is still gone.

- **If you can still trigger a bug:** mark it ❌, write down exactly what you did and on which device, and report it.
- **For a new bug:** once it's fixed, add an entry using the template at the end.

## Before you start

- **Use the local playground**, never the real tournament data:
  1. On a laptop, open the project folder and run `python -m http.server 8000`.
  2. The host opens `http://localhost:8000/#host` (password `1101`).
  3. Other devices on the same Wi-Fi open `http://<laptop-IP>:8000/`. Find the IP with `ipconfig`.
  4. Every screen must show the yellow **🧪 PLAYGROUND** banner.
- **Each player needs a separate browser identity:**
  - a normal Chrome window,
  - Chrome Incognito,
  - Edge,
  - or a phone.
  
  Two normal tabs in the same browser count as the **same** player.
- **Setup used by most steps:** add teams `QA-A` and `QA-B`, create a room with a **custom 2–3 minute** length, join one player per team, press **I'm ready** in both, then **Start**.
- When you're done, press **Reset playground** in the yellow banner.

**Result marks:** ✅ could not trigger the bug · ❌ bug came back · ⚠️ partly / unsure (add a note).

---

## Seats, joining and devices

### BF-01: Player can't get back into a game after switching devices
- **Area:** joining · **Fixed in:** PR #2 · **Found by:** code review
- **Used to happen:** if a player's phone died, or they reopened the link on another device mid-game, they could only watch. Their seat stayed taken, and the host could only award the win or void the room.
- **Try to trigger it:**
  1. Start a game: Player A on device 1, Player B on device 2.
  2. On a **third** device or browser, open the site and enter the room code.
  3. As the host, open the room and press **Free <Player A>'s seat**.
  4. On the third device, press **Take QA-A's seat**.
- **Expected now:** the third device takes over seat A with **the same tiles and score**, and the game continues.

### BF-02: "Just watch" could not be undone
- **Area:** joining · **Fixed in:** PR #2 · **Found by:** code review
- **Used to happen:** after tapping **Just watch**, that device could never take a seat in that room again.
- **Try to trigger it:**
  1. Join a room that is still waiting, and tap **Just watch**.
  2. Tap **Stop watching / take a seat**.
- **Expected now:** the seat buttons come back, and you can play for a team.

### BF-03: Old device silently takes back a freed seat
- **Area:** joining · **Fixed in:** PR #3 · **Found by:** code review
- **Used to happen:** after the host freed a player's seat, reopening the room link on the player's **old** device put them straight back in the seat, possibly before their new device got there.
- **Try to trigger it:**
  1. Start a game.
  2. On Player A's device, go to **Home**.
  3. As the host, press **Free <Player A>'s seat**.
  4. On Player A's old device, open the room link again.
- **Expected now:** the old device shows the message "Your seat was freed…" and a **Take QA-A's seat** button. It does **not** go back into the seat on its own.

### BF-04: "Leave seat" right as the host presses Start
- **Area:** lobby · **Fixed in:** PR #3 · **Found by:** code review
- **Used to happen:** a player tapping **Leave seat** at the same moment the host pressed **Start** could leave an empty seat in a running game.
- **Try to trigger it:**
  1. Both players press **I'm ready**.
  2. The host presses **Start** and Player A presses **Leave seat** as close to the same moment as possible. Try several times.
- **Expected now:** either the game starts with both players seated, or Player A leaves *before* the start and **Start** is disabled again. You should never see a running game with an empty seat.

### BF-05: Refreshing during a game loses your seat
- **Area:** joining · **Fixed in:** PR #2 (rebuild) · **Found by:** first scan of the old app
- **Used to happen:** in the old app, a refresh after registration closed locked the player out.
- **Try to trigger it:**
  1. During a live game, refresh Player A's page.
  2. Then close the tab entirely and reopen the room link on the same device.
- **Expected now:** both times, Player A is back in seat A with the same tiles, and it's still their turn if it was.

### BF-19: Long player name breaks the lobby seat row
- **Area:** lobby · **Fixed in:** `feat/ui-revamp` (QA pass #1) · **Found by:** QA pass #1
- **Used to happen:** in the room lobby, a long player name wrapped onto several lines and pushed the team chip, the **Ready** badge and the host's **Remove** button onto new lines.
- **Try to trigger it:**
  1. Add a team with a long name (about 40 characters).
  2. Join its seat with a 40-character player name, e.g. `MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM`, on a phone (or a 360px-wide window).
  3. Look at the lobby as that player and as the host.
- **Expected now:** each seat row stays on one line. The long name (and a long team chip) ends in "…", while "(you)", the **Ready / Not ready** badge and **Remove** stay whole. Hovering the name on a laptop shows the full name.

---

## Host dashboard and results

### BF-06: Time-up not recorded when only the host dashboard is open
- **Area:** results · **Fixed in:** PR #2 · **Found by:** code review
- **Used to happen:** if both players' screens were off or closed when the clock reached 0:00, the room stayed "Live 0:00" until someone opened it.
- **Try to trigger it:**
  1. Start a **1-minute** game.
  2. Close both players' tabs, or lock both phones.
  3. Leave the host on the **dashboard**, not in the room.
- **Expected now:** when time runs out, the room card switches to **Final · +1 …** by itself, and the standings update.

### BF-07: Corrections and voids lose the reason
- **Area:** results · **Fixed in:** PR #3 · **Found by:** code review
- **Used to happen:** correcting a result replaced the original reason, and voiding stored no reason at all.
- **Try to trigger it:**
  1. Finish a game.
  2. On the dashboard, press **Correct result**, type a reason, and confirm.
  3. Press **Void**, type a reason, and confirm.
- **Expected now:**
  - After **Correct result**, the card shows "corrected by host: <your reason>".
  - After **Void**, the card shows "Void: <your reason>", and the players' result screen shows the reason too.

### BF-08: A host button click silently does nothing
- **Area:** host controls · **Fixed in:** PR #3 · **Found by:** automated testing
- **Used to happen:** very rarely, a host action (Approve, Deny, Award, Void, Pause) was dropped without any message, when the host's device saved something else at the same moment. It needs a player to be reconnecting or moving at that exact moment, so it's hard to trigger on purpose.
- **Try to trigger it:**
  1. During a game, have a player turn airplane mode on and off repeatedly.
  2. While they do, the host clicks **Pause** / **Resume** and other buttons quickly.
- **Expected now:** every click either takes effect, or shows "That action is no longer possible (the room changed)." A click should never do nothing and show nothing.

### BF-09: Reset leaves a broken room that freezes the host's room list
- **Area:** dashboard · **Fixed in:** PR #2 · **Found by:** code review
- **Used to happen:** after a reset, a phone that still had a room open could recreate a broken room when it reconnected. The host's room list then stopped updating.
- **Try to trigger it:**
  1. Open a room on a phone.
  2. On the host laptop, press **Reset playground**.
  3. On the phone, turn airplane mode on, wait 5 s, then turn it off.
  4. As the host, create a new room.
- **Expected now:** the new room appears on the dashboard, no old or empty room shows up, and the list keeps updating.

### BF-10: Standings only visible to the host
- **Area:** standings · **Fixed in:** PR #2 · **Found by:** code review
- **Used to happen:** players and spectators couldn't see the team standings.
- **Try to trigger it:**
  1. Open the home (join) page.
  2. Finish a game and look at the result screen.
- **Expected now:** both show a **🏆 Team standings** table that updates live.

### BF-11: Team rename not shown inside rooms
- **Area:** rooms · **Fixed in:** PR #3 · **Found by:** code review
- **Used to happen:** after the host renamed a team, room screens kept showing the old name.
- **Try to trigger it:**
  1. With a room open on a player's screen (lobby or live game), rename **QA-A** on the dashboard.
- **Expected now:** the player's room screen shows the new name within a second or two. The result screen does too.

---

## Links and loading

### BF-12: Pasted room link with extra characters shows a blank page
- **Area:** links · **Fixed in:** PR #2 · **Found by:** code review
- **Used to happen:** a link copied from chat with trailing punctuation (`…#room=K7Q42M.`) or a broken character showed a blank page.
- **Try to trigger it:** open these, replacing the code with a real one:
  1. `http://<host>:8000/#room=K7Q42M.`
  2. `http://<host>:8000/#room=(k7q-42m)!`
  3. `http://<host>:8000/#room=%E0%A4%A`
- **Expected now:**
  - Links 1 and 2 open the room.
  - Link 3 shows the join page.
  - None of them shows a blank page.

### BF-13: Blank screen while a room is loading
- **Area:** loading · **Fixed in:** PR #3 · **Found by:** code review
- **Used to happen:** on a slow connection, the room page stayed blank, or kept showing the previous page, until the data arrived.
- **Try to trigger it:**
  1. In Chrome, press F12 to open DevTools, go to the **Network** tab, and set throttling to **Slow 3G**.
  2. Open a room link.
- **Expected now:** "Loading room…" shows immediately, then the room appears.

### BF-14: Screen breaks when a game ends within 3 seconds
- **Area:** live game · **Fixed in:** PR #2 · **Found by:** automated testing
- **Used to happen:** if a game ended within 3 seconds of Start, the coin-toss message tried to update a screen that was already gone. That caused an error and could leave the screen stuck.
- **Try to trigger it:**
  1. The host presses **Start**.
  2. Within 1–2 seconds, a player presses **Resign** and confirms.
- **Expected now:** the result screen shows normally on every device. *(Optional: no red errors in the F12 Console.)*

### BF-20: Coin toss result disappears before you can read who goes first
- **Area:** live game · **Fixed in:** `feat/ui-revamp` (QA pass #1) · **Found by:** QA pass #1
- **Used to happen:** after **Start**, the VS intro and the coin flip played, but "<TEAM> GOES FIRST!" popped up only about half a second before the whole scene faded away, so players couldn't see who goes first.
- **Try to trigger it:**
  1. Set up a room, get both players ready, and have the host press **Start**.
  2. Watch the intro on both players and the host without pressing **Skip**.
- **Expected now:** the coin lands and "<TEAM> GOES FIRST!" stays on screen for about 2 seconds on every device before the board appears. The first player's turn clock starts only after that, about 6.5 seconds after **Start**. The caption under the turn pill names the same team.

### BF-21: "AWESOME!" word looks dark instead of bright yellow
- **Area:** live game · **Fixed in:** `feat/drag-drop` (QA pass, 2026-11-02) · **Found by:** QA pass
- **Used to happen:** when a word scored 40–59 points, the big "AWESOME!" title appeared with its dark brown shadow painted over the yellow letters, so the word looked dark. It was most noticeable on laptops, where the celebration is drawn larger.
- **Try to trigger it:**
  1. Play a word worth 40 to 59 points, or have the host test it in the playground.
  2. Watch "AWESOME!" on a laptop, a phone and the projector, in both light and dark mode.
- **Expected now:** the letters are bright yellow with a brown outline and shadow behind them, and the shine still sweeps across. With reduced motion turned on, a calm yellow card shows instead.

### BF-22: Long team or player names break pages and make phones zoom out
- **Area:** all pages · **Fixed in:** `feat/drag-drop` (QA pass, 2026-11-02) · **Found by:** QA pass
- **Used to happen:** a long name with no spaces (e.g. `TEST-wwwwwwwwwwwwwwwwwwwwww`) pushed pages wider than the screen. On phones the browser then zoomed out and everything became tiny. Team chips ran off the screen, "Play for …" buttons spilled over, the host's team dropdowns stretched the dashboard, and the intro and result screens filled up with long wrapped names.
- **Try to trigger it:**
  1. Add two teams with 40-character names without spaces, and join with 40-character player names.
  2. On a phone, and on a laptop, open each of these in turn: the host dashboard (Teams, New room, room tabs, Standings), the seat choice after typing the code, the lobby, the VS intro, the game, and the result screen for winner, other player and host.
- **Expected now:**
  - Every team and player name shows at most **25 characters, then "…"**, on one line, everywhere: chips, buttons, the team list, standings, the score bar, the intro and coin, the result screens and the projector (the ticker included).
  - On a narrow phone a name can be cut a little earlier to fit.
  - Hovering a cut name on a laptop shows the full name.
  - Nothing is wider than the screen and phones never zoom out.
  - Short labels stay whole: "Rename", "Void", "RANK", "W-L", "1-0", and the projector's "LIVE".
  - The full names are still saved: renaming and standings are unaffected.

---

### BF-27: A deleted room comes back as an empty "ghost" in the database
- **Area:** host controls · **Fixed in:** the ghost-presence PR · **Found by:** code review during the UI revamp
- **Used to happen:** when the host deleted or reset a room while a player or spectator was briefly offline, that device wrote its "I'm here" marker back when it reconnected. That left an empty room entry in the database. Nobody could see it, but it was clutter.
- **Try to trigger it** (needs someone who can read the playground data, e.g. the developer):
  1. Start a game with two players and a spectator.
  2. Turn the spectator's Wi-Fi off (or put the phone in airplane mode).
  3. The host presses **Reset playground** (or deletes the room).
  4. Turn the spectator's Wi-Fi back on and wait a few seconds.
- **Expected now:** the spectator sees "Room not found", and the room is gone from the data for good: no empty entry with only "presence" in it.

### BF-28: Polish pass: small glitches from the feature batches
- **Area:** live game / host / big screen · **Fixed in:** the polish-pass PR · **Found by:** the final code reviews of batches 1–5
- **Used to happen** (the most visible ones):
  - spectators and the host had an empty gap under the board;
  - on a laptop, "✕ Skip" and "⏸ Paused" sat in the window's corner instead of on the board;
  - while dragging a tile, the green target ring vanished when the board refreshed;
  - pressing Play while dragging a placed tile played it at its old square;
  - the ⋯ menu and the 😀 pop-up could be open at the same time;
  - "? Bonuses" was hard to tap on a phone, and the Bonuses card didn't move keyboard focus.
- **Try to trigger it:**
  1. Join as a spectator: there's no empty gap under the board.
  2. On a laptop, play a big word (e.g. Awesome!): "✕ Skip" sits in the top-right corner of the board.
  3. On a phone, start dragging one of your placed tiles while the other player moves: the green ring stays. Press Play mid-drag: nothing is played.
  4. Open ⋯, then 😀 (and the other way round): only one stays open.
  5. Tap just above or below "? Bonuses": it still opens. With a keyboard, open it with Enter: focus is on ✕; Tab stays inside; Escape closes it and focus returns to "? Bonuses".
- **Expected now:** all of the above, with nothing else looking or working differently.

### BF-29: Keyboard focus, second-finger Play, pager focus and small jumps
- **Area:** live game / host · **Fixed in:** the How-to-play PR · **Found by:** the polish-pass review
- **Used to happen:**
  - with a keyboard, you couldn't see which button was focused;
  - a second finger landing on Play while you dragged a tile could play the word;
  - on the host's Finished/Void pages, pressing Next to the last page lost your place;
  - closing the "? Bonuses" card could jump the page up;
  - while dragging a rack tile, the gap jiggled each time the other player moved.
- **Try to trigger it:**
  1. On a laptop, press **Tab** a few times in a game: a clear ring shows on the focused button (navy in the light theme, yellow in the dark). Clicking with the mouse shows no ring.
  2. On a phone, drag one of your placed tiles and touch **Play word** with a second finger: nothing is played.
  3. As host, with more than 5 finished rooms, use Tab and Enter on "›": focus stays on the page buttons.
  4. As a spectator on a phone, scroll down, open "? Bonuses" with a keyboard and close it: the page doesn't move.
- **Expected now:** all of the above.

## Turn moments and the big screen

### BF-23: "Whose turn" ribbon stuck on the left of a laptop screen
- **Area:** live game · **Fixed in:** the turn-moments PR · **Found by:** QA pass 1 (turn moments)
- **Used to happen:** on a laptop the "YOUR TURN!" / "<NAME>'S TURN" band was only part-width and pinned to the left edge. On a phone it sat above the middle of the board instead of across it.
- **Try to trigger it:**
  1. Start a game with one player on a laptop (full-screen browser) and one on a phone.
  2. Play a word, and watch both screens when the next player's clock starts.
  3. Open the same room as the host (Host dashboard → the room) and watch it there too.
- **Expected now:** on the laptop and the host's screen, the band sweeps across the board, through the board's middle. On the phone it crosses the whole screen width, through the middle of the board.

### BF-24: No "whose turn" ribbon after a Pass or a timeout
- **Area:** live game · **Fixed in:** the turn-moments PR · **Found by:** QA pass 1 (turn moments)
- **Used to happen:** the ribbon showed after a word was played, but never when a player pressed **Pass** or let their 1-minute turn run out, on the players' screens and in the host's room view.
- **Try to trigger it:**
  1. In a live game, the player whose turn it is presses **⏭ Pass** and confirms.
  2. Watch both players' screens and the host's room view.
  3. Then let the next player's turn clock run out without playing.
- **Expected now:** both times the ribbon shows straight away on every screen: "YOUR TURN!" for the next player, "<NAME>'S TURN" for the other player, and the team name for the host and spectators.

### BF-25: Bonus squares not labelled on the big screen
- **Area:** big screen · **Fixed in:** the turn-moments PR · **Found by:** QA pass 1 (turn moments)
- **Used to happen:** on `?view=scoreboard` (including a pinned room) the bonus squares were only coloured, with no 3W / 2W / 3L / 2L / ★, so the audience couldn't tell them apart.
- **Try to trigger it:**
  1. Open `http://localhost:8000/?view=scoreboard` on the projector or a big window.
  2. Pin a live room from the host dashboard.
  3. Switch the big screen between light and dark with its ☀️/🌙 button.
- **Expected now:** every bonus square shows its label, big enough to read from the back of the room, in both themes.

### BF-26: Opponent's name on the ribbon in the wrong (thin) font
- **Area:** live game · **Fixed in:** the turn-moments PR · **Found by:** checks while fixing BF-23
- **Used to happen:** "YOUR TURN!" used the heavy display font, but "<NAME>'S TURN" (other player, host, spectators) showed in the normal thin text font.
- **Try to trigger it:**
  1. Play a word, and look at the ribbon on the screen of the player who just played.
- **Expected now:** "<NAME>'S TURN" uses the same heavy display font as "YOUR TURN!". A very long name is cut with "…" and "'S TURN" stays readable, even on a phone.

### BF-31: No sound on iPhones (Safari and Brave)
- **Area:** live game · **Fixed in:** PR #18 · **Found by:** QA, iPhone (Safari and Brave)
- **Used to happen:** on an iPhone, the match music and the sound effects stayed silent while the phone was on silent (the side switch, or the Action button set to Silent). Every iPhone browser works this way, Brave included, because they all use Safari's engine. (The fix also lets a normal tap start the sound, for older Safari versions that ignore the touch types the game listened for.)
- **Before you start:** sound effects are **off on purpose** on a new device. Tap 🔇 in the header so it shows 🔊. 🎵 (music) is on unless it's greyed out. Turn the media volume up.
- **Try to trigger it:** on an iPhone (iOS 17 or later), in Safari and again in Brave:
  1. Put the phone on **silent**.
  2. Join a room, tap 🔇 so it shows 🔊, get ready, and let the host start the match.
  3. Once the game screen is up, tap a tile.
  4. Play a word.
  5. Do it again with the phone on **ring**.
- **Expected now:** the music starts with your first tap on the game screen, and you hear the tile clicks, the "your turn" beep and the word sounds, whether the phone is on silent or on ring. If you had music playing in another app, it pauses on your first tap once the game has sound to play (🔊 on, or the match music), as it does for a video, and stays paused while the game is open. A phone call in the middle of a match doesn't leave the game silent: the next tap brings the sound back. On an iPhone older than iOS 17, silent mode still mutes the game (Apple doesn't allow anything else there); on ring it plays after your first tap.

## Scrabble rules

### BF-15: Middle-row triple-word square in the wrong place
- **Area:** board · **Fixed in:** PR #2 · **Found by:** first scan of the old app
- **Used to happen:** the middle row was one square short, so its right-edge **3W** square was missing.
- **Try to trigger it:**
  1. Look at the middle row of the board, the one with the ★.
- **Expected now:** the row has **3W** at both ends, **2L** on the 4th square from each end, and ★ in the centre. The board is symmetrical.

### BF-16: Bad word placements accepted
- **Area:** rules · **Fixed in:** PR #2 · **Found by:** first scan of the old app
- **Used to happen:** the old app accepted a first word that missed the centre, words with gaps, and words not touching any other tiles.
- **Try to trigger it:** try each of these, then press **Play**:
  1. A first word that doesn't cover the ★.
  2. Two tiles with an empty square between them.
  3. After the first word, a word somewhere else on the board that doesn't touch any tiles.
  4. Tiles placed diagonally.
- **Expected now:** each one is refused with a clear message, the tiles stay on your rack, and it's still your turn.

### BF-17: Side words and existing letters not scored
- **Area:** scoring · **Fixed in:** PR #2 · **Found by:** first scan of the old app
- **Used to happen:**
  - letters already on the board didn't count toward a word,
  - side words weren't scored,
  - bonus squares under old tiles counted again.
- **Try to trigger it:**
  1. Play **CAT** across the ★. It should score **10**.
  2. Add an **S** at the end to make **CATS** (S on a plain square). It should score **6**: C3 + A1 + T1 + S1, and the ★ doesn't double again.
  3. Play a word that also forms a side word, and check both words appear in the "last move" line with their scores.
- **Expected now:** scores match the numbers above, and every word formed is listed.

### BF-18: Duplicate tiles (tile bag not shared)
- **Area:** rules · **Fixed in:** PR #2 · **Found by:** first scan of the old app
- **Used to happen:** each player drew from their own full bag, so tiles could appear more often than a real Scrabble set allows. There is only one Z, one Q, one X, one J and one K.
- **Try to trigger it:**
  1. Play a long game, or several.
  2. Watch for two **Z**, **Q**, **X**, **J** or **K** tiles in the same game, counting both racks and the board.
- **Expected now:** you never see more than one of each of those letters in a game.

### BF-30: Words spelled bottom to top shown backwards (YFIREV)
- **Area:** rules · **Fixed in:** PR #15 · **Found by:** QA, desktop
- **Used to happen:** a word spelled upward, from the bottom tile to the top (V at the bottom, Y at the top), was read top to bottom only. The log said "played **YFIREV**", and it only counted if the dictionary was slow or the host approved it on appeal.
- **Try to trigger it:** use a game where you can play these. Run them one at a time, in any order.
  1. **Left to right:** play **CAT** across. It's accepted and the log says "played CAT".
  2. **Top to bottom:** play **CAT** down, C at the top. It's accepted, "played CAT".
  3. **Bottom to top:** on an empty board, play **VERIFY** upward in the ★'s column so the column reads Y-F-I-R-E-V from the top, with **Y two squares above the ★** (so the **I** sits on the ★). It's accepted. The log, the projector and the best word say **VERIFY**. The tiles stay exactly where you put them, and it scores **30**: (4+4+1+1+1+4) × 2 for the ★. (Placed elsewhere, the score changes with the bonus squares under the tiles, as for any word.)
  4. **Right to left:** play **CAT** with C on the right, so the row reads T-A-C. It's refused: "TAC not found in the dictionary", with the hint "Words read left→right, top→bottom or bottom→top." No points, and it's still your turn.
  5. **Both ways:** play **STOP** down (S at the top). STOP reads down and POTS reads up, so the log says "played **STOP/POTS**". The points are counted once.
- **Expected now:** steps 1, 2, 3 and 5 score, step 4 doesn't, and every screen shows the real word. The How to play page (Player, "Make a word") mentions the three directions too.

---

## QA results log

Copy one row per bug you test. You can test several bugs in one session.

| Date | Tester | Bug ID | Device / browser | Result (✅ / ❌ / ⚠️) | Notes |
|---|---|---|---|---|---|
| | | | | | |

---

## Template for new fixed bugs

Add new bugs to the right section, using the next free number. Keep the steps simple enough for someone who has never seen the code.

```markdown
### BF-XX: <short name a tester would recognise>
- **Area:** <joining / lobby / live game / host controls / results / standings / rules / links> · **Fixed in:** PR #<n> · **Found by:** <who or how>
- **Used to happen:** <what the player or host saw, in plain words>
- **Try to trigger it:**
  1. <step>
  2. <step>
- **Expected now:** <what should happen instead>
```
