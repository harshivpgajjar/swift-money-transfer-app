# Swift Money Transfer App

Three-role money flow for distributors, field officers (FOS), and retailers.

- **Retailer** requests money → **FOS** accepts / edits / declines → **Distributor** approves.
- **Distributor** uploads end-of-day sheet (transfers + reversals) — *the only thing that moves outstanding*.
- **Retailer / FOS** report cash given back → **Distributor** approves → reduces outstanding.
- Outstanding sheet: `Opening + Transferred − Reversed − Cash = Closing`. Per retailer, daily.

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind v4
- Supabase (Postgres, Auth, Storage, RLS) — server- and browser-side via `@supabase/ssr`
- Zod, react-hook-form, date-fns
- Mobile (Expo) deferred to Phase 3

## Getting started

```bash
# 1. Install
npm install

# 2. Spin up Supabase (see supabase/README.md for details)
brew install supabase/tap/supabase    # one-time
supabase init                          # one-time
supabase start
supabase db reset                      # applies migrations

# 3. Env
cp .env.local.example .env.local
# paste URL + anon + service-role keys printed by `supabase start`

# 4. Bootstrap a distributor
# — see supabase/README.md "Bootstrapping the first distributor"

# 5. Run
npm run dev
```

Open http://localhost:3000 and sign in.

## Project structure

```
src/
  app/
    (authed)/                  # protected route group (sidebar shell)
      distributor/             # distributor home
      fos/                     # FOS home
      retailer/                # retailer home
      layout.tsx
    login/                     # login page + server action
    layout.tsx                 # root layout
    page.tsx                   # role-aware redirect
  lib/
    supabase/
      server.ts                # createServerClient (SSR)
      client.ts                # createBrowserClient
      admin.ts                 # service-role (Server Actions only)
    auth.ts                    # requireProfile / requireRole helpers
    types.ts                   # role + status enums
    utils.ts                   # cn(), formatINR()
proxy.ts                       # auth gate (Next.js 16 file convention)
supabase/
  migrations/                  # SQL: schema → RLS → balance fns
  seed.sql                     # manual examples
  README.md                    # local + hosted setup
```

## Build phases

See [`tasks/todo.md`](./tasks/todo.md) for the full phased plan and check-state.

- **Phase 1** (this commit): schema + RLS + balance fn, auth, role-aware shells.
- **Phase 2**: workflows — request/approval flows, EOD upload + parser, outstanding sheet.
- **Phase 3**: mobile (Expo), notifications, exports, audit log.
