# Supabase setup

## Option A — local stack (recommended for dev)

```bash
brew install supabase/tap/supabase
supabase init        # only needed once, creates supabase/config.toml
supabase start       # boots Postgres + Auth + Storage + Studio in Docker
```

Apply migrations:

```bash
supabase db reset    # wipes & replays all migrations in supabase/migrations/
```

Studio: http://localhost:54323

Copy the printed `anon` and `service_role` keys + URL into `.env.local`.

## Option B — hosted project

1. Create project at supabase.com.
2. In SQL editor, run each migration file in `supabase/migrations/` in order.
3. Project URL + anon + service_role keys go into `.env.local`.

## Bootstrapping the first distributor

There is no self-signup. The first distributor is created manually:

1. In Supabase Studio → Authentication → Users → "Add user", create with email + password.
2. Copy the new user's UUID.
3. In SQL editor:

   ```sql
   insert into public.profiles (id, role, full_name, distributor_id)
   values ('<uuid>', 'distributor', 'Your Name', '<uuid>');

   -- so the proxy/auth gate can read role from JWT app_metadata:
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role":"distributor"}'::jsonb
   where id = '<uuid>';
   ```

4. Sign in at `/login`. From there, the distributor creates FOS + retailer accounts via the UI (Phase 2).
