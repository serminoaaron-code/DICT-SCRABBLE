# In-match landscape layout for desktop (#9): design

**Date:** 2026-11-02 · **Status:** approved in chat (layout A) · **Mockup:** `.superpowers/brainstorm/190-1793589938/content/landscape-layout-v2.html` (option 9A)

## Why

Every in-match screen is built as one phone-width column, capped at 520px and centred. On a laptop that leaves a small board (about 350px on a 1366×768 laptop) with empty space on both sides. Desktop players asked for an in-match screen sized for a desktop, with the board as the main thing.

## Goal

On a desktop- or laptop-sized window, the in-match screen uses **layout A**:
- The **board is a square on the left** that fills the height of the window below the slim in-game header: about 590px on a 1366×768 laptop and about 900px at 1920×1080.
- A **game panel sits on the right**. Top to bottom it holds the score bar with the clock, the turn pill, the caption line (coin toss / last move and "? Bonuses"), then the rack with 🔀 and the action buttons at the bottom.

Phones look and behave exactly as they do today.

## Non-goals

- The lobby, join page, result screen, host dashboard and projector (`?view=scoreboard`) don't change.
- No change to rules, scoring, timing, Firebase data or what anyone can do. This is a layout change only.
- No new features in the panel, such as a move history or a chat. Those are later batches.

## Anti-goals (a failure even if it "works")

- Anything changes on a phone, in portrait or landscape. The 360×640 phone fit (no scrolling, everything visible) must hold exactly as now.
- The page scrolls vertically on a 1366×768 laptop for a seated player.
- The board isn't square, or its letters stay phone-small on a big board.
- Contrast drops below WCAG AA in either theme. Light backgrounds keep dark text, and dark backgrounds keep light text.

## When the landscape layout applies

- **Our call:** the window is **at least 1024px wide, at least 560px tall and wider than it is tall**. This is a pure CSS media query.
  - That includes laptops, desktops and tablets held sideways.
  - It excludes phones in landscape, which are under 560px tall, and narrow windows.
  - 1024px rather than 900px wide leaves the board enough room next to a 420px panel; see the board-size floor below.
- It follows the window live. Resizing or rotating switches layouts with no refresh, and the board re-sizes itself.
- It applies only to the in-match screen (`#liveRoot`), for every viewer: seated players, spectators and the host.

## The layout

- **Board**
  - A square on the left.
  - Its size is the smaller of (a) the window height minus the in-game header, the playground bar when shown, and margins, and (b) the window width minus the panel and gaps.
  - **Floor (our call):** in landscape the board is never smaller than a seated player's board today at the same window size, which `fitBoard()` shrinks to fit (about 350px at 1366×768). Near the smallest qualifying heights (560–620px) a spectator's or host's board may be a little under today's 520px, which they reach by scrolling. That is accepted, because the landscape page doesn't scroll.
  - The in-game page width cap (`main`, currently 1100px) must not stop it from growing on big screens.
  - Square labels (3W, 2L…) and tile letters scale with the board, so a 900px board doesn't have 9px labels.
- **Panel**
  - On the right, about **420px wide** (*our call*), as tall as the board. The mockup's panel is wider still, about 560px when scaled to 1366px. 420px is the narrowest panel that fits the whole rack and 🔀 on one row with 44px tiles.
  - The score bar, pill and caption sit at the top, and the rack and actions are pinned to the bottom, closest to the mouse.
  - *Our call:* rack tiles **44px**, the 🔀 button the same size on the same row, and action buttons a little taller than on phones. That's 7×44 + 6×6 gaps + rack padding + 🔀 ≈ 410px.
- **Spectators:** the same board and panel, without the rack, 🔀 or action buttons. The panel's lower part shows what spectators see today below the actions ("Back to start", "Stop watching / take a seat").
- **Host:** the host control bar (`#hostBar`: pause, appeals, award and so on) goes at the bottom of the panel. If it doesn't fit, the panel scrolls inside itself. The page doesn't scroll, and the board stays put.
- **Seated players** keep today's rule that the whole game screen fits the window with no scrolling. In landscape the board is sized by the window height, not shrunk after measuring the actions row.

## What keeps working, unchanged in behaviour

These must look right, and be checked, at 1366×768 and 1920×1080:
- Celebrations: the +N float, the four tier overlays and the count-up flying into the score bar, which now sits in the panel.
- The VS intro with the coin toss and the round-start card.
- The paused, appeal and sudden-death states.
- The "word not found" sheet, the disconnect notice sheet, the ⋯ menu, the "? Bonuses" card, toasts and the playground bar.

All of these should stay sized to the game area, not to a phone-width column. Bottom sheets may stay centred at the bottom of the window (*our call*).

- **Celebrations and the VS intro (our call): centred on the board, at board scale.**
  - The dim may still cover the whole window, as today.
  - The tier title, count-up and intro content centre over the board, and they scale up with the board. Today they are capped at phone scale (`--k` in `css/fx.css`); in landscape that cap is lifted to match the board.
  - The +N float starts from the board's centre.
  - The count-up still flies into the score in the panel.
  - This means new landscape positioning in `celebrate.js` / `scenes.js` / `fx.css`, not only CSS tweaks.

## Edge cases the build must cover

- **Several clients writing to Firebase at once, refresh or disconnect mid-turn, and the host window closing:** behaviour is unchanged, because this is layout only. Re-renders (`update()` on every room change) must keep the layout without flicker.
- **Switching layouts mid-turn** (window resize or tablet rotation) with tiles placed on the board, a tile selected, or a celebration playing: nothing is lost, and the board re-sizes.
- **Reduced motion:** unchanged.
- **Phone width (360px):** unchanged; this is checked by the existing phone-fit test.

## Left to the builder

- The CSS technique: media query plus grid or flex on `.arena`, and how the board size is computed (CSS `min()` with viewport units, or the existing `fitBoard()` taught about landscape).
- Exact font scaling for labels and tiles, as long as it reads well from 590px up to about 900px.
- Exact spacing and gaps. The panel stays about 420px wide (see Panel).
- Whether the slim in-game header changes on desktop. It should not take more height than it does today.
