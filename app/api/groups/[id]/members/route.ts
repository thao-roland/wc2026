import { NextResponse } from 'next/server';
import { getDb, type Group } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const gid = Number(params.id);
  const db = getDb();
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(gid) as Group | undefined;
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

  const me = db
    .prepare('SELECT status FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(gid, s.uid) as { status: string } | undefined;
  if (!me || me.status !== 'active') {
    return NextResponse.json({ error: 'Not a member' }, { status: 403 });
  }

  const members = db
    .prepare(
      `SELECT u.id, u.username, gm.status, gm.joined_at
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ?
       ORDER BY gm.status, gm.joined_at`,
    )
    .all(gid);
  return NextResponse.json({ group, members, is_owner: group.created_by === s.uid });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const gid = Number(params.id);
  const { user_id, action } = await req.json().catch(() => ({}));
  if (!Number.isInteger(user_id) || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const db = getDb();
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(gid) as Group | undefined;
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  if (group.created_by !== s.uid) {
    return NextResponse.json({ error: 'Only the group owner can do that' }, { status: 403 });
  }

  if (action === 'approve') {
    db.prepare(
      `UPDATE group_members SET status = 'active'
       WHERE group_id = ? AND user_id = ? AND status = 'pending'`,
    ).run(gid, user_id);
  } else {
    db.prepare(
      `DELETE FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'pending'`,
    ).run(gid, user_id);
  }
  return NextResponse.json({ ok: true });
}
