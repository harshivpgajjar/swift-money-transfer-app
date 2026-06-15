-- Force-password-change flow: distributor-issued credentials get a default
-- password and the user must set their own at first login.

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

create or replace function public.clear_must_change_password()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set must_change_password = false, updated_at = now()
  where id = auth.uid();
$$;

revoke all on function public.clear_must_change_password from public;
grant execute on function public.clear_must_change_password to authenticated;
