const DIFFICULTIES = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard: { rows: 16, cols: 30, mines: 99 }
};

const boardElement = document.getElementById('board');
const difficultyElement = document.getElementById('difficulty');
const newGameButton = document.getElementById('new-game');
const mineCountElement = document.getElementById('mine-count');
const timerElement = document.getElementById('timer');
const bestTimeElement = document.getElementById('best-time');
const messageElement = document.getElementById('message');
const themeToggle = document.getElementById('theme-toggle');

let rows = 9;
let cols = 9;
let mineTotal = 10;
let cells = [];
let started = false;
let gameOver = false;
let revealedCount = 0;
let flags = 0;
let seconds = 0;
let timerId = null;

function createCell(row, col) {
  return { row, col, mine: false, revealed: false, flagged: false, adjacent: 0, element: null };
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function buildBoard() {
  cells = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => createCell(row, col))
  );

  boardElement.innerHTML = '';
  boardElement.style.gridTemplateColumns = `repeat(${cols}, 34px)`;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const button = document.createElement('button');
      button.className = 'cell';
      button.type = 'button';
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-label', `Row ${row + 1}, column ${col + 1}`);
      button.addEventListener('click', () => reveal(row, col));
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        toggleFlag(row, col);
      });
      cells[row][col].element = button;
      boardElement.appendChild(button);
    }
  }
}

function neighbors(row, col) {
  const result = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) result.push(cells[r][c]);
    }
  }
  return result;
}

function placeMines(firstRow, firstCol) {
  const forbidden = new Set([`${firstRow},${firstCol}`]);
  neighbors(firstRow, firstCol).forEach((cell) => forbidden.add(`${cell.row},${cell.col}`));

  let candidates = cells.flat().filter((cell) => !forbidden.has(`${cell.row},${cell.col}`));
  if (candidates.length < mineTotal) {
    candidates = cells.flat().filter((cell) => !(cell.row === firstRow && cell.col === firstCol));
  }

  shuffle(candidates);
  for (let i = 0; i < mineTotal; i++) candidates[i].mine = true;

  cells.flat().forEach((cell) => {
    cell.adjacent = neighbors(cell.row, cell.col).filter((neighbor) => neighbor.mine).length;
  });
}

