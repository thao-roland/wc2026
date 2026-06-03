import { getDb } from './db';
import { calculatePoints } from './scoring';

export function recalcMatchPoints(matchId: number): number {
  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as
    | { id: number; score_home: number | null; score_away: number | null; status: string }
    | undefined;
  if (!match) return 0;
  if (match.status !== 'finished' || match.score_home === null || match.score_away === null) {
    db.prepare('UPDATE predictions SET points_earned = NULL WHERE match_id = ?').run(matchId);
    return 0;
  }

  const preds = db
    .prepare('SELECT id, pred_home, pred_away FROM predictions WHERE match_id = ?')
    .all(matchId) as { id: number; pred_home: number; pred_away: number }[];

  const upd = db.prepare('UPDATE predictions SET points_earned = ? WHERE id = ?');
  const tx = db.transaction((rows: typeof preds) => {
    for (const r of rows) {
      const pts = calculatePoints(r.pred_home, r.pred_away, match.score_home!, match.score_away!);
      upd.run(pts, r.id);
    }
  });
  tx(preds);
  return preds.length;
}
