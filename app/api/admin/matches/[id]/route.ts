import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recalcMatchPoints } from '@/lib/recalc';

function isAdmin(uid: number): boolean {
  const r = getDb()
    .prepare('SELECT 1 FROM groups WHERE created_by = ? LIMIT 1')
    .get(uid);
  return !!r;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(s.uid)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const mid = Number(params.id);
  const body = await req.json().catch(() => ({}));
  const { score_home, score_away, status, team_home, team_away } = body;

  const db = getDb();
  const existing = db.prepare('SELECT id FROM matches WHERE id = ?').get(mid);
  if (!existing) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (Number.isInteger(score_home)) { sets.push('score_home = ?'); vals.push(score_home); }
  if (Number.isInteger(score_away)) { sets.push('score_away = ?'); vals.push(score_away); }
  if (status === 'upcoming' || status === 'live' || status === 'finished') {
    sets.push('status = ?');
    vals.push(status);
  }
  if (typeof team_home === 'string' && team_home.trim()) { sets.push('team_home = ?'); vals.push(team_home.trim()); }
  if (typeof team_away === 'string' && team_away.trim()) { sets.push('team_away = ?'); vals.push(team_away.trim()); }

  if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  vals.push(mid);
  db.prepare(`UPDATE matches SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(mid) as
    | { status: string; score_home: number | null; score_away: number | null }
    | undefined;

  let recalced = 0;
  if (updated?.status === 'finished' && updated.score_home !== null && updated.score_away !== null) {
    recalced = recalcMatchPoints(mid);
  } else {
    // clear stale points if reopened
    db.prepare('UPDATE predictions SET points_earned = NULL WHERE match_id = ?').run(mid);
  }

  return NextResponse.json({ ok: true, recalculated: recalced });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  // explicit "recalc" trigger
  const s = getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(s.uid)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(req.url);
  if (url.searchParams.get('action') !== 'recalc') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
  const n = recalcMatchPoints(Number(params.id));
  return NextResponse.json({ ok: true, recalculated: n });
}
