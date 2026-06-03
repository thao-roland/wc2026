/**
 * Pure scoring function.
 *
 *  7 → correct winner + exact score
 *  4 → correct winner + one team's score matches
 *  2 → correct winner only (no team score match)
 *  2 → correct draw (predicted draw, was a draw, wrong score)
 *  1 → wrong winner but one team's score matches
 *  0 → otherwise
 */
export function calculatePoints(
  predHome: number,
  predAway: number,
  actualHome: number,
  actualAway: number,
): number {
  const exact = predHome === actualHome && predAway === actualAway;
  if (exact) return 7;

  const predWinner = Math.sign(predHome - predAway);   // 1 home, -1 away, 0 draw
  const actualWinner = Math.sign(actualHome - actualAway);
  const sameWinner = predWinner === actualWinner;
  const oneScoreMatches = predHome === actualHome || predAway === actualAway;

  if (sameWinner && actualWinner === 0) {
    // both are draws; we know it's not exact (handled above)
    return 2;
  }

  if (sameWinner) {
    return oneScoreMatches ? 4 : 2;
  }

  return oneScoreMatches ? 1 : 0;
}
