-- Daily auto-run for late charges. Charges yesterday (IST) for every
-- distributor, once the day's data is complete. Idempotent per day.

create extension if not exists pg_cron;

create or replace function public.apply_late_charges_daily()
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare
  d date := (now() at time zone 'Asia/Kolkata')::date - 1;
  r record;
begin
  for r in select id from profiles where role='distributor' loop
    perform apply_late_charges(r.id, d);
  end loop;
end $fn$;

-- 23:30 UTC == 05:00 IST daily; charges the prior (now-complete) day.
select cron.schedule('late-charges-daily', '30 23 * * *', $$select public.apply_late_charges_daily();$$);
