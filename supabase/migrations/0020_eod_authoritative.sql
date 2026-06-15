-- EOD-authoritative credit model (user decision, 11 June 2026).
--
-- The daily EOD portal reports are the source of truth for credit given out:
-- on any (account, date) covered by an EOD upload, the file's transfer rows
-- define each retailer's credit for that day, and app-approved money requests
-- on those dates become audit-only (they power the "who isn't using the app"
-- insights, but no longer move balances — prevents double-counting).
-- On uncovered dates the app keeps working as before.
--
-- Manual adjustments made by the distributor (notes prefixed
-- 'Manual adjustment by distributor') always count, regardless of coverage,
-- on both the credit side (money_requests) and the cash side
-- (cash_submissions) — they are distributor decisions, not portal/FOS events.
--
-- Self payment return rows are no longer retailer events (the parser now
-- ignores them); existing imported ones are removed below.

-- ============================================================================
-- eod_report_dates — which (account, date) pairs an EOD upload covers
-- ============================================================================

create table public.eod_report_dates (
  account_id uuid not null references public.accounts(id) on delete cascade,
  txn_date date not null,
  upload_id uuid not null references public.sheet_uploads(id) on delete cascade,
  primary key (account_id, txn_date)
);

alter table public.eod_report_dates enable row level security;

create policy eod_report_dates_distributor on public.eod_report_dates
  for all using (
    exists (
      select 1 from public.accounts a
      where a.id = eod_report_dates.account_id and a.distributor_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.accounts a
      where a.id = eod_report_dates.account_id and a.distributor_id = auth.uid()
    )
  );

-- ============================================================================
-- recompute_balances v3 — EOD coverage decides the credit source
-- ============================================================================

