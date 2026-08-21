# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A vanilla-JS Tetris implementation using HTML5 Canvas. No build process, no package manager, no dependencies — just three files: `index.html`, `style.css`, `game.js`.

## Running / testing

There is no build, lint, or test tooling in this repo. To run the game, just open `index.html` in a browser, or serve the directory statically:

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then visit `http://localhost:8000`. There is no automated test suite — verify changes manually in the browser.

## Architecture

Everything lives in `game.js` (single file, no modules). It's organized as global state + free functions operating on that state, driven by a `requestAnimationFrame` loop.

- **Board model**: `board` is a `ROWS × COLS` (20×10) matrix. `0` = empty cell, `1`–`7` = a color index identifying which standard piece type occupies that cell (see `COLORS`/`PIECES`); `8` is the rare 1x1 bonus piece.
- **Pieces**: the 7 tetrominoes plus a rare 1x1 "bonus" piece (type/color index `8`, spawned with probability `BONUS_PIECE_CHANCE`) are defined as square matrices in `PIECES`. `current` and `next` are piece objects (`{ type, shape, x, y }`). Rotation (`rotateCW`) transposes + reverses rows rather than using precomputed rotation states (a no-op on the 1x1 piece).
- **Collision** (`collide`): checks board bounds and overlap with locked cells; used before every move, rotation, and drop.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until a non-colliding position is found, else the rotation is discarded.
- **Game loop** (`loop`): accumulates elapsed time each frame; when it exceeds `dropInterval`, the piece drops one row (or locks if it can't). While `clearing` is true, the loop instead advances the line-clear animation (see below) and skips normal drop logic entirely.
- **Locking a piece** (`lockPiece`): `merge()` bakes the piece into `board`, then `detectFullRows()` scans for completed rows (pure, non-mutating). If none, `combo` resets to `-1` and `spawn()` runs immediately. If there are full rows, `startClear(rows)` applies scoring (see below) and kicks off the clear animation; the board itself is **not** mutated yet.
- **Line-clear animation**: `startClear` sets `clearing = true` and spawns particle fragments (`spawnClearParticles`, `PARTICLES_PER_CELL` per cleared cell, colored from the cell's original piece color, random velocity + `PARTICLE_GRAVITY`) plus any popup text (`buildClearPopups`). While `clearing`, `draw()` hides the completed rows and renders particles/popups instead of the ghost/current piece, and the keydown handler ignores input. After `CLEAR_ANIM_DURATION` ms, `resolveClear()` actually splices the rows out of `board`, unshifts empty rows, clears animation state, and calls `spawn()` (which may trigger `endGame()` if the new piece immediately collides).
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` indexed by lines cleared at once, multiplied by `level`. Hard drop adds 2 pts/row dropped, soft drop adds 1 pt/row. On top of that, `startClear` awards a **combo bonus** (`COMBO_BONUS * combo * level`, where `combo` counts consecutive piece-locks that each cleared ≥1 line — starts at `-1`, becomes `0` on the first clear of a streak with no bonus, then increments) and a **Perfect Clear bonus** (`PERFECT_CLEAR_BONUS * level`) when the board is entirely empty after the clear. `buildClearPopups`/`drawClearPopups` show transient on-canvas text ("TETRIS!", "COMBO xN +pts", "PERFECT CLEAR! +pts") during the clear animation.
- **Level/speed**: level = `floor(lines / 10) + 1`; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms.
- **Ghost piece** (`ghostY`): projects `current` straight down until collision, drawn at `globalAlpha = 0.2`.
- **Rendering**: `draw()` redraws the whole board canvas each frame (grid, locked blocks, ghost, current piece, or — while `clearing` — particles and popups instead); `drawNext()` renders the next-piece preview on a separate canvas.

Tunable constants at the top of `game.js`: `COLS`, `ROWS`, `BLOCK` (px per cell), `COLORS`, `LINE_SCORES`, `dropInterval`, `CLEAR_ANIM_DURATION`, `PARTICLES_PER_CELL`, `PARTICLE_SPEED_MIN`/`PARTICLE_SPEED_MAX`, `PARTICLE_GRAVITY`, `COMBO_BONUS`, `PERFECT_CLEAR_BONUS`, `BONUS_PIECE_CHANCE`. If `COLS`/`ROWS`/`BLOCK` change, update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS × BLOCK` and `ROWS × BLOCK`).

## Controls

`←`/`→` move, `↑` or `X` rotate CW, `↓` soft drop, `Space` hard drop, `P` pause/resume.
