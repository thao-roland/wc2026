import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getDb, type Group } from '@/lib/db';
import { getSession } from '@/lib/auth';

function newInviteCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

export async function GET() {
  const s = getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  const groups = db
    .prepare(
      `SELECT g.*, gm.status AS my_status
       FROM groups g
       JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
       ORDER BY g.created_at DESC`,
    )
    .all(s.uid);
  return NextResponse.json({ groups });
}

export async function POST(req: Request) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name } = await req.json().catch(() => ({}));
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 60) {
    return NextResponse.json({ error: 'Group name 2-60 chars required' }, { status: 400 });
  }

  const db = getDb();
  let code = newInviteCode();
  for (let i = 0; i < 5; i++) {
    const exists = db.prepare('SELECT 1 FROM groups WHERE invite_code = ?').get(code);
    if (!exists) break;
    code = newInviteCode();
  }

  const info = db
    .prepare('INSERT INTO groups (name, invite_code, created_by) VALUES (?, ?, ?)')
    .run(name.trim(), code, s.uid);
  const gid = Number(info.lastInsertRowid);

  db.prepare(
    `INSERT INTO group_members (group_id, user_id, status) VALUES (?, ?, 'active')`,
  ).run(gid, s.uid);

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(gid) as Group;
  return NextResponse.json({ group });
}
