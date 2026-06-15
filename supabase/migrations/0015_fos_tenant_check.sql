-- Defense in depth for cross-tenant FOS assignment: a retailer's fos_id must
-- reference an FOS in the SAME distributor org. App code checks this on the
-- web server, but mobile clients update fos_id directly under RLS (which
-- scopes the retailer row, not the fos_id value) — enforce it at the DB.

create or replace function public.check_fos_same_distributor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'retailer' and new.fos_id is not null then
    if not exists (
      select 1 from public.profiles f
      where f.id = new.fos_id
        and f.role = 'fos'
        and f.distributor_id is not distinct from new.distributor_id
    ) then
      raise exception 'FOS does not belong to this distributor';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_fos_tenant_check on public.profiles;
create trigger profiles_fos_tenant_check
  before insert or update of fos_id, distributor_id on public.profiles
  for each row
  execute function public.check_fos_same_distributor();
