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

  const rows = db
    .prepare(
      `
      SELECT
        u.id           AS user_id,
        u.username     AS username,
        COALESCE(SUM(p.points_earned), 0)                                   AS total_points,
        SUM(CASE WHEN p.points_earned = 7 THEN 1 ELSE 0 END)                AS exact_scores,
        SUM(CASE WHEN p.points_earned IN (7,4,2) THEN 1 ELSE 0 END)         AS correct_winners,
        SUM(CASE WHEN p.points_earned IS NOT NULL THEN 1 ELSE 0 END)        AS scored_predictions
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      LEFT JOIN predictions p ON p.user_id = u.id
      LEFT JOIN matches m ON m.id = p.match_id AND m.status = 'finished'
      WHERE gm.group_id = ? AND gm.status = 'active'
      GROUP BY u.id, u.username
      ORDER BY total_points DESC, exact_scores DESC, correct_winners DESC, u.username ASC
    `,
    )
    .all(gid);

  return NextResponse.json({ group, leaderboard: rows, me: s.uid });
}
