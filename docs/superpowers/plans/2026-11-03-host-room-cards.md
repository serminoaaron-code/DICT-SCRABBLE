# Host room cards redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The PM's ticket "Redesign the Host Fixture Rooms interface": room cards with a Player List and a Seat Overview for 2, 3 and 4 seats, compact per-player alerts, consistent actions and clearer status badges, in both themes. Design: mockup **A** (chosen 2026-11-03), "like the reference".

**Architecture:** A pure per-seat model in `js/roomlist.js` (`RoomList.seatRows`, `RoomList.seatTags`, Node-tested) feeds a rewritten `cardHtml` in `js/view-host.js`. CSS in `css/style.css` (theme tokens only), a container query switches the card body between two columns (wide) and stacked (narrow). No room data or `Match` change: the card only reads.

**Tech Stack:** vanilla JS (UMD), CSS custom properties + container queries, Node `node:test`, CDP E2E.

**Spec:** the PM ticket (scope 1–6, acceptance criteria 1–8, pasted 2026-11-03) + mockup A (`.superpowers/brainstorm/414-*/content/host-cards-v2.html`).

## Global Constraints

- Every user string through `UI.escapeHtml`; names shown with `Names.short`, full name in `title`.
- WCAG AA in both themes (revamp.js sweep covers `.pill, .chip, .badge, button, .card` on the dashboard).
- Keep ids/classes the tests and flows rely on: `#nrCreated`, `#nrCode`, `#nrCopy`, `.room-card[data-room]`, `.badge.<phase>`, `data-pin|walkover|void|correct|correct-to`, `.pick`.
- Breakpoints 900px (dashboard stacks) and 480px (phone); 360px without sideways scroll.

## Review Focus

- A room whose seat is taken by a player who then disconnected (presence gone): Offline, not Empty.
- A 3–4 player room where a seat left (`game.out = 'left'`) or dropped out of sudden death (`'sd'`): LEFT / OUT tag, dashed seat tile, no Turn tag.
- A long team or player name (40 chars): one line with "…", no overflow at 360px.
- The list is rebuilt on every room update: an open Walkover… / Correct result… picker stays open (existing `openPick`).
- Finished and void rooms stay compact (no player list).

---

### Task 1: Pure seat model

**Files:** Modify `js/roomlist.js`; Test `tests/roomlist.test.js`.

**Produces:** `RoomList.seatRows(room)` → `[{ seat, num, name|null, taken, ready, online, turn, score|null, out: 'left'|'sd'|null, leaves }]` in seat order (`Match.seatsOf`); `RoomList.seatTags(row, phase)` → `[{ kind: 'bad'|'turn'|'ok'|'off'|'warn', text }]`.

- [ ] Tests: 2/3/4 seats give 2/3/4 rows numbered 1..n; empty seat → `taken:false, name:null`; waiting → `✓ Ready` / `Not ready`; a taken seat without presence → `📴 Offline` (not in final/void); live → `▶ Turn` on `game.turn`, scores from `game.scores`; `out` left → `LEFT`, sd → `OUT`, and no Turn; `fairPlay.screenLeaves` 2 → `⚠️ Left the screen · 2×`; final/void → no tags.
- [ ] RED, implement, GREEN, commit.

### Task 2: The card

**Files:** Modify `js/view-host.js` (`cardHtml`, created box, tab labels), `css/style.css`.

- [ ] Header: team chips (every seat) + status badge (`● LIVE m:ss`, `🕒 WAITING`, `⏸ PAUSED`, `⚖️ APPEAL`, `● SUDDEN DEATH`, `⚖️ HOST DECISION`, `✓ FINISHED`, `🗑 VOID`). Meta: code, minutes, `Seats x/n` pill (full / part / none), label.
- [ ] Waiting and live: body = Players (x/n) rows (num in seat colour, name + team, tags, score when live) + Seat overview tiles (taken / empty / gone). Room alerts (appeal, host decision) as one compact line.
- [ ] Final / void: result or void line only.
- [ ] Actions: Open room · Pin | Walkover (2 buttons or the picker) · Correct result | Void (right).
- [ ] Created box: big code + Copy code + Open room.
- [ ] Dashboard columns give the rooms more width (`1fr 2fr 1fr`) if the screenshots need it.

### Task 3: Verify and docs

- [ ] E2E `host-cards.js`: 2, 3 and 4 seat rooms (waiting, live, LEFT, offline, screen leaves), both themes, 1366 / 1920 / 360 widths, no sideways scroll, AA on the new parts; existing t8, multi-host, quickwins, revamp pass (update the "seats 0/N" text checks).
- [ ] CLAUDE.md (`roomlist.js` row), How to play host step if a picture shows the card.
