import { NextResponse } from 'next/server';
import { getDb, type Match } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(req: Request) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const match_id = Number(body.match_id);
  const pred_home = Number(body.pred_home);
  const pred_away = Number(body.pred_away);
  if (!Number.isInteger(match_id) || !Number.isInteger(pred_home) || !Number.isInteger(pred_away)) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  if (pred_home < 0 || pred_away < 0 || pred_home > 20 || pred_away > 20) {
    return NextResponse.json({ error: 'Score out of range' }, { status: 400 });
  }

  const db = getDb();
  const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(match_id) as Match | undefined;
  if (!m) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

  // Lock when match has started.
  const kickoff = new Date(m.match_date).getTime();
  const lockedByTime = Date.now() >= kickoff;
  if (m.status !== 'upcoming' || lockedByTime) {
    return NextResponse.json({ error: 'Predictions locked for this match' }, { status: 409 });
  }

  db.prepare(
    `INSERT INTO predictions (user_id, match_id, pred_home, pred_away)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, match_id) DO UPDATE SET
       pred_home = excluded.pred_home,
       pred_away = excluded.pred_away,
       submitted_at = datetime('now'),
       points_earned = NULL`,
  ).run(s.uid, match_id, pred_home, pred_away);

  return NextResponse.json({ ok: true });
}
