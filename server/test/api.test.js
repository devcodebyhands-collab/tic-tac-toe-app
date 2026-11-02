import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server.js';

let server;
let base;
let tempDir;
let storePath;

async function api(path, { method = 'GET', body, rawBody, cookie, origin } = {}) {
  const headers = {};
  if (body !== undefined || rawBody !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;

  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await response.text();
  const setCookie = response.headers.get('set-cookie');
  return {
    status: response.status,
    headers: response.headers,
    setCookie,
    cookie: setCookie?.split(';')[0],
    body: text ? JSON.parse(text) : null,
  };
}

before(async () => {
  const tempBase = tmpdir();
  await mkdir(tempBase, { recursive: true });
  tempDir = await mkdtemp(join(tempBase, 'ttt-api-test-'));
  storePath = join(tempDir, 'store.json');
  server = createServer({ storePath, adminEmails: 'admin@example.com' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server?.closeAllConnections();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

test('health, CORS, and error envelopes', async () => {
  const health = await api('/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { ok: true, status: 'ok' });

  const preflight = await api('/games', {
    method: 'OPTIONS',
    origin: 'http://localhost:5173',
  });
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get('access-control-allow-origin'),
    'http://localhost:5173',
  );
  assert.equal(
    preflight.headers.get('access-control-allow-credentials'),
    'true',
  );

  const missing = await api('/does-not-exist');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'not_found');

  const malformed = await api('/auth/login', {
    method: 'POST',
    rawBody: '{not json',
  });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error.code, 'invalid_request');
});

test('signup, login, session cookie, and /auth/me', async () => {
  const badEmail = await api('/auth/signup', {
    method: 'POST',
    body: { email: 'nope', password: 'long-enough' },
  });
  assert.equal(badEmail.status, 400);
  assert.equal(badEmail.body.error.field, 'email');

  const shortPassword = await api('/auth/signup', {
    method: 'POST',
    body: { email: 'ada@example.com', password: 'short' },
  });
  assert.equal(shortPassword.status, 400);
  assert.equal(shortPassword.body.error.field, 'password');

  const signup = await api('/auth/signup', {
    method: 'POST',
    body: {
      email: 'Ada@Example.com',
      password: 'correct horse battery',
      displayName: 'Ada',
    },
  });
  assert.equal(signup.status, 201);
  assert.equal(signup.body.user.email, 'ada@example.com');
  assert.equal(signup.body.user.displayName, 'Ada');
  assert.equal(signup.body.user.role, 'player');
  assert.ok(signup.cookie.startsWith('session='));
  assert.match(signup.setCookie, /HttpOnly/);
  assert.match(signup.setCookie, /SameSite=Lax/);
  assert.doesNotMatch(signup.setCookie, /correct horse battery/);

  const duplicate = await api('/auth/signup', {
    method: 'POST',
    body: { email: 'ada@example.com', password: 'another password' },
  });
  assert.equal(duplicate.status, 400);
  assert.equal(duplicate.body.error.code, 'invalid_request');

  const badLogin = await api('/auth/login', {
    method: 'POST',
    body: { email: 'ada@example.com', password: 'wrong password' },
  });
  assert.equal(badLogin.status, 401);
  assert.equal(badLogin.body.error.code, 'invalid_credentials');

  const me = await api('/auth/me', { cookie: signup.cookie });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.id, signup.body.user.id);

  const anonymous = await api('/auth/me');
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error.code, 'unauthenticated');

  const login = await api('/auth/login', {
    method: 'POST',
    body: { email: 'ada@example.com', password: 'correct horse battery' },
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, signup.body.user.id);
});

test('create games, play legal moves, reject illegal moves, detect a win', async () => {
  const signup = await api('/auth/signup', {
    method: 'POST',
    body: {
      email: 'player@example.com',
      password: 'correct horse battery',
      displayName: 'Player One',
    },
  });
  const cookie = signup.cookie;
  const playerId = signup.body.user.id;

  const unauthenticated = await api('/games', {
    method: 'POST',
    body: { opponent: 'computer' },
  });
  assert.equal(unauthenticated.status, 401);

  const human = await api('/games', {
    method: 'POST',
    body: { opponent: 'human' },
    cookie,
  });
  assert.equal(human.status, 201);
  assert.equal(human.body.board.length, 9);
  assert.ok(human.body.board.every((cell) => cell === null));
  assert.equal(human.body.turn, 'X');
  assert.equal(human.body.you, 'X');
  assert.equal(human.body.status, 'active');
  assert.equal(human.body.winner, null);

  const fetched = await api(`/games/${human.body.id}`, { cookie });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.players.X, playerId);
  assert.equal(fetched.body.players.O, 'human');

  const sequence = [
    [0, 'X'],
    [3, 'O'],
    [1, 'X'],
    [4, 'O'],
    [2, 'X'],
  ];
  let last;
  for (const [cell, symbol] of sequence) {
    last = await api(`/games/${human.body.id}/moves`, {
      method: 'POST',
      body: { cell },
      cookie,
    });
    assert.equal(last.status, 200);
    assert.equal(last.body.board[cell], symbol);
  }
  assert.equal(last.body.status, 'won');
  assert.equal(last.body.winner, 'X');
  assert.equal(last.body.moves.length, 5);

  const afterFinish = await api(`/games/${human.body.id}/moves`, {
    method: 'POST',
    body: { cell: 8 },
    cookie,
  });
  assert.equal(afterFinish.status, 409);
  assert.equal(afterFinish.body.error.code, 'invalid_move');

  const drawGame = await api('/games', {
    method: 'POST',
    body: { opponent: 'human' },
    cookie,
  });
  let drawState;
  for (const cell of [0, 1, 2, 4, 3, 5, 7, 6, 8]) {
    drawState = await api(`/games/${drawGame.body.id}/moves`, {
      method: 'POST',
      body: { cell },
      cookie,
    });
    assert.equal(drawState.status, 200);
  }
  assert.equal(drawState.body.status, 'draw');
  assert.equal(drawState.body.winner, null);

  const computer = await api('/games', {
    method: 'POST',
    body: { opponent: 'computer' },
    cookie,
  });
  assert.equal(computer.status, 201);

  const playerMove = await api(`/games/${computer.body.id}/moves`, {
    method: 'POST',
    body: { cell: 4 },
    cookie,
  });
  assert.equal(playerMove.status, 200);
  assert.equal(playerMove.body.board[4], 'X');
  assert.equal(playerMove.body.moves.length, 2, 'computer answered immediately');
  assert.equal(playerMove.body.turn, 'X');
  assert.equal(playerMove.body.status, 'active');

  const outOfRange = await api(`/games/${computer.body.id}/moves`, {
    method: 'POST',
    body: { cell: 9 },
    cookie,
  });
  assert.equal(outOfRange.status, 409);
  assert.equal(outOfRange.body.error.code, 'invalid_move');

  const occupied = await api(`/games/${computer.body.id}/moves`, {
    method: 'POST',
    body: { cell: 4 },
    cookie,
  });
  assert.equal(occupied.status, 409);
  assert.equal(occupied.body.error.code, 'invalid_move');
  assert.equal(occupied.body.error.field, 'cell');

  const missingCell = await api(`/games/${computer.body.id}/moves`, {
    method: 'POST',
    body: {},
    cookie,
  });
  assert.equal(missingCell.status, 400);
  assert.equal(missingCell.body.error.code, 'invalid_request');

  const history = await api('/games', { cookie });
  assert.equal(history.status, 200);
  assert.equal(history.body.games.length, 3);

  const otherUser = await api('/auth/signup', {
    method: 'POST',
    body: { email: 'other@example.com', password: 'correct horse battery' },
  });
  const otherGame = await api(`/games/${computer.body.id}`, {
    cookie: otherUser.cookie,
  });
  assert.equal(otherGame.status, 404);
  assert.equal(otherGame.body.error.code, 'not_found');

  const forbiddenStats = await api('/admin/stats', { cookie });
  assert.equal(forbiddenStats.status, 403);
  assert.equal(forbiddenStats.body.error.code, 'forbidden');

  const leaderboard = await api('/leaderboard');
  assert.equal(leaderboard.status, 200);
  assert.equal(leaderboard.body.entries[0].displayName, 'Player One');
  assert.equal(leaderboard.body.entries[0].wins, 1);
  assert.equal(leaderboard.body.entries[0].losses, 0);
  assert.equal(leaderboard.body.entries[0].draws, 1);
});

test('admin stats for promoted admin and logout invalidation', async () => {
  const player = await api('/auth/login', {
    method: 'POST',
    body: { email: 'player@example.com', password: 'correct horse battery' },
  });
  assert.equal(player.status, 200);

  const admin = await api('/auth/signup', {
    method: 'POST',
    body: { email: 'admin@example.com', password: 'admin password 123' },
  });
  assert.equal(admin.status, 201);
  assert.equal(admin.body.user.role, 'admin');

  const stats = await api('/admin/stats', { cookie: admin.cookie });
  assert.equal(stats.status, 200);
  assert.ok(stats.body.totals.games >= 2);
  assert.ok(stats.body.totals.players >= 3);
  assert.ok(stats.body.totals.finished >= 1);
  assert.ok(stats.body.results.xWins >= 1);
  assert.equal(stats.body.windowDays, 30);

  const logout = await api('/auth/logout', {
    method: 'POST',
    cookie: player.cookie,
  });
  assert.equal(logout.status, 200);
  assert.match(logout.setCookie, /Max-Age=0/);

  const afterLogout = await api('/auth/me', { cookie: player.cookie });
  assert.equal(afterLogout.status, 401);

  const persisted = JSON.parse(await readFile(storePath, 'utf8'));
  assert.ok(Array.isArray(persisted.users));
  assert.ok(Array.isArray(persisted.games));
  assert.ok(persisted.users.every((user) => !('password' in user)));
  assert.ok(persisted.users.every((user) => user.passwordHash.startsWith('scrypt$')));
});
