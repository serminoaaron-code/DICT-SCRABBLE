# Dry-run checklist (Mon 2026-11-02 evening)

**Goal:** prove one full tournament evening works with real people on real devices before the event on Tue 2026-11-03.

**Who:** 3–4 people.
- **Host:** a laptop.
- **Player A:** a laptop.
- **Player B:** a **phone**.
- **Spectator** (optional): any device.

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

## 2. Joining
- [ ] Player A: open the site, enter the code in **lowercase**, enter a name, then **Play for TEST-A**.
- [ ] Player B (phone): join with the code, then **Play for TEST-B**. The TEST-A button shows "taken by …".
- [ ] Spectator: join with the code, then **Just watch**. The host lobby shows "👁️ 1 watching".
- [ ] Player A **refreshes** the page. They're back in the TEST-A seat without doing anything.
- [ ] Host: **Remove** Player A. Player A sees the join buttons again and rejoins.

## 3. Start and play
- [ ] **Start match** stays disabled until both players press **I'm ready**.
- [ ] Host presses **Start**. All screens show the same "Coin toss: … goes first".
- [ ] A first word that doesn't cover the ★ is refused with a message.
- [ ] A real word across the ★ scores the same on every screen, and the rack refills to 7.
- [ ] On the phone: tap a tile, then tap a square. Placing, Recall and Play all work.
- [ ] A made-up word shows "not found", with **Recall** and **Ask host**.
- [ ] **Ask host**: both clocks freeze, and the host sees the word with **Approve** / **Deny**.
  - [ ] **Approve** adds the score and passes the turn.
  - [ ] **Deny** returns the tiles and it's still the same player's turn.
- [ ] Leave a turn idle for 60 seconds. It passes automatically, and the last-move line says "ran out of time" once.

## 4. Host controls
- [ ] **Pause** freezes both clocks on every screen, and **Resume** continues from the same time.
- [ ] Player A switches to another app or tab. The host sees "⚠️ … left the screen 1×" in the room and on the dashboard card, and the game continues.
- [ ] Player B turns on airplane mode (or closes the tab). Everyone sees "… disconnected". Player B reconnects, and the notice disappears.

## 5. Ending
- [ ] Let the 3-minute clock reach 0:00. Every screen shows "🏆 … wins · +1 …", and **Standings** update.
- [ ] Repeat with a new 2-minute room and **close the host's window before 0:00**. A player's screen still records the result. Reopening the host shows the same single result, not two.
- [ ] New room: both players only **Pass** until time is up while the scores are tied. Sudden death starts, and after 3 tied rounds the host gets **Award the win** buttons.
- [ ] New room: a player presses **Resign**. The other team wins.
- [ ] New room: nobody joins. The host uses **Walkover → TEST-A** on the dashboard, and it counts as +1. On another waiting room, **Void** counts for nobody.

## 6. Clean up
- [ ] Press **Reset playground** in the yellow banner. This deletes only test data.
- [ ] Open the real site (GitHub Pages, no banner) and check that its Standings are empty or show only real teams.

## Notes / issues found
| # | Device | What happened | Expected |
|---|---|---|---|
| | | | |
