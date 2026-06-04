-- =====================================================================
-- Migration 004 — fix "infinite recursion detected in policy" on groups
--
-- Root cause: groups_select_member checked group_members, and
-- members_select_visible checked group_members again. Both Row Level
-- Security passes re-enter the RLS check and never terminate.
--
-- Fix: route the visibility checks through SECURITY DEFINER helper
-- functions that bypass RLS. The policies then become straight calls
-- to those helpers — no cycle.
-- =====================================================================

create or replace function public.is_group_owner(g_id bigint, u_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.groups
     where id = g_id and created_by = u_id
  );
$$;

create or replace function public.is_active_member(g_id bigint, u_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
     where group_id = g_id
       and user_id  = u_id
       and status   = 'active'
  );
$$;

grant execute on function public.is_group_owner(bigint, uuid) to authenticated;
grant execute on function public.is_active_member(bigint, uuid) to authenticated;

-- ---------- groups policies ----------

drop policy if exists groups_select_member on public.groups;
create policy groups_select_member on public.groups
  for select to authenticated using (
    created_by = auth.uid()
    or public.is_active_member(id, auth.uid())
  );

-- ---------- group_members policies ----------

drop policy if exists members_select_visible on public.group_members;
create policy members_select_visible on public.group_members
  for select to authenticated using (
    user_id = auth.uid()
    or public.is_group_owner(group_id, auth.uid())
    or public.is_active_member(group_id, auth.uid())
  );

drop policy if exists members_update_owner on public.group_members;
create policy members_update_owner on public.group_members
  for update to authenticated using (
    public.is_group_owner(group_id, auth.uid())
  );

drop policy if exists members_delete_owner_or_self on public.group_members;
create policy members_delete_owner_or_self on public.group_members
  for delete to authenticated using (
    user_id = auth.uid()
    or public.is_group_owner(group_id, auth.uid())
  );
