import { randomUUID } from 'node:crypto';

export const SYMBOLS = ['X', 'O'];
export const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function otherSymbol(symbol) {
  return symbol === 'X' ? 'O' : 'X';
}

export function createGameRecord({ playerId, opponent }) {
  const now = new Date().toISOString();
  return {
    id: `g_${randomUUID().replaceAll('-', '').slice(0, 10)}`,
    playerId,
    you: 'X',
    opponent,
    board: Array(9).fill(null),
    turn: 'X',
    status: 'active',
    winner: null,
    players: {
      X: playerId,
      O: opponent === 'computer' ? 'computer' : 'human',
    },
    moves: [],
    statsApplied: false,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  };
}

export function findWinner(board) {
  for (const [a, b, c] of WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  return null;
}

export function makeMove(game, cell) {
  const symbol = game.turn;
  game.board[cell] = symbol;
  game.moves.push({ cell, symbol, at: new Date().toISOString() });
  game.updatedAt = new Date().toISOString();

  const winner = findWinner(game.board);
  if (winner) {
    game.status = 'won';
    game.winner = winner;
    game.turn = winner;
    game.finishedAt = game.updatedAt;
  } else if (game.board.every((value) => value !== null)) {
    game.status = 'draw';
    game.winner = null;
    game.finishedAt = game.updatedAt;
  } else {
    game.turn = otherSymbol(symbol);
  }
  return game;
}

function firstEmptyInLine(game, line, symbol) {
  const cells = line.map((index) => game.board[index]);
  if (cells.filter((value) => value === symbol).length !== 2) return null;
  const empty = line.find((index) => game.board[index] === null);
  return empty ?? null;
}

// Win if possible, block the player, then prefer center, corners and edges.
export function chooseComputerMove(game) {
  const computer = otherSymbol(game.you);
  const player = game.you;

  for (const symbol of [computer, player]) {
    for (const line of WINNING_LINES) {
      const cell = firstEmptyInLine(game, line, symbol);
      if (cell !== null) return cell;
    }
  }

  if (game.board[4] === null) return 4;
  for (const cell of [0, 2, 6, 8, 1, 3, 5, 7]) {
    if (game.board[cell] === null) return cell;
  }
  return null;
}

export function gameView(game) {
  return {
    id: game.id,
    board: [...game.board],
    turn: game.turn,
    status: game.status,
    winner: game.winner,
    you: game.you,
    opponent: game.opponent,
    players: { ...game.players },
    moves: game.moves.map((move) => ({ ...move })),
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    finishedAt: game.finishedAt,
  };
}
