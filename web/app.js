"use strict";
const STORE = "ttt.local.v1";
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
function blankData() {
  return { history: [], score: {
    computer: { wins: 0, losses: 0, draws: 0 }, human: { x: 0, o: 0, draws: 0 },
  } };
}
function loadData() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE));
    if (!raw || !Array.isArray(raw.history)) throw new Error("bad data");
    const base = blankData();
    return { history: raw.history, score: {
      computer: { ...base.score.computer, ...(raw.score?.computer || {}) },
      human: { ...base.score.human, ...(raw.score?.human || {}) },
    } };
  } catch { return blankData(); }
}
let data = loadData();
let currentTab = "game";
function freshState(mode = "computer", number = 1) {
  return { mode, number, board: Array(9).fill(""), turn: "X", over: false, winner: null,
    line: [], draw: false, thinking: false, active: 0, token: 0 };
}
let state = freshState("computer", data.history.length + 1);
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(data)); } catch { /* storage may be unavailable */ }
}

/* Theme */
const themeToggle = $("#theme-toggle");
function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
  themeToggle.title = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  $("#theme-icon").textContent = theme === "dark" ? "☀" : "☾";
  $('meta[name="theme-color"]').content = theme === "dark" ? "#0b1220" : "#f8fafc";
  if (persist) { try { localStorage.setItem("ttt.theme", theme); } catch { /* ignore */ } }
}
applyTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
themeToggle.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
});

