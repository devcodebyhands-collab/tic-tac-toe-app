import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import { join } from 'node:path';
import { createStore } from './store.js';
import {
  adminEmailsFrom,
  clearSessionCookie,
  currentSession,
  hashPassword,
  isAdminEmail,
  publicUser,
  sessionCookie,
  SESSION_COOKIE,
  startSession,
  verifyPassword,
} from './auth.js';
import {
  chooseComputerMove,
  createGameRecord,
  gameView,
  makeMove,
} from './game.js';

const DEFAULT_STORE_PATH = fileURLToPath(
  new URL('../data/store.json', import.meta.url),
);
const WINDOW_DAYS = 30;
const MAX_BODY_BYTES = 1_000_000;

class HttpError extends Error {
  constructor(status, code, message, field) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendError(res, status, code, message, field) {
  sendJson(res, status, { error: { code, message, ...(field ? { field } : {}) } });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'invalid_request', 'Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return reject(new HttpError(400, 'invalid_request', 'Body must be a JSON object.'));
        }
        resolve(value);
      } catch {
        reject(new HttpError(400, 'invalid_request', 'Body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validateCredentials(body) {
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpError(400, 'invalid_request', 'A valid email address is required.', 'email');
  }
  if (password.length < 8 || password.length > 128) {
    throw new HttpError(
      400,
      'invalid_request',
      'Password must be between 8 and 128 characters.',
      'password',
    );
  }
  return { email, password };
}

function finishGameIfNeeded(store, game) {
  if (game.status === 'active' || game.statsApplied) return;
  game.statsApplied = true;
  const outcome =
    game.winner === null ? 'draw' : game.winner === game.you ? 'win' : 'loss';
  store.recordResult(game.playerId, outcome);
}

function applyMove(store, game, cell) {
  makeMove(game, cell);
  if (game.status === 'active') {
    store.save();
  } else {
    finishGameIfNeeded(store, game);
  }
  return game;
}

function leaderboard(store) {
  const entries = [...store.data.users]
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        a.losses - b.losses ||
        a.displayName.localeCompare(b.displayName),
    )
    .slice(0, 50)
    .map((user, index) => ({
      rank: index + 1,
      playerId: user.id,
      displayName: user.displayName,
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
    }));
  return { updatedAt: new Date().toISOString(), entries };
}

function adminStats(store) {
  const since = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const recentGames = store.data.games.filter(
    (game) => Date.parse(game.createdAt) >= since,
  );
  const finished = recentGames.filter((game) => game.status !== 'active');
  return {
    totals: {
      games: recentGames.length,
      players: store.data.users.length,
      finished: finished.length,
    },
    results: {
      xWins: finished.filter((game) => game.winner === 'X').length,
      oWins: finished.filter((game) => game.winner === 'O').length,
      draws: finished.filter((game) => game.status === 'draw').length,
    },
    windowDays: WINDOW_DAYS,
    updatedAt: new Date().toISOString(),
  };
}

