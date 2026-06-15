-- Row-level security policies
-- Rule of thumb:
--   distributor: full access to their org (where distributor_id = auth.uid())
--   fos:        their own profile + their assigned retailers' rows + their requests
--   retailer:   their own rows only

alter table public.profiles enable row level security;
alter table public.money_requests enable row level security;
alter table public.cash_submissions enable row level security;
alter table public.sheet_uploads enable row level security;
alter table public.eod_transactions enable row level security;
alter table public.daily_balances enable row level security;

-- ============================================================================
-- profiles
-- ============================================================================

-- Distributor sees everyone in their org
create policy profiles_distributor_select on public.profiles
  for select using (
    public.current_role() = 'distributor'
    and distributor_id = auth.uid()
  );

-- FOS sees themselves + their assigned retailers
create policy profiles_fos_select on public.profiles
  for select using (
    public.current_role() = 'fos'
    and (id = auth.uid() or fos_id = auth.uid())
  );

-- Retailer sees themselves + their FOS + their distributor (read-only contact info)
create policy profiles_retailer_select on public.profiles
  for select using (
    public.current_role() = 'retailer'
    and (
      id = auth.uid()
      or id = (select fos_id from public.profiles where id = auth.uid())
      or id = (select distributor_id from public.profiles where id = auth.uid())
    )
  );

-- Only distributor inserts/updates profiles in their org (via service role for inserts in practice)
create policy profiles_distributor_insert on public.profiles
  for insert with check (
    public.current_role() = 'distributor'
    and distributor_id = auth.uid()
  );

create policy profiles_distributor_update on public.profiles
  for update using (
    public.current_role() = 'distributor'
    and distributor_id = auth.uid()
  ) with check (
    public.current_role() = 'distributor'
    and distributor_id = auth.uid()
  );

-- ============================================================================
-- money_requests
-- ============================================================================

create policy requests_distributor_all on public.money_requests
  for all using (
    public.current_role() = 'distributor'
    and distributor_id = auth.uid()
  ) with check (
    public.current_role() = 'distributor'
    and distributor_id = auth.uid()
  );

create policy requests_fos_select on public.money_requests
  for select using (
    public.current_role() = 'fos' and fos_id = auth.uid()
  );

create policy requests_fos_update on public.money_requests
  for update using (
    public.current_role() = 'fos' and fos_id = auth.uid()
  ) with check (
    public.current_role() = 'fos' and fos_id = auth.uid()
  );

create policy requests_retailer_select on public.money_requests
  for select using (
    public.current_role() = 'retailer' and retailer_id = auth.uid()
  );

create policy requests_retailer_insert on public.money_requests
  for insert with check (
    public.current_role() = 'retailer' and retailer_id = auth.uid()
  );

-- ============================================================================
-- cash_submissions
-- ============================================================================

create policy cash_distributor_all on public.cash_submissions
  for all using (
    public.current_role() = 'distributor'
    and distributor_id = auth.uid()
  ) with check (
    public.current_role() = 'distributor'
    and distributor_id = auth.uid()
  );

create policy cash_fos_select on public.cash_submissions
  for select using (
    public.current_role() = 'fos'
    and exists (
      select 1 from public.profiles p
      where p.id = cash_submissions.retailer_id and p.fos_id = auth.uid()
    )
  );

create policy cash_fos_insert on public.cash_submissions
  for insert with check (
    public.current_role() = 'fos'
    and submitted_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = cash_submissions.retailer_id and p.fos_id = auth.uid()
    )
  );

create policy cash_retailer_select on public.cash_submissions
  for select using (
    public.current_role() = 'retailer' and retailer_id = auth.uid()
  );

create policy cash_retailer_insert on public.cash_submissions
  for insert with check (
    public.current_role() = 'retailer'
    and retailer_id = auth.uid()
    and submitted_by = auth.uid()
  );

-- ============================================================================
-- sheet_uploads
-- ============================================================================

create policy uploads_distributor_all on public.sheet_uploads
  for all using (
    public.current_role() = 'distributor'
    and distributor_id = auth.uid()
  ) with check (
    public.current_role() = 'distributor'
    and distributor_id = auth.uid()
  );

-- ============================================================================
-- eod_transactions
-- ============================================================================

create policy eod_distributor_all on public.eod_transactions
  for all using (
    public.current_role() = 'distributor'
    and distributor_id = auth.uid()
  ) with check (
    public.current_role() = 'distributor'
    and distributor_id = auth.uid()
  );

create policy eod_fos_select on public.eod_transactions
  for select using (
    public.current_role() = 'fos'
    and exists (
      select 1 from public.profiles p
      where p.id = eod_transactions.retailer_id and p.fos_id = auth.uid()
    )
  );

create policy eod_retailer_select on public.eod_transactions
  for select using (
    public.current_role() = 'retailer' and retailer_id = auth.uid()
  );

-- ============================================================================
-- daily_balances
-- ============================================================================

create policy balances_distributor_all on public.daily_balances
  for all using (
    public.current_role() = 'distributor'
    and exists (
      select 1 from public.profiles p
      where p.id = daily_balances.retailer_id and p.distributor_id = auth.uid()
    )
  ) with check (true);

create policy balances_fos_select on public.daily_balances
  for select using (
    public.current_role() = 'fos'
    and exists (
      select 1 from public.profiles p
      where p.id = daily_balances.retailer_id and p.fos_id = auth.uid()
    )
  );

create policy balances_retailer_select on public.daily_balances
  for select using (
    public.current_role() = 'retailer' and retailer_id = auth.uid()
  );