/* Board */
const boardEl = $("#board");
const cells = [];
for (let i = 0; i < 9; i += 1) {
  const cell = document.createElement("button");
  Object.assign(cell, { type: "button", className: "cell" });
  cell.dataset.index = String(i);
  cell.addEventListener("click", () => play(i));
  cells.push(cell); boardEl.append(cell);
}
function lineFor(board, symbol) {
  return LINES.find((line) => line.every((i) => board[i] === symbol)) || null;
}
function resultOf(board) {
  const xLine = lineFor(board, "X");
  if (xLine) return { winner: "X", line: xLine, draw: false };
  const oLine = lineFor(board, "O");
  if (oLine) return { winner: "O", line: oLine, draw: false };
  return board.every(Boolean) ? { winner: null, line: [], draw: true } : null;
}
function canPlay() { return !state.over && !state.thinking && (state.mode === "human" || state.turn === "X"); }
function play(index) {
  if (!canPlay() || state.board[index]) return;
  state.active = index;
  applyMove(index);
}
function applyMove(index) {
  const boardFocused = document.activeElement?.classList.contains("cell");
  state.board[index] = state.turn;
  const result = resultOf(state.board);
  if (result) {
    Object.assign(state, { over: true, winner: result.winner, line: result.line, draw: result.draw, thinking: false });
    recordGame(); renderGame();
    if (boardFocused) $(".result h2")?.focus();
    return;
  }
  state.turn = state.turn === "X" ? "O" : "X";
  renderGame();
  if (boardFocused) focusCell(nextEmpty(index));
  if (state.mode === "computer" && state.turn === "O") startComputerTurn();
}
function nextEmpty(from) {
  for (let step = 1; step <= 9; step += 1) {
    const i = (from + step) % 9;
    if (!state.board[i]) return i;
  }
  return 0;
}
function focusCell(index) {
  if (index == null || index < 0) return;
  state.active = index;
  updateBoard();
  cells[index].focus();
}
function startComputerTurn() {
  state.thinking = true; state.token += 1;
  const token = state.token;
  renderGame();
  window.setTimeout(() => {
    if (token !== state.token || state.mode !== "computer" || state.over || state.turn !== "O") return;
    state.thinking = false; applyMove(computerChoice());
  }, 420);
}
function computerChoice() {
  const empty = state.board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  const findMove = (symbol) => {
    for (const i of empty) {
      const copy = [...state.board];
      copy[i] = symbol;
      if (lineFor(copy, symbol)) return i;
    }
    return null;
  };
  const win = findMove("O");
  if (win !== null) return win;
  const block = findMove("X");
  if (block !== null) return block;
  if (empty.includes(4)) return 4;
  const corners = empty.filter((i) => [0, 2, 6, 8].includes(i));
  const pool = corners.length ? corners : empty;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* Recording and rendering game */
function recordGame() {
  const entry = { id: `g_${Date.now().toString(36)}`, at: Date.now(), mode: state.mode,
    board: [...state.board], winner: state.winner, draw: state.draw, line: [...state.line] };
  data.history.unshift(entry);
  if (state.mode === "computer") {
    if (state.winner === "X") data.score.computer.wins += 1;
    else if (state.winner === "O") data.score.computer.losses += 1;
    else data.score.computer.draws += 1;
  } else if (state.winner === "X") data.score.human.x += 1;
  else if (state.winner === "O") data.score.human.o += 1;
  else data.score.human.draws += 1;
  save(); renderHistory(); renderLeaderboard(); renderAdmin();
}
function statusText() {
  if (state.over) {
    if (state.draw) return "It's a draw.";
    if (state.mode === "computer") return state.winner === "X" ? "You win!" : "Computer wins.";
    return `${state.winner} wins!`;
  }
  if (state.thinking) return "Computer is thinking…";
  if (state.mode === "computer") return state.turn === "X" ? "Your turn — place an X." : "Computer's turn.";
  return `${state.turn}'s turn — place an ${state.turn}.`;
}
function identityText() {
  return state.mode === "computer" ? "You are <strong>X</strong>" : "<strong>Player 1</strong> is X";
}
function turnText() {
  if (state.over) return "Game over";
  if (state.thinking) return "Computer thinking";
  if (state.mode === "computer") return state.turn === "X" ? "Your turn" : "Computer's turn";
  return `${state.turn}'s turn`;
}
function updateBoard() {
  cells.forEach((cell, i) => {
    const value = state.board[i];
    const row = Math.floor(i / 3) + 1;
    const col = (i % 3) + 1;
    const winning = state.line.includes(i);
    cell.textContent = value;
    cell.className = `cell${value ? ` ${value.toLowerCase()}` : ""}${winning ? " winning" : ""}`;
    cell.disabled = state.over || Boolean(value);
    cell.tabIndex = !state.over && i === state.active ? 0 : -1;
    cell.setAttribute("aria-label", `Row ${row}, column ${col}, ${value || "empty"}${winning ? ", winning cell" : ""}`);
    cell.setAttribute("aria-disabled", String(!canPlay() || Boolean(value)));
  });
  boardEl.setAttribute("aria-busy", String(state.thinking));
}
function renderResult() {
  const slot = $("#result-slot");
  if (!state.over) {
    slot.replaceChildren();
    return;
  }
  let heading, detail, tone;
  if (state.draw) {
    [heading, detail, tone] = ["It's a draw", "Nobody wins this one. Try again?", "draw"];
  } else if (state.mode === "computer") {
    heading = state.winner === "X" ? "You win!" : "Computer wins";
    detail = state.winner === "X" ? "Nice board — you beat the computer." : "The computer got you this time.";
    tone = state.winner === "X" ? "win" : "loss";
  } else {
    [heading, detail, tone] = [`${state.winner} wins!`, "Pass the device and play another round.", "win"];
  }
  slot.innerHTML = `<div class="result ${tone}"><h2 tabindex="-1">${heading}</h2><p class="muted">${detail}</p><div class="row"><button class="btn primary" type="button" data-action="again">Play again</button><button class="btn ghost" type="button" data-action="history">View history</button></div></div>`;
}
function renderGame() {
  updateBoard();
  $("#identity").innerHTML = identityText();
  $("#turn-label").textContent = turnText();
  $("#game-status").textContent = statusText();
  $("#mode-pill").textContent = state.mode === "computer" ? "vs Computer" : "Two players";
  $("#game-number").textContent = `Game ${state.number}`;
  $("#mode-help").textContent = state.mode === "computer" ? "You play X. The computer plays O."
    : "Player 1 is X, Player 2 is O. X goes first.";
  const score = data.score[state.mode];
  $("#score").textContent = state.mode === "computer" ? `${score.wins} wins · ${score.losses} losses · ${score.draws} draws`
    : `X ${score.x} · O ${score.o} · Draws ${score.draws}`;
  renderResult();
}
$("#result-slot").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "again") newGame();
  else showTab("history");
});

