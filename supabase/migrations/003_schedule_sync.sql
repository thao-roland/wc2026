-- =====================================================================
-- Migration 003 — schedule the sync-scores Edge Function every 10 min.
-- Run AFTER you deploy the Edge Function and set its secrets.
--
-- BEFORE running, replace YOUR_PROJECT_REF below with your real ref
-- (the subdomain part of your supabase URL, e.g. "xpcozrttepbmhgqrpuol").
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Drop any previous schedule before re-creating.
select cron.unschedule('sync-wc26-scores')
  where exists (select 1 from cron.job where jobname = 'sync-wc26-scores');

select cron.schedule(
  'sync-wc26-scores',
  '*/10 * * * *',
  $$
    select net.http_post(
      url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-scores',
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  $$
);
