const COLS = 10;
const ROWS = 20;
const CELL = 30;
const BEST_SCORE_KEY = "stackfall-best-score";

const COLORS = {
  I: "#63d7d4",
  O: "#f0d45e",
  T: "#a495ff",
  S: "#72d36f",
  Z: "#f172b7",
  J: "#5aa4ff",
  L: "#ffae65",
};

const SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
};

const LINE_SCORES = [0, 100, 300, 500, 800];
const TYPES = Object.keys(SHAPES);

const boardCanvas = document.querySelector("#game-board");
const boardContext = boardCanvas.getContext("2d");
const nextCanvas = document.querySelector("#next-piece");
const holdCanvas = document.querySelector("#hold-piece");
const nextContext = nextCanvas.getContext("2d");
const holdContext = holdCanvas.getContext("2d");

const elements = {
  score: document.querySelector("#score"),
  bestScore: document.querySelector("#best-score"),
  startBest: document.querySelector("#start-best"),
  level: document.querySelector("#level"),
  lines: document.querySelector("#lines"),
  boardStatus: document.querySelector("#board-status"),
  startScreen: document.querySelector("#start-screen"),
  pauseOverlay: document.querySelector("#pause-overlay"),
  gameOverOverlay: document.querySelector("#gameover-overlay"),
  finalScore: document.querySelector("#final-score"),
  finalLines: document.querySelector("#final-lines"),
  newBest: document.querySelector("#new-best"),
  soundToggle: document.querySelector("#sound-toggle"),
  soundLabel: document.querySelector("#sound-label"),
};

let board = createBoard();
let currentPiece = null;
let nextType = randomType();
let holdType = null;
let canHold = true;
let score = 0;
let lines = 0;
let level = 1;
let bestScore = readBestScore();
let status = "start";
let lastTime = 0;
let dropTimer = 0;
let animationFrame = null;
let soundOn = true;
let audioContext = null;

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function randomType() {
  return TYPES[Math.floor(Math.random() * TYPES.length)];
}

function cloneShape(shape) {
  return shape.map((row) => [...row]);
}

function createPiece(type) {
  const shape = cloneShape(SHAPES[type]);
  return {
    type,
    shape,
    x: Math.floor((COLS - shape[0].length) / 2),
    y: 0,
  };
}

function readBestScore() {
  try {
    return Number.parseInt(localStorage.getItem(BEST_SCORE_KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function saveBestScore() {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
  } catch {
    // 저장을 지원하지 않는 환경에서도 게임은 계속 진행한다.
  }
}

function formatNumber(value, digits = 0) {
  return String(value).padStart(digits, "0");
}

function resetGame() {
  board = createBoard();
  currentPiece = createPiece(nextType);
  nextType = randomType();
  holdType = null;
  canHold = true;
  score = 0;
  lines = 0;
  level = 1;
  dropTimer = 0;
  status = "playing";
  elements.startScreen.classList.add("is-hidden");
  elements.pauseOverlay.hidden = true;
  elements.gameOverOverlay.hidden = true;
  elements.boardStatus.textContent = "IN PLAY";
  updateStats();
  render();
  playTone(440, 0.06, "sine");
}

function startGame() {
  resetGame();
  if (animationFrame === null) {
    animationFrame = requestAnimationFrame(gameLoop);
  }
}

function restartGame() {
  resetGame();
}

function gameLoop(time = 0) {
  const delta = time - lastTime;
  lastTime = time;

  if (status === "playing") {
    dropTimer += delta;
    if (dropTimer >= getDropInterval()) {
      dropTimer = 0;
      moveDown(false);
    }
    render();
  }

  animationFrame = requestAnimationFrame(gameLoop);
}

function getDropInterval() {
  return Math.max(90, 850 - (level - 1) * 70);
}

function isValid(piece, offsetX = 0, offsetY = 0, shape = piece.shape) {
  return shape.every((row, rowIndex) => row.every((value, columnIndex) => {
    if (!value) return true;
    const x = piece.x + columnIndex + offsetX;
    const y = piece.y + rowIndex + offsetY;
    return x >= 0 && x < COLS && y < ROWS && (y < 0 || !board[y][x]);
  }));
}

function moveHorizontal(direction) {
  if (status !== "playing" || !currentPiece) return;
  if (isValid(currentPiece, direction, 0)) {
    currentPiece.x += direction;
    playTone(170 + Math.abs(direction) * 20, 0.025, "square");
    render();
  }
}

function moveDown(isSoftDrop = false) {
  if (status !== "playing" || !currentPiece) return false;
  if (isValid(currentPiece, 0, 1)) {
    currentPiece.y += 1;
    if (isSoftDrop) score += 1;
    updateStats();
    return true;
  }
  lockPiece();
  return false;
}

function hardDrop() {
  if (status !== "playing" || !currentPiece) return;
  let distance = 0;
  while (isValid(currentPiece, 0, 1)) {
    currentPiece.y += 1;
    distance += 1;
  }
  score += distance * 2;
  playTone(105, 0.08, "triangle");
  lockPiece();
}

function rotatePiece(direction) {
  if (status !== "playing" || !currentPiece || currentPiece.type === "O") return;
  const rotated = rotateMatrix(currentPiece.shape, direction);
  const kicks = [0, -1, 1, -2, 2];
  const kick = kicks.find((offset) => isValid(currentPiece, offset, 0, rotated));
  if (kick === undefined) return;
  currentPiece.shape = rotated;
  currentPiece.x += kick;
  playTone(310, 0.04, "sine");
  render();
}

function rotateMatrix(matrix, direction) {
  const height = matrix.length;
  const width = matrix[0].length;
  const rotated = Array.from({ length: width }, () => Array(height).fill(0));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (direction > 0) rotated[x][height - 1 - y] = matrix[y][x];
      else rotated[width - 1 - x][y] = matrix[y][x];
    }
  }
  return rotated;
}

function holdPiece() {
  if (status !== "playing" || !currentPiece || !canHold) return;
  const activeType = currentPiece.type;
  if (holdType === null) {
    holdType = activeType;
    currentPiece = createPiece(nextType);
    nextType = randomType();
  } else {
    const swapType = holdType;
    holdType = activeType;
    currentPiece = createPiece(swapType);
  }
  canHold = false;
  playTone(245, 0.05, "sine");
  render();
}

function lockPiece() {
  if (!currentPiece) return;
  currentPiece.shape.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (!value) return;
      const y = currentPiece.y + rowIndex;
      const x = currentPiece.x + columnIndex;
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) board[y][x] = currentPiece.type;
    });
  });

  playTone(125, 0.055, "triangle");
  clearLines();
  currentPiece = createPiece(nextType);
  nextType = randomType();
  canHold = true;
  dropTimer = 0;

  if (!isValid(currentPiece)) endGame();
  render();
}

