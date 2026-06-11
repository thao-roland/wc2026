-- =====================================================================
-- Migration 014 — décale le verrouillage des pronos longs.
--
-- Le trigger 013 verrouillait dès que le premier match avait démarré,
-- ce qui était trop court (l'utilisateur n'a pas eu le temps de poser
-- ses pronos). Désormais on s'appuie sur une date butoir explicite
-- stockée dans tournament_results.picks_lock_at, qu'on peut prolonger
-- à la volée par un simple UPDATE.
--
-- Effet immédiat : 30 minutes supplémentaires à partir du moment où
-- cette migration tourne. Si tu veux re-prolonger plus tard, relance
-- juste la ligne UPDATE en bas.
-- =====================================================================

alter table public.tournament_results
  add column if not exists picks_lock_at timestamptz;

-- Pose la nouvelle date butoir : maintenant + 30 minutes.
update public.tournament_results
   set picks_lock_at = now() + interval '30 minutes'
 where id = 1;

-- Trigger réécrit : on regarde la date butoir explicite, pas le
-- premier match. Si elle est NULL on ne verrouille jamais (utile en
-- dev), sinon on bloque toute écriture après cette date.
create or replace function public.check_picks_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  deadline timestamptz;
begin
  select picks_lock_at into deadline from public.tournament_results where id = 1;
  if deadline is not null and now() >= deadline then
    raise exception 'pronos longs verrouillés : la date butoir est passée';
  end if;
  return new;
end $$;

-- Recharge le schéma pour PostgREST.
notify pgrst, 'reload schema';
