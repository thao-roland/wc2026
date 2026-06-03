/**
 * Pure scoring function for WC26 predictions.
 *
 *  7 → exact score
 *  4 → right winner + one team score matches
 *  2 → right winner only / called the draw (wrong score)
 *  1 → wrong winner but one team score matches
 *  0 → otherwise
 */
function calculatePoints(predHome, predAway, actualHome, actualAway) {
  if (predHome === actualHome && predAway === actualAway) return 7;

  const predW = Math.sign(predHome - predAway);
  const actW = Math.sign(actualHome - actualAway);
  const sameWinner = predW === actW;
  const oneScore = predHome === actualHome || predAway === actualAway;

  if (sameWinner && actW === 0) return 2;          // both draws, not exact
  if (sameWinner) return oneScore ? 4 : 2;          // home or away winner
  return oneScore ? 1 : 0;                          // wrong winner
}

module.exports = { calculatePoints };
