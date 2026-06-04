// Auto-sync des scores depuis TheSportsDB (API gratuite, CORS-friendly).
// Tourne au chargement du dashboard / page groupe, puis toutes les 60s
// tant que l'onglet est visible. Réveil immédiat quand l'onglet revient.

const TSDB_KEY      = '3';
const TSDB_LEAGUE   = 4429;                      // FIFA World Cup
const TSDB_SEASONS  = ['2026', '2025-2026', '2025']; // try each until one works
const POLL_INTERVAL = 60_000;

// Tous les variants connus d'un nom d'équipe se résolvent vers le même
// "canonical". Aussi bien la DB que l'API passent par normalize(),
// donc "Türkiye", "Turkey", "Turkiye" finissent tous à "turkiye".
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

// Try each season variant until we get a non-empty events array.
async function fetchTSDB() {
  for (const season of TSDB_SEASONS) {
    const url = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/eventsseason.php?id=${TSDB_LEAGUE}&s=${season}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const j = await res.json();
      if (Array.isArray(j.events) && j.events.length > 0) {
        if (window.__wc26_sync_logged !== season) {
          console.log(`[sync] using TheSportsDB season "${season}" (${j.events.length} events)`);
          window.__wc26_sync_logged = season;
        }
        return j.events;
      }
    } catch (e) { /* try the next */ }
  }
  return [];
}

async function syncScoresOnce() {
  if (!window.WC || !window.WC.sb) return { updated: 0, reason: 'WC not ready' };

  let apiEvents;
  try { apiEvents = await fetchTSDB(); }
  catch (ex) {
    console.warn('[sync] fetch failed:', ex.message);
    return { updated: 0, reason: 'TheSportsDB unreachable' };
  }
  if (apiEvents.length === 0) {
    console.warn('[sync] TheSportsDB returned no events for any season variant');
    return { updated: 0, reason: 'no events from TheSportsDB' };
  }

  const { data: local, error } = await WC.sb
    .from('matches')
    .select('id, team_home, team_away, score_home, score_away, status');
  if (error) {
    console.warn('[sync] db read:', error.message);
    return { updated: 0, reason: error.message };
  }

  const byPair = new Map();
  for (const m of local) {
    byPair.set(`${normalize(m.team_home)}|${normalize(m.team_away)}`, m);
  }

  let updated = 0, matched = 0;
  for (const ev of apiEvents) {
    const key = `${normalize(ev.strHomeTeam)}|${normalize(ev.strAwayTeam)}`;
    const match = byPair.get(key);
    if (!match) continue;
    matched++;

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
  console.log(`[sync] matched ${matched}/${apiEvents.length} events · updated ${updated} match(es)`);
  if (updated > 0) {
    window.dispatchEvent(new CustomEvent('wc26:scores-synced', { detail: { updated } }));
  }
  return { updated, matched, total: apiEvents.length };
}

// Manual trigger so the user can force-refresh from the UI.
async function syncNowWithFeedback(btn) {
  if (!btn) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳';
  try {
    const r = await syncScoresOnce();
    btn.textContent = r.updated > 0 ? `✓ ${r.updated} maj` : '✓ à jour';
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2500);
  } catch (ex) {
    btn.textContent = '✗';
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2500);
  }
}

window.WC_SYNC = { syncScoresOnce, syncNowWithFeedback };

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