/* Keyboard board navigation */
boardEl.addEventListener("focusin", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  state.active = Number(cell.dataset.index);
  cells.forEach((c, i) => { c.tabIndex = i === state.active ? 0 : -1; });
});
boardEl.addEventListener("keydown", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  const i = Number(cell.dataset.index);
  const row = Math.floor(i / 3);
  const col = i % 3;
  let next = i;
  if (event.key === "ArrowRight") next = row * 3 + Math.min(col + 1, 2);
  else if (event.key === "ArrowLeft") next = row * 3 + Math.max(col - 1, 0);
  else if (event.key === "ArrowDown") next = Math.min(row + 1, 2) * 3 + col;
  else if (event.key === "ArrowUp") next = Math.max(row - 1, 0) * 3 + col;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = 8;
  else return;
  event.preventDefault();
  focusCell(next);
});

/* New game, score reset, mode */
function newGame(mode = state.mode) {
  state = freshState(mode, data.history.length + 1);
  $$('input[name="mode"]').forEach((radio) => { radio.checked = radio.value === mode; });
  renderGame();
  if (currentTab === "game") focusCell(0);
}
$("#new-game").addEventListener("click", () => newGame());
$("#reset-score").addEventListener("click", () => {
  data.score[state.mode] = state.mode === "computer" ? { wins: 0, losses: 0, draws: 0 } : { x: 0, o: 0, draws: 0 };
  save(); renderGame();
  $("#game-status").textContent = "Score reset for this mode.";
});
$$('input[name="mode"]').forEach((radio) => {
  radio.addEventListener("change", () => { if (radio.checked) newGame(radio.value); });
});

