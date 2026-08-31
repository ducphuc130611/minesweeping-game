const DIFFICULTIES = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard: { rows: 16, cols: 30, mines: 99 }
};

const boardElement = document.getElementById('board');
const difficultyElement = document.getElementById('difficulty');
const newGameButton = document.getElementById('new-game');
const mineCountElement = document.getElementById('mine-count');
const flagCountElement = document.getElementById('flag-count');
const timerElement = document.getElementById('timer');
const bestTimeElement = document.getElementById('best-time');
const messageElement = document.getElementById('message');
const themeToggle = document.getElementById('theme-toggle');
const soundToggle = document.getElementById('sound-toggle');
const winsElement = document.getElementById('wins');
const gamesElement = document.getElementById('games');
const winRateElement = document.getElementById('win-rate');

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
let audioContext = null;

function storageGet(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_) {
    // Optional storage must never break gameplay.
  }
}

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
  cells = [];
  boardElement.replaceChildren();
  boardElement.style.gridTemplateColumns = `repeat(${cols}, 34px)`;

  for (let row = 0; row < rows; row++) {
    const currentRow = [];

    for (let col = 0; col < cols; col++) {
      const cell = createCell(row, col);
      const button = document.createElement('button');

      button.className = 'cell';
      button.type = 'button';
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-label', `Hidden cell at row ${row + 1}, column ${col + 1}`);
      button.addEventListener('click', () => reveal(row, col));
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        toggleFlag(row, col);
      });

      cell.element = button;
      currentRow.push(cell);
      boardElement.appendChild(button);
    }

    cells.push(currentRow);
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

function allCells() {
  return cells.flat();
}

function placeMines(firstRow, firstCol) {
  const forbidden = new Set([`${firstRow},${firstCol}`]);
  neighbors(firstRow, firstCol).forEach((cell) => forbidden.add(`${cell.row},${cell.col}`));

  let candidates = allCells().filter((cell) => !forbidden.has(`${cell.row},${cell.col}`));
  if (candidates.length < mineTotal) {
    candidates = allCells().filter((cell) => !(cell.row === firstRow && cell.col === firstCol));
  }

  shuffle(candidates);
  for (let i = 0; i < mineTotal && i < candidates.length; i++) candidates[i].mine = true;

  allCells().forEach((cell) => {
    cell.adjacent = neighbors(cell.row, cell.col).filter((neighbor) => neighbor.mine).length;
  });
}

function startTimer() {
  if (timerId !== null) return;
  timerId = setInterval(() => {
    seconds++;
    timerElement.textContent = String(seconds);
  }, 1000);
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

function updateCounters() {
  mineCountElement.textContent = String(Math.max(0, mineTotal - flags));
  flagCountElement.textContent = String(flags);
}

function getBestTime() {
  const value = storageGet(`minesweeper-best-${difficultyElement.value}`);
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function updateBestTime() {
  const best = getBestTime();
  bestTimeElement.textContent = best === null ? '—' : `${best}s`;
}

function saveBestTime() {
  const best = getBestTime();
  if (best === null || seconds < best) {
    storageSet(`minesweeper-best-${difficultyElement.value}`, String(seconds));
    return true;
  }
  return false;
}

function getStats() {
  return {
    games: Number(storageGet('minesweeper-games', '0')) || 0,
    wins: Number(storageGet('minesweeper-wins', '0')) || 0
  };
}

function updateStats(won) {
  const stats = getStats();
  stats.games++;
  if (won) stats.wins++;
  storageSet('minesweeper-games', String(stats.games));
  storageSet('minesweeper-wins', String(stats.wins));
  renderStats();
}

function renderStats() {
  const stats = getStats();
  const rate = stats.games === 0 ? 0 : Math.round((stats.wins / stats.games) * 100);
  winsElement.textContent = String(stats.wins);
  gamesElement.textContent = String(stats.games);
  winRateElement.textContent = `${rate}%`;
}

function soundEnabled() {
  return storageGet('minesweeper-sound', 'on') !== 'off';
}

function playSound(type) {
  if (!soundEnabled()) return;

  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === 'suspended') audioContext.resume();

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const frequencies = { reveal: 440, flag: 660, lose: 120, win: 880 };
    oscillator.frequency.value = frequencies[type] || 440;
    oscillator.type = type === 'lose' ? 'sawtooth' : 'sine';
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, audioContext.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.13);
  } catch (_) {
    // Audio is optional.
  }
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
    element.textContent = String(cell.adjacent);
    element.setAttribute('aria-label', `${cell.adjacent} adjacent mines`);
  } else {
    element.setAttribute('aria-label', 'Empty cell');
  }
}

function reveal(row, col) {
  if (gameOver) return;
  const cell = cells[row][col];
  if (cell.flagged) return;
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
  playSound('reveal');
  checkWin();
}

function chord(cell) {
  if (!started || cell.adjacent === 0) return;
  const around = neighbors(cell.row, cell.col);
  const flagCount = around.filter((neighbor) => neighbor.flagged).length;
  if (flagCount !== cell.adjacent) return;

  for (const neighbor of around) {
    if (neighbor.flagged || neighbor.revealed) continue;
    if (neighbor.mine) {
      neighbor.revealed = true;
      renderCell(neighbor);
      loseGame();
      return;
    }
    floodReveal(neighbor);
  }
  playSound('reveal');
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
  updateCounters();
  playSound('flag');
}

function revealAllMines() {
  allCells().forEach((cell) => {
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
  updateStats(false);
  playSound('lose');
  messageElement.textContent = '💥 Game over! You hit a mine.';
}

function checkWin() {
  const safeCells = rows * cols - mineTotal;
  if (revealedCount !== safeCells) return;

  gameOver = true;
  stopTimer();
  allCells().forEach((cell) => {
    if (cell.mine && !cell.flagged) {
      cell.flagged = true;
      flags++;
      renderCell(cell);
    }
  });

  updateCounters();
  updateStats(true);
  const newRecord = saveBestTime();
  updateBestTime();
  playSound('win');
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
  buildBoard();
  updateCounters();
  updateBestTime();
}

function toggleTheme() {
  document.body.classList.toggle('light');
  const light = document.body.classList.contains('light');
  storageSet('minesweeper-theme', light ? 'light' : 'dark');
  themeToggle.textContent = light ? '🌙' : '☀️';
}

function loadTheme() {
  const light = storageGet('minesweeper-theme', 'dark') === 'light';
  document.body.classList.toggle('light', light);
  themeToggle.textContent = light ? '🌙' : '☀️';
}

function toggleSound() {
  const enabled = soundEnabled();
  storageSet('minesweeper-sound', enabled ? 'off' : 'on');
  soundToggle.textContent = enabled ? '🔇' : '🔊';
}

function loadSound() {
  soundToggle.textContent = soundEnabled() ? '🔊' : '🔇';
}

difficultyElement.addEventListener('change', newGame);
newGameButton.addEventListener('click', newGame);
themeToggle.addEventListener('click', toggleTheme);
soundToggle.addEventListener('click', toggleSound);

loadTheme();
loadSound();
renderStats();
newGame();