create or replace function public.recompute_balances(
  p_retailer_id uuid,
  p_account_id uuid,
  p_from_date date default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_from date;
  v_max  date;
  v_prev_closing numeric(12,2);
  d date;
  v_cash_amount numeric(12,2);
  v_transferred numeric(12,2);
  v_has_book boolean;
  v_has_eod boolean;
begin
  if p_from_date is null then
    select min(activity_date) into v_from from (
      select (distributor_acted_at)::date as activity_date
      from public.money_requests
      where retailer_id = p_retailer_id and account_id = p_account_id
        and distributor_status = 'approved' and distributor_acted_at is not null
      union all
      select txn_date as activity_date from public.eod_transactions
      where retailer_id = p_retailer_id and account_id = p_account_id
      union all
      select txn_date as activity_date from public.cash_submissions
      where retailer_id = p_retailer_id and account_id = p_account_id and status = 'approved'
      union all
      select txn_date as activity_date from public.cash_report_entries
      where retailer_id = p_retailer_id and account_id = p_account_id
    ) x;
  else
    v_from := p_from_date;
  end if;

  if v_from is null then return; end if;

  select greatest(
    coalesce((select max((distributor_acted_at)::date) from public.money_requests
              where retailer_id = p_retailer_id and account_id = p_account_id
                and distributor_status = 'approved'), current_date),
    coalesce((select max(txn_date) from public.eod_transactions
              where retailer_id = p_retailer_id and account_id = p_account_id),
             current_date),
    coalesce((select max(txn_date) from public.cash_submissions
              where retailer_id = p_retailer_id and account_id = p_account_id and status = 'approved'),
             current_date),
    coalesce((select max(txn_date) from public.cash_report_entries
              where retailer_id = p_retailer_id and account_id = p_account_id),
             current_date),
    current_date
  ) into v_max;

  select closing into v_prev_closing
  from public.daily_balances
  where retailer_id = p_retailer_id and account_id = p_account_id
    and balance_date = (v_from - 1);
  if v_prev_closing is null then v_prev_closing := 0; end if;

  delete from public.daily_balances
  where retailer_id = p_retailer_id and account_id = p_account_id and balance_date >= v_from;

  d := v_from;
  while d <= v_max loop
    -- Cash: the FSE cash book is authoritative on dates it covers.
    -- Manual adjustments always count on top.
    select exists (
      select 1 from public.cash_report_dates
      where account_id = p_account_id and txn_date = d
    ) into v_has_book;

    if v_has_book then
      select coalesce(sum(amount), 0) into v_cash_amount
      from public.cash_report_entries
      where retailer_id = p_retailer_id and account_id = p_account_id and txn_date = d;
      v_cash_amount := v_cash_amount + coalesce((
        select sum(coalesce(approved_amount, amount))
        from public.cash_submissions
        where retailer_id = p_retailer_id and account_id = p_account_id
          and status = 'approved' and txn_date = d
          and notes like 'Manual adjustment by distributor%'
      ), 0);
    else
      select coalesce(sum(coalesce(approved_amount, amount)), 0) into v_cash_amount
      from public.cash_submissions
      where retailer_id = p_retailer_id and account_id = p_account_id
        and status = 'approved' and txn_date = d;
    end if;

    -- Credit: the EOD report is authoritative on dates it covers.
    -- Manual adjustments always count on top.
    select exists (
      select 1 from public.eod_report_dates
      where account_id = p_account_id and txn_date = d
    ) into v_has_eod;

    v_transferred := coalesce((
      select sum(amount) from public.eod_transactions
      where retailer_id = p_retailer_id and account_id = p_account_id
        and type = 'transfer' and txn_date = d
    ), 0);
    v_transferred := v_transferred + coalesce((
      select sum(coalesce(final_amount, fos_amount, requested_amount))
      from public.money_requests
      where retailer_id = p_retailer_id and account_id = p_account_id
        and distributor_status = 'approved'
        and (distributor_acted_at)::date = d
        and (
          not v_has_eod
          or coalesce(distributor_notes, '') like 'Manual adjustment by distributor%'
        )
    ), 0);

    insert into public.daily_balances (
      retailer_id, account_id, balance_date, opening, transferred, reversed, cash_received, closing
    ) values (
      p_retailer_id, p_account_id, d, v_prev_closing,
      v_transferred,
      coalesce((select sum(amount) from public.eod_transactions
                where retailer_id = p_retailer_id and account_id = p_account_id
                  and type = 'reversal' and txn_date = d), 0),
      v_cash_amount,
      0
    );
    update public.daily_balances
      set closing = opening + transferred - reversed - cash_received
      where retailer_id = p_retailer_id and account_id = p_account_id and balance_date = d;
    select closing into v_prev_closing from public.daily_balances
      where retailer_id = p_retailer_id and account_id = p_account_id and balance_date = d;
    d := d + 1;
  end loop;
end;
$$;

-- ============================================================================
-- Data migration: drop self-payment-return rows, backfill coverage, recompute
-- ============================================================================

-- 1) Self payment returns are not retailer events.
delete from public.eod_transactions where notes like 'Self payment return%';

-- 2) Coverage: every (account, date) that has at least one imported transfer
--    row. (Transfer rows only — reversals alone must never suppress app credit.)
insert into public.eod_report_dates (account_id, txn_date, upload_id)
select distinct on (account_id, txn_date) account_id, txn_date, upload_id
from public.eod_transactions
where type = 'transfer' and upload_id is not null
order by account_id, txn_date, created_at
on conflict (account_id, txn_date) do nothing;

-- 3) Recompute every (retailer, account) pair that has any activity.
do $$
declare rec record;
begin
  for rec in
    select distinct retailer_id, account_id from (
      select retailer_id, account_id from public.money_requests where distributor_status = 'approved'
      union
      select retailer_id, account_id from public.eod_transactions
      union
      select retailer_id, account_id from public.cash_submissions where status = 'approved'
      union
      select retailer_id, account_id from public.cash_report_entries
    ) x
  loop
    perform public.recompute_balances(rec.retailer_id, rec.account_id, null);
  end loop;
end;
$$;
