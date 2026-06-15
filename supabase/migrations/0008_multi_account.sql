-- Multi-account support.
-- Each distributor has named accounts (e.g. "Swift Money", "A2Z").
-- Retailers stay one profile each, but every transaction (money request, cash,
-- EOD row, balance) belongs to exactly one account.
--
-- Cash report (the FSE cashbook XLSX) is authoritative for cash received on the
-- dates it covers. Approved cash submissions are provisional until the book
-- lands; once it does, the book's per-(retailer, account, date) totals replace
-- the approved values in recompute_balances.

-- ============================================================================
-- accounts
-- ============================================================================

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (distributor_id, slug)
);

create index idx_accounts_distributor on public.accounts(distributor_id);

alter table public.accounts enable row level security;

create policy accounts_select on public.accounts
  for select using (
    distributor_id = auth.uid()
    or distributor_id = public.current_distributor_id()
  );

create policy accounts_distributor_write on public.accounts
  for all using (
    public.current_role() = 'distributor' and distributor_id = auth.uid()
  ) with check (
    public.current_role() = 'distributor' and distributor_id = auth.uid()
  );

-- Seed two accounts for every existing distributor.
insert into public.accounts (distributor_id, name, slug)
select id, 'Swift Money', 'swift' from public.profiles where role = 'distributor'
union all
select id, 'A2Z', 'naomi' from public.profiles where role = 'distributor';

-- ============================================================================
-- account_id on every transactional table
-- ============================================================================

alter table public.money_requests
  add column account_id uuid not null references public.accounts(id) on delete restrict;
create index idx_requests_account on public.money_requests(account_id);

alter table public.cash_submissions
  add column account_id uuid not null references public.accounts(id) on delete restrict;
create index idx_cash_account on public.cash_submissions(account_id);

alter table public.sheet_uploads
  add column account_id uuid not null references public.accounts(id) on delete restrict;

alter table public.eod_transactions
  add column account_id uuid not null references public.accounts(id) on delete restrict;
create index idx_eod_account_date on public.eod_transactions(account_id, txn_date);

-- daily_balances: account_id becomes part of the composite PK
alter table public.daily_balances
  add column account_id uuid not null references public.accounts(id) on delete cascade;
alter table public.daily_balances drop constraint daily_balances_pkey;
alter table public.daily_balances add primary key (retailer_id, account_id, balance_date);
create index idx_balances_account_date on public.daily_balances(account_id, balance_date);

-- ============================================================================
-- cash report tables (the FSE cashbook XLSX upload)
-- ============================================================================

create table public.cash_reports (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.profiles(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  filename text,
  uploaded_at timestamptz not null default now(),
  row_count int not null default 0,
  total_amount numeric(12,2) not null default 0
);

-- One row per (account, date) the workbook covers. Lets recompute_balances
-- distinguish "no book entry → use approved cash" from "book says ₹0 → use 0".
create table public.cash_report_dates (
  account_id uuid not null references public.accounts(id) on delete cascade,
  txn_date date not null,
  report_id uuid not null references public.cash_reports(id) on delete cascade,
  primary key (account_id, txn_date)
);

create table public.cash_report_entries (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.cash_reports(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  retailer_id uuid not null references public.profiles(id),
  txn_date date not null,
  amount numeric(12,2) not null check (amount >= 0),
  sheet_name text,
  raw_name text,
  created_at timestamptz not null default now()
);

create index idx_cre_retailer_account_date
  on public.cash_report_entries(retailer_id, account_id, txn_date);
create index idx_cre_account_date
  on public.cash_report_entries(account_id, txn_date);

alter table public.cash_reports enable row level security;
alter table public.cash_report_dates enable row level security;
alter table public.cash_report_entries enable row level security;

create policy cash_reports_distributor on public.cash_reports
  for all using (
    public.current_role() = 'distributor' and distributor_id = auth.uid()
  ) with check (
    public.current_role() = 'distributor' and distributor_id = auth.uid()
  );

create policy cash_report_dates_distributor on public.cash_report_dates
  for all using (
    exists (
      select 1 from public.cash_reports r
      where r.id = cash_report_dates.report_id and r.distributor_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.cash_reports r
      where r.id = cash_report_dates.report_id and r.distributor_id = auth.uid()
    )
  );

create policy cash_report_entries_distributor on public.cash_report_entries
  for all using (
    exists (
      select 1 from public.cash_reports r
      where r.id = cash_report_entries.report_id and r.distributor_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.cash_reports r
      where r.id = cash_report_entries.report_id and r.distributor_id = auth.uid()
    )
  );

create policy cash_report_entries_fos_select on public.cash_report_entries
  for select using (
    public.current_role() = 'fos'
    and exists (
      select 1 from public.profiles p
      where p.id = cash_report_entries.retailer_id and p.fos_id = auth.uid()
    )
  );

create policy cash_report_entries_retailer_select on public.cash_report_entries
  for select using (
    public.current_role() = 'retailer' and retailer_id = auth.uid()
  );

-- ============================================================================
-- recompute_balances — now account-aware, with book-cash precedence
-- ============================================================================

drop function if exists public.recompute_balances(uuid, date);

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
  v_has_book boolean;
begin
  if p_from_date is null then
    select min(activity_date) into v_from from (
      select (distributor_acted_at)::date as activity_date
      from public.money_requests
      where retailer_id = p_retailer_id and account_id = p_account_id
        and distributor_status = 'approved' and distributor_acted_at is not null
      union all
      select txn_date as activity_date from public.eod_transactions
      where retailer_id = p_retailer_id and account_id = p_account_id and type = 'reversal'
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
              where retailer_id = p_retailer_id and account_id = p_account_id and type = 'reversal'),
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
    -- If a cash report covers this (account, date), it is authoritative.
    select exists (
      select 1 from public.cash_report_dates
      where account_id = p_account_id and txn_date = d
    ) into v_has_book;

    if v_has_book then
      select coalesce(sum(amount), 0) into v_cash_amount
      from public.cash_report_entries
      where retailer_id = p_retailer_id and account_id = p_account_id and txn_date = d;
    else
      select coalesce(sum(coalesce(approved_amount, amount)), 0) into v_cash_amount
      from public.cash_submissions
      where retailer_id = p_retailer_id and account_id = p_account_id
        and status = 'approved' and txn_date = d;
    end if;

    insert into public.daily_balances (
      retailer_id, account_id, balance_date, opening, transferred, reversed, cash_received, closing
    ) values (
      p_retailer_id, p_account_id, d, v_prev_closing,
      coalesce((select sum(coalesce(final_amount, fos_amount, requested_amount))
                from public.money_requests
                where retailer_id = p_retailer_id and account_id = p_account_id
                  and distributor_status = 'approved'
                  and (distributor_acted_at)::date = d), 0),
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