function startTimer() {
  if (timerId !== null) return;
  timerId = setInterval(() => {
    seconds++;
    timerElement.textContent = seconds;
  }, 1000);
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

function updateMineCounter() {
  mineCountElement.textContent = Math.max(0, mineTotal - flags);
}

function getBestTime() {
  const value = localStorage.getItem(`minesweeper-best-${difficultyElement.value}`);
  return value === null ? null : Number(value);
}

function updateBestTime() {
  const best = getBestTime();
  bestTimeElement.textContent = best === null ? '—' : `${best}s`;
}

function saveBestTime() {
  const best = getBestTime();
  if (best === null || seconds < best) {
    localStorage.setItem(`minesweeper-best-${difficultyElement.value}`, String(seconds));
    return true;
  }
  return false;
}

function renderCell(cell) {
  const element = cell.element;
  element.className = 'cell';
  element.textContent = '';

  if (cell.flagged && !cell.revealed) {
    element.classList.add('flagged');
    element.textContent = '🚩';
    element.setAttribute('aria-label', 'Flagged cell');
    return;
  }

  if (!cell.revealed) {
    element.setAttribute('aria-label', 'Hidden cell');
    return;
  }

  element.classList.add('revealed');
  if (cell.mine) {
    element.classList.add('mine');
    element.textContent = '💣';
    element.setAttribute('aria-label', 'Mine');
  } else if (cell.adjacent > 0) {
    element.textContent = cell.adjacent;
    element.setAttribute('aria-label', `${cell.adjacent} adjacent mines`);
  } else {
    element.setAttribute('aria-label', 'Empty cell');
  }
}

function reveal(row, col) {
  if (gameOver) return;

  const cell = cells[row][col];
  if (cell.flagged) return;

  // Chording: clicking a revealed number opens its unflagged neighbors when
  // the number of adjacent flags matches the number shown.
  if (cell.revealed) {
    chord(cell);
    return;
  }

  if (!started) {
    started = true;
    placeMines(row, col);
    startTimer();
    messageElement.textContent = 'Find every safe cell!';
  }

  if (cell.mine) {
    cell.revealed = true;
    renderCell(cell);
    loseGame();
    return;
  }

  floodReveal(cell);
  checkWin();
}

function chord(cell) {
  if (!started || cell.adjacent === 0) return;

  const around = neighbors(cell.row, cell.col);
  const flagCount = around.filter((neighbor) => neighbor.flagged).length;
  if (flagCount !== cell.adjacent) return;

  for (const neighbor of around) {
    if (!neighbor.flagged && !neighbor.revealed) {
      if (neighbor.mine) {
        neighbor.revealed = true;
        renderCell(neighbor);
        loseGame();
        return;
      }
      floodReveal(neighbor);
    }
  }
  checkWin();
}

function floodReveal(startCell) {
  const queue = [startCell];
  const visited = new Set();

  while (queue.length > 0) {
    const cell = queue.shift();
    const key = `${cell.row},${cell.col}`;
    if (visited.has(key) || cell.revealed || cell.flagged || cell.mine) continue;

    visited.add(key);
    cell.revealed = true;
    revealedCount++;
    renderCell(cell);

    if (cell.adjacent === 0) {
      neighbors(cell.row, cell.col).forEach((neighbor) => {
        if (!neighbor.revealed && !neighbor.flagged && !neighbor.mine) queue.push(neighbor);
      });
    }
  }
}

function toggleFlag(row, col) {
  if (gameOver) return;

  const cell = cells[row][col];
  if (cell.revealed) return;
  if (!cell.flagged && flags >= mineTotal) return;

  cell.flagged = !cell.flagged;
  flags += cell.flagged ? 1 : -1;
  renderCell(cell);
  updateMineCounter();
}

function revealAllMines() {
  cells.flat().forEach((cell) => {
    if (cell.mine) {
      cell.revealed = true;
      renderCell(cell);
    }
  });
}

function loseGame() {
  if (gameOver) return;
  gameOver = true;
  stopTimer();
  revealAllMines();
  messageElement.textContent = '💥 Game over! You hit a mine.';
}

function checkWin() {
  const safeCells = rows * cols - mineTotal;
  if (revealedCount !== safeCells) return;

  gameOver = true;
  stopTimer();

  cells.flat().forEach((cell) => {
    if (cell.mine && !cell.flagged) {
      cell.flagged = true;
      flags++;
      renderCell(cell);
    }
  });

  updateMineCounter();
  const newRecord = saveBestTime();
  updateBestTime();
  messageElement.textContent = newRecord
    ? `🏆 New record! You won in ${seconds} seconds!`
    : `🎉 You win in ${seconds} seconds!`;
}

function newGame() {
  const difficulty = DIFFICULTIES[difficultyElement.value];
  rows = difficulty.rows;
  cols = difficulty.cols;
  mineTotal = difficulty.mines;
  started = false;
  gameOver = false;
  revealedCount = 0;
  flags = 0;
  seconds = 0;

  stopTimer();
  timerElement.textContent = '0';
  messageElement.textContent = 'Click a cell to start.';
  updateMineCounter();
  updateBestTime();
  buildBoard();
}

function toggleTheme() {
  document.body.classList.toggle('light');
  const light = document.body.classList.contains('light');
  localStorage.setItem('minesweeper-theme', light ? 'light' : 'dark');
  themeToggle.textContent = light ? '🌙' : '☀️';
  themeToggle.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
}

function loadTheme() {
  const light = localStorage.getItem('minesweeper-theme') === 'light';
  document.body.classList.toggle('light', light);
  themeToggle.textContent = light ? '🌙' : '☀️';
  themeToggle.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
}

difficultyElement.addEventListener('change', newGame);
newGameButton.addEventListener('click', newGame);
themeToggle.addEventListener('click', toggleTheme);

loadTheme();
newGame();
