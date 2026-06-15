-- Recompute daily_balances for a retailer from a given date forward.
-- Call after EOD sheet import or cash submission approval.

create or replace function public.recompute_balances(
  p_retailer_id uuid,
  p_from_date date default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_from date;
  v_max  date;
  v_prev_closing numeric(12,2);
  d date;
begin
  if p_from_date is null then
    select min(txn_date) into v_from
    from (
      select txn_date from public.eod_transactions where retailer_id = p_retailer_id
      union all
      select txn_date from public.cash_submissions
        where retailer_id = p_retailer_id and status = 'approved'
    ) x;
  else
    v_from := p_from_date;
  end if;

  if v_from is null then
    return;
  end if;

  select greatest(
    coalesce((select max(txn_date) from public.eod_transactions where retailer_id = p_retailer_id), current_date),
    coalesce((select max(txn_date) from public.cash_submissions where retailer_id = p_retailer_id and status = 'approved'), current_date),
    current_date
  ) into v_max;

  -- Carry-forward from the day before v_from
  select closing into v_prev_closing
  from public.daily_balances
  where retailer_id = p_retailer_id and balance_date = (v_from - 1);
  if v_prev_closing is null then
    v_prev_closing := 0;
  end if;

  delete from public.daily_balances
  where retailer_id = p_retailer_id and balance_date >= v_from;

  d := v_from;
  while d <= v_max loop
    insert into public.daily_balances (
      retailer_id, balance_date, opening, transferred, reversed, cash_received, closing
    ) values (
      p_retailer_id,
      d,
      v_prev_closing,
      coalesce((select sum(amount) from public.eod_transactions
                where retailer_id = p_retailer_id and txn_date = d and type = 'transfer'), 0),
      coalesce((select sum(amount) from public.eod_transactions
                where retailer_id = p_retailer_id and txn_date = d and type = 'reversal'), 0),
      coalesce((select sum(amount) from public.cash_submissions
                where retailer_id = p_retailer_id and txn_date = d and status = 'approved'), 0),
      0
    );

    update public.daily_balances
    set closing = opening + transferred - reversed - cash_received
    where retailer_id = p_retailer_id and balance_date = d;

    select closing into v_prev_closing
    from public.daily_balances
    where retailer_id = p_retailer_id and balance_date = d;

    d := d + 1;
  end loop;
end;
$$;

-- Convenience: current outstanding for a retailer = latest closing
create or replace function public.current_outstanding(p_retailer_id uuid) returns numeric
language sql stable as $$
  select coalesce(closing, 0) from public.daily_balances
  where retailer_id = p_retailer_id
  order by balance_date desc
  limit 1;
$$;

-- Approved-but-not-yet-on-sheet amount, surfaced in the outstanding view
create or replace function public.approved_pending_transfer(p_retailer_id uuid) returns numeric
language sql stable as $$
  select coalesce(sum(coalesce(fos_amount, requested_amount)), 0)
  from public.money_requests
  where retailer_id = p_retailer_id
    and distributor_status = 'approved'
    and not exists (
      select 1 from public.eod_transactions e
      where e.retailer_id = money_requests.retailer_id
        and e.type = 'transfer'
        and e.amount = coalesce(money_requests.fos_amount, money_requests.requested_amount)
        and e.txn_date >= money_requests.distributor_acted_at::date
    );
$$;
