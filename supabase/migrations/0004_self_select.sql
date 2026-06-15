-- Every authenticated user must be able to read their own profile row.
-- Without this, the login server action and `requireProfile()` would only
-- succeed when the role-specific SELECT policy passes, which depends on
-- `current_role()` — itself looking up the profile. Adding an explicit
-- self-select policy avoids that fragility.

create policy profiles_self_select on public.profiles
  for select using (id = auth.uid());
