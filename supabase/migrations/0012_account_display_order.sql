-- Add a deterministic ordering column so Swift Money always appears before
-- the A2Z account regardless of insertion-time microsecond ordering.

alter table public.accounts
  add column if not exists display_order int not null default 0;

update public.accounts
set display_order = case slug
                      when 'swift' then 0
                      when 'naomi' then 1
                      else 99
                    end;
