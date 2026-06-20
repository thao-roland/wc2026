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

function statusFromTSDB(strStatus, hasScore, kickoffMs) {
  const s = (strStatus || '').toLowerCase().trim();
  // Statuts explicites "terminé"
  if (s.includes('finish') || s.includes('played') || s.includes('after')
      || s === 'ft' || s === 'aet' || s === 'pen' || s === 'ap') {
    return 'finished';
  }
  // Statuts explicites "pas commencé"
  if (s === 'not started' || s === 'ns' || s.includes('postponed') || s.includes('cancel')) {
    return 'upcoming';
  }
  // Aucun statut clair : on déduit du contexte (heure de coup d'envoi + score).
  if (kickoffMs && Date.now() >= kickoffMs + 2.5 * 60 * 60 * 1000 && hasScore) {
    return 'finished';   // > 2h30 après le coup d'envoi avec un score = match fini
  }
  if (!s || s === '') {
    return hasScore ? 'live' : 'upcoming';
  }
  // 1ère mi-temps, mi-temps, 2e mi-temps, "live", etc.
  return 'live';
}

// Trois sources, en parallèle, merge sur idEvent :
//   - eventsseason.php × 3 saisons → l'index bulk quand il existe
//   - eventsday.php × 5 derniers jours → indexe par date
//   - livescore.php (1 appel) → matchs actuellement en cours
// On gardait avant un eventsround.php × 21 combinaisons. Plus de mal
// que de bien : ça consommait la limite de la clé gratuite '3' et
// renvoyait surtout des doublons. Supprimé.
async function fetchTSDB() {
  const today = new Date();
  const days = [];
  for (let i = -5; i <= 1; i++) {
    const d = new Date(today.getTime() + i * 86_400_000);
    days.push(d.toISOString().slice(0, 10));
  }

  const seasonReqs = TSDB_SEASONS.map(async (season) => {
    const url = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/eventsseason.php?id=${TSDB_LEAGUE}&s=${season}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) { console.warn(`[sync] season "${season}" HTTP ${res.status}`); return []; }
      const j = await res.json();
      const evs = Array.isArray(j.events) ? j.events : [];
      if (evs.length > 0) console.log(`[sync] season "${season}" → ${evs.length} events`);
      return evs;
    } catch (e) { console.warn(`[sync] season "${season}" fetch failed:`, e.message); return []; }
  });

  const dayReqs = days.map(async (d) => {
    const url = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/eventsday.php?d=${d}&s=Soccer`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return [];
      const j = await res.json();
      const all = Array.isArray(j.events) ? j.events : [];
      return all.filter((ev) => ev.idLeague === String(TSDB_LEAGUE));
    } catch { return []; }
  });

  const liveReq = (async () => {
    const url = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/livescore.php?l=${TSDB_LEAGUE}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return [];
      const j = await res.json();
      const evs = Array.isArray(j.events) ? j.events : [];
      if (evs.length > 0) console.log(`[sync] livescore → ${evs.length} match(s) en cours`);
      return evs;
    } catch { return []; }
  })();

  const results = await Promise.all([...seasonReqs, ...dayReqs, liveReq]);
  const dayMatches = results.slice(TSDB_SEASONS.length, TSDB_SEASONS.length + days.length).flat();
  if (dayMatches.length > 0) {
    console.log(`[sync] day endpoint → ${dayMatches.length} WC events (${days.length} jours)`);
  }

  const merged = new Map();
  for (const arr of results) {
    for (const ev of arr) {
      const key = ev.idEvent || `${ev.strHomeTeam}|${ev.strAwayTeam}|${ev.dateEvent || ''}`;
      const existing = merged.get(key);
      if (!existing) { merged.set(key, ev); continue; }
      // Privilégie la version qui a un score quand l'autre n'en a pas.
      const ehas = existing.intHomeScore && existing.intHomeScore !== '';
      const nhas = ev.intHomeScore && ev.intHomeScore !== '';
      if (nhas && !ehas) merged.set(key, ev);
    }
  }
  const events = [...merged.values()];
  if (events.length > 0 && window.__wc26_sync_total !== events.length) {
    console.log(`[sync] total ${events.length} événements uniques (toutes sources confondues)`);
    window.__wc26_sync_total = events.length;
  }
  return events;
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
    .select('id, team_home, team_away, match_date, score_home, score_away, status');
  if (error) {
    console.warn('[sync] db read:', error.message);
    return { updated: 0, reason: error.message };
  }

  // Indexe les matchs locaux par paire (home|away) ET par paire inversée
  // (away|home) pour tolérer un swap home/away côté API.
  const byPair = new Map();
  const byPairRev = new Map();
  for (const m of local) {
    const h = normalize(m.team_home);
    const a = normalize(m.team_away);
    byPair.set(`${h}|${a}`, m);
    byPairRev.set(`${a}|${h}`, m);
  }

  let updated = 0, matched = 0;
  const unmatched = [];
  for (const ev of apiEvents) {
    const apiH = normalize(ev.strHomeTeam);
    const apiA = normalize(ev.strAwayTeam);
    let match = byPair.get(`${apiH}|${apiA}`);
    let swapped = false;
    if (!match) {
      match = byPairRev.get(`${apiH}|${apiA}`);
      if (match) swapped = true;
    }
    if (!match) {
      unmatched.push(`${ev.strHomeTeam} vs ${ev.strAwayTeam}`);
      continue;
    }
    matched++;

    // Si TheSportsDB a inversé home/away, on inverse les scores aussi.
    const rawH = (ev.intHomeScore === null || ev.intHomeScore === '' || ev.intHomeScore === undefined)
      ? null : Number(ev.intHomeScore);
    const rawA = (ev.intAwayScore === null || ev.intAwayScore === '' || ev.intAwayScore === undefined)
      ? null : Number(ev.intAwayScore);
    const sH = swapped ? rawA : rawH;
    const sA = swapped ? rawH : rawA;

    const kickoffMs = match.match_date ? new Date(match.match_date).getTime() : null;
    const status = statusFromTSDB(ev.strStatus, sH !== null || sA !== null, kickoffMs);

    if (match.status === status && match.score_home === sH && match.score_away === sA) continue;

    const { error: updErr } = await WC.sb
      .from('matches')
      .update({ score_home: sH, score_away: sA, status })
      .eq('id', match.id);
    if (updErr) { console.warn('[sync] update', match.id, updErr.message); continue; }
    updated++;
  }
  console.log(`[sync] matched ${matched}/${apiEvents.length} events · updated ${updated} match(es)`);
  if (unmatched.length > 0 && unmatched.length <= 20) {
    console.log('[sync] unmatched events :', unmatched);
  }
  // Expose la dernière sync pour l'indicateur du header
  window.__wc26_last_sync = Date.now();
  window.dispatchEvent(new CustomEvent('wc26:sync-attempt', {
    detail: { updated, matched, total: apiEvents.length },
  }));
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
