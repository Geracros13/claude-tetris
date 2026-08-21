'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
  '#f06292', // BONUS - 1x1, rare (~6%), pink/magenta so it reads as "special"
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8]],                                       // BONUS 1x1
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const CLEAR_ANIM_DURATION = 450;   // ms, particle-explosion + row-freeze duration
const PARTICLES_PER_CELL = 6;
const PARTICLE_SPEED_MIN = 0.05;   // px/ms
const PARTICLE_SPEED_MAX = 0.22;   // px/ms
const PARTICLE_GRAVITY = 0.0006;   // px/ms^2, added to vy each frame
const COMBO_BONUS = 50;            // points; total = COMBO_BONUS * combo * level
const PERFECT_CLEAR_BONUS = 1000;  // points; total = PERFECT_CLEAR_BONUS * level
const BONUS_PIECE_CHANCE = 0.06;   // 6% spawn probability for the 1x1 bonus piece

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeSwitch = document.getElementById('theme-switch');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor, blockHighlight;
let combo, clearing, clearingRows, clearAnimElapsed, particles, clearPopups;

function updateThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  gridColor = styles.getPropertyValue('--grid-color').trim();
  blockHighlight = styles.getPropertyValue('--block-highlight').trim();
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.random() < BONUS_PIECE_CHANCE ? 8 : Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function detectFullRows() {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    if (board[r].every(v => v !== 0)) rows.push(r);
  }
  return rows;
}

function startClear(rows) {
  const cleared = rows.length;
  lines += cleared;
  const lineScore = (LINE_SCORES[cleared] || 0) * level;
  combo = combo < 0 ? 0 : combo + 1;
  const comboBonus = COMBO_BONUS * combo * level; // 0 when combo === 0
  const perfect = board.every((row, r) => rows.includes(r) || row.every(v => v === 0));
  const perfectBonus = perfect ? PERFECT_CLEAR_BONUS * level : 0;

  score += lineScore + comboBonus + perfectBonus;
  level = Math.floor(lines / 10) + 1;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  updateHUD();

  clearing = true;
  clearingRows = rows;
  clearAnimElapsed = 0;
  spawnClearParticles(rows);
  buildClearPopups(cleared, combo, comboBonus, perfect, perfectBonus);
}

function resolveClear() {
  const rows = [...clearingRows].sort((a, b) => b - a); // descending so indices stay valid across splices
  for (const r of rows) board.splice(r, 1);
  for (let i = 0; i < rows.length; i++) board.unshift(new Array(COLS).fill(0));

  clearing = false;
  clearingRows = [];
  particles = [];
  clearPopups = [];
  spawn();
}

function spawnClearParticles(rows) {
  for (const r of rows) {
    for (let c = 0; c < COLS; c++) {
      const color = COLORS[board[r][c]];
      const cx = c * BLOCK + BLOCK / 2;
      const cy = r * BLOCK + BLOCK / 2;
      for (let i = 0; i < PARTICLES_PER_CELL; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = PARTICLE_SPEED_MIN + Math.random() * (PARTICLE_SPEED_MAX - PARTICLE_SPEED_MIN);
        particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.05, // slight upward bias for an "explosion" look
          color,
          size: 2 + Math.random() * 3,
        });
      }
    }
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.vy += PARTICLE_GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

function drawParticles() {
  const alpha = Math.max(0, 1 - clearAnimElapsed / CLEAR_ANIM_DURATION);
  ctx.globalAlpha = alpha;
  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function buildClearPopups(cleared, combo, comboBonus, perfect, perfectBonus) {
  clearPopups = [];
  if (cleared === 4) clearPopups.push('TETRIS!');
  if (combo > 0) clearPopups.push(`COMBO x${combo} +${comboBonus}`);
  if (perfect) clearPopups.push(`PERFECT CLEAR! +${perfectBonus}`);
}

function drawClearPopups() {
  if (!clearPopups.length) return;
  const t = clearAnimElapsed / CLEAR_ANIM_DURATION;
  const alpha = t < 0.8 ? 1 : Math.max(0, 1 - (t - 0.8) / 0.2);
  const riseY = -20 * t;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  const baseY = (ROWS * BLOCK) / 2 + riseY;
  clearPopups.forEach((text, i) => {
    ctx.fillText(text, (COLS * BLOCK) / 2, baseY + i * 24 - (clearPopups.length - 1) * 12);
  });
  ctx.restore();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const rows = detectFullRows();
  if (rows.length === 0) {
    combo = -1;
    spawn();
    return;
  }
  startClear(rows);
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = blockHighlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board (rows mid-clear are hidden while their particles fly out)
  for (let r = 0; r < ROWS; r++) {
    if (clearing && clearingRows.includes(r)) continue;
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);
  }

  if (!clearing) {
    // ghost
    const gy = ghostY();
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c])
          drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

    // current piece
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  } else {
    drawParticles();
    drawClearPopups();
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;

  if (clearing) {
    clearAnimElapsed += dt;
    updateParticles(dt);
    if (clearAnimElapsed >= CLEAR_ANIM_DURATION) {
      resolveClear();
      if (gameOver) {
        draw();
        return;
      }
    }
    draw();
    animId = requestAnimationFrame(loop);
    return;
  }

  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      if (gameOver) {
        draw();
        return;
      }
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  updateThemeColors();
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  combo = -1;
  clearing = false;
  clearingRows = [];
  clearAnimElapsed = 0;
  particles = [];
  clearPopups = [];
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver || clearing) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeSwitch.addEventListener('change', () => {
  document.documentElement.setAttribute('data-theme', themeSwitch.checked ? 'light' : 'dark');
  updateThemeColors();
  draw();
  drawNext();
});

init();
