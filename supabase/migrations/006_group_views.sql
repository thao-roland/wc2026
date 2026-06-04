-- =====================================================================
-- Migration 006 — extra RPCs that power the rich group page:
--   group_stats              → headline numbers
--   group_upcoming           → next N matches + "X/Y predicted"
--   group_recent             → last N finished matches + group highlight
--   group_match_predictions  → all group predictions for a given match
--                              (revealed once the match has kicked off, or
--                              if you're looking at your own prediction)
-- All are SECURITY DEFINER and gated on being an active member.
-- =====================================================================

create or replace function public.group_stats(p_group_id bigint)
returns table (
  members_count        int,
  finished_matches     int,
  total_predictions    int,
  exact_scores         int,
  correct_winners      int,
  avg_points           numeric,
  best_score           int,
  best_scorer          text
)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.group_members
     where group_id = p_group_id and user_id = auth.uid() and status = 'active'
  ) then raise exception 'not a member'; end if;

  return query
    with mem as (
      select user_id from public.group_members
       where group_id = p_group_id and status = 'active'
    ),
    member_preds as (
      select p.*, u.username
        from public.predictions p
        join mem on mem.user_id = p.user_id
        join public.profiles u on u.id = p.user_id
    ),
    scored as (
      select * from member_preds where points_earned is not null
    ),
    bests as (
      select username, points_earned
        from scored
       order by points_earned desc, username
       limit 1
    )
    select
      (select count(*)::int from mem),
      (select count(*)::int from public.matches where status = 'finished'),
      (select count(*)::int from member_preds),
      (select count(*)::int from scored where points_earned = 7),
      (select count(*)::int from scored where points_earned in (7,4,2)),
      coalesce((select round(avg(points_earned)::numeric, 2) from scored), 0),
      coalesce((select points_earned from bests), 0),
      coalesce((select username from bests), '—');
end $$;

create or replace function public.group_upcoming(p_group_id bigint, p_limit int default 5)
returns table (
  match_id          bigint,
  team_home         text,
  team_away         text,
  stage             text,
  group_name        text,
  match_date        timestamptz,
  members_total     int,
  members_predicted int,
  my_pred_home      int,
  my_pred_away      int
)
language plpgsql security definer set search_path = public as $$
declare
  total int;
begin
  if not exists (
    select 1 from public.group_members
     where group_id = p_group_id and user_id = auth.uid() and status = 'active'
  ) then raise exception 'not a member'; end if;

  select count(*)::int into total
    from public.group_members
   where group_id = p_group_id and status = 'active';

  return query
    select
      mt.id, mt.team_home, mt.team_away, mt.stage, mt.group_name, mt.match_date,
      total,
      coalesce((
        select count(*)::int from public.predictions p
          join public.group_members gm
            on gm.user_id = p.user_id
           and gm.group_id = p_group_id
           and gm.status = 'active'
         where p.match_id = mt.id
      ), 0),
      (select pred_home from public.predictions
        where user_id = auth.uid() and match_id = mt.id),
      (select pred_away from public.predictions
        where user_id = auth.uid() and match_id = mt.id)
    from public.matches mt
    where mt.status = 'upcoming' and mt.match_date >= now()
    order by mt.match_date asc
    limit p_limit;
end $$;

create or replace function public.group_recent(p_group_id bigint, p_limit int default 5)
returns table (
  match_id           bigint,
  team_home          text,
  team_away          text,
  stage              text,
  group_name         text,
  match_date         timestamptz,
  score_home         int,
  score_away         int,
  predictions_count  int,
  best_score         int,
  best_scorer        text
)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.group_members
     where group_id = p_group_id and user_id = auth.uid() and status = 'active'
  ) then raise exception 'not a member'; end if;

  return query
    with finished as (
      select id, team_home, team_away, stage, group_name, match_date,
             score_home, score_away
        from public.matches
       where status = 'finished'
         and score_home is not null
         and score_away is not null
       order by match_date desc
       limit p_limit
    ),
    preds as (
      select p.match_id, p.points_earned, u.username
        from public.predictions p
        join public.group_members gm
          on gm.user_id = p.user_id
         and gm.group_id = p_group_id
         and gm.status = 'active'
        join public.profiles u on u.id = p.user_id
    )
    select
      f.id, f.team_home, f.team_away, f.stage, f.group_name, f.match_date,
      f.score_home, f.score_away,
      coalesce((select count(*)::int from preds where match_id = f.id), 0),
      coalesce((select max(points_earned) from preds where match_id = f.id), 0),
      coalesce((
        select username from preds
         where match_id = f.id
         order by points_earned desc nulls last, username
         limit 1
      ), '—')
    from finished f
    order by f.match_date desc;
end $$;

create or replace function public.group_match_predictions(p_group_id bigint, p_match_id bigint)
returns table (
  user_id        uuid,
  username       text,
  pred_home      int,
  pred_away      int,
  points_earned  int,
  is_me          boolean
)
language plpgsql security definer set search_path = public as $$
declare
  m_status text;
  m_date   timestamptz;
begin
  if not exists (
    select 1 from public.group_members
     where group_id = p_group_id and user_id = auth.uid() and status = 'active'
  ) then raise exception 'not a member'; end if;

  select status, match_date into m_status, m_date
    from public.matches where id = p_match_id;
  if m_status is null then raise exception 'match not found'; end if;

  return query
    select
      u.id, u.username, p.pred_home, p.pred_away, p.points_earned,
      (u.id = auth.uid()) as is_me
    from public.predictions p
    join public.group_members gm
      on gm.user_id = p.user_id
     and gm.group_id = p_group_id
     and gm.status   = 'active'
    join public.profiles u on u.id = p.user_id
    where p.match_id = p_match_id
      and (m_status <> 'upcoming' or now() >= m_date or p.user_id = auth.uid())
    order by p.points_earned desc nulls last, u.username;
end $$;

grant execute on function public.group_stats(bigint)                            to authenticated;
grant execute on function public.group_upcoming(bigint, int)                    to authenticated;
grant execute on function public.group_recent(bigint, int)                      to authenticated;
grant execute on function public.group_match_predictions(bigint, bigint)        to authenticated;
