# Swift Money — full context for Claude

This file is the single source of truth for an AI assistant working on this
repo. Read it fully before making changes. It captures the architecture, the
(non-obvious) financial model, the file formats, the deployment process, and
the hard-won gotchas. Pair it with the live database via the Supabase MCP.

---

## 1. What this is

**Swift Money** is a daily money-transfer / credit-settlement system for a
distributor (Pankaj Gajjar) who fronts money to retailers through payment
portals (HT, PT, A2Z) and collects cash back through field officers (FOS).
It replaces a tangle of Excel sheets with one shared, real-time ledger.

Three roles:
- **Distributor** — owns the org, approves credit, sees all balances, uploads
  the daily portal reports (EOD) and the FSE cash book, reconciles.
- **FOS** (field officer) — reviews retailer requests, collects cash. May have
  *auto-approve* authority (their accept also approves on the distributor's
  behalf).
- **Retailer** — requests money, submits cash, sees their own outstanding.

Two **accounts** per distributor: `swift` ("Swift Money", covers the HT + PT
portals) and `naomi` ("A2Z"). Slug `naomi` is the historical name for A2Z — the
DB slug is still `naomi`; the display name is "A2Z".

---

## 2. Stack & where things live

| Piece | Tech | Location | Hosting |
|---|---|---|---|
| Web app | Next.js 16 (App Router, Turbopack, RSC + server actions) | repo root (`src/`) | Vercel → https://swift-money.vercel.app |
| Mobile app | Expo SDK 54 (expo-router, React Native, new arch) | `mobile/` | EAS build → Android APK (sideloaded) |
| Database / auth / realtime | Supabase (Postgres + RLS + Realtime + Auth) | `supabase/migrations/` | project `rpcpoczwgishuywxpgpl` |

- **One Supabase project, two clients.** Web uses server components/actions
  (`src/lib/supabase/server.ts`) + an admin client (service role,
  `src/lib/supabase/admin.ts`) for privileged work. Mobile talks to Supabase
  **directly** (`mobile/lib/supabase.ts`, anon key + user JWT) and to a few
  Bearer-authed Next API routes (`src/app/api/*`) for service-role needs.
- Because mobile writes directly to tables, **business rules that must hold for
  both web and mobile belong in the database** (RLS, triggers, RPCs) — not only
  in web server actions. (This is why notifications are DB triggers.)

### AGENTS.md note
`AGENTS.md` warns that this Next.js version has breaking changes vs training
data. When unsure about a Next API, read `node_modules/next/dist/docs/`.

---

## 3. Auth & roles

- Login email scheme: **`<10-digit-phone>@swift.app`**, password set per user.
  (8 retailers auto-created from imports use an internal
  `r-m<phone>-<distprefix>@auto.local` email instead — convert to the
  `@swift.app` scheme via the admin API if they need to log in.)
- `profiles` row per user: `role`, `full_name`, `retailer_code`, `phone`,
  `fos_id`, `distributor_id`, `fos_auto_approve`, `active`,
  `must_change_password`, `books_start_date` (distributor only).
- **RLS** scopes every table by org/role. The distributor sees their org;
  FOS sees their assigned retailers; retailer sees themselves.

---

## 4. THE BALANCE MODEL (most important section)

Outstanding is computed **per retailer, per account, per day** into
`daily_balances`, by the `recompute_balances(p_retailer_id, p_account_id,
p_from_date)` RPC. The latest `closing` per (retailer, account) is the
outstanding. Always recompute after touching any source row.

```
closing = opening
        + transferred     (credit GIVEN to the retailer)
        − reversed        (credit returned via portal)
        − cash_received   (cash the retailer paid back)
```

Where each input comes from is the subtle part — it is **EOD-authoritative**:

- **`transferred` (credit):** on a date the EOD report covers (a row in
  `eod_report_dates` for that account+date), credit = the EOD file's
  *transfer* rows. On uncovered dates, credit = app-approved `money_requests`.
  This prevents double-counting when a request and its portal transfer both
  exist. Manual adjustments always count on top.
