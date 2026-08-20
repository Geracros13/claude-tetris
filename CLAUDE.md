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

- **Board model**: `board` is a `ROWS × COLS` (20×10) matrix. `0` = empty cell, `1`–`7` = a color index identifying which piece type occupies that cell (see `COLORS`/`PIECES`).
- **Pieces**: the 7 tetrominoes are defined as square matrices in `PIECES`. `current` and `next` are piece objects (`{ type, shape, x, y }`). Rotation (`rotateCW`) transposes + reverses rows rather than using precomputed rotation states.
- **Collision** (`collide`): checks board bounds and overlap with locked cells; used before every move, rotation, and drop.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until a non-colliding position is found, else the rotation is discarded.
- **Game loop** (`loop`): accumulates elapsed time each frame; when it exceeds `dropInterval`, the piece drops one row (or locks if it can't).
- **Locking a piece** (`lockPiece`): `merge()` bakes the piece into `board`, `clearLines()` removes completed rows (scanning bottom-up, re-checking the same row index after a splice), then `spawn()` promotes `next` to `current` and generates a new `next`. If the new piece immediately collides, `endGame()` fires.
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` indexed by lines cleared at once, multiplied by `level`. Hard drop adds 2 pts/row dropped, soft drop adds 1 pt/row.
- **Level/speed**: level = `floor(lines / 10) + 1`; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms.
- **Ghost piece** (`ghostY`): projects `current` straight down until collision, drawn at `globalAlpha = 0.2`.
- **Rendering**: `draw()` redraws the whole board canvas each frame (grid, locked blocks, ghost, current piece); `drawNext()` renders the next-piece preview on a separate canvas.

Tunable constants at the top of `game.js`: `COLS`, `ROWS`, `BLOCK` (px per cell), `COLORS`, `LINE_SCORES`, `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS × BLOCK` and `ROWS × BLOCK`).

## Controls

`←`/`→` move, `↑` or `X` rotate CW, `↓` soft drop, `Space` hard drop, `P` pause/resume.
