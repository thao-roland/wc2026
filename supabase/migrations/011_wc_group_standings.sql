-- =====================================================================
-- Migration 011 — vue "wc_group_standings" pour afficher le classement
-- des 12 groupes (A-L) du Mondial sur la page d'un groupe d'amis.
--
-- Recalculée à la volée depuis matches. Une équipe sans match joué
-- apparaît avec 0 partout grâce au LEFT JOIN sur la liste des équipes.
-- Hérite de la RLS de matches (SELECT autorisé pour authenticated).
-- =====================================================================

create or replace view public.wc_group_teams as
  select distinct group_name, team_home as team from public.matches
    where stage = 'Group Stage' and group_name is not null
  union
  select distinct group_name, team_away as team from public.matches
    where stage = 'Group Stage' and group_name is not null;

create or replace view public.wc_group_standings as
with sides as (
  -- Two rows per finished match (home + away).
  select group_name, team_home as team,
         score_home as gf, score_away as ga,
         case when score_home > score_away then 3
              when score_home = score_away then 1
              else 0 end as pts,
         (score_home > score_away)::int as w,
         (score_home = score_away)::int as d,
         (score_home < score_away)::int as l
    from public.matches
   where stage = 'Group Stage'
     and status = 'finished'
     and group_name is not null
     and score_home is not null and score_away is not null
  union all
  select group_name, team_away,
         score_away, score_home,
         case when score_away > score_home then 3
              when score_away = score_home then 1
              else 0 end,
         (score_away > score_home)::int,
         (score_away = score_home)::int,
         (score_away < score_home)::int
    from public.matches
   where stage = 'Group Stage'
     and status = 'finished'
     and group_name is not null
     and score_home is not null and score_away is not null
),
agg as (
  select group_name, team,
         count(*)::int  as played,
         sum(w)::int    as wins,
         sum(d)::int    as draws,
         sum(l)::int    as losses,
         sum(gf)::int   as gf,
         sum(ga)::int   as ga,
         sum(pts)::int  as points
    from sides
   group by group_name, team
)
select
  t.group_name,
  t.team,
  coalesce(a.played, 0)  as played,
  coalesce(a.wins,   0)  as wins,
  coalesce(a.draws,  0)  as draws,
  coalesce(a.losses, 0)  as losses,
  coalesce(a.gf,     0)  as gf,
  coalesce(a.ga,     0)  as ga,
  (coalesce(a.gf, 0) - coalesce(a.ga, 0)) as gd,
  coalesce(a.points, 0)  as points
from public.wc_group_teams t
left join agg a on a.group_name = t.group_name and a.team = t.team
order by t.group_name asc,
         points desc,
         gd desc,
         gf desc,
         t.team asc;

grant select on public.wc_group_teams      to authenticated;
grant select on public.wc_group_standings  to authenticated;
