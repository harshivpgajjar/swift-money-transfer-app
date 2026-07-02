-- Late-payment charges on unpaid outstanding (income-only; does NOT touch
-- retailer outstanding). Charged only on the `attention` bucket: retailers who
-- transferred by 3 PM today but did not clear yesterday's due. at-risk,
-- defaulter and alert are all excluded. Tiers on the due-pending amount:
--   <= 10,000 -> 25 | 10,000.01..25,000 -> 50 | > 25,000 -> 0.3%.
-- Started 1-Jul-2026.

create table if not exists public.late_charges (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.profiles(id) on delete cascade,
  retailer_id   uuid not null references public.profiles(id) on delete cascade,
  account_id    uuid not null references public.accounts(id),
  charge_date   date not null,
  bucket        text not null,      -- always 'attention' under the current rule
  basis         numeric not null,   -- due-pending used for tiering
  tier          text not null,      -- '<=10k' | '10-25k' | '>25k'
  amount        numeric not null,   -- the charge
  created_at    timestamptz not null default now(),
  unique (retailer_id, account_id, charge_date)
);
alter table public.late_charges enable row level security;
create index if not exists late_charges_dist_date on public.late_charges(distributor_id, charge_date);

-- Compute & write charges for one day (idempotent: re-run replaces that day).
create or replace function public.apply_late_charges(p_distributor uuid, p_date date)
returns table(accounts int, total numeric)
language plpgsql security definer set search_path to 'public' as $fn$
begin
  delete from late_charges where distributor_id = p_distributor and charge_date = p_date;

  insert into late_charges(distributor_id, retailer_id, account_id, charge_date, bucket, basis, tier, amount)
  with ret as (
    select p.id, p.defaulted from profiles p
    where p.role='retailer' and not p.excluded and not p.personal and p.distributor_id = p_distributor
  ),
  acct as (
    select r.id retailer_id, r.defaulted, db.account_id
    from ret r join daily_balances db on db.retailer_id=r.id and db.balance_date <= p_date
    group by r.id, r.defaulted, db.account_id
  ),
  old as (select distinct on (retailer_id,account_id) retailer_id,account_id,closing o
    from daily_balances where balance_date <= p_date-1
    order by retailer_id,account_id,balance_date desc),
  by3 as (select retailer_id,account_id,sum(amount) amt from eod_transactions
    where type='transfer' and txn_date=p_date
      and txn_at is not null and (txn_at at time zone 'Asia/Kolkata')::time <= time '15:00'
    group by retailer_id,account_id),
  rt as (select retailer_id,account_id,coalesce(sum(cash_received),0)+coalesce(sum(reversed),0) returned
    from daily_balances where balance_date=p_date group by retailer_id,account_id),
  lc as (select retailer_id,account_id,max(balance_date) lc from daily_balances
    where cash_received>0 and balance_date<=p_date group by retailer_id,account_id),
  calc as (select a.retailer_id,a.defaulted,a.account_id,
      greatest(coalesce(o.o,0)+coalesce(b.amt,0)-coalesce(rt.returned,0),0) due_pending,
      coalesce(b.amt,0) by3, lc.lc
    from acct a left join old o on o.retailer_id=a.retailer_id and o.account_id=a.account_id
      left join by3 b on b.retailer_id=a.retailer_id and b.account_id=a.account_id
      left join rt on rt.retailer_id=a.retailer_id and rt.account_id=a.account_id
      left join lc on lc.retailer_id=a.retailer_id and lc.account_id=a.account_id),
  bucketed as (select *, case
      when defaulted then 'blocked'
      when due_pending>0 and by3>0 then 'attention'
      when due_pending>0 and (lc is null or lc < p_date-45) then 'atrisk'
      when due_pending>0 then 'alert' end bucket
    from calc where defaulted or due_pending>0)
  select p_distributor, retailer_id, account_id, p_date, bucket, due_pending,
    case when due_pending<=10000 then '<=10k' when due_pending<=25000 then '10-25k' else '>25k' end,
    case when due_pending<=10000 then 25 when due_pending<=25000 then 50 else round(due_pending*0.003,2) end
  from bucketed where bucket = 'attention';

  return query select count(*)::int, coalesce(sum(amount),0)
  from late_charges where distributor_id=p_distributor and charge_date=p_date;
end $fn$;

-- Per-retailer detail for a given day.
create or replace function public.late_charge_summary(p_distributor uuid, p_date date)
returns table(retailer_id uuid, full_name text, retailer_code text, account_name text,
              bucket text, basis numeric, tier text, amount numeric)
language sql stable security definer set search_path to 'public' as $fn$
  select lc.retailer_id, p.full_name, p.retailer_code, a.name,
         lc.bucket, lc.basis, lc.tier, lc.amount
  from late_charges lc
  join profiles p on p.id=lc.retailer_id
  join accounts a on a.id=lc.account_id
  where lc.distributor_id=p_distributor and lc.charge_date=p_date
  order by lc.amount desc;
$fn$;
