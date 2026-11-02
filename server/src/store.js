import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

function emptyData() {
  return { version: 1, users: [], sessions: [], games: [] };
}

function newId(prefix) {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
}

// Small JSON-file store. Writes are synchronous and atomic (write + rename), so
// concurrent requests in this single-process server cannot interleave a save.
export function createStore({ filePath } = {}) {
  if (!filePath) throw new Error('createStore requires a filePath');

  let data = emptyData();
  if (existsSync(filePath)) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      data = {
        ...emptyData(),
        ...parsed,
        users: Array.isArray(parsed.users) ? parsed.users : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        games: Array.isArray(parsed.games) ? parsed.games : [],
      };
    } catch {
      // A corrupt demo store should not stop the server from booting.
      data = emptyData();
    }
  }

  function save() {
    mkdirSync(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, filePath);
  }

  return {
    data,
    save,

    findUserByEmail(email) {
      return data.users.find((user) => user.email === email) ?? null;
    },

    findUserById(id) {
      return data.users.find((user) => user.id === id) ?? null;
    },

    createUser({ email, displayName, passwordHash, role }) {
      const user = {
        id: newId('u'),
        email,
        displayName,
        passwordHash,
        role,
        wins: 0,
        losses: 0,
        draws: 0,
        createdAt: new Date().toISOString(),
      };
      data.users.push(user);
      save();
      return user;
    },

    saveUser(user) {
      save();
      return user;
    },

    recordResult(userId, outcome) {
      const user = data.users.find((candidate) => candidate.id === userId);
      if (!user) return;
      if (outcome === 'win') user.wins += 1;
      else if (outcome === 'loss') user.losses += 1;
      else if (outcome === 'draw') user.draws += 1;
      save();
    },

    createSession({ token, userId, expiresAt }) {
      const session = { token, userId, createdAt: new Date().toISOString(), expiresAt };
      data.sessions.push(session);
      save();
      return session;
    },

    findSession(token) {
      return data.sessions.find((session) => session.token === token) ?? null;
    },

    deleteSession(token) {
      const before = data.sessions.length;
      data.sessions = data.sessions.filter((session) => session.token !== token);
      if (data.sessions.length !== before) save();
    },

    pruneSessions(now = Date.now()) {
      const before = data.sessions.length;
      data.sessions = data.sessions.filter(
        (session) => Date.parse(session.expiresAt) > now,
      );
      if (data.sessions.length !== before) save();
    },

    createGame(record) {
      data.games.push(record);
      save();
      return record;
    },

    findGame(id) {
      return data.games.find((game) => game.id === id) ?? null;
    },

    gamesForUser(userId) {
      return data.games
        .filter((game) => game.playerId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}
