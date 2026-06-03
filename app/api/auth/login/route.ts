import { NextResponse } from 'next/server';
import { getDb, type User } from '@/lib/db';
import { verifyPassword, signSession, setSessionCookie } from '@/lib/auth';

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  if (typeof username !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const u = username.trim().toLowerCase();
  const user = getDb().prepare('SELECT * FROM users WHERE username = ?').get(u) as User | undefined;
  if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  setSessionCookie(signSession({ uid: user.id, username: user.username }));
  return NextResponse.json({ ok: true });
}
