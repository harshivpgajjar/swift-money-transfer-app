-- Alias names for retailers as they appear in uploaded portal files
-- (HT/PT/A2Z exports use different names than the app).

create table public.retailer_aliases (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.profiles(id) on delete cascade,
  retailer_id uuid not null references public.profiles(id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now()
);
create unique index idx_retailer_aliases_unique
  on public.retailer_aliases (distributor_id, lower(alias));
create index idx_retailer_aliases_retailer on public.retailer_aliases (retailer_id);

alter table public.retailer_aliases enable row level security;

create policy aliases_distributor_all on public.retailer_aliases
  for all using (
    "current_role"() = 'distributor'::user_role and distributor_id = auth.uid()
  ) with check (
    "current_role"() = 'distributor'::user_role and distributor_id = auth.uid()
  );
