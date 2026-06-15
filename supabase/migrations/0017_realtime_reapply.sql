-- Re-apply realtime publication membership: the hosted publication was empty
-- (0009 never landed), so no postgres_changes events were emitted at all.

alter publication supabase_realtime add table public.money_requests;
alter publication supabase_realtime add table public.cash_submissions;
alter publication supabase_realtime add table public.daily_balances;
alter publication supabase_realtime add table public.eod_transactions;
alter publication supabase_realtime add table public.cash_report_entries;
alter publication supabase_realtime add table public.profiles;
