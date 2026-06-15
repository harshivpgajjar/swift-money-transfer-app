-- Distributor can edit the amount during approval, on both money requests
-- and cash submissions. Original numbers stay preserved as audit trail.
--
--   money_requests.final_amount   — set by distributor on approve. If null,
--                                   coalesce(fos_amount, requested_amount).
--   cash_submissions.approved_amount — set by distributor on approve. If null,
--                                   the original `amount` field stands.

alter table public.money_requests
  add column if not exists final_amount numeric(12,2)
    check (final_amount is null or final_amount > 0);

alter table public.cash_submissions
  add column if not exists approved_amount numeric(12,2)
    check (approved_amount is null or approved_amount > 0);

-- recompute_balances now respects the edited amounts
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
        select sum(coalesce(final_amount, fos_amount, requested_amount))
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
        select sum(coalesce(approved_amount, amount))
        from public.cash_submissions
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
