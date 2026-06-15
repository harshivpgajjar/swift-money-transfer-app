-- Fix infinite recursion in profiles_retailer_select.
-- Inline subqueries against public.profiles inside a profiles RLS policy
-- trigger 42P17 (infinite_recursion) because every SELECT on profiles
-- re-evaluates every policy on profiles. Wrap the lookups in security-definer
-- helpers so they bypass RLS.

create or replace function public.current_my_fos_id() returns uuid
language sql stable security definer set search_path = public, auth as $$
  select fos_id from public.profiles where id = auth.uid();
$$;

drop policy if exists profiles_retailer_select on public.profiles;

create policy profiles_retailer_select on public.profiles
  for select using (
    public.current_role() = 'retailer'
    and (
      id = auth.uid()
      or id = public.current_my_fos_id()
      or id = public.current_distributor_id()
    )
  );