- **`reversed`:** EOD `eod_transactions` of type `reversal` (DT REVERSED).
- **`cash_received`:** on a date the cash book covers
  (`cash_report_dates`), cash = the book's entries
  (`cash_report_entries`). On uncovered dates, cash = app-approved
  `cash_submissions`. Manual adjustments always count on top.

Critical rules baked into `recompute_balances` (migrations 0020→0023):
1. **Books-start floor** (`profiles.books_start_date` = `2026-06-09`): any
   cash/EOD row dated before this never moves balances — the 9-June opening
   import already netted out all prior history. Pre-floor rows stay for
   reference only.
2. Balances **carry across gaps** (the opening for a recompute window is the
   latest closing on-or-before the day before — not strictly the previous
   calendar day).
3. If a (retailer, account) has **no remaining activity**, its
   `daily_balances` rows are deleted (no stale balances).
4. **Manual adjustments** (`money_requests`/`cash_submissions` whose notes start
   with `Manual adjustment by distributor`) always count, regardless of EOD/book
   coverage. Increase → an approved `money_request`; decrease → an approved
   `cash_submission`. See `src/lib/outstanding-core.ts`.

**Opening balances** were seeded on 2026-06-09 as approved `money_requests`
with notes `Opening balance — imported from Outstanding_09_June_2026.xlsx`.

---

## 5. File formats & parsing

### EOD portal reports (the "transfers/reversals" feed)
Parsed by `src/lib/sheet-parser.ts`; imported by `src/lib/uploads/eod-core.ts`
(web action `src/lib/actions/eod.ts`; mobile via `/api/uploads/eod`).
Up to 5 files/day: 3 HT, 1 PT, 1 A2Z (the 3rd HT file uses PT format).
Formats auto-detected by headers:
- **simple**, **PT/merchant report** (`Merchant MobileNo` etc.),
  **HT-A** name-only (`tranname` + the typo column `tarnsfer_to`),
  **HT-B** credit/debit (`creditamount`/`debitamount`: Debit=transfer,
  Credit=reversal), **A2Z PaymentReports** (`Ref Id` + `Description` +
  `Closing Bal`).
- Account auto-detected: `detected_account` from format → filename inference
  (`a2z`→naomi; `ht`/`pt`/`swift`→swift) → form default.

**A2Z rules:** keep only `DT` (transfer) and `DT REVERSED` (reversal). Phone is
in the Description tagged `REM:` (retailer file) or `DLM:` (distributor file).
The export's columns are shifted — the numeric order id is in the **Wallet**
column, not "Order id" (which holds the label "Money"); use the numeric one as
`bank_reference` for dedup. **Two A2Z files/day** (retailer + distributor
report), same format, processed identically; dedup by order id. SELF PAYMENT
RETURN is **ignored** (repayments live only in the cash book).

**Ignored counterparties** (inter-portal / distributor's own firms, never
retailers): `rameshchandra mohanlal gajjar`, `swift money wallet`,
`pankaj rameshchandra gajjar huf`, `panache traders` (+ swift),
`quicksun vinod kumar`, `vinod achalaram kumar`. (HT rows under these names are
dropped silently.)

**Name/alias resolution** (`eod-core.ts`): match by phone → code → name. Name
matching is exact (incl. `retailer_aliases`) → punctuation/spacing-insensitive
→ **prefix containment ≥5 chars**. A row that carries a phone NEVER falls back
to fuzzy name matching (it auto-creates by phone). This avoids the class of bug
where `"narpatlalmajisAMOBILE"` matched "A Mobile". `eod_transactions.raw_name`
stores the original portal name/phone for audit.

