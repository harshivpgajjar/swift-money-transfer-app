-- Outstanding model change:
--   transferred = sum of distributor-approved money request amounts on that day
--                 (approval is the financial event — outstanding moves immediately)
--   reversed    = sum of EOD reversal amounts on that day (unchanged)
--   cash_recv   = sum of approved cash submissions on that day (unchanged)
--   closing     = opening + transferred - reversed - cash_received
--
-- EOD `transfer` rows are now audit/reconciliation only (visible in history,
-- but they no longer move the balance). EOD `reversal` rows still subtract.

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
    select min(activity_date) into v_from from (
      select (distributor_acted_at)::date as activity_date
      from public.money_requests
      where retailer_id = p_retailer_id and distributor_status = 'approved'
        and distributor_acted_at is not null
      union all
      select txn_date as activity_date from public.eod_transactions
      where retailer_id = p_retailer_id and type = 'reversal'
      union all
      select txn_date as activity_date from public.cash_submissions
      where retailer_id = p_retailer_id and status = 'approved'
    ) x;
  else
    v_from := p_from_date;
  end if;

  if v_from is null then return; end if;

  select greatest(
    coalesce((select max((distributor_acted_at)::date)
              from public.money_requests
              where retailer_id = p_retailer_id and distributor_status = 'approved'),
             current_date),
    coalesce((select max(txn_date)
              from public.eod_transactions
              where retailer_id = p_retailer_id and type = 'reversal'),
             current_date),
    coalesce((select max(txn_date)
              from public.cash_submissions
              where retailer_id = p_retailer_id and status = 'approved'),
             current_date),
    current_date
  ) into v_max;

  select closing into v_prev_closing
  from public.daily_balances
  where retailer_id = p_retailer_id and balance_date = (v_from - 1);
  if v_prev_closing is null then v_prev_closing := 0; end if;

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
      coalesce((
        select sum(coalesce(fos_amount, requested_amount))
        from public.money_requests
        where retailer_id = p_retailer_id
          and distributor_status = 'approved'
          and (distributor_acted_at)::date = d
      ), 0),
      coalesce((
        select sum(amount) from public.eod_transactions
        where retailer_id = p_retailer_id and type = 'reversal' and txn_date = d
      ), 0),
      coalesce((
        select sum(amount) from public.cash_submissions
        where retailer_id = p_retailer_id and status = 'approved' and txn_date = d
      ), 0),
      0
    );
    update public.daily_balances
      set closing = opening + transferred - reversed - cash_received
      where retailer_id = p_retailer_id and balance_date = d;
    select closing into v_prev_closing from public.daily_balances
      where retailer_id = p_retailer_id and balance_date = d;
    d := d + 1;
  end loop;
end;
$$;

-- Backfill all retailers under the new model
do $$
declare r record;
begin
  for r in select id from public.profiles where role = 'retailer' loop
    delete from public.daily_balances where retailer_id = r.id;
    perform public.recompute_balances(r.id, null);
  end loop;
end$$;
