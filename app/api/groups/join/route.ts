import { NextResponse } from 'next/server';
import { getDb, type Group } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: Request) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { invite_code } = await req.json().catch(() => ({}));
  if (typeof invite_code !== 'string') {
    return NextResponse.json({ error: 'Invite code required' }, { status: 400 });
  }
  const code = invite_code.trim().toUpperCase();
  const db = getDb();
  const group = db.prepare('SELECT * FROM groups WHERE invite_code = ?').get(code) as
    | Group
    | undefined;
  if (!group) return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });

  const existing = db
    .prepare('SELECT status FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(group.id, s.uid) as { status: string } | undefined;

  if (existing) {
    return NextResponse.json({ group, status: existing.status });
  }

  db.prepare(
    `INSERT INTO group_members (group_id, user_id, status) VALUES (?, ?, 'pending')`,
  ).run(group.id, s.uid);

  return NextResponse.json({ group, status: 'pending' });
}
