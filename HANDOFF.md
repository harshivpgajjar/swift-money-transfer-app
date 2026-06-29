# Swift Money — session handoff

Context bridge for continuing the distributor (Pankaj/Harshiv Gajjar) money-transfer
app: Next.js 16 web + Expo mobile + Supabase. This summarizes work + decisions so a
fresh (or cloud) session can pick up without re-deriving everything.

## Stack & deploy
- **Web:** Next.js (App Router) → Vercel. Deploy is **CLI-only**: `vercel deploy --prod`
  (no git auto-deploy). Pushing to GitHub does **not** trigger a deploy.
- **Mobile:** Expo / React Native → **EAS** production APK (`eas build --platform android
  --profile production`). versionCode auto-increments; currently at **40**.
- **DB:** Supabase project ref `rpcpoczwgishuywxpgpl` (name "Swift Money"). Two accounts:
  **A2Z** (slug `naomi`) and **Swift Money** (slug `swift`).
- **APK cadence (user rule):** do NOT build an APK every change — only on request or once
  at day-end. Web deploys per change.
- Ops creds (Vercel token, EXPO_TOKEN, Supabase service key) are NOT in the repo — they
  live in Vercel/EAS/local env. A cloud session must re-provision them for deploys/builds.

## Ledger model (core)
- `daily_balances` per (retailer, account, day): opening, transferred, reversed,
  cash_received, closing. closing = opening + transferred − reversed − cash.
- Rebuilt by `recompute_balances(retailer, account, from_date)` — opening = prior day's
  closing (no standalone opening field). **All retailers' opening = ₹0**; their starting
  outstanding was loaded as **transfers on day 1 (09-Jun-2026)**. To "change opening,"
  edit the 09-Jun entry + recompute.
- Outstanding totals use cap-proof RPCs (`org_outstanding`, `org_personal_outstanding`,
  `org_day_flow`) — all exclude `excluded` and `personal` retailers.

## Profile flags (project-specific)
- `profiles.excluded` — junk/duplicate (e.g. Naomi Communication); out of all totals.
- `profiles.personal` — owner/internal accounts (Pankaj Gajjar, Harshiv Traders RT-1009);
  carved out of receivables, shown as a separate "Personal" line.
- `profiles.defaulted` — credit blocked (trigger `block_defaulter_credit`); 19 flagged.
- At-risk = owes + no cash in 45 days. **At-risk reads ledger cash (`daily_balances
  .cash_received`), NOT `cash_submissions`** — this distributor records cash via the cash
  book/EOD, so cash_submissions is near-empty.

## Action Center (`action_center` RPC) — the most-iterated piece
A daily collection to-do. Anchored to **ref_day = latest day with cash** (not calendar
today), so it's meaningful before today's cash is uploaded.
- **txn_at**: EOD parser now captures each transfer's time (`eod_transactions.txn_at`,
  IST). The importer **backfills txn_at on re-upload** (heals rows imported before the
  feature) instead of skipping as duplicate. "By 3 PM" = `txn_at <= 15:00` (NULL excluded).
- **Pending due = old outstanding + by-3PM transfers − collected today** (cash+reversals).
  After-3 PM transfers are NOT due. The amount shown is this pending-due, not full balance.
- Buckets (priority): **defaulter** → **attention** (pending due > 0 AND a by-3PM transfer
  today) → **atrisk** (pending due > 0 AND no cash 45d) → **alert** (pending due > 0, old
  carryover). Returns `outstanding` (=pending due) and `full_pending` (=total balance).
- **UI:** one grouped, sorted list (Active → At-risk → Blocked) with two columns
  **Till 3 PM** (red, primary) and **Full** (muted) + call button. FOS filter for
  distributor. Web: `src/app/(authed)/action/action-view.tsx`. Mobile:
  `mobile/components/ActionCenter.tsx`.

## Outstanding screen
- Same Active/At-risk/Defaulters **grouping** as Action (soft dividers, count+subtotal per
  group), but the number is the **full balance** (not Till-3PM) and it keeps the ledger
  controls (account toggle, date range, search, export, tap-to-expand history). Decision:
  give it the *look*, not the Till-3PM brain.

## FOS features
- **Action tab** + **FOS filter** on Action (distributor sees all / per-FOS).
- **Request balance** (`src/lib/fos-request.ts`, `/api/fos/request-balance`,
  `src/lib/actions/requests.ts:fosRequestBalance`): FOS raises an **auto-approved** money
  request for a retailer (distributor approval is auto here). Defaulter block still applies.
  Web screen `(authed)/fos/request/`, mobile `(fos)/request.tsx`, mobile API in `lib/api.ts`.

## PENDING / not built
- **FOS cash-file upload** — *mocked, awaiting go*. Must be **scoped to the FOS's own
  retailers**: the distributor's `processCashReportUpload` (cash-report-core.ts) does
  replace-by-(account,date) across ALL retailers; a FOS partial upload would wipe other
  retailers' cash. Build a FOS-scoped variant that only deletes/inserts/recomputes the
  FOS's retailers.
- (Earlier idea) **Cash sheet via photo** — needs an Anthropic API key (vision); user has
  none yet. Review-before-save UI was mocked.

## Conventions
- i18n is a dual dict (en/hi/gu): web `src/lib/i18n-dict.ts`, mobile `mobile/lib/i18n.tsx`.
  Keep keys in sync across all 3 languages and both files.
- Verify with `npm run typecheck` (web) and `npx tsc --noEmit` (mobile) before deploy.
- Password resets: update `auth.users.encrypted_password` via
  `extensions.crypt('pw', extensions.gen_salt('bf'))` + set `profiles.must_change_password
  = false`.
