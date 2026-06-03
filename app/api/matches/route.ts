import { NextResponse } from 'next/server';
import { getDb, type Match, type Prediction } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: Request) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const filter = url.searchParams.get('stage'); // 'group' | 'knockout' | null

  const db = getDb();
  let matches: Match[];
  if (filter === 'group') {
    matches = db.prepare("SELECT * FROM matches WHERE stage = 'Group Stage' ORDER BY match_date, id").all() as Match[];
  } else if (filter === 'knockout') {
    matches = db.prepare("SELECT * FROM matches WHERE stage != 'Group Stage' ORDER BY match_date, id").all() as Match[];
  } else {
    matches = db.prepare('SELECT * FROM matches ORDER BY match_date, id').all() as Match[];
  }

  const preds = db
    .prepare('SELECT * FROM predictions WHERE user_id = ?')
    .all(s.uid) as Prediction[];
  const byMatch = new Map<number, Prediction>();
  for (const p of preds) byMatch.set(p.match_id, p);

  return NextResponse.json({
    matches: matches.map((m) => ({ ...m, prediction: byMatch.get(m.id) ?? null })),
  });
}
