const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const COOKIE = 'wc26_session';

function signSession(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

function verifySession(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function readSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE];
  if (!token) return null;
  return verifySession(token);
}

function sessionCookie(token) {
  const maxAge = 60 * 60 * 24 * 30;
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

async function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}

async function verifyPassword(pw, hash) {
  return bcrypt.compare(pw, hash);
}

module.exports = {
  signSession,
  readSession,
  sessionCookie,
  clearCookie,
  hashPassword,
  verifyPassword,
};