function clearLines() {
  const fullRows = board.reduce((count, row) => count + (row.every(Boolean) ? 1 : 0), 0);
  if (!fullRows) return;

  board = board.filter((row) => !row.every(Boolean));
  while (board.length < ROWS) board.unshift(Array(COLS).fill(null));
  score += LINE_SCORES[fullRows] * level;
  lines += fullRows;
  level = Math.floor(lines / 10) + 1;
  playTone(520 + fullRows * 90, 0.12, "sine");
  updateStats();
}

function togglePause() {
  if (status === "playing") {
    status = "paused";
    elements.pauseOverlay.hidden = false;
    elements.boardStatus.textContent = "PAUSED";
    playTone(230, 0.04, "sine");
  } else if (status === "paused") {
    resumeGame();
  }
  render();
}

function resumeGame() {
  if (status !== "paused") return;
  status = "playing";
  elements.pauseOverlay.hidden = true;
  elements.boardStatus.textContent = "IN PLAY";
  lastTime = performance.now();
  playTone(440, 0.04, "sine");
}

function endGame() {
  status = "gameover";
  elements.boardStatus.textContent = "RUN COMPLETE";
  elements.finalScore.textContent = formatNumber(score);
  elements.finalLines.textContent = formatNumber(lines);
  const isNewBest = score > bestScore;
  if (isNewBest) {
    bestScore = score;
    saveBestScore();
  }
  elements.newBest.hidden = !isNewBest;
  elements.gameOverOverlay.hidden = false;
  updateStats();
  playTone(90, 0.22, "sawtooth");
}

function updateStats() {
  elements.score.textContent = formatNumber(score);
  elements.bestScore.textContent = formatNumber(bestScore);
  elements.startBest.textContent = formatNumber(bestScore);
  elements.level.textContent = formatNumber(level, 2);
  elements.lines.textContent = formatNumber(lines, 3);
}

function getGhostPiece() {
  if (!currentPiece) return null;
  const ghost = { ...currentPiece, shape: cloneShape(currentPiece.shape) };
  while (isValid(ghost, 0, 1, ghost.shape)) ghost.y += 1;
  return ghost;
}

function render() {
  drawBoard();
  drawPreview(nextContext, nextCanvas, nextType);
  drawPreview(holdContext, holdCanvas, holdType);
}

