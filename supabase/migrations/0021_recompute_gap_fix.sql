-- Fix: when recompute_balances starts at a date with no balance row on the
-- immediately preceding day (e.g. entries landing on a far-future date after a
-- header misparse), opening fell back to 0 and erased the carried balance.
-- Use the LATEST closing on-or-before (from − 1) instead.

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

  -- Carry the balance across gaps: latest closing on-or-before the day
  -- before the recompute window starts.
  select closing into v_prev_closing
  from public.daily_balances
  where retailer_id = p_retailer_id and account_id = p_account_id
    and balance_date <= (v_from - 1)
  order by balance_date desc
  limit 1;
  if v_prev_closing is null then v_prev_closing := 0; end if;

  delete from public.daily_balances
  where retailer_id = p_retailer_id and account_id = p_account_id and balance_date >= v_from;

  d := v_from;
  while d <= v_max loop
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
