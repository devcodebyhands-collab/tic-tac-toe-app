import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
export const SESSION_COOKIE = 'session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  const [scheme, salt, expectedHex] = String(storedHash).split('$');
  if (scheme !== 'scrypt' || !salt || !expectedHex) return false;

  const expected = Buffer.from(expectedHex, 'hex');
  const actual = await scrypt(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function sessionExpiry() {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
}

export function startSession(store, userId) {
  const token = newSessionToken();
  store.createSession({ token, userId, expiresAt: sessionExpiry() });
  return token;
}

export function currentSession(store, token) {
  if (!token) return null;
  const session = store.findSession(token);
  if (!session) return null;
  if (Date.parse(session.expiresAt) <= Date.now()) {
    store.deleteSession(token);
    return null;
  }
  return session;
}

export function adminEmailsFrom(value) {
  return String(value ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email, adminEmails) {
  return adminEmails.includes(String(email).trim().toLowerCase());
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
    createdAt: user.createdAt,
  };
}

export function sessionCookie(token, { secure = false } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie({ secure = false } = {}) {
  const parts = [
    `${SESSION_COOKIE}=`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
