-- =====================================================================
-- Migration 005 — let any authenticated user UPDATE matches.
--
-- Background: scores now come from the browser (a TheSportsDB fetch on
-- dashboard load), not from an admin panel. Since match results are
-- public knowledge, allowing every signed-in user to write them is
-- acceptable for a private friends game — any deliberate tampering gets
-- corrected on the next sync.
-- =====================================================================

drop policy if exists matches_admin_update on public.matches;

create policy matches_user_update on public.matches
  for update to authenticated using (true) with check (true);
