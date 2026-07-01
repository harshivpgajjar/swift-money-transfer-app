-- Part 3 (FOR REVIEW — not yet applied): tag each Swift cash-report ROW with its portal
-- (HT or PT), splitting the merged `swift` account on the CASH side — the analog of the EOD
-- transfer tag (0027_eod_portal.sql on sheet_uploads.portal) and of A2Z having its own account.
--
-- Per-ENTRY (not per-report): a single cash file can hold HT, PT and A2Z sheets at once, so the
-- tag lives on cash_report_entries and comes straight from the sheet name — automatic, no
-- operator selector needed (unlike EOD, where the file format was ambiguous). The parser sets
-- it: ht sheet -> 'HT', pt sheet -> 'PT', a2z -> null.
--
-- Prospective: historical rows stay null. A2Z stays null (single portal). Metadata only —
-- does not affect balances. After apply, cash splits by firm directly on cash_report_entries.portal.

alter table public.cash_report_entries
  add column portal text check (portal in ('HT', 'PT'));

comment on column public.cash_report_entries.portal is
  'HT or PT for swift-account cash rows (from the sheet name); null for A2Z and pre-tagging history. Splits merged swift on the cash side (mirrors sheet_uploads.portal / eod_transactions).';
