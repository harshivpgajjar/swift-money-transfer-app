-- Rename the existing "Naomi Communication" account to "A2Z".
-- Slug stays the same ('naomi') so cash-report sheet mapping continues to work.

update public.accounts
set name = 'A2Z'
where slug = 'naomi' and name = 'Naomi Communication';
