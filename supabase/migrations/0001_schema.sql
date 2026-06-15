-- Swift Money Transfer App — initial schema
-- Roles: distributor (org owner), fos (field officer, owns a set of retailers), retailer (end customer)

create extension if not exists "uuid-ossp";

create type public.user_role as enum ('distributor', 'fos', 'retailer');
create type public.request_fos_status as enum ('pending', 'accepted', 'edited', 'declined');
create type public.approval_status as enum ('pending', 'approved', 'declined');
create type public.eod_txn_type as enum ('transfer', 'reversal');

-- profiles extends auth.users with role + org membership
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null,
  full_name text not null,
  phone text,
  retailer_code text unique,
  fos_id uuid references public.profiles(id) on delete set null,
  distributor_id uuid references public.profiles(id) on delete cascade,
  active boolean not null default true,
  needs_assignment boolean not null default false,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retailer_code_only_for_retailers check (
    (role = 'retailer' and retailer_code is not null)
    or (role <> 'retailer' and retailer_code is null)
  ),
  constraint distributor_self_owned check (
    (role = 'distributor' and distributor_id = id)
    or (role <> 'distributor' and distributor_id is not null)
  )
);

create index idx_profiles_distributor on public.profiles(distributor_id);
create index idx_profiles_fos on public.profiles(fos_id);
create index idx_profiles_role on public.profiles(role);

-- money_requests: retailer asks for X, FOS edits/accepts/declines, distributor approves/declines
create table public.money_requests (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.profiles(id),
  fos_id uuid not null references public.profiles(id),
  distributor_id uuid not null references public.profiles(id),
  requested_amount numeric(12,2) not null check (requested_amount > 0),
  fos_amount numeric(12,2) check (fos_amount is null or fos_amount > 0),
  fos_status public.request_fos_status not null default 'pending',
  fos_acted_at timestamptz,
  fos_notes text,
  distributor_status public.approval_status not null default 'pending',
  distributor_acted_at timestamptz,
  distributor_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_requests_retailer on public.money_requests(retailer_id);
create index idx_requests_fos on public.money_requests(fos_id);
create index idx_requests_distributor on public.money_requests(distributor_id);
create index idx_requests_pending_fos on public.money_requests(fos_id)
  where fos_status = 'pending';
create index idx_requests_pending_distributor on public.money_requests(distributor_id)
  where distributor_status = 'pending' and fos_status in ('accepted', 'edited');

-- cash_submissions: retailer/FOS reports cash given, distributor approves
create table public.cash_submissions (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.profiles(id),
  submitted_by uuid not null references public.profiles(id),
  distributor_id uuid not null references public.profiles(id),
  amount numeric(12,2) not null check (amount > 0),
  txn_date date not null default current_date,
  status public.approval_status not null default 'pending',
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_cash_retailer on public.cash_submissions(retailer_id);
create index idx_cash_distributor on public.cash_submissions(distributor_id);
create index idx_cash_pending on public.cash_submissions(distributor_id)
  where status = 'pending';

-- sheet_uploads: one row per CSV/XLSX upload by distributor
create table public.sheet_uploads (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.profiles(id),
  uploaded_by uuid not null references public.profiles(id),
  filename text,
  storage_path text,
  txn_date date not null default current_date,
  row_count int not null default 0,
  total_transferred numeric(12,2) not null default 0,
  total_reversed numeric(12,2) not null default 0,
  uploaded_at timestamptz not null default now()
);

-- eod_transactions: rows from the EOD sheet — the only thing that moves outstanding
create table public.eod_transactions (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.sheet_uploads(id) on delete cascade,
  distributor_id uuid not null references public.profiles(id),
  retailer_id uuid not null references public.profiles(id),
  type public.eod_txn_type not null,
  amount numeric(12,2) not null check (amount > 0),
  txn_date date not null,
  bank_reference text,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_eod_retailer_date on public.eod_transactions(retailer_id, txn_date);
create index idx_eod_distributor_date on public.eod_transactions(distributor_id, txn_date);

-- daily_balances: materialized per (retailer, day) for fast outstanding lookups
create table public.daily_balances (
  retailer_id uuid not null references public.profiles(id),
  balance_date date not null,
  opening numeric(12,2) not null default 0,
  transferred numeric(12,2) not null default 0,
  reversed numeric(12,2) not null default 0,
  cash_received numeric(12,2) not null default 0,
  closing numeric(12,2) not null default 0,
  primary key (retailer_id, balance_date)
);

create index idx_balances_date on public.daily_balances(balance_date);

-- updated_at trigger
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger trg_requests_updated before update on public.money_requests
  for each row execute procedure public.set_updated_at();

-- Auth helpers used by RLS policies
create or replace function public.current_role() returns public.user_role
language sql stable security definer set search_path = public, auth as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_distributor_id() returns uuid
language sql stable security definer set search_path = public, auth as $$
  select distributor_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_fos_id() returns uuid
language sql stable security definer set search_path = public, auth as $$
  select id from public.profiles where id = auth.uid() and role = 'fos';
$$;
