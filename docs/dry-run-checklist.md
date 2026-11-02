# Dry-run checklist (Mon 2026-11-02 evening)

**Goal:** prove one full tournament evening works with real people on real devices before the event on Tue 2026-11-03.

**Who:** 3–4 people, plus a projector/TV if you have one handy.
- **Host:** a laptop.
- **Player A:** a laptop.
- **Player B:** a **phone**.
- **Spectator** (optional): any device, ideally pointed at a projector or a second screen for the broadcast checks in section 8.

**Before you start:**
- Run it from the **local playground**, so the real tournament data stays untouched:
  1. On the host laptop, in the project folder, run `python -m http.server 8000`.
  2. The host opens `http://localhost:8000/#host`.
  3. Everyone else on the same Wi-Fi opens `http://<host-laptop-IP>:8000/`. Find the IP with `ipconfig`, under "IPv4 Address".
  4. Every screen should show the yellow **🧪 PLAYGROUND** banner. If one doesn't, stop: that device is on real data.
- If Windows Firewall asks about Python, allow it on **Private** networks, so phones can connect.

Tick each box. If something fails, note what you did, what you saw, and on which device.

## 1. Host setup
- [ ] Open `…/#host`. A wrong password is refused, and `1101` opens the dashboard.
- [ ] Add teams `TEST-A` and `TEST-B`. Both show in **Standings** at 0-0.
- [ ] Try creating a room with the same team on both sides. It's blocked.
- [ ] Create **TEST-A vs TEST-B, custom 3 minutes**. A code like `K7Q-42M` appears. **Copy code** works.

## 2. Look and feel (dark mode, sound)
- [ ] On each device, tap the **☀️/🌙** switch in the header. The whole page (join page, dashboard) flips to dark and every bit of text stays easy to read — no washed-out or invisible labels on pills, chips, badges, buttons or cards.
- [ ] Refresh the page. The theme you picked is still there.
- [ ] Tap the **🔇/🔊** switch. It starts muted (🔇) on a device that's never turned it on. Turning it on shows 🔊 and survives a refresh.
- [ ] With sound on, play a few turns (section 4) and confirm you hear short tones for placing a tile, a word being accepted, and your turn starting — all quiet, none longer than a second or so.

## 3. Joining
- [ ] Player A: open the site, enter the code in **lowercase**, enter a name, then **Play for TEST-A**.
- [ ] Player B (phone): join with the code, then **Play for TEST-B**. The TEST-A button shows "taken by …".
- [ ] Spectator: join with the code, then **Just watch**. The host lobby shows "👁️ 1 watching".
- [ ] Player A **refreshes** the page. They're back in the TEST-A seat without doing anything.
- [ ] Host: **Remove** Player A. Player A sees the join buttons again and rejoins.

## 4. Start and play
- [ ] **Start match** stays disabled until both players press **I'm ready**.
- [ ] Host presses **Start**. All screens briefly show a **VS intro** (the two team names) followed by a **coin toss** animation, then "🪙 Coin toss: … goes first". The game only unlocks the first turn once the intro finishes (about 5 seconds) — the pill shows "Get ready" until then.
- [ ] A first word that doesn't cover the ★ is refused with a message.
- [ ] A real word across the ★ scores the same on every screen, and the rack refills to 7.
- [ ] That first play also fires a **word celebration** (a tier banner like "Cool!" or "Awesome!" with the score flying into the score bar) on the host, both players and the spectator at the same time. Score a bigger word later in the game and confirm a higher tier shows (bigger effects, more confetti), up to "IMPOSSIBLE!!!" for a 7-tile bingo.
- [ ] On the phone: tap a tile, then tap a square. Placing, Recall and Play all work. The celebration overlay doesn't block the board underneath, and its **✕ Skip** button dismisses it early.
- [ ] A made-up word shows "not found", with **Recall** and **Ask host**.
- [ ] **Ask host**: both clocks freeze, and the host sees the word with **Approve** / **Deny**.
  - [ ] **Approve** adds the score and passes the turn.
  - [ ] **Deny** returns the tiles and it's still the same player's turn.
- [ ] Leave a turn idle for 60 seconds. It passes automatically, and the last-move line says "ran out of time" once.

## 5. Host controls
- [ ] **Pause** freezes both clocks on every screen, and **Resume** continues from the same time.
- [ ] Player A switches to another app or tab. The host sees "⚠️ … left the screen 1×" in the room and on the dashboard card, and the game continues.
- [ ] Player B turns on airplane mode (or closes the tab). Everyone sees "… disconnected". Player B reconnects, and the notice disappears.

## 6. Ending
- [ ] Let the 3-minute clock reach 0:00. The winner's screen shows a trophy result screen ("🏆 TEAM WINS!" with confetti and a fanfare), the other player gets a calmer "well played" screen, and the host/spectators see the neutral result scene (the gold "TEAM wins" scene with confetti). **Standings** update, and each screen's **+1 TEAM**/score stamp matches it.
- [ ] Repeat with a new 2-minute room and **close the host's window before 0:00**. A player's screen still records the result and shows its result screen. Reopening the host shows the same single result, not two.
- [ ] New room: both players only **Pass** until time is up while the scores are tied. Sudden death starts, and after 3 tied rounds the host gets **Award the win** buttons.
- [ ] New room: a player opens the **⋯** menu and presses **Leave**. A confirm box names their team and says they'll lose the match; confirming it, the other team wins.
- [ ] New room: nobody joins. The host uses **Walkover → TEST-A** on the dashboard, and it counts as +1. On another waiting room, **Void** counts for nobody.

## 7. Dark mode and sound on a result screen
- [ ] On the winner's and the other player's result screens from section 6, toggle **☀️/🌙**. Both screens stay easy to read in dark mode (the hero card keeps its own fixed colours; the score pill and buttons below it switch with the theme).
- [ ] With sound on, the winner hears a short fanfare when their result screen appears; the other player and spectators don't.

## 8. Projector broadcast (`?view=scoreboard`)
- [ ] On the spectator device (or a projector/TV), open `…/?view=scoreboard`. With one waiting room and nothing live, it shows full-screen **Standings** and a **"Next up"** card naming the two teams.
- [ ] Start two rooms at once (or close together). The projector picks one to feature, shows a lower-third reading "● LIVE · ROOM `<CODE>` · A vs B", and a **🔁 AUTO** badge.
- [ ] Score a big word (tier 3+, "Awesome!" or better) in the room that *isn't* currently featured. The projector cuts to that room within a couple of seconds, plays the celebration full-screen, and the newest tiles glow on its board.
- [ ] On the host dashboard, press **Pin** on a room's card. The projector badge changes to **📌 PINNED BY HOST** and stays on that room even when another room has a highlight (it shows a small corner card for that instead). Press **Unpin** (or pin a different room) and the projector goes back to **🔁 AUTO**.
- [ ] Let a pinned or featured room finish. The projector shows a winner card for it, then returns to rotation or idle standings.
- [ ] Toggle **☀️/🌙** on the projector page. Every readout (score bar, lower-third, ticker, corner card) stays easy to read in both themes.
- [ ] Delete a room (host **Reset playground**) while the projector is mid-highlight on it. The highlight clears and the projector falls back to idle standings within a couple of seconds, instead of freezing on a room that no longer exists.

## 9. Clean up
- [ ] Press **Reset playground** in the yellow banner. This deletes only test data.
- [ ] Open the real site (GitHub Pages, no banner) and check that its Standings are empty or show only real teams.

## Notes / issues found
| # | Device | What happened | Expected |
|---|---|---|---|
| | | | |
