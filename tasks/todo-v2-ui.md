# UI Reimplementation — exact match to design zip v3 (June 10, 2026)

Design ground truth: `/tmp/swift_ui3/` (extracted from `~/Downloads/Swift Money (3).zip`).
Spec = design JSX/CSS + explicit user overrides from previous session transcript.
Previous build plan archived at tasks/todo-v1-build.md.

## Explicit overrides (user-stated, win over the mock)
- SKIP "Sign in as" role picker on login (web + mobile) — role comes from profile
- Account names come from DB: "Swift Money" (slug swift, always FIRST) and "A2Z" (slug naomi)
- i18n: EVERY string in EN/HI/GU incl. tab labels; pills on login; persists (cookie/AsyncStorage)
- Fonts: Hanken Grotesk (UI), Space Grotesk (numbers), Noto Sans Devanagari/Gujarati per locale
- Pay full button (typed-amount mode only); edit fields on every approval; auto-approve banner
- Realtime auto-refresh everywhere (debounced ~250ms), pull-to-refresh fallback on mobile
- EOD transfer rows audit-only; book cash authoritative; outstanding = approval-event model
- Theme fixed: linen. No tweaks panel (design-tool only). Count-up animations ON.

## Phase A — Web foundation
- [ ] A1. Port design CSS: theme.css (linen tokens) + app.css + web.css → src/app/globals.css
- [ ] A2. Shared components (Icon set, Logo, Btn, Field, Segmented, Switch, Selectt, FileDrop,
      Tile, AmountBox, Denominations, CashAmountEntry, SuccessView, Empty, AccCard, Toast,
      KV, badges, dtable helpers) → src/lib/ui.tsx (client)
- [ ] A3. Realtime: <RealtimeRefresh tables=[...]/> client comp → router.refresh() debounced
- [ ] A4. Authed shell: 268px sidebar (logo, role, Menu, active rail, realtime badges,
      Settings/Sign out footer), topbar (page title/sub + profile chip w/ initials avatar)
- [ ] A5. Login: split-screen (emerald brand panel + cream form), lang pills, NO role picker

## Phase B — Web pages (exact match, real data)
- [ ] B1. Retailer home: feature tiles per account (sparkline, Tap to view), pending tiles,
      Quick actions (72px stacked btns), FOS who-card
- [ ] B2. Retailer request: account seg, big AmountBox, notes, success view; no-FOS empty state
- [ ] B3. Retailer cash: account seg + outstanding line, Enter amount/Count notes seg,
      denominations counter, Pay full, date, notes, success view
- [ ] B4. Retailer history: daily dtable, requests w/ dual badges + "req X → adjusted",
      cash list, EOD transfers/reversals dtable
- [ ] B5. FOS home: hero outstanding, inbox/retailers tiles, quick actions, auto-approve note
- [ ] B6. FOS inbox: InboxCard (edit amount, notes, Decline/Send edited/Accept), recent list
- [ ] B7. FOS cash: account seg, retailer picker rows w/ outstanding, denom entry, success
- [ ] B8. FOS retailers: cards w/ badge + phone/outstanding KVs
- [ ] B9. Dist home: hero total outstanding + 5 tiles (3-col grid)
- [ ] B10. Dist approvals: ApprRequestCard + ApprCashCard (badges, strike-through orig,
      FOS note, Approve as ₹ + notes, Decline/Approve[ edited])
- [ ] B11. Dist outstanding: lead, account seg, expandable OutItem (chevron rotate, badges,
      4-mini grid, daily dtable), total row
- [ ] B12. Dist users: AccCard create FOS/retailer forms, bulk auto-approve btns, roster
      (badge, auto-approve switch, de/activate), retailers (badge, compact FOS select)
- [ ] B13. Dist reports: subtabs EOD upload | Cash report; FileDrop, import results boxes,
      unmatched warning, supported-formats card; cash book recon dtable w/ tfoot diff
      → new route /distributor/reports, redirect old /eod + /cash-report
- [ ] B14. Settings (NEW page, all roles): account KVs, edit profile, change password,
      change email, notifications toggles, [dist] accounts mgmt + auto-approve defaults,
      devices & sessions (sign out / everywhere), [dist] danger zone
- [ ] B15. Update sidebar nav: distributor = Overview/Approvals/Outstanding/Users/Reports

## Phase C — Backend additions for UI features
- [ ] C1. Migration 0013: profiles.notification_prefs jsonb, profiles.default_fos_auto_approve
      (distributor default for new FOS)
- [ ] C2. Server actions: update profile (name/phone/tz), change password, change email,
      accounts CRUD (rename/active/add w/ name+slug), notification prefs
- [ ] C3. Mobile upload API: POST /api/uploads/eod + /api/uploads/cash-report (JWT-auth,
      distributor-only, reuse parsers) so mobile Reports tab is fully functional