export function createServer(options = {}) {
  const store =
    options.store ??
    createStore({
      filePath:
        options.storePath ??
        process.env.STORE_PATH ??
        (process.env.NODE_ENV === 'test'
          ? join(os.tmpdir(), `ttt-store-${process.pid}.json`)
          : DEFAULT_STORE_PATH),
    });
  const adminEmails = adminEmailsFrom(
    options.adminEmails ?? process.env.ADMIN_EMAILS,
  );
  const secureCookie = options.secureCookie ?? process.env.COOKIE_SECURE === '1';
  const allowedOrigins = String(
    options.corsOrigin ?? process.env.CORS_ORIGIN ?? '',
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  function applyCors(req, res) {
    const origin = req.headers.origin;
    if (!origin) return;
    res.setHeader('Vary', 'Origin');
    if (allowedOrigins.length && !allowedOrigins.includes(origin)) return;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  function sessionUser(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const session = currentSession(store, token);
    if (!session) return { user: null, token: null };
    return { user: store.findUserById(session.userId), token };
  }

  function requireUser(req) {
    const { user } = sessionUser(req);
    if (!user) {
      throw new HttpError(401, 'unauthenticated', 'Sign in to continue.');
    }
    return user;
  }

  function requireAdmin(req) {
    const user = requireUser(req);
    if (user.role !== 'admin') {
      throw new HttpError(403, 'forbidden', 'Admin access is required.');
    }
    return user;
  }

  function ownedGame(user, id) {
    const game = store.findGame(id);
    if (!game || game.playerId !== user.id) {
      throw new HttpError(404, 'not_found', 'Game not found.');
    }
    return game;
  }

  async function route(req, res) {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    let pathname = url.pathname.replace(/\/+$/, '') || '/';
    if (pathname === '/health') pathname = '/api/health';
    if (pathname === '/api') pathname = '/';
    if (pathname.startsWith('/api/')) pathname = pathname.slice(4);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
      });
      return res.end();
    }

    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, { ok: true, status: 'ok' });
    }

    if (req.method === 'POST' && pathname === '/auth/signup') {
      const body = await readJson(req);
      const { email, password } = validateCredentials(body);
      if (store.findUserByEmail(email)) {
        throw new HttpError(
          400,
          'invalid_request',
          'An account with that email already exists.',
          'email',
        );
      }
      const rawName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
      const displayName = (rawName || email.split('@')[0]).slice(0, 40);
      const role = isAdminEmail(email, adminEmails) ? 'admin' : 'player';
      const user = store.createUser({
        email,
        displayName,
        passwordHash: await hashPassword(password),
        role,
      });
      const token = startSession(store, user.id);
      res.setHeader('Set-Cookie', sessionCookie(token, { secure: secureCookie }));
      return sendJson(res, 201, { user: publicUser(user) });
    }

    if (req.method === 'POST' && pathname === '/auth/login') {
      const body = await readJson(req);
      const email = normalizeEmail(body.email);
      const password = typeof body.password === 'string' ? body.password : '';
      const user = store.findUserByEmail(email);
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        throw new HttpError(
          401,
          'invalid_credentials',
          'Email or password is incorrect.',
        );
      }
      if (isAdminEmail(user.email, adminEmails) && user.role !== 'admin') {
        user.role = 'admin';
        store.saveUser(user);
      }
      const token = startSession(store, user.id);
      res.setHeader('Set-Cookie', sessionCookie(token, { secure: secureCookie }));
      return sendJson(res, 200, { user: publicUser(user) });
    }

    if (req.method === 'POST' && pathname === '/auth/logout') {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (token) store.deleteSession(token);
      res.setHeader('Set-Cookie', clearSessionCookie({ secure: secureCookie }));
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/auth/me') {
      const user = requireUser(req);
      return sendJson(res, 200, { user: publicUser(user) });
    }

    if (req.method === 'POST' && pathname === '/games') {
      const user = requireUser(req);
      const body = await readJson(req);
      const opponent = body.opponent ?? 'computer';
      if (opponent !== 'computer' && opponent !== 'human') {
        throw new HttpError(
          400,
          'invalid_request',
          'Opponent must be "computer" or "human".',
          'opponent',
        );
      }
      const game = store.createGame(
        createGameRecord({ playerId: user.id, opponent }),
      );
      return sendJson(res, 201, gameView(game));
    }

    if (req.method === 'GET' && pathname === '/games') {
      const user = requireUser(req);
      return sendJson(res, 200, {
        games: store.gamesForUser(user.id).map(gameView),
      });
    }

    const gameMatch = pathname.match(/^\/games\/([^/]+)$/);
    if (req.method === 'GET' && gameMatch) {
      const user = requireUser(req);
      return sendJson(res, 200, gameView(ownedGame(user, gameMatch[1])));
    }

    const moveMatch = pathname.match(/^\/games\/([^/]+)\/moves$/);
    if (req.method === 'POST' && moveMatch) {
      const user = requireUser(req);
      const game = ownedGame(user, moveMatch[1]);
      const body = await readJson(req);

      if (!Object.hasOwn(body, 'cell')) {
        throw new HttpError(400, 'invalid_request', 'Cell is required.', 'cell');
      }
      if (!Number.isInteger(body.cell)) {
        throw new HttpError(
          400,
          'invalid_request',
          'Cell must be an integer from 0 to 8.',
          'cell',
        );
      }
      if (body.cell < 0 || body.cell > 8) {
        throw new HttpError(
          409,
          'invalid_move',
          'Cell must be between 0 and 8.',
          'cell',
        );
      }
      if (game.status !== 'active') {
        throw new HttpError(409, 'invalid_move', 'This game is already finished.');
      }
      if (game.opponent === 'computer' && game.turn !== game.you) {
        throw new HttpError(409, 'invalid_move', 'Wait for the computer to move.');
      }
      if (game.board[body.cell] !== null) {
        throw new HttpError(
          409,
          'invalid_move',
          `Cell ${body.cell} is already occupied.`,
          'cell',
        );
      }

      applyMove(store, game, body.cell);
      if (game.status === 'active' && game.opponent === 'computer') {
        const computerCell = chooseComputerMove(game);
        if (computerCell !== null) {
          makeMove(game, computerCell);
          if (game.status === 'active') store.save();
          else finishGameIfNeeded(store, game);
        }
      }
      return sendJson(res, 200, gameView(game));
    }

    if (req.method === 'GET' && pathname === '/leaderboard') {
      return sendJson(res, 200, leaderboard(store));
    }

    if (req.method === 'GET' && pathname === '/admin/stats') {
      requireAdmin(req);
      return sendJson(res, 200, adminStats(store));
    }

    throw new HttpError(404, 'not_found', 'Route not found.');
  }

  const server = http.createServer(async (req, res) => {
    applyCors(req, res);
    try {
      await route(req, res);
    } catch (error) {
      if (res.headersSent) return res.end();
      if (error instanceof HttpError) {
        return sendError(
          res,
          error.status,
          error.code,
          error.message,
          error.field,
        );
      }
      console.error(error);
      sendError(res, 500, 'internal_error', 'Something went wrong.');
    }
  });

  return server;
}

export function startServer(options = {}) {
  const server = createServer(options);
  const port = Number(options.port ?? process.env.PORT ?? 3000);
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';
  server.listen(port, host, () => {
    const address = server.address();
    console.log(
      `Tic-tac-toe API listening on http://${host}:${address.port}`,
    );
  });
  return server;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) startServer();
