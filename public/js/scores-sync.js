// Auto-syncs match scores from TheSportsDB (free, CORS-enabled).
// Runs on dashboard / group page load and every 60s while the tab is open.
//
// Why a free public key: the data is publicly available and the only
// purpose is to copy it into our DB; rate limits are generous enough
// for a private friends app.

const TSDB_KEY      = '3';
const TSDB_LEAGUE   = 4419;     // FIFA World Cup
const TSDB_SEASON   = '2026';
const POLL_INTERVAL = 60_000;

// After normalize() runs (lowercase, diacritic strip, punctuation→space),
// these aliases collapse all known variants of a team name to a single
// canonical key. Both the DB row and the API row pass through this, so
// "Türkiye", "Turkey", "Turkiye" all become "turkiye" and the join works.
const ALIASES = {
  'turkey':                            'turkiye',
  'united states':                     'usa',
  'united states of america':          'usa',
  'korea republic':                    'korea',
  'south korea':                       'korea',
  'czech republic':                    'czechia',
  'cote d ivoire':                     'ivory coast',
  'côte d ivoire':                     'ivory coast',
  'dr congo':                          'congo',
  'congo dr':                          'congo',
  'democratic republic of the congo':  'congo',
  'democratic republic of congo':      'congo',
  'cabo verde':                        'cape verde',
  'bosnia and herzegovina':            'bosnia',
  'bosnia herzegovina':                'bosnia',
  'curacao':                           'curacao',
  'iran islamic republic of':          'iran',
};

function normalize(s) {
  const n = (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return ALIASES[n] || n;
}

function statusFromTSDB(strStatus, hasScore) {
  const s = (strStatus || '').toLowerCase().trim();
  if (!s || s === 'not started' || s === 'ns' || s.includes('postponed')) {
    return hasScore ? 'live' : 'upcoming';
  }
  if (s.includes('finish') || s === 'ft' || s === 'aet' || s === 'pen' || s.includes('after')) {
    return 'finished';
  }
  return 'live';
}

async function fetchTSDB() {
  const url = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/eventsseason.php?id=${TSDB_LEAGUE}&s=${TSDB_SEASON}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`TheSportsDB HTTP ${res.status}`);
  const j = await res.json();
  return Array.isArray(j.events) ? j.events : [];
}

async function syncScoresOnce() {
  if (!window.WC || !window.WC.sb) return 0;

  let apiEvents;
  try { apiEvents = await fetchTSDB(); }
  catch (ex) { console.warn('[sync] fetch failed:', ex.message); return 0; }
  if (apiEvents.length === 0) return 0;

  const { data: local, error } = await WC.sb
    .from('matches')
    .select('id, team_home, team_away, score_home, score_away, status');
  if (error) { console.warn('[sync] db read:', error.message); return 0; }

  const byPair = new Map();
  for (const m of local) {
    byPair.set(`${normalize(m.team_home)}|${normalize(m.team_away)}`, m);
  }

  let updated = 0;
  for (const ev of apiEvents) {
    const key = `${normalize(ev.strHomeTeam)}|${normalize(ev.strAwayTeam)}`;
    const match = byPair.get(key);
    if (!match) continue;

    const sH = (ev.intHomeScore === null || ev.intHomeScore === '' || ev.intHomeScore === undefined)
      ? null : Number(ev.intHomeScore);
    const sA = (ev.intAwayScore === null || ev.intAwayScore === '' || ev.intAwayScore === undefined)
      ? null : Number(ev.intAwayScore);
    const status = statusFromTSDB(ev.strStatus, sH !== null || sA !== null);

    if (match.status === status && match.score_home === sH && match.score_away === sA) continue;

    const { error: updErr } = await WC.sb
      .from('matches')
      .update({ score_home: sH, score_away: sA, status })
      .eq('id', match.id);
    if (updErr) { console.warn('[sync] update', match.id, updErr.message); continue; }
    updated++;
  }
  if (updated > 0) {
    console.log(`[sync] updated ${updated} match(es)`);
    window.dispatchEvent(new CustomEvent('wc26:scores-synced', { detail: { updated } }));
  }
  return updated;
}

window.WC_SYNC = { syncScoresOnce };

(function autoSync() {
  function tick() {
    if (document.visibilityState !== 'visible') return;
    syncScoresOnce().catch(() => {});
  }
  setTimeout(tick, 200);
  setInterval(tick, POLL_INTERVAL);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
})();
