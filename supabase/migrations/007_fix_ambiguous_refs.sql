-- =====================================================================
-- Migration 007 — fix "column reference 'user_id' is ambiguous" on group
-- page load.
--
-- Cause: the 006 RPCs declare OUT parameters via RETURNS TABLE (eg.
-- match_id, user_id). plpgsql exposes those names as variables visible
-- inside the function body. Our sub-queries reference the same names
-- unqualified (eg. "where user_id = auth.uid()") and Postgres can't
-- decide between the column and the OUT variable, so it raises an
-- ambiguity error.
--
-- Fix: prefix every column reference with its table alias and add
-- "#variable_conflict use_column" so columns always win.
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
#variable_conflict use_column
begin
  if not exists (
    select 1 from public.group_members gm
     where gm.group_id = p_group_id and gm.user_id = auth.uid() and gm.status = 'active'
  ) then raise exception 'not a member'; end if;

  return query
    with mem as (
      select gm.user_id
        from public.group_members gm
       where gm.group_id = p_group_id and gm.status = 'active'
    ),
    member_preds as (
      select p.id, p.user_id, p.match_id, p.points_earned, u.username
        from public.predictions p
        join mem on mem.user_id = p.user_id
        join public.profiles u on u.id = p.user_id
    ),
    scored as (
      select * from member_preds mp where mp.points_earned is not null
    ),
    bests as (
      select s.username, s.points_earned
        from scored s
       order by s.points_earned desc, s.username
       limit 1
    )
    select
      (select count(*)::int from mem),
      (select count(*)::int from public.matches mt where mt.status = 'finished'),
      (select count(*)::int from member_preds),
      (select count(*)::int from scored s where s.points_earned = 7),
      (select count(*)::int from scored s where s.points_earned in (7,4,2)),
      coalesce((select round(avg(s.points_earned)::numeric, 2) from scored s), 0),
      coalesce((select b.points_earned from bests b), 0),
      coalesce((select b.username      from bests b), '—');
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
#variable_conflict use_column
declare
  total int;
begin
  if not exists (
    select 1 from public.group_members gm
     where gm.group_id = p_group_id and gm.user_id = auth.uid() and gm.status = 'active'
  ) then raise exception 'not a member'; end if;

  select count(*)::int into total
    from public.group_members gm
   where gm.group_id = p_group_id and gm.status = 'active';

  return query
    select
      mt.id, mt.team_home, mt.team_away, mt.stage, mt.group_name, mt.match_date,
      total,
      coalesce((
        select count(*)::int from public.predictions p
          join public.group_members gm
            on gm.user_id  = p.user_id
           and gm.group_id = p_group_id
           and gm.status   = 'active'
         where p.match_id = mt.id
      ), 0),
      (select pp.pred_home from public.predictions pp
        where pp.user_id = auth.uid() and pp.match_id = mt.id),
      (select pp.pred_away from public.predictions pp
        where pp.user_id = auth.uid() and pp.match_id = mt.id)
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
#variable_conflict use_column
begin
  if not exists (
    select 1 from public.group_members gm
     where gm.group_id = p_group_id and gm.user_id = auth.uid() and gm.status = 'active'
  ) then raise exception 'not a member'; end if;

  return query
    with finished as (
      select mt.id, mt.team_home, mt.team_away, mt.stage, mt.group_name, mt.match_date,
             mt.score_home, mt.score_away
        from public.matches mt
       where mt.status = 'finished'
         and mt.score_home is not null
         and mt.score_away is not null
       order by mt.match_date desc
       limit p_limit
    ),
    preds as (
      select p.match_id, p.points_earned, u.username
        from public.predictions p
        join public.group_members gm
          on gm.user_id  = p.user_id
         and gm.group_id = p_group_id
         and gm.status   = 'active'
        join public.profiles u on u.id = p.user_id
    )
    select
      f.id, f.team_home, f.team_away, f.stage, f.group_name, f.match_date,
      f.score_home, f.score_away,
      coalesce((select count(*)::int from preds pr where pr.match_id = f.id), 0),
      coalesce((select max(pr.points_earned) from preds pr where pr.match_id = f.id), 0),
      coalesce((
        select pr.username from preds pr
         where pr.match_id = f.id
         order by pr.points_earned desc nulls last, pr.username
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
#variable_conflict use_column
declare
  m_status text;
  m_date   timestamptz;
begin
  if not exists (
    select 1 from public.group_members gm
     where gm.group_id = p_group_id and gm.user_id = auth.uid() and gm.status = 'active'
  ) then raise exception 'not a member'; end if;

  select mt.status, mt.match_date into m_status, m_date
    from public.matches mt where mt.id = p_match_id;
  if m_status is null then raise exception 'match not found'; end if;

  return query
    select
      u.id, u.username, p.pred_home, p.pred_away, p.points_earned,
      (u.id = auth.uid())
    from public.predictions p
    join public.group_members gm
      on gm.user_id  = p.user_id
     and gm.group_id = p_group_id
     and gm.status   = 'active'
    join public.profiles u on u.id = p.user_id
    where p.match_id = p_match_id
      and (m_status <> 'upcoming' or now() >= m_date or p.user_id = auth.uid())
    order by p.points_earned desc nulls last, u.username;
end $$;
