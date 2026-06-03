import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { getDb, type User } from './db';

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const COOKIE = 'wc26_session';

export type SessionPayload = { uid: number; username: string };

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export function setSessionCookie(token: string) {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE);
}

export function getSession(): SessionPayload | null {
  const c = cookies().get(COOKIE);
  if (!c) return null;
  return verifySession(c.value);
}

export function requireUser(): SessionPayload {
  const s = getSession();
  if (!s) throw new Response('Unauthorized', { status: 401 });
  return s;
}

export function getCurrentUser(): User | null {
  const s = getSession();
  if (!s) return null;
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(s.uid) as User | undefined ?? null;
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}
