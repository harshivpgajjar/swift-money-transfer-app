-- Per-FOS "auto-approve" toggle.
-- When true, the FOS's accept/edit decision also approves the request on the
-- distributor's behalf — it never lands in the distributor approvals queue.
-- Default false (current behaviour: distributor approves every request).

alter table public.profiles
  add column fos_auto_approve boolean not null default false;
