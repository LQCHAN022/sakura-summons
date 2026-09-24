import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { db, tx } from './db.js';
import { createPlayer, GameError } from './game.js';

const COOKIE = 'sid';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

const q = {
  byName: db.prepare('SELECT * FROM users WHERE username = ?'),
  byId: db.prepare('SELECT * FROM users WHERE id = ?'),
  insertUser: db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)'),
  setPassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
  session: db.prepare(`
    SELECT u.id, u.username, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?'),
  purgeExpired: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  q.insertSession.run(hashToken(token), userId, Date.now() + SESSION_MS);
  const secure = req.secure ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`
  );
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// Simple in-memory limiter for login/signup attempts per IP.
const attempts = new Map();
function rateLimit(req) {
  const now = Date.now();
  const key = req.ip;
  const entry = attempts.get(key);
  if (!entry || now - entry.start > 10 * 60 * 1000) {
    attempts.set(key, { start: now, count: 1 });
    return;
  }
  if (++entry.count > 20) throw new GameError('Too many attempts. Try again in a few minutes.', 429);
}

function validateCredentials(username, password) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw new GameError('Username must be 3-20 letters, numbers or underscores.');
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 200) {
    throw new GameError('Password must be at least 6 characters.');
  }
}

export function loadUser(req, _res, next) {
  const token = readCookie(req, COOKIE);
  if (token) {
    req.tokenHash = hashToken(token);
    req.user = q.session.get(req.tokenHash, Date.now()) || null;
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new GameError('Please log in.', 401));
  next();
}

const publicUser = (u) => ({ id: u.id, username: u.username, createdAt: u.created_at });

export const authRouter = Router();

authRouter.post('/signup', async (req, res) => {
  rateLimit(req);
  const { username, password } = req.body || {};
  validateCredentials(username, password);
  if (q.byName.get(username)) throw new GameError('That username is taken.', 409);
  const hash = await bcrypt.hash(password, 10);
  const user = tx(() => {
    const { lastInsertRowid } = q.insertUser.run(username, hash, Date.now());
    createPlayer(Number(lastInsertRowid));
    return q.byId.get(Number(lastInsertRowid));
  });
  startSession(req, res, user.id);
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post('/login', async (req, res) => {
  rateLimit(req);
  const { username, password } = req.body || {};
  const user = typeof username === 'string' ? q.byName.get(username) : null;
  const ok = user && typeof password === 'string' && (await bcrypt.compare(password, user.password_hash));
  if (!ok) throw new GameError('Wrong username or password.', 401);
  q.purgeExpired.run(Date.now());
  startSession(req, res, user.id);
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', (req, res) => {
  if (req.tokenHash) q.deleteSession.run(req.tokenHash);
  clearCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

authRouter.put('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = q.byId.get(req.user.id);
  if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, user.password_hash))) {
    throw new GameError('Current password is wrong.', 403);
  }
  validateCredentials(user.username, newPassword);
  q.setPassword.run(await bcrypt.hash(newPassword, 10), user.id);
  q.deleteUserSessions.run(user.id, req.tokenHash); // sign out other devices
  res.json({ ok: true });
});

authRouter.delete('/account', requireAuth, async (req, res) => {
  const { password } = req.body || {};
  const user = q.byId.get(req.user.id);
  if (typeof password !== 'string' || !(await bcrypt.compare(password, user.password_hash))) {
    throw new GameError('Password is wrong.', 403);
  }
  q.deleteUser.run(user.id);
  clearCookie(res);
  res.json({ ok: true });
});
