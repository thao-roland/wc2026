-- =====================================================================
-- Migration 012 — rééquilibrage du barème pour resserrer les écarts.
--
-- Avant : 7 / 4 / 2 / 2 / 1 / 0    (max-min = 7)
-- Après : 5 / 3 / 2 / 2 / 1 / 1    (max-min = 4)
--
-- Deux leviers :
--   1) Plafond du score exact baissé : 7 → 5. Un coup d'éclat reste
--      le meilleur résultat possible, mais ne pèse plus 7× un prono
--      tristounet sur 104 matchs.
--   2) Prime de participation : tout prono déposé rapporte au moins
--      1 pt même s'il est totalement raté. Empêche les joueurs en
--      panne sèche de rester collés à zéro et de décrocher.
--
-- À la fin du fichier, on rejoue le calcul sur toutes les prédictions
-- des matchs déjà terminés pour que les classements actuels reflètent
-- le nouveau barème (pas de transition louche).
-- =====================================================================

create or replace function public.calculate_points(
  ph int, pa int, ah int, aa int
) returns int
language plpgsql
immutable
as $$
declare
  pred_w int := sign(ph - pa);
  act_w  int := sign(ah - aa);
  same_winner boolean := pred_w = act_w;
  one_score   boolean := ph = ah or pa = aa;
begin
  if ph = ah and pa = aa then return 5; end if;            -- score exact
  if same_winner and act_w = 0 then return 2; end if;      -- nul prédit, mauvais score
  if same_winner then
    if one_score then return 3; else return 2; end if;     -- bon vainqueur
  end if;
  return 1;                                                -- prono déposé, raté → consolation
end $$;

-- Recalcul global pour appliquer le nouveau barème aux pronos déjà scorés.
update public.predictions p
   set points_earned = public.calculate_points(p.pred_home, p.pred_away, mt.score_home, mt.score_away)
  from public.matches mt
 where mt.id = p.match_id
   and mt.status = 'finished'
   and mt.score_home is not null
   and mt.score_away is not null;

-- Les RPCs comptent "scores exacts" et "bons vainqueurs" par valeur de
-- points_earned. Avec le nouveau barème : exact = 5 (était 7), bon
-- vainqueur ∈ {5, 3, 2} (était {7, 4, 2}). On recompile.

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
      coalesce(sum(p.points_earned), 0)::int                            as total_points,
      sum(case when p.points_earned = 5 then 1 else 0 end)::int         as exact_scores,
      sum(case when p.points_earned in (5,3,2) then 1 else 0 end)::int  as correct_winners,
      sum(case when p.points_earned is not null then 1 else 0 end)::int as scored_predictions
    from public.group_members gm
    join public.profiles u on u.id = gm.user_id
    left join public.predictions p on p.user_id = u.id
    left join public.matches mt on mt.id = p.match_id and mt.status = 'finished'
    where gm.group_id = p_group_id and gm.status = 'active'
    group by u.id, u.username
    order by total_points desc, exact_scores desc, correct_winners desc, u.username;
end $$;

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
      (select count(*)::int from scored s where s.points_earned = 5),
      (select count(*)::int from scored s where s.points_earned in (5,3,2)),
      coalesce((select round(avg(s.points_earned)::numeric, 2) from scored s), 0),
      coalesce((select b.points_earned from bests b), 0),
      coalesce((select b.username      from bests b), '—');
end $$;
