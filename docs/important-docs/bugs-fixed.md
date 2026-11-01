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

---

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
