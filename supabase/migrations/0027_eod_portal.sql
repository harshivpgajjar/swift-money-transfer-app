-- Tag each Swift EOD upload with its portal (HT or PT) so the merged `swift`
-- account (which bundles both portals) can be split downstream — the investor
-- settlement needs HT vs PT per transfer, and the DB currently can't tell them
-- apart. HT-A / HT-B exports are auto-tagged HT at import; PT/Report-format
-- files are tagged from the uploader's choice (format alone can't distinguish a
-- PT export from a 3rd HT export, which uses the same format).
--
-- Prospective only: historical rows stay null (raw files weren't retained, so no
-- backfill). A2Z (naomi) uploads stay null — that account is already a single
-- portal. Portal is metadata: it does not affect balances or recompute_balances.

alter table public.sheet_uploads
  add column portal text check (portal in ('HT', 'PT'));

comment on column public.sheet_uploads.portal is
  'HT or PT for swift-account uploads (splits the merged HT+PT portal for downstream consumers); null for A2Z and pre-tagging history.';
