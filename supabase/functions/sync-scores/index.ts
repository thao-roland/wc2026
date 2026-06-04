// Supabase Edge Function — sync match scores from football-data.org
//
// Deploy:
//   supabase functions deploy sync-scores --no-verify-jwt
//
// Set secrets (one-time):
//   supabase secrets set FOOTBALL_DATA_TOKEN=YOUR_API_KEY_FROM_football-data.org
//
// Manually invoke (test):
//   curl -X POST https://<your-project>.supabase.co/functions/v1/sync-scores
//
// Schedule (runs every 10 minutes during the tournament). Run once in the
// SQL editor:
//   select cron.schedule(
//     'sync-wc26-scores', '*/10 * * * *',
//     $$ select net.http_post(
//          url := 'https://<your-project>.supabase.co/functions/v1/sync-scores',
//          headers := '{"Content-Type":"application/json"}'::jsonb
//        ); $$
//   );

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// football-data.org competition ID for the FIFA World Cup
const COMPETITION = 'WC';
const API_BASE = 'https://api.football-data.org/v4';

Deno.serve(async () => {
  const token = Deno.env.get('FOOTBALL_DATA_TOKEN');
  if (!token) {
    return new Response(JSON.stringify({ error: 'FOOTBALL_DATA_TOKEN secret not set' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }

  // Service-role key bypasses RLS so this function can update matches without
  // a user session.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Fetch all matches for the World Cup.
  const apiRes = await fetch(`${API_BASE}/competitions/${COMPETITION}/matches`, {
    headers: { 'X-Auth-Token': token },
  });
  if (!apiRes.ok) {
    return new Response(JSON.stringify({ error: `football-data: ${apiRes.status}` }), {
      status: 502, headers: { 'content-type': 'application/json' },
    });
  }
  const payload = await apiRes.json();
  const apiMatches: any[] = payload.matches || [];

  // Pull every local match once.
  const { data: localMatches, error: loadErr } = await supabase
    .from('matches')
    .select('id, stage, team_home, team_away, status, score_home, score_away, match_date');
  if (loadErr) {
    return new Response(JSON.stringify({ error: loadErr.message }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }

  // Build a lookup by normalized team pair + day. football-data team names
  // are stable enough that a direct (home, away) match is usually right.
  function key(home: string, away: string, dateIso: string) {
    return `${home.toLowerCase()}|${away.toLowerCase()}|${dateIso.slice(0, 10)}`;
  }
  const byKey = new Map<string, any>();
  for (const m of localMatches || []) {
    byKey.set(key(m.team_home, m.team_away, m.match_date), m);
  }

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const am of apiMatches) {
    const home = am.homeTeam?.name || '';
    const away = am.awayTeam?.name || '';
    const utcDate = am.utcDate;
    if (!home || !away || !utcDate) { skipped++; continue; }

    // Try direct match first.
    let local = byKey.get(key(home, away, utcDate));
    // Fallback: match same teams ignoring date (knockout placeholders).
    if (!local) {
      local = (localMatches || []).find(
        (m) => m.team_home.toLowerCase() === home.toLowerCase()
            && m.team_away.toLowerCase() === away.toLowerCase(),
      );
    }
    if (!local) { skipped++; continue; }

    const fhHome = am.score?.fullTime?.home;
    const fhAway = am.score?.fullTime?.away;
    let status: 'upcoming' | 'live' | 'finished';
    switch (am.status) {
      case 'FINISHED':
      case 'AWARDED':
        status = 'finished'; break;
      case 'IN_PLAY':
      case 'PAUSED':
      case 'LIVE':
        status = 'live'; break;
      default:
        status = 'upcoming';
    }

    // Only write if something actually changed.
    const same =
      local.status === status &&
      local.score_home === (fhHome ?? null) &&
      local.score_away === (fhAway ?? null);
    if (same) continue;

    const { error } = await supabase
      .from('matches')
      .update({
        status,
        score_home: status === 'upcoming' ? null : (fhHome ?? null),
        score_away: status === 'upcoming' ? null : (fhAway ?? null),
      })
      .eq('id', local.id);
    if (error) errors.push(`#${local.id}: ${error.message}`);
    else updated++;
  }

  return new Response(JSON.stringify({
    ok: true,
    api_matches: apiMatches.length,
    updated,
    skipped,
    errors,
  }), { headers: { 'content-type': 'application/json' } });
});