/* Tabs */
const tabs = $$('.tab');
const panels = $$('.panel');
function showTab(name) {
  if (!tabs.some((tab) => tab.dataset.tab === name)) name = "game";
  currentTab = name;
  tabs.forEach((tab) => {
    const selected = tab.dataset.tab === name;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  panels.forEach((panel) => { panel.hidden = panel.id !== `panel-${name}`; });
  try { window.history.replaceState(null, "", `#${name}`); } catch { /* ignore */ }
  if (name === "history") renderHistory();
  if (name === "leaderboard") renderLeaderboard();
  if (name === "admin") renderAdmin();
}
tabs.forEach((tab) => {
  tab.addEventListener("click", () => showTab(tab.dataset.tab));
});
$(".tabs").addEventListener("keydown", (event) => {
  const index = tabs.indexOf(document.activeElement);
  if (index < 0) return;
  let next = index;
  if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
  else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = tabs.length - 1;
  else return;
  event.preventDefault();
  tabs[next].focus();
  showTab(tabs[next].dataset.tab);
});
$("#brand").addEventListener("click", (event) => {
  event.preventDefault(); showTab("game"); $("#main").focus();
});
$$('[data-go]').forEach((button) => button.addEventListener("click", () => showTab(button.dataset.go)));

/* History */
function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function thumbMarkup(board) {
  return `<div class="thumb" aria-hidden="true">${board.map((v) => `<span class="thumb-cell ${v ? v.toLowerCase() : ""}">${v}</span>`).join("")}</div>`;
}
function renderHistory() {
  const list = $("#history-list");
  const empty = $("#history-empty");
  $("#history-count").textContent = `${data.history.length} ${data.history.length === 1 ? "game" : "games"}`;
  empty.hidden = data.history.length > 0;
  list.hidden = data.history.length === 0;
  list.innerHTML = data.history.slice(0, 100).map((game) => {
    let title, meta, label, tone;
    if (game.mode === "computer") {
      title = "You vs Computer";
      tone = game.draw ? "draw" : game.winner === "X" ? "win" : "loss";
      label = game.draw ? "Draw" : game.winner === "X" ? "You won" : "Computer won";
      meta = formatDate(game.at);
    } else {
      title = "Player 1 vs Player 2"; tone = game.draw ? "draw" : "win";
      label = game.draw ? "Draw" : `${game.winner} won`; meta = `${formatDate(game.at)} · Two players`;
    }
    return `<li class="history-row">${thumbMarkup(game.board)}<div><p class="history-title">${title}</p><p class="history-meta">${meta}</p></div><span class="outcome ${tone}">${label}</span></li>`;
  }).join("");
}

/* Leaderboard */
function buildLeaderboard() {
  const players = new Map();
  data.history.forEach((game) => {
    const names = game.mode === "computer" ? ["You", "Computer"] : ["Player 1", "Player 2"];
    ["X", "O"].forEach((symbol, index) => {
      const name = names[index];
      const stats = players.get(name) || { name, wins: 0, losses: 0, draws: 0 };
      if (game.draw) stats.draws += 1; else if (game.winner === symbol) stats.wins += 1; else stats.losses += 1;
      players.set(name, stats);
    });
  });
  return [...players.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name));
}
function renderLeaderboard() {
  const rows = buildLeaderboard();
  const body = $("#leaderboard-body");
  $("#leaderboard-empty").hidden = rows.length > 0;
  $("#leaderboard-wrap").hidden = rows.length === 0;
  body.innerHTML = rows.map((player, index) => {
    const games = player.wins + player.losses + player.draws;
    const rate = games ? Math.round((player.wins / games) * 100) : 0;
    return `<tr class="${player.name === "You" ? "you" : ""}"><td><span class="rank">${index + 1}</span></td><td>${player.name}${player.name === "You" ? ' <span class="pill">you</span>' : ""}</td><td class="numeric">${player.wins}</td><td class="numeric">${player.losses}</td><td class="numeric">${player.draws}</td><td class="numeric">${rate}%</td></tr>`;
  }).join("");
}

/* Admin demo stats */
function renderAdmin() {
  const games = data.history.length;
  const xWins = data.history.filter((game) => game.winner === "X").length;
  const oWins = data.history.filter((game) => game.winner === "O").length;
  const draws = data.history.filter((game) => game.draw).length;
  const metrics = [["Games played", games], ["X wins", xWins], ["O wins", oWins], ["Draws", draws]];
  $("#metrics").innerHTML = metrics.map(([label, value]) => `<div class="metric"><p class="metric-label">${label}</p><p class="metric-value">${value}</p></div>`).join("");
  const rows = [["X", xWins, ""], ["O", oWins, "o"], ["Draw", draws, "draw"]];
  $("#results").innerHTML = rows.map(([label, count, tone]) => {
    const pct = games ? Math.round((count / games) * 100) : 0;
    return `<div class="bar-row"><span>${label}</span><div class="bar-track" role="img" aria-label="${label}: ${count} games, ${pct} percent"><div class="bar-fill ${tone}" style="width:${pct}%"></div></div><span class="bar-value">${count} · ${pct}%</span></div>`;
  }).join("");
  $("#updated-at").textContent = data.history.length ? `Last game ${formatDate(data.history[0].at)}` : "No games yet";
  $("#recent-empty").hidden = games > 0;
  $("#recent-wrap").hidden = games === 0;
  $("#recent-body").innerHTML = data.history.slice(0, 8).map((game) => {
    const mode = game.mode === "computer" ? "Computer" : "Two players";
    const players = game.mode === "computer" ? "You vs Computer" : "Player 1 vs Player 2";
    const result = game.draw ? "Draw" : `${game.winner} won`;
    return `<tr><td>${formatDate(game.at)}</td><td>${mode}</td><td>${players}</td><td>${result}</td></tr>`;
  }).join("");
}
$("#reset-data").addEventListener("click", () => {
  if (!window.confirm("Delete all local games, scores and rankings? This cannot be undone.")) return;
  data = blankData(); save(); state = freshState();
  $$('input[name="mode"]').forEach((radio) => { radio.checked = radio.value === "computer"; });
  renderGame(); renderHistory(); renderLeaderboard(); renderAdmin();
  $("#game-status").textContent = "All local data has been reset.";
});

/* Start */
const requestedTab = window.location.hash.slice(1);
showTab(tabs.some((tab) => tab.dataset.tab === requestedTab) ? requestedTab : "game");
renderGame();
renderHistory();
renderLeaderboard();
renderAdmin();
