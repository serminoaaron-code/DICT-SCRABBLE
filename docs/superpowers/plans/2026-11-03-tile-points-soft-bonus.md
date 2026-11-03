# Tile points on phones + softer bonus squares Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** QA mobile findings of 2026-11-03: (1) every tile shows its letter points on phones too; (2) the bonus squares use the soft palette the user picked (mockup "C1"), on phones, desktop, the big screen, the "? Bonuses" card and How to play.

**Architecture:** CSS only. (1) The `@media (max-width: 480px)` rule `.tile .sub { display: none; }` in `css/style.css` becomes a phone size. (2) The `--sq-*` tokens get per-theme values plus new `--sq-*-ink` label tokens; `.sq.*` and `.gh-sq.*` use them. A Node test reads `css/style.css` and guards both.

**Tech Stack:** plain CSS, Node `node:test`.

**Spec:** the user's picks in chat (2026-11-03): option C (very light tint, label in the bonus colour; deep muted squares in dark mode), with 2W purple instead of yellow (too close to the cream tiles) and 2L cyan instead of blue (blended into the dark board) = mockup C1.

## Global Constraints

- Light: 3W `#fde1df` / ink `#b3170f`; 2W (and ★) `#efe2fb` / `#6a2ea6`; 3L `#d9f2e4` / `#05703a`; 2L `#d5f3f8` / `#0a6273`.
- Dark: 3W `#5a2436` / `#ffb3ad`; 2W (and ★) `#46285f` / `#dcb8ff`; 3L `#1c4a2c` / `#8fe3b6`; 2L `#0d4f5e` / `#86e6f5`.
- Every label ≥ 4.5:1 on its square in both themes (WCAG AA, CLAUDE.md contrast rule).
- Theme tokens only, no new hard-coded colours in rules. Phone width 360px must not overflow.

## Review Focus

- 360px phone: a two-digit value (Q 10, Z 10) must not cover the letter on a board tile.
- The big screen (`.bp-board`) and the "? Bonuses" legend pick up the new colours without their own overrides.
- A placed tile on a bonus square still reads clearly (tiles are cream on a pale square in light mode).
- The pending (dashed) and temp (yellow) tiles stay distinct from the 2W square.

---

### Task 1: Tile points on phones

**Files:** Modify `css/style.css` (the 480px block); Test `tests/style-tokens.test.js` (new).

- [ ] Step 1: test `phones keep the tile points` — the 480px block has no `.sub { display: none }`, and sets a `.tile .sub` font size ≥ 6px.
- [ ] Step 2: run `node --test tests/style-tokens.test.js` → FAIL.
- [ ] Step 3: replace the rule with `.tile .sub { font-size: 6.5px; right: 1px; line-height: 1; }` and `.rack .tile .sub { font-size: 9px; }`.
- [ ] Step 4: run → PASS. Commit.

### Task 2: Soft bonus squares

**Files:** Modify `css/style.css` (`:root` / `html[data-theme="dark"]` tokens, `.sq.*` rules), `css/help.css` (`.gh-sq.*`); Test `tests/style-tokens.test.js`.

- [ ] Step 1: tests `bonus squares: the picked colours in both themes` (exact values above) and `bonus labels pass AA on their squares in both themes` (≥ 4.5:1).
- [ ] Step 2: run → FAIL.
- [ ] Step 3: light values + `--sq-*-ink` in `:root`, dark values in `html[data-theme="dark"]`; `.sq.dl/.tl/.dw/.center/.tw` and `.gh-sq.*` use `color: var(--sq-*-ink)`.
- [ ] Step 4: run → PASS; full suite green. Commit.

### Task 3: Check in the browser, docs

- [ ] Screenshots at 360px (light, dark) of a live board with tiles, the "? Bonuses" card, How to play, and the big screen; `help.js` E2E passes.
- [ ] CLAUDE.md "Visual tokens" lists the `--sq-*-ink` tokens; bugs-fixed entry BF-32 (tile points on phones).