Dedup: by `bank_reference` per (distributor, account). Re-uploading a file →
0 new rows, all duplicates. Aliases live in `retailer_aliases` (migration 0019,
seeded from the user's `Alias.xlsx`).

### FSE cash book (the "cash_received" feed)
A Google Sheets workbook (`FSE CASH BOOK (Autosaved).xlsx`). Parsed by
`src/lib/cash-report-parser.ts`; imported by
`src/lib/uploads/cash-report-core.ts`.
- Sheets named **HT / PT** (→ swift) and **A2Z** (→ naomi). Fuzzy sheet/file
  detection (`sheetKeyFromLabel`): "H T", "H.T.", "HT Cash", "a-2-z" all work;
  no false hits on "night"/"receipt".
- Date **column headers** are read leniently: `DD/MM/YYYY`, `D/M`, month names
  ("10 JUNE"), Excel date serials, and ISO. **Locale-flip fix:** Google Sheets
  in a US locale stores a typed "10/06/2026" as the *date* Oct 6 — when a serial
  is implausibly far from today and the day↔month swap lands near today, trust
  the swap. **Future-dated columns are a hard error** (cash can't be collected
  in the future → reject the whole upload, name the column).
- Rows match by phone, then **name/alias** (added 13 Jun — the cash importer now
  resolves phone-less rows like the EOD importer; the FSE HT sheet often has
  alias-only retailers with no phone). Unmatched rows are reported by name,
  never silently dropped, never guessed.
- An upload **replaces only the (account, date) pairs present in the file** —
  the FOS reuses the same column day-to-day, so earlier dates are preserved.

### Reconciliation against the distributor's ledger reports
The distributor periodically sends `<date>.xlsx` with sheets `HT`/`Swift`
(→ swift account) and `A2Z` (→ naomi). Rows are "Effect" lines; the `Total`
column is the closing. To verify: compare the system's latest
`daily_balances` closing **on-or-before that date** against the report, per
account and per retailer. Books have been verified to the paisa for 9–14 June.
Expect the system to lead the report by any same-day app approvals. Helper:
`scripts/compare-expected.mjs` / `cmp12full.mjs` (one-offs; adapt the file path).

---

## 6. Notifications & live activity (added 13 Jun)

- **DB triggers** on `money_requests` and `cash_submissions` write rows into
  `notifications(user_id, type, title, body, data, read_at)`, routed to whoever
  needs it (retailer/FOS/distributor). Works for web AND mobile because it's at
  the DB layer. The distributor's decision is the final word (a direct override
  doesn't fire intermediate "awaiting" notifs). Opening/bulk inserts stay
  silent; manual adjustments → `adjustment` type. Migrations 0024 + 0025.
- **In-app bell + feed**, live via Realtime on `notifications`. Web:
  `src/components/notification-bell.tsx` (topbar in `shell.tsx`). Mobile:
  `mobile/components/notif-bell.tsx` (rendered in `Topbar`). Localized via
  `ntf.<type>` title keys + a data-driven body
  (`src/lib/notif.ts` / `mobile/lib/notif.ts`). **Works with zero extra setup.**
- **Expo push** (device pings): `push_tokens` table; mobile registers on login
  (`mobile/lib/push.ts`, expo-notifications + expo-device). The `notify_push`
  trigger POSTs to exp.host via `pg_net` on each notification insert. Android
  standalone push needs FCM, already configured: Firebase project
  `swiftmoneytransfer-48e82`, FCM V1 service-account key uploaded to EAS, and
  `mobile/google-services.json` + `android.googleServicesFile` in `app.json`.
  Push delivers only on APKs built **after** that config.
- **Distributor live activity feed**: `src/components/distributor-activity.tsx`
  / `mobile/components/distributor-activity.tsx` on the dashboard — merged
  requests + cash, newest first, realtime, status badges. i18n `act.*`.
- **Distributor override:** the distributor sees FOS-pending requests (even with
  auto-approve on) and can act directly; `distributorDecideRequest` stamps the
  FOS stage with "Actioned directly by distributor". Query
  `getDistributorFosPendingRequests`.

---

## 7. Conventions

- **i18n is trilingual (en/hi/gu)** and lives in **two** dictionaries that must
  stay in sync: web `src/lib/i18n-dict.ts` and mobile `mobile/lib/i18n.tsx`.
  Add every new key to both, in all three locales. Non-ASCII is stored as
  `\uXXXX` escapes in the files. `t(key)` returns the raw key on a miss.
- **Design system** ("linen"): warm off-white theme. Web uses CSS classes in
  `src/app/globals.css` + helpers in `src/lib/ui.tsx`. Mobile uses
  `mobile/lib/theme.ts` (`T` tokens, `font()`) + `mobile/components/linen/`.
- **Money**: `formatINR` (Indian grouping). **Dates/IST**: always compute "today"
  in IST via `toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })`.
- Excel export: web dynamic `import("xlsx")` + `XLSX.writeFile`; mobile CSV via
  expo-file-system `File`/`Paths.cache` + `expo-sharing`.

---

## 8. Deployment

- **Web:** `vercel deploy --prod` (from repo root), aliased to
  `swift-money.vercel.app`. Env (Supabase URL/anon, service role, Google Drive
  keys) lives in Vercel project settings, not the repo.
- **Mobile:** `cd mobile && eas build --platform android --profile production
  --non-interactive`. The production profile is `apk` (sideloadable). **Env for
  the app must live in `eas.json`'s production `env` block** — the root
  `.gitignore` excludes `.env*`, so a `mobile/.env` would NOT reach EAS.
  Native module changes (expo-notifications, etc.) require a fresh build.
- **DB:** apply migrations with the Supabase MCP `apply_migration`, or
  `supabase db push`. Migrations are the source of truth in `supabase/migrations/`.

---

## 9. Gotchas (learned the hard way)

- **Never `export type` from a `"use server"` file.** In prod, every export of a
  server module is registered as a server reference → `ReferenceError: X is not
  defined` at module eval. Put shared types in a plain module and import them.
- **`mobile/.env` is gitignored** → invisible to EAS. Put app env in `eas.json`.
- **Hermes bundle string greps are unreliable** (string-table packing) — verify
  env-in-bundle with fragments, not full strings.
- **Realtime publication can be empty** on a hosted project if a migration never
  applied — `supabase_realtime` must include the tables you subscribe to
  (migrations 0017, 0024 re-add them).
- **Google Sheets US-locale dates**: typed `DD/MM/YYYY` can be stored as the
  wrong *date serial* (month-first). The cash parser auto-corrects via the
  near-today heuristic; future-dated cash is rejected outright.
- **A2Z export columns are shifted** (order id ↔ wallet label "Money") — use the
  numeric Wallet value as the dedup reference.
- **Phone-bearing EOD rows must auto-create, never fuzzy-match a name** — short
  retailer names (e.g. "A Mobile" → "amobile") otherwise match mid-word inside
  longer names.
- `eod_transactions` now stores `raw_name` so a mis-match is auditable; older
  rows predate it.

---

## 10. Repo layout

```
/                      Next.js web app (src/, package.json, next.config.ts)
  src/app/(authed)/    distributor / fos / retailer dashboards (RSC) + shell
  src/app/api/         Bearer-authed routes for mobile service-role needs
  src/lib/             actions/, uploads/, queries, analytics, parsers, ui, i18n
  src/components/      client components (bell, activity, drive-picker, …)
/mobile/               Expo app (app/ routes by role group, lib/, components/)
/supabase/migrations/  numbered SQL migrations (source of truth for the DB)
/scripts/              one-off data ops + E2E tests (read .env.local at runtime)
/tasks/                working todo/notes (todo.md is the live one)
/docs/                 this file
```

## 11. Local setup on a new machine

1. `npm install` (root) and `cd mobile && npm install`.
2. Create `/.env.local` with: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and (for Drive
   import) `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_API_KEY`.
   **These are NOT in the repo** — copy them from Vercel project settings or the
   Supabase dashboard (Project Settings → API).
3. Web: `npm run dev`. Mobile: `cd mobile && npx expo start`.
4. DB access for an assistant: the Supabase MCP server, project
   `rpcpoczwgishuywxpgpl`. Verify balances after any data change with the
   `with latest as (select distinct on (retailer_id, account_id) … order by
   balance_date desc) …` pattern.
5. After ANY change to source rows, call `recompute_balances` for the affected
   (retailer, account) and re-check the org total.
