-- Let any signed-in user update their own editable profile fields
-- (mobile clients have no service role). Security definer so RLS's
-- distributor-only update policy doesn't block self-edits, while the
-- column list keeps role/fos/distributor/active immutable.

create or replace function public.update_own_profile(
  p_full_name text default null,
  p_phone text default null,
  p_timezone text default null,
  p_notification_prefs jsonb default null,
  p_default_fos_auto_approve boolean default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set
    full_name = coalesce(p_full_name, full_name),
    phone = coalesce(p_phone, phone),
    timezone = coalesce(p_timezone, timezone),
    notification_prefs = coalesce(p_notification_prefs, notification_prefs),
    default_fos_auto_approve = case
      when p_default_fos_auto_approve is null then default_fos_auto_approve
      when role = 'distributor' then p_default_fos_auto_approve
      else default_fos_auto_approve
    end,
    updated_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.update_own_profile from public;
grant execute on function public.update_own_profile to authenticated;
