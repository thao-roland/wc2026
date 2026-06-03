const { getDb } = require('./db');
const { calculatePoints } = require('./scoring');

function recalcMatchPoints(matchId) {
  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) return 0;
  if (match.status !== 'finished' || match.score_home === null || match.score_away === null) {
    db.prepare('UPDATE predictions SET points_earned = NULL WHERE match_id = ?').run(matchId);
    return 0;
  }

  const preds = db
    .prepare('SELECT id, pred_home, pred_away FROM predictions WHERE match_id = ?')
    .all(matchId);

  const upd = db.prepare('UPDATE predictions SET points_earned = ? WHERE id = ?');
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      const pts = calculatePoints(r.pred_home, r.pred_away, match.score_home, match.score_away);
      upd.run(pts, r.id);
    }
  });
  tx(preds);
  return preds.length;
}

module.exports = { recalcMatchPoints };
