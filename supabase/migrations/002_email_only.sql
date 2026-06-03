-- =====================================================================
-- Migration 002 — switch from username-only signup to email + password.
-- Run after 001_init.sql.
-- =====================================================================

-- Allow longer / shorter handles. Username is now derived from the email
-- prefix at signup, so we don't need a strict length window.
alter table public.profiles
  drop constraint if exists profiles_username_check;
alter table public.profiles
  add constraint profiles_username_check
  check (length(username) between 1 and 64);

-- Replace the signup trigger: take the part before @ as a display handle
-- and add a numeric suffix if it's already taken.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base      text := lower(split_part(new.email, '@', 1));
  candidate text := base;
  n         int  := 1;
begin
  while exists (select 1 from public.profiles where username = candidate) loop
    candidate := base || n;
    n := n + 1;
  end loop;
  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end $$;
