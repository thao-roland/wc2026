-- =====================================================================
-- WC26.bets — initial Supabase schema
--
-- Tables:   profiles, groups, group_members, matches, predictions
-- Auth:     Supabase Auth (email/password). Username is stored in profiles
--           and supplied at signup via user metadata. The frontend maps
--           username <-> a fake email (`<username>@wc26.local`) so users
--           never see an email field.
-- Scoring:  PL/pgSQL function + UPDATE trigger on matches that recalcs
--           every prediction when a match is set to finished.
-- Locking:  BEFORE trigger on predictions rejects inserts/updates after
--           the match has kicked off.
-- RLS:      Each table has policies; reading other users' predictions is
--           gated on the match being finished. Leaderboards & invite-code
--           joins go through SECURITY DEFINER functions.
-- =====================================================================

-- ---------- tables ----------

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null check (length(username) between 3 and 32),
  created_at  timestamptz not null default now()
);

create table if not exists public.groups (
  id           bigserial primary key,
  name         text not null check (length(name) between 2 and 60),
  invite_code  text unique not null
                 default upper(substr(encode(gen_random_bytes(4),'hex'), 1, 8)),
  created_by   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id   bigint not null references public.groups(id) on delete cascade,
  user_id    uuid   not null references public.profiles(id) on delete cascade,
  status     text   not null check (status in ('pending','active')) default 'pending',
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.matches (
  id          bigserial primary key,
  stage       text not null,
  group_name  text,
  team_home   text not null,
  team_away   text not null,
  match_date  timestamptz not null,
  score_home  int,
  score_away  int,
  status      text not null check (status in ('upcoming','live','finished')) default 'upcoming'
);

create table if not exists public.predictions (
  id             bigserial primary key,
  user_id        uuid   not null references public.profiles(id) on delete cascade,
  match_id       bigint not null references public.matches(id) on delete cascade,
  pred_home      int    not null check (pred_home between 0 and 20),
  pred_away      int    not null check (pred_away between 0 and 20),
  submitted_at   timestamptz not null default now(),
  points_earned  int,
  unique (user_id, match_id)
);

create index if not exists matches_match_date_idx     on public.matches (match_date);
create index if not exists matches_status_idx         on public.matches (status);
create index if not exists predictions_match_id_idx   on public.predictions (match_id);
create index if not exists predictions_user_id_idx    on public.predictions (user_id);

-- ---------- profile auto-create on signup ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, username) values (new.id, lower(uname));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- group creator auto-joins as active member ----------

