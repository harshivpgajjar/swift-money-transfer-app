import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCashWorkbooks } from "@/lib/cash-report-parser";
import type { AccountSlug } from "@/lib/types";

export type CashReportResult =
  | {
      ok: true;
      summary: {
        report_id: string;
        rows: number;
        total_amount: number;
        covered_dates: string[];
        per_account: Record<AccountSlug, { rows: number; amount: number; dates: string[] }>;
        sheets_processed: string[];
        missing_sheets: string[];
        new_retailers: { code: string; name: string; phone: string }[];
        warnings: string[];
      };
    }
  | { ok: false; error: string };

export async function processCashReportUpload(
  distributorId: string,
  fileOrFiles: File | File[],
): Promise<CashReportResult> {
  const distributor = { id: distributorId };
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];

  const parsed = await parseCashWorkbooks(files);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (parsed.entries.length === 0) {
    return { ok: false, error: "No usable rows found — check the sheet names (HT/PT/A2Z) or filenames" };
  }

  const admin = createAdminClient();

  // Look up the distributor's accounts by slug.
  const { data: accounts, error: accErr } = await admin
    .from("accounts")
    .select("id, slug")
    .eq("distributor_id", distributor.id);
  if (accErr) return { ok: false, error: accErr.message };
  const slugToAccount = new Map<string, string>();
  for (const a of accounts ?? []) slugToAccount.set(a.slug, a.id);

  // Confirm every account we need actually exists.
  const neededSlugs = Array.from(new Set(parsed.entries.map((e) => e.account_slug)));
  const missingAccountSlugs = neededSlugs.filter((s) => !slugToAccount.has(s));
  if (missingAccountSlugs.length) {
    return {
      ok: false,
      error: `Missing account(s) for your distributor: ${missingAccountSlugs.join(", ")}`,
    };
  }

  // Resolve retailers: by phone (auto-creating missing ones), or — for rows
  // without a phone — by name/alias, exactly like the EOD importer.
  const phones = Array.from(new Set(parsed.entries.map((e) => e.phone).filter(Boolean)));
  const { data: retailers, error: rErr } = await admin
    .from("profiles")
    .select("id, phone, retailer_code, full_name")
    .eq("distributor_id", distributor.id)
    .eq("role", "retailer");
  if (rErr) return { ok: false, error: rErr.message };
  const { data: aliases } = await admin
    .from("retailer_aliases")
    .select("alias, retailer_id")
    .eq("distributor_id", distributor.id);

  const phoneToId = new Map<string, string>();
  const normName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");
  const fuzzKey = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "");
  const byName = new Map<string, string>();
  const byFuzz = new Map<string, string>();
  for (const r of retailers ?? []) {
    if (r.phone) phoneToId.set(r.phone.replace(/\D/g, "").slice(-10), r.id);
    // fall back to the auto-generated code so a phone-format drift can't
    // trigger a duplicate auto-create
    if (r.retailer_code?.startsWith("M") && !phoneToId.has(r.retailer_code.slice(1))) {
      phoneToId.set(r.retailer_code.slice(1), r.id);
    }
    if (r.full_name) {
      byName.set(normName(r.full_name), r.id);
      byFuzz.set(fuzzKey(r.full_name), r.id);
    }
  }
  for (const a of aliases ?? []) {
    byName.set(normName(a.alias), a.retailer_id);
    byFuzz.set(fuzzKey(a.alias), a.retailer_id);
    // A 10-digit alias is a SECONDARY phone — a shop with two portal numbers
    // (A2Z vs Swift) resolves to one profile instead of re-creating per portal.
    const digits = a.alias.replace(/\D/g, "");
    if (digits.length === 10 && !phoneToId.has(digits)) phoneToId.set(digits, a.retailer_id);
  }
  // exact (incl. aliases) → punctuation/spacing-insensitive → unique containment
  const resolveByName = (raw: string): string | undefined => {
    const exact = byName.get(normName(raw));
    if (exact) return exact;
    const key = fuzzKey(raw);
    if (!key) return undefined;
    const fuzz = byFuzz.get(key);
    if (fuzz) return fuzz;
    const candidates = new Set<string>();
    for (const [k, id] of byFuzz) {
      if (k.includes(key) || key.includes(k)) candidates.add(id);
    }
    return candidates.size === 1 ? [...candidates][0] : undefined;
  };

  const newRetailers: { code: string; name: string; phone: string }[] = [];
  for (const phone of phones) {
    if (phoneToId.has(phone)) continue;
    const sample = parsed.entries.find((e) => e.phone === phone)!;
    const code = `M${phone}`;
    const created = await createRetailer(admin, distributor.id, {
      code,
      name: sample.raw_name,
      phone,
    });
    if ("error" in created) return { ok: false, error: created.error };
    phoneToId.set(phone, created.id);
    newRetailers.push({ code, name: sample.raw_name, phone });
  }

  // Final per-entry retailer ids. Name-only rows that resolve nowhere are
  // excluded and reported — never imported by guesswork, never dropped silently.
  const warnings = [...parsed.warnings];
  const importable: { entry: (typeof parsed.entries)[number]; retailerId: string }[] = [];
  for (const e of parsed.entries) {
    const id = e.phone ? phoneToId.get(e.phone) : resolveByName(e.raw_name);
    if (id) {
      importable.push({ entry: e, retailerId: id });
    } else {
      warnings.push(
        `${e.sheet_name.trim()}: no retailer matches "${e.raw_name.slice(0, 40)}" (₹${e.amount} on ${e.txn_date}) — NOT imported. Add the retailer or an alias, then re-upload.`,
      );
    }
  }
  if (importable.length === 0) {
    return { ok: false, error: warnings[0] ?? "No usable rows found" };
  }

  // Build (account_id, txn_date) coverage list.
  const coverageKeys = new Set<string>();
  for (const { entry: e } of importable) {
    const accountId = slugToAccount.get(e.account_slug)!;
    coverageKeys.add(`${accountId}|${e.txn_date}`);
  }
  const coverage = Array.from(coverageKeys).map((k) => {
    const [account_id, txn_date] = k.split("|");
    return { account_id, txn_date };
  });

  // The FOS reuses the book's columns day to day, so a given upload may not
  // contain the full history. Replace ONLY the (account, date) pairs present
  // in this file; dates imported earlier stay untouched. Misparse-class
  // duplicates are prevented upstream (locale flip, future-date rejection,
  // named warnings for anything skipped).
  const uploadAccountIds = Array.from(
    new Set(importable.map((x) => slugToAccount.get(x.entry.account_slug)!)),
  );
  const replacedKeys = new Set(coverage.map((c) => `${c.account_id}|${c.txn_date}`));
  const { data: oldEntriesAll } = await admin
    .from("cash_report_entries")
    .select("retailer_id, account_id, txn_date")
    .in("account_id", uploadAccountIds);
  const oldEntries = (oldEntriesAll ?? []).filter((e) =>
    replacedKeys.has(`${e.account_id}|${e.txn_date}`),
  );
  for (const { account_id, txn_date } of coverage) {
    await admin
      .from("cash_report_dates")
      .delete()
      .eq("account_id", account_id)
      .eq("txn_date", txn_date);
    await admin
      .from("cash_report_entries")
      .delete()
      .eq("account_id", account_id)
      .eq("txn_date", txn_date);
  }

  // Insert the report header.
  const totalAmount = importable.reduce((s, x) => s + x.entry.amount, 0);
  const { data: report, error: repErr } = await admin
    .from("cash_reports")
    .insert({
      distributor_id: distributor.id,
      uploaded_by: distributor.id,
      filename: files.map((f) => f.name).join(", "),
      row_count: importable.length,
      total_amount: totalAmount,
    })
    .select("id")
    .single();
  if (repErr || !report) {
    return { ok: false, error: repErr?.message ?? "Failed to create report" };
  }

  // Coverage rows so recompute_balances knows the book is authoritative here.
  const { error: dateErr } = await admin.from("cash_report_dates").insert(
    coverage.map((c) => ({ ...c, report_id: report.id })),
  );
  if (dateErr) {
    await admin.from("cash_reports").delete().eq("id", report.id);
    return { ok: false, error: dateErr.message };
  }

  // Entry rows.
  const entryRows = importable.map(({ entry: e, retailerId }) => ({
    report_id: report.id,
    account_id: slugToAccount.get(e.account_slug)!,
    retailer_id: retailerId,
    txn_date: e.txn_date,
    amount: e.amount,
    sheet_name: e.sheet_name,
    raw_name: e.raw_name,
  }));
  const { error: entryErr } = await admin.from("cash_report_entries").insert(entryRows);
  if (entryErr) {
    await admin.from("cash_reports").delete().eq("id", report.id);
    return { ok: false, error: entryErr.message };
  }

  // Full recompute for every retailer whose entries were replaced, every
  // retailer in the new data, and every retailer with approved app cash on a
  // replaced date (the book takes precedence over their submissions there).
  const recomputeSet = new Set<string>(); // "retailer|account"
  for (const e of oldEntries) recomputeSet.add(`${e.retailer_id}|${e.account_id}`);
  for (const r of entryRows) recomputeSet.add(`${r.retailer_id}|${r.account_id}`);
  const { data: subRows } = await admin
    .from("cash_submissions")
    .select("retailer_id, account_id, txn_date")
    .in("account_id", uploadAccountIds)
    .eq("status", "approved");
  for (const c of subRows ?? []) {
    if (replacedKeys.has(`${c.account_id}|${c.txn_date}`)) {
      recomputeSet.add(`${c.retailer_id}|${c.account_id}`);
    }
  }

  for (const key of recomputeSet) {
    const [retailerId, accountId] = key.split("|");
    const { error: rpcErr } = await admin.rpc("recompute_balances", {
      p_retailer_id: retailerId,
      p_account_id: accountId,
      p_from_date: null,
    });
    if (rpcErr) console.error("recompute_balances failed", retailerId, accountId, rpcErr);
  }

  // Per-account summary for the UI.
  const perAccount: Record<AccountSlug, { rows: number; amount: number; dates: string[] }> = {
    swift: { rows: 0, amount: 0, dates: [] },
    naomi: { rows: 0, amount: 0, dates: [] },
  };
  for (const { entry: e } of importable) {
    const a = perAccount[e.account_slug];
    a.rows += 1;
    a.amount += e.amount;
    if (!a.dates.includes(e.txn_date)) a.dates.push(e.txn_date);
  }
  const coveredDates = Array.from(new Set(importable.map((x) => x.entry.txn_date))).sort();

  return {
    ok: true,
    summary: {
      report_id: report.id,
      rows: importable.length,
      total_amount: totalAmount,
      covered_dates: coveredDates,
      per_account: perAccount,
      sheets_processed: parsed.sheets_processed,
      missing_sheets: parsed.missing_sheets,
      new_retailers: newRetailers,
      warnings,
    },
  };
}

async function createRetailer(
  admin: ReturnType<typeof createAdminClient>,
  distributorId: string,
  args: { code: string; name: string; phone: string },
): Promise<{ id: string } | { error: string }> {
  const syntheticEmail = `r-${args.code.toLowerCase()}-${distributorId.slice(0, 8)}@auto.local`;
  const password = crypto.randomUUID();

  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
    app_metadata: { role: "retailer" },
  });
  if (authErr || !created.user) {
    return { error: authErr?.message ?? "auth.admin.createUser failed" };
  }

  // retailer_code is globally unique — on a collision (e.g. the same code in
  // another org), retry with a numeric suffix instead of failing the import.
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = attempt === 0 ? args.code : `${args.code}-${attempt + 1}`;
    const { error: profileErr } = await admin.from("profiles").insert({
      id: created.user.id,
      role: "retailer",
      full_name: args.name,
      retailer_code: code,
      phone: args.phone,
      distributor_id: distributorId,
      active: false,
      needs_assignment: true,
    });
    if (!profileErr) return { id: created.user.id };
    lastErr = profileErr.message;
    if (!/retailer_code/.test(profileErr.message)) break;
  }
  await admin.auth.admin.deleteUser(created.user.id);
  return { error: lastErr };
}
