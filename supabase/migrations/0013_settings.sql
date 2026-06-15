-- Settings: notification preferences (all roles) and the distributor's
-- default auto-approve for newly created FOS.

alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb,
  add column if not exists default_fos_auto_approve boolean not null default false;

comment on column public.profiles.notification_prefs is
  'Per-user notification toggles, e.g. {"approved": true, "cash": true, "incoming": true}';
comment on column public.profiles.default_fos_auto_approve is
  'Distributor-only: fos_auto_approve applied to FOS created from now on';