create or replace function public.add_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, status)
    values (new.id, new.created_by, 'active')
    on conflict (group_id, user_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_add_owner_member on public.groups;
create trigger trg_add_owner_member
  after insert on public.groups
  for each row execute procedure public.add_owner_as_member();

-- ---------- scoring ----------

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
  if ph = ah and pa = aa then return 7; end if;
  if same_winner and act_w = 0 then return 2; end if;     -- both draws
  if same_winner then
    if one_score then return 4; else return 2; end if;
  end if;
  if one_score then return 1; else return 0; end if;
end $$;

-- ---------- auto-recalc on match update ----------

create or replace function public.recalc_match_predictions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'finished'
     and new.score_home is not null
     and new.score_away is not null
  then
    update public.predictions
       set points_earned = public.calculate_points(pred_home, pred_away, new.score_home, new.score_away)
     where match_id = new.id;
  else
    update public.predictions
       set points_earned = null
     where match_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_recalc_predictions on public.matches;
create trigger trg_recalc_predictions
  after update of status, score_home, score_away on public.matches
  for each row execute procedure public.recalc_match_predictions();

-- ---------- lock predictions at kickoff ----------

create or replace function public.check_prediction_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
begin
  select status, match_date into m from public.matches where id = new.match_id;
  if m is null then
    raise exception 'match not found';
  end if;
  if m.status <> 'upcoming' or now() >= m.match_date then
    raise exception 'predictions locked for this match'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_check_lock on public.predictions;
create trigger trg_check_lock
  before insert or update of pred_home, pred_away on public.predictions
  for each row execute procedure public.check_prediction_lock();

-- ---------- RPCs ----------

-- Join via invite code (or return current status if already a member).
create or replace function public.join_group_by_code(p_code text)
returns table (group_id bigint, group_name text, my_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  g_id    bigint;
  g_name  text;
  cur     text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select id, name into g_id, g_name
    from public.groups where invite_code = upper(p_code);
  if g_id is null then
    raise exception 'invalid invite code';
  end if;

  select gm.status into cur from public.group_members gm
    where gm.group_id = g_id and gm.user_id = auth.uid();

  if cur is not null then
    return query select g_id, g_name, cur;
  else
    insert into public.group_members (group_id, user_id, status)
      values (g_id, auth.uid(), 'pending');
    return query select g_id, g_name, 'pending'::text;
  end if;
end $$;

-- Per-group leaderboard. Returns ranked rows for the caller's group only.
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
begin
  if not exists (
    select 1 from public.group_members
     where group_id = p_group_id
       and user_id  = auth.uid()
       and status   = 'active'
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

-- Convenience: tells the client whether they have admin powers (= own a group).
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (select 1 from public.groups where created_by = auth.uid());
$$;

-- ---------- RLS ----------

alter table public.profiles       enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.matches        enable row level security;
alter table public.predictions    enable row level security;

-- profiles: readable to anyone authenticated; updatable only by self.
drop policy if exists profiles_select_auth on public.profiles;
create policy profiles_select_auth on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (auth.uid() = id);

-- groups: only owner or members can see the row (invite codes are not public).
drop policy if exists groups_select_member on public.groups;
create policy groups_select_member on public.groups
  for select to authenticated using (
    created_by = auth.uid()
    or exists (
      select 1 from public.group_members
       where group_id = groups.id and user_id = auth.uid()
    )
  );

drop policy if exists groups_insert_owner on public.groups;
create policy groups_insert_owner on public.groups
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists groups_update_owner on public.groups;
create policy groups_update_owner on public.groups
  for update to authenticated using (created_by = auth.uid());

drop policy if exists groups_delete_owner on public.groups;
create policy groups_delete_owner on public.groups
  for delete to authenticated using (created_by = auth.uid());

-- group_members: readable to self, group owner, or co-members.
drop policy if exists members_select_visible on public.group_members;
create policy members_select_visible on public.group_members
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.groups g
       where g.id = group_members.group_id and g.created_by = auth.uid()
    )
    or exists (
      select 1 from public.group_members me
       where me.group_id = group_members.group_id
         and me.user_id  = auth.uid()
         and me.status   = 'active'
    )
  );

-- (joins happen via the join_group_by_code RPC; no direct INSERT needed
--  but kept open for completeness)
drop policy if exists members_insert_self on public.group_members;
create policy members_insert_self on public.group_members
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');

drop policy if exists members_update_owner on public.group_members;
create policy members_update_owner on public.group_members
  for update to authenticated using (
    exists (
      select 1 from public.groups g
       where g.id = group_members.group_id and g.created_by = auth.uid()
    )
  );

drop policy if exists members_delete_owner_or_self on public.group_members;
create policy members_delete_owner_or_self on public.group_members
  for delete to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.groups g
       where g.id = group_members.group_id and g.created_by = auth.uid()
    )
  );

-- matches: read by all authenticated; update only by group owners (admins).
drop policy if exists matches_select_auth on public.matches;
create policy matches_select_auth on public.matches
  for select to authenticated using (true);

drop policy if exists matches_admin_update on public.matches;
create policy matches_admin_update on public.matches
  for update to authenticated using (
    exists (select 1 from public.groups where created_by = auth.uid())
  );

-- predictions: see your own anytime, see others' once the match is finished;
-- write only your own.
drop policy if exists predictions_select_self on public.predictions;
create policy predictions_select_self on public.predictions
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.matches m
       where m.id = predictions.match_id and m.status = 'finished'
    )
  );

drop policy if exists predictions_insert_self on public.predictions;
create policy predictions_insert_self on public.predictions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists predictions_update_self on public.predictions;
create policy predictions_update_self on public.predictions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists predictions_delete_self on public.predictions;
create policy predictions_delete_self on public.predictions
  for delete to authenticated using (user_id = auth.uid());

-- ---------- grants on RPCs ----------

grant execute on function public.join_group_by_code(text)       to authenticated;
grant execute on function public.group_leaderboard(bigint)      to authenticated;
grant execute on function public.is_admin()                     to authenticated;
