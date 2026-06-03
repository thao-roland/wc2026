import { NextResponse } from 'next/server';
import { getDb, type User } from '@/lib/db';
import { hashPassword, signSession, setSessionCookie } from '@/lib/auth';

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  if (typeof username !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const u = username.trim().toLowerCase();
  if (u.length < 3 || u.length > 32 || !/^[a-z0-9_-]+$/.test(u)) {
    return NextResponse.json(
      { error: 'Username: 3-32 chars, lowercase letters/numbers/-/_' },
      { status: 400 },
    );
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }

  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(u);
  if (exists) return NextResponse.json({ error: 'Username taken' }, { status: 409 });

  const hash = await hashPassword(password);
  const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(u, hash);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid) as User;

  setSessionCookie(signSession({ uid: user.id, username: user.username }));
  return NextResponse.json({ ok: true });
}
