-- =====================================================================
-- Migration 010 — RPC qui renvoie un tableau (membre x match terminé)
-- des points gagnés, pour afficher un "tableau des points" cliquable
-- sur la page du groupe.
-- =====================================================================

create or replace function public.group_points_matrix(p_group_id bigint)
returns table (
  match_id      bigint,
  team_home     text,
  team_away     text,
  score_home    int,
  score_away    int,
  match_date    timestamptz,
  user_id       uuid,
  username      text,
  points        int,
  pred_home     int,
  pred_away     int,
  is_me         boolean
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
  ) then raise exception 'not a member'; end if;

  return query
    with members as (
      select gm.user_id, pr.username
        from public.group_members gm
        join public.profiles pr on pr.id = gm.user_id
       where gm.group_id = p_group_id and gm.status = 'active'
    ),
    fin as (
      select mt.id, mt.team_home, mt.team_away, mt.score_home, mt.score_away, mt.match_date
        from public.matches mt
       where mt.status = 'finished'
         and mt.score_home is not null
         and mt.score_away is not null
    )
    select
      f.id, f.team_home, f.team_away, f.score_home, f.score_away, f.match_date,
      m.user_id, m.username,
      coalesce(p.points_earned, 0),
      p.pred_home, p.pred_away,
      (m.user_id = auth.uid())
    from fin f
    cross join members m
    left join public.predictions p on p.match_id = f.id and p.user_id = m.user_id
    order by f.match_date asc, m.username asc;
end $$;

grant execute on function public.group_points_matrix(bigint) to authenticated;
