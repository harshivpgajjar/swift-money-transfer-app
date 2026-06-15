# EOD-authoritative model + parser fixes (11 June 2026)

User decisions (locked):
- EOD report OVERRIDES app outstanding: on dates covered by an EOD upload (per account),
  file transfers define credit; app-approved requests on those dates are audit-only.
- Cash book contains ONLY cash submitted to FOS (no returns). It stays authoritative for
  collections on covered dates.
- A2Z SELF PAYMENT RETURN rows: ignore completely (not retailer money).
- Two A2Z files per day (retailer + distributor report), same format, processed identically;
  dedup by bank_reference prevents double-count. Sample of distributor file pending from user.
- Dashboard: discrepancy insights — who got file transfers without app requests, FOS vs file
  amount diffs, etc.
- Fix cash-book (and EOD) file/sheet detection: fuzzy HT/PT/A2Z ("h t", "H.T.", sheets
  *containing* the token, etc.).

## Tasks
- [x] 1. Parser: drop SELF PAYMENT RETURN handling in A2Z mapper (ignore + count in summary)
- [x] 2. Parser: fuzzy account detection (sheetKeyFromLabel; 21 unit cases pass)
- [x] 3. Migration 0020: eod_report_dates coverage table + recompute_balances v3
- [x] 4. eod-core: coverage recorded per transfer date; recompute extends to retailers
      with app approvals on newly covered dates
- [x] 5. Data migration: 5 self-return rows (₹3.5L) deleted; coverage backfilled; all recomputed
- [x] 6. Analytics: pulse now reads daily_balances (file credit included); new appUsage list
- [x] 7. i18n an.appuse* ×3 locales web + mobile
- [x] 8. Verified: total outstanding ₹31,54,846.10 — reconciles to the paisa
      (= −9,42,154 + 37,67,000 file credit + 3,50,000 self returns + 1,65,000 new
      approvals today − 1,85,000 new collections today). Deployed to swift-money.vercel.app
- [x] 9. Mobile: appUsage section on dashboard; APK rebuild kicked off

## Extra (found during work)
- [x] A2Z export's "Order id" column holds the label "Money"; real order number is in
      "Wallet" → all 106 A2Z rows shared ref "Money" (next upload would have deduped to
      nothing). Parser fixed + 106 production rows repaired with real refs from the file.
- [x] Distributor A2Z file tags phones "DLM:" (retailer file "REM:") — regex accepts both.
- [x] E2E: 12/12 assertions pass with real files in throwaway org (cleaned up).

## Review
EOD files are now authoritative for credit on covered (account, date); cash book for
collections; manual adjustments always count; app approvals/cash on covered dates are
audit-only and feed the discrepancy + "not using the app" insights.