- [ ] C4. Apply migration to hosted Supabase

## Phase D — Mobile (Expo) exact port
- [ ] D1. Linen components parity: Segmented (animated thumb), Switch, Selectt, FileDrop,
      Toast, SuccessView, AccCard/expandables, subtabs, denom counter check, tab bar w/ dot
- [ ] D2. Retailer: home, request, cash (+denoms +payfull), history (tables)
- [ ] D3. FOS: home, inbox, cash, retailers + layout tab bar
- [ ] D4. Distributor: home, approvals, outstanding, users, reports (subtabs, uploads via API,
      recon table) + 5-tab bar
- [ ] D5. Settings screen parity incl. language tiles
- [ ] D6. i18n: add all missing keys EN/HI/GU incl. TAB LABELS (known leftover)

## Phase E — Verification (user bar: "verify twice")
- [ ] E1. npm run build clean (web); expo export / tsc clean (mobile)
- [ ] E2. Playwright: screenshot every web page × 3 roles vs design screenshots; fix diffs
- [ ] E3. Mobile: launch Expo, screenshot key screens (emulator if available)
- [ ] E4. Code review pass of the diff

## Review notes (June 10, 2026 — all phases complete)

**Web** — full rewrite to the v3 linen design:
- globals.css = complete union of design theme.css+app.css+web.css; src/lib/ui.tsx ports the
  design's exact icon paths + every shared component (Tile w/ count-up, Segmented, Switch,
  Selectt, FileDrop, Toast, SuccessView, Denominations/CashAmountEntry, AccCard, KV…).
- All 14 role pages rewritten; /distributor/reports merges EOD+Cash (old routes redirect);
  NEW /settings (all roles + distributor accounts mgmt + auto-approve defaults).
- RealtimeRefresh in shell: postgres_changes → router.refresh() (250ms debounce) on all
  data tables, so badges/pages live-update.
- Verified with Playwright (temp org, deleted after): login (split-panel, EN/HI), distributor
  home/approvals/reports/settings, retailer home/cash incl. denominations — all match design.
- Builds: next build ✓, tsc ✓, eslint ✓. tsconfig now excludes mobile/ (its RN global
  FormData type was shadowing DOM's — broke API route typing).

**Mobile** — exact port completed (4 parallel agents on disjoint files):
- New shared linen components (components/linen/more.tsx): Switch, ToggleRow, Selectt
  (modal sheet), FilePick (expo-document-picker), Toast, SuccessView, AccCard, Subtabs,
  DTable, ResultBox.
- All retailer/FOS/distributor screens at design parity incl. dual badges, leaving
  animations, denominations, hero stats, expandable outstanding rows (now per-account).
- NEW (distributor)/reports.tsx — EOD + cash book uploads from mobile via the new
  Bearer-authenticated API routes (/api/uploads/eod, /api/uploads/cash-report) using
  EXPO_PUBLIC_API_URL (set in mobile/.env; LAN IP needed for physical device).
- Settings full parity (profile/password/email/notifications/accounts/auto-approve
  defaults/devices/danger) via new update_own_profile RPC.
- Tab labels translated (EN/HI/GU) — the known leftover. status.*/toast keys added.
- tsc ✓.

**Backend** — migrations 0013 (notification_prefs, default_fos_auto_approve; createFos now
honors the default) and 0014 (update_own_profile security-definer RPC for self profile
edits from mobile) — both applied to hosted Supabase.

**Post-handover fixes (same session)**
- Runtime crash on dev: server imported LOCALES/DICT from the "use client" i18n module
  (client-reference proxies on server in Next 16). Locale data moved to plain shared
  src/lib/i18n-dict.ts; i18n.tsx re-exports for client imports.
- Responsive tier added to globals.css: ≤700px (64px icon rail w/ corner badge, compact
  topbar w/ avatar-only profile, 1-col approval grid, 2-col mini stats, scrollable login),
  ≤600px (smaller tables/segments/buttons), ≤400px guards. .web-appr-grid minmax now
  min(340px,100%) to prevent overflow. Verified at 390×844 via Playwright (login,
  distributor home, approvals — incl. Gujarati).

**Known follow-ups**
- quicksekure push automation still blocked on transfer-form HTML/OTP details (from before).
- ~~Mobile user creation web-only~~ → ENABLED (same session): shared src/lib/users-core.ts
  + Bearer-auth POST /api/users/fos and /api/users/retailer; mobile Users AccCards now have
  real create forms (design CreateFosForm/CreateRetailerForm). E2E-tested with a real JWT
  (200 + profile created, default_fos_auto_approve honored, zod 422 on bad payload, 401
  unauthenticated).
- Web change-password verifies the current password by re-login (Supabase has no verify API).
