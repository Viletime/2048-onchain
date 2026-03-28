// ─── ESTADO DO JOGO ───────────────────────────────────────────
let grid      = [];
let score     = 0;
let moveCount = 0;
let gameOver  = false;

// ─── INICIALIZAR GRID ─────────────────────────────────────────
function initGrid() {
  grid      = Array(4).fill(null).map(() => Array(4).fill(0));
  score     = 0;
  gameOver  = false;

  document.getElementById('score').textContent = 0;
  document.getElementById('overlay').classList.remove('visible');

  addRandom();
  addRandom();
  renderBoard();
}

// ─── ADICIONAR PEÇA ALEATÓRIA ─────────────────────────────────
function addRandom() {
  const empty = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (grid[r][c] === 0) empty.push([r, c]);

  if (!empty.length) return null;

  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  grid[r][c]   = Math.random() < 0.9 ? 2 : 4;
  return [r, c];
}

// ─── RENDERIZAR BOARD ─────────────────────────────────────────
function renderBoard(newPos, mergedPositions) {
  const board = document.getElementById('board');
  board.innerHTML = '';

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const val  = grid[r][c];
      const cell = document.createElement('div');
      cell.className = 'cell';

      if (val) {
        cell.classList.add('t' + val);
        cell.textContent = val;
        if (newPos && newPos[0] === r && newPos[1] === c)
          cell.classList.add('new');
        if (mergedPositions && mergedPositions.some(p => p[0] === r && p[1] === c))
          cell.classList.add('merged');
      }

      board.appendChild(cell);
    }
  }
}

// ─── LÓGICA DE SLIDE ─────────────────────────────────────────
function slide(row) {
  let arr    = row.filter(x => x);
  const merged = [];

  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i] === arr[i + 1]) {
      arr[i] *= 2;
      score  += arr[i];
      merged.push(i);
      arr.splice(i + 1, 1);
    }
  }

  while (arr.length < 4) arr.push(0);
  return { arr, merged };
}

// ─── EXECUTAR MOVIMENTO ───────────────────────────────────────
// direction: 0=up 1=down 2=left 3=right
function move(dir) {
  const oldGrid = grid.map(r => [...r]);
  let moved     = false;

  if (dir === 2 || dir === 3) {
    // Esquerda / Direita
    for (let r = 0; r < 4; r++) {
      let row = dir === 2 ? [...grid[r]] : [...grid[r]].reverse();
      const { arr } = slide(row);
      const newRow  = dir === 2 ? arr : arr.reverse();
      if (newRow.join() !== grid[r].join()) moved = true;
      grid[r] = newRow;
    }
  } else {
    // Cima / Baixo
    for (let c = 0; c < 4; c++) {
      let col = grid.map(r => r[c]);
      if (dir === 1) col.reverse();
      const { arr } = slide(col);
      if (dir === 1) arr.reverse();
      arr.forEach((v, r) => {
        if (v !== oldGrid[r][c]) moved = true;
        grid[r][c] = v;
      });
    }
  }

  document.getElementById('score').textContent = score;

  if (moved) {
    const newPos = addRandom();
    renderBoard(newPos, []);

    // Checa game over
    if (!canMove()) {
      gameOver = true;
      document.getElementById('overlay-title').textContent = 'GAME OVER';
      document.getElementById('overlay-msg').textContent   = `Score final: ${score}`;
      document.getElementById('overlay').classList.add('visible');
      if (sessionActive && contract) endGame();
    }
  } else {
    renderBoard();
  }

  return moved;
}

// ─── CHECAR SE AINDA DÁ PRA MOVER ────────────────────────────
function canMove() {
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (grid[r][c] === 0) return true;
      if (c < 3 && grid[r][c] === grid[r][c + 1]) return true;
      if (r < 3 && grid[r][c] === grid[r + 1][c]) return true;
    }
  }
  return false;
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────
function handleMove(dir) {
  if (gameOver) return;
  const moved = move(dir);
if (moved && sessionActive && sessionContract) {
    queueMove(dir);
  }
}

// ─── REINICIAR JOGO ───────────────────────────────────────────
function restartGame() {
  moveCount = 0;
  document.getElementById('moves').textContent = 0;
  initGrid();
}