function drawBoard() {
  boardContext.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  boardContext.fillStyle = "#09151e";
  boardContext.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
  drawGrid(boardContext, CELL, COLS, ROWS);

  board.forEach((row, y) => row.forEach((type, x) => {
    if (type) drawCell(boardContext, x, y, COLORS[type], CELL, 1);
  }));

  if (currentPiece && status !== "start" && status !== "gameover") {
    const ghost = getGhostPiece();
    if (ghost) drawPiece(ghost, true);
    drawPiece(currentPiece, false);
  }
}

function drawGrid(context, cellSize, columns, rows) {
  context.strokeStyle = "rgba(149, 182, 192, 0.09)";
  context.lineWidth = 1;
  for (let x = 0; x <= columns; x += 1) {
    context.beginPath();
    context.moveTo(x * cellSize + 0.5, 0);
    context.lineTo(x * cellSize + 0.5, rows * cellSize);
    context.stroke();
  }
  for (let y = 0; y <= rows; y += 1) {
    context.beginPath();
    context.moveTo(0, y * cellSize + 0.5);
    context.lineTo(columns * cellSize, y * cellSize + 0.5);
    context.stroke();
  }
}

function drawPiece(piece, ghost) {
  piece.shape.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    if (!value) return;
    const x = piece.x + columnIndex;
    const y = piece.y + rowIndex;
    if (y >= 0) drawCell(boardContext, x, y, COLORS[piece.type], CELL, ghost ? 0.14 : 1, ghost);
  }));
}

function drawCell(context, x, y, color, size, alpha = 1, ghost = false) {
  context.save();
  context.globalAlpha = alpha;
  if (ghost) {
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.strokeRect(x * size + 5, y * size + 5, size - 10, size - 10);
  } else {
    const gradient = context.createLinearGradient(x * size, y * size, (x + 1) * size, (y + 1) * size);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, shadeColor(color, -22));
    context.fillStyle = gradient;
    context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
    context.fillStyle = "rgba(255,255,255,.2)";
    context.fillRect(x * size + 4, y * size + 4, size - 9, 3);
    context.fillStyle = "rgba(0,0,0,.15)";
    context.fillRect(x * size + 4, (y + 1) * size - 6, size - 8, 2);
  }
  context.restore();
}

function drawPreview(context, canvas, type) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(7, 17, 25, .68)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (!type) return;
  const shape = SHAPES[type];
  const size = 23;
  const offsetX = (canvas.width - shape[0].length * size) / 2;
  const offsetY = (canvas.height - shape.length * size) / 2;
  shape.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    if (!value) return;
    drawCell(context, (offsetX / size) + columnIndex, (offsetY / size) + rowIndex, COLORS[type], size, 1);
  }));
}

function shadeColor(hex, amount) {
  const num = Number.parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (num & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function playTone(frequency, duration, type) {
  if (!soundOn) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.045, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch {
    // 브라우저가 오디오를 지원하지 않아도 게임 조작에는 영향을 주지 않는다.
  }
}

function handleAction(action) {
  switch (action) {
    case "start":
    case "restart":
      restartGame();
      break;
    case "resume":
      resumeGame();
      break;
    case "left":
      moveHorizontal(-1);
      break;
    case "right":
      moveHorizontal(1);
      break;
    case "rotate":
      rotatePiece(1);
      break;
    case "rotate-ccw":
      rotatePiece(-1);
      break;
    case "soft":
      moveDown(true);
      render();
      break;
    case "hard":
      hardDrop();
      break;
    case "hold":
      holdPiece();
      break;
    case "pause":
      togglePause();
      break;
    default:
      break;
  }
}

document.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-action]");
  if (actionTarget) handleAction(actionTarget.dataset.action);

  if (event.target.closest("#sound-toggle")) {
    soundOn = !soundOn;
    elements.soundToggle.classList.toggle("is-off", !soundOn);
    elements.soundLabel.textContent = soundOn ? "SOUND ON" : "SOUND OFF";
    if (soundOn) playTone(440, 0.05, "sine");
  }
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const handledKeys = ["arrowleft", "arrowright", "arrowup", "arrowdown", "z", "c", "p", "escape", "r", " "];
  if (handledKeys.includes(key)) event.preventDefault();

  if (key === "arrowleft") moveHorizontal(-1);
  else if (key === "arrowright") moveHorizontal(1);
  else if (key === "arrowup") rotatePiece(1);
  else if (key === "z") rotatePiece(-1);
  else if (key === "arrowdown") moveDown(true);
  else if (key === " ") hardDrop();
  else if (key === "c") holdPiece();
  else if (key === "p" || key === "escape") togglePause();
  else if (key === "r") {
    if (status === "playing") {
      if (window.confirm("현재 게임을 다시 시작할까요?")) restartGame();
    } else {
      restartGame();
    }
  }
  render();
});

updateStats();
render();
animationFrame = requestAnimationFrame(gameLoop);
