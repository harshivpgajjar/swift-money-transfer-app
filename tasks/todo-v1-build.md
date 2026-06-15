# Swift Money Transfer App — Build Plan

## Decisions locked
- **Stack:** Next.js 15 (web) + Supabase (Postgres, Auth, Storage, RLS). Mobile (Expo) deferred to Phase 3.
- **Auth:** Distributor-issued credentials only. No self-signup.
- **Money flow semantics:** approval = intent; EOD sheet = truth. Outstanding moves only on sheet rows.
- **Period:** daily. `opening = previous day's closing`.
- **Each FOS owns specific retailers.** Retailers can be pre-registered or auto-created from EOD sheet (flagged "needs FOS assignment").
- **EOD format:** CSV/XLSX with `retailer_code, retailer_name?, type, amount, txn_date?, bank_reference?, notes?`. Atomic upload — reject whole file on any row error.

## Schema (5 tables + 1 materialized)
- `profiles` — role, full_name, phone, retailer_code, fos_id, distributor_id, active, needs_assignment, timezone
- `money_requests` — retailer_id, fos_id, distributor_id, requested_amount, fos_amount, fos_status, distributor_status, notes
- `cash_submissions` — retailer_id, submitted_by, distributor_id, amount, txn_date, status, notes
- `sheet_uploads` — distributor_id, filename, storage_path, row_count, totals, uploaded_at
- `eod_transactions` — upload_id, retailer_id, type (transfer/reversal), amount, txn_date, bank_reference, notes
- `daily_balances` — (retailer_id, balance_date) → opening, transferred, reversed, cash_received, closing

## Phase 1 — Foundation ✅
- [x] Plan committed to tasks/todo.md
- [x] supabase/migrations/0001_schema.sql — types, tables, indexes
- [x] supabase/migrations/0002_rls.sql — row-level security per role
- [x] supabase/migrations/0003_balance_fn.sql — `recompute_balances(retailer, from_date)` + helpers
- [x] supabase/seed.sql + supabase/README.md (manual bootstrap of first distributor)
- [x] Next.js 16 scaffold (TS + Tailwind v4 + App Router, src/)
- [x] Deps installed: @supabase/ssr, @supabase/supabase-js, zod, react-hook-form, @hookform/resolvers, date-fns, date-fns-tz, lucide-react, clsx, tailwind-merge
- [x] src/lib/supabase/{server,client,admin}.ts — SSR / browser / service-role clients
- [x] proxy.ts (Next.js 16 file convention, replaces middleware.ts) — auth gate + role-based redirect
- [x] /login — server-action sign-in (email + password) with role-aware redirect
- [x] Authed shell + per-role landing pages (/distributor, /fos, /retailer) with phase-2 placeholders
- [x] .env.local.example + README quickstart
- [x] Verified: `npm run typecheck` clean, `npm run build` clean

## Phase 2 — Role workflows ✅
- [x] **Distributor**
  - [x] Users: create FOS, create retailer, assign retailers to FOS, deactivate (soft)
  - [x] Approvals queue: money requests + cash submissions (both with notes)
  - [x] EOD upload: CSV/XLSX picker → atomic commit → balance recompute, with auto-create of unknown retailers
  - [x] Outstanding sheet: per-retailer rows w/ click-to-expand daily history, lazy-loaded via /api route
  - [x] Approved-pending column = `max(0, approved − transferred)` aggregate
- [x] **FOS**
  - [x] Inbox: pending money requests from assigned retailers (accept / send edited / decline) + recent history
  - [x] Submit cash on retailer's behalf
  - [x] Roster: assigned retailers + each one's current outstanding
- [x] **Retailer**
  - [x] New money request form
  - [x] Submit cash form
  - [x] My outstanding (today) on overview
  - [x] History page: daily balances + requests + cash submissions + EOD transfers
- [x] Verified: `npm run typecheck` clean, `npm run build` clean (17 routes)

## Phase 3 — Mobile (Expo) ✅
- [x] Expo SDK 54 + Expo Router 6 + React Native 0.81 + NativeWind v4
- [x] Supabase client (AsyncStorage session persistence, auto-refresh tied to AppState)
- [x] AuthProvider context + RoleGate per route group + role-based redirect
- [x] Login screen
- [x] Distributor tabs: Overview · Approvals · Outstanding · Users (read-only) · EOD (web-only message)
- [x] FOS tabs: Overview · Inbox (accept/edit/decline) · Submit cash · My retailers
- [x] Retailer tabs: Overview · Request · Submit cash · History
- [x] Pull-to-refresh on all list screens
- [x] Verified: `npx tsc --noEmit` clean (35 source files)

## Phase 4 — Later
- [ ] Push notifications (expo-notifications) on status changes
- [ ] Exports (PDF outstanding, CSV statements) on web
- [ ] Audit log table
- [ ] Multi-distributor isolation hardening
- [ ] App store builds (EAS Build)

## Open follow-ups (raise before Phase 2 starts)
- Currency formatting locale (defaulting to en-IN ₹)
- Should retailers see *their* full transaction history or only running balance?
- Reversal authorisation flow — does FOS see reversals or only distributor?
- Hard-delete vs soft-delete on user deactivation (soft, by default)
