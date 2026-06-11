-- =====================================================================
-- Migration 013 — pronostics longue durée du tournoi (Golden Boot
-- style) : vainqueur, meilleur buteur, meilleur passeur.
--
-- 1. tournament_picks : 1 ligne par joueur (winner / top scorer /
--    top assister) + ses points sur chacun.
-- 2. tournament_results : singleton (id=1) avec les vraies réponses.
--    Seuls les "admins" (= ceux qui ont créé un groupe) peuvent
--    éditer ce singleton.
-- 3. Trigger de verrouillage : pas d'édition des picks une fois que
--    le premier match du tournoi a démarré.
-- 4. Trigger de recalcul : dès qu'on touche tournament_results, on
--    recompile points_winner / points_top_scorer / points_top_assister
--    sur tous les picks.
-- 5. Le classement (group_leaderboard) inclut le bonus tournoi.
-- =====================================================================

create table if not exists public.tournament_picks (
  user_id              uuid primary key references public.profiles(id) on delete cascade,
  winner_team          text,
  top_scorer           text,
  top_assister         text,
  updated_at           timestamptz not null default now(),
  points_winner        int not null default 0,
  points_top_scorer    int not null default 0,
  points_top_assister  int not null default 0
);

create table if not exists public.tournament_results (
  id            int primary key check (id = 1),
  winner_team   text,
  top_scorer    text,
  top_assister  text,
  updated_at    timestamptz default now()
);

insert into public.tournament_results (id) values (1) on conflict (id) do nothing;

-- vue utilitaire : les 48 équipes du tournoi (= équipes en phase de
-- groupes), pour peupler le menu déroulant "vainqueur".
create or replace view public.wc_teams as
  select team from (
    select distinct team_home as team from public.matches where stage = 'Group Stage'
    union
    select distinct team_away      from public.matches where stage = 'Group Stage'
  ) t
  where team is not null
  order by team;

grant select on public.wc_teams to authenticated;

-- verrouillage : pas d'édition des picks une fois le premier match
-- du tournoi commencé.
create or replace function public.check_picks_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.matches where match_date <= now()) then
    raise exception 'pronos longs verrouillés : le tournoi a commencé';
  end if;
  return new;
end $$;

drop trigger if exists trg_lock_picks on public.tournament_picks;
create trigger trg_lock_picks
  before insert or update of winner_team, top_scorer, top_assister
  on public.tournament_picks
  for each row execute procedure public.check_picks_lock();

-- recalcul des points dès qu'on met à jour les "vraies" réponses.
create or replace function public.recalc_tournament_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tournament_picks
     set points_winner       = case when winner_team is not null
                                     and lower(winner_team)  = lower(coalesce(new.winner_team, ''))
                                    then 15 else 0 end,
         points_top_scorer   = case when top_scorer is not null
                                     and lower(top_scorer)   = lower(coalesce(new.top_scorer, ''))
                                    then 10 else 0 end,
         points_top_assister = case when top_assister is not null
                                     and lower(top_assister) = lower(coalesce(new.top_assister, ''))
                                    then 10 else 0 end;
  return new;
end $$;

drop trigger if exists trg_recalc_tournament on public.tournament_results;
create trigger trg_recalc_tournament
  after update on public.tournament_results
  for each row execute procedure public.recalc_tournament_points();

-- RLS
alter table public.tournament_picks   enable row level security;
alter table public.tournament_results enable row level security;

drop policy if exists tp_select_auth   on public.tournament_picks;
drop policy if exists tp_self_insert   on public.tournament_picks;
drop policy if exists tp_self_update   on public.tournament_picks;
drop policy if exists tr_select_auth   on public.tournament_results;
drop policy if exists tr_update_admin  on public.tournament_results;

create policy tp_select_auth on public.tournament_picks
  for select to authenticated using (true);
create policy tp_self_insert on public.tournament_picks
  for insert to authenticated with check (user_id = auth.uid());
create policy tp_self_update on public.tournament_picks
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy tr_select_auth on public.tournament_results
  for select to authenticated using (true);
create policy tr_update_admin on public.tournament_results
  for update to authenticated using (
    exists (select 1 from public.groups where created_by = auth.uid())
  );

-- classement : on ajoute le bonus tournoi au total et on l'expose
-- séparément (utile pour l'afficher dans la page groupe).
-- DROP nécessaire parce qu'on modifie la signature (ajout de colonnes
-- match_points et tournament_bonus) — Postgres refuse CREATE OR REPLACE
-- dans ce cas.
drop function if exists public.group_leaderboard(bigint);

create or replace function public.group_leaderboard(p_group_id bigint)
returns table (
  user_id            uuid,
  username           text,
  total_points       int,
  match_points       int,
  tournament_bonus   int,
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
    with mp as (
      select u.id as uid, u.username,
             coalesce(sum(p.points_earned), 0)::int                            as match_points,
             sum(case when p.points_earned = 5 then 1 else 0 end)::int         as exact_scores,
             sum(case when p.points_earned in (5,3,2) then 1 else 0 end)::int  as correct_winners,
             sum(case when p.points_earned is not null then 1 else 0 end)::int as scored_predictions
        from public.group_members gm
        join public.profiles u on u.id = gm.user_id
        left join public.predictions p on p.user_id = u.id
        left join public.matches mt on mt.id = p.match_id and mt.status = 'finished'
       where gm.group_id = p_group_id and gm.status = 'active'
       group by u.id, u.username
    ),
    bonus as (
      select tp.user_id,
             (coalesce(tp.points_winner, 0)
              + coalesce(tp.points_top_scorer, 0)
              + coalesce(tp.points_top_assister, 0))::int as bonus_pts
        from public.tournament_picks tp
    )
    select
      mp.uid,
      mp.username,
      (mp.match_points + coalesce(b.bonus_pts, 0))::int as total_points,
      mp.match_points,
      coalesce(b.bonus_pts, 0)::int                     as tournament_bonus,
      mp.exact_scores,
      mp.correct_winners,
      mp.scored_predictions
    from mp
    left join bonus b on b.user_id = mp.uid
    order by total_points desc, exact_scores desc, correct_winners desc, mp.username;
end $$;
