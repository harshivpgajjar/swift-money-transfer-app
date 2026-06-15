-- Enable Supabase realtime (logical replication) on tables the UI subscribes to.
-- RLS is enforced on realtime too — users only receive events for rows they can read.

alter publication supabase_realtime add table public.money_requests;
alter publication supabase_realtime add table public.cash_submissions;
alter publication supabase_realtime add table public.daily_balances;
alter publication supabase_realtime add table public.eod_transactions;
alter publication supabase_realtime add table public.cash_report_entries;
alter publication supabase_realtime add table public.profiles;
