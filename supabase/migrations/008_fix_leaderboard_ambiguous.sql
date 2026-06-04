-- =====================================================================
-- Migration 008 — same fix as 007 applied to group_leaderboard.
--
-- group_leaderboard (from migration 001) declares user_id as an OUT
-- parameter via RETURNS TABLE, and its membership check query had
-- "where user_id = auth.uid()" unqualified. Postgres can't tell whether
-- "user_id" refers to the column or the OUT variable, hence the
-- "column reference 'user_id' is ambiguous" error.
--
-- This was previously masked by the RLS infinite-recursion error
-- (fixed in 004); now that RLS works it surfaces.
-- =====================================================================

create or replace function public.group_leaderboard(p_group_id bigint)
returns table (
  user_id            uuid,
  username           text,
  total_points       int,
  exact_scores       int,
  correct_winners    int,
  scored_predictions int
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not exists (
    select 1 from public.group_members gm
     where gm.group_id = p_group_id
       and gm.user_id  = auth.uid()
       and gm.status   = 'active'
  ) then
    raise exception 'not a member of this group';
  end if;

  return query
    select
      u.id,
      u.username,
      coalesce(sum(p.points_earned), 0)::int                              as total_points,
      sum(case when p.points_earned = 7 then 1 else 0 end)::int           as exact_scores,
      sum(case when p.points_earned in (7,4,2) then 1 else 0 end)::int    as correct_winners,
      sum(case when p.points_earned is not null then 1 else 0 end)::int   as scored_predictions
    from public.group_members gm
    join public.profiles u on u.id = gm.user_id
    left join public.predictions p on p.user_id = u.id
    left join public.matches mt on mt.id = p.match_id and mt.status = 'finished'
    where gm.group_id = p_group_id and gm.status = 'active'
    group by u.id, u.username
    order by total_points desc, exact_scores desc, correct_winners desc, u.username;
end $$;
