-- Cash submissions are now approved by the retailer's FOS (not the distributor).
-- Give FOS update rights on assigned retailers' submissions.

create policy cash_fos_update on public.cash_submissions
  for update using (
    "current_role"() = 'fos'::user_role and exists (
      select 1 from profiles p
      where p.id = cash_submissions.retailer_id and p.fos_id = auth.uid()
    )
  ) with check (
    "current_role"() = 'fos'::user_role and exists (
      select 1 from profiles p
      where p.id = cash_submissions.retailer_id and p.fos_id = auth.uid()
    )
  );
