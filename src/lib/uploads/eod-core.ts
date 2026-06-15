import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseEodFile, type RowError } from "@/lib/sheet-parser";
import { accountFromFilename } from "@/lib/cash-report-parser";
import type { EodRow } from "@/lib/zod-schemas";
import { todayIso } from "@/lib/format";

export type EodResult =
  | {
      ok: true;
      summary: {
        rows: number;
        transferred: number;
        reversed: number;
        new_retailers: { code: string; name: string | null; phone: string | null }[];
        affected_dates: string[];
        unmatched_transfers: number;
        skipped: { row: number; message: string }[];
        duplicates: number;
      };
    }
  | { ok: false; errors: RowError[]; message?: string };

type ResolvedRow = EodRow & { retailer_id: string };

/* Multiple EOD files at once: each file's account comes from its filename
   (HT/PT/Swift → Swift Money, A2Z → A2Z); files that don't say go to the
   account selected in the form. */
export async function processEodUploads(
  distributorId: string,
  defaultAccountId: string,
  files: File[],
): Promise<EodResult> {
  const merged = {
    rows: 0,
    transferred: 0,
    reversed: 0,
    new_retailers: [] as { code: string; name: string | null; phone: string | null }[],
    affected_dates: [] as string[],
    unmatched_transfers: 0,
    skipped: [] as { row: number; message: string }[],
    duplicates: 0,
  };
  const errors: RowError[] = [];
  const prefix = files.length > 1;
  for (const file of files) {
    const parsed = await parseEodFile(file, todayIso());
    if (!parsed.ok) {
      for (const e of parsed.errors) {
        errors.push({ ...e, message: prefix ? `${file.name}: ${e.message}` : e.message });
      }
      continue;
    }
    // Account priority: format-detected → filename → form selection.
    const slug = parsed.detected_account ?? accountFromFilename(file.name);
    const accountId = (slug ? await accountIdForSlug(distributorId, slug) : null) ?? defaultAccountId;
    const res = await processEodParsed(distributorId, accountId, file.name, parsed);
    if (!res.ok) {
      for (const e of res.errors) {
        errors.push({ ...e, message: prefix ? `${file.name}: ${e.message}` : e.message });
      }
      continue;
    }
    merged.rows += res.summary.rows;
    merged.transferred += res.summary.transferred;
    merged.reversed += res.summary.reversed;
    merged.new_retailers.push(...res.summary.new_retailers);
    merged.affected_dates.push(...new Set(res.summary.affected_dates));
    merged.unmatched_transfers += res.summary.unmatched_transfers;
    merged.skipped.push(
      ...res.summary.skipped.map((sk) =>
        prefix ? { ...sk, message: `${file.name}: ${sk.message}` } : sk,
      ),
    );
    merged.duplicates += res.summary.duplicates;
  }
  if (errors.length && merged.rows === 0) return { ok: false, errors };
  if (errors.length) {
    return { ok: false, errors, message: `Some files imported (${merged.rows} rows) but others failed` };
  }
  merged.affected_dates = [...new Set(merged.affected_dates)].sort();
  return { ok: true, summary: merged };
}

async function accountIdForSlug(distributorId: string, slug: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("accounts")
    .select("id")
    .eq("distributor_id", distributorId)
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  return data?.id ?? null;
}

export async function processEodUpload(
  distributorId: string,
  accountId: string,
  file: File,
): Promise<EodResult> {
  const parsed = await parseEodFile(file, todayIso());
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  return processEodParsed(distributorId, accountId, file.name, parsed);
}

async function processEodParsed(
  distributorId: string,
  accountId: string,
  filename: string,
  parsed: Extract<Awaited<ReturnType<typeof parseEodFile>>, { ok: true }>,
): Promise<EodResult> {
  const distributor = { id: distributorId };
  const today = todayIso();
  const admin = createAdminClient();

  // Verify this account belongs to the caller.
  const { data: account, error: acctErr } = await admin
    .from("accounts")
    .select("id, distributor_id")
    .eq("id", accountId)
    .single();
  if (acctErr || !account || account.distributor_id !== distributor.id) {
    return { ok: false, errors: [{ row: 0, message: "Invalid account" }] };
  }

  // Pull every retailer of this distributor; match by phone, then code, then name.
  const { data: retailers, error: retailersErr } = await admin
    .from("profiles")
    .select("id, retailer_code, phone, full_name, distributor_id")
    .eq("distributor_id", distributor.id)
    .eq("role", "retailer");
  if (retailersErr) {
    return { ok: false, errors: [{ row: 0, message: retailersErr.message }] };
  }
  const { data: distProfile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", distributor.id)
    .maybeSingle();
  const distTokens = (distProfile?.full_name ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((tk: string) => tk.length > 2);

  const { data: aliases } = await admin
    .from("retailer_aliases")
    .select("alias, retailer_id")
    .eq("distributor_id", distributor.id);

  const normName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");
  const fuzzKey = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "");
  const byPhone = new Map<string, string>();
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  const byFuzz = new Map<string, string>();
  for (const r of retailers ?? []) {
    if (r.phone) byPhone.set(r.phone.replace(/\D/g, "").slice(-10), r.id);
    if (r.retailer_code) byCode.set(r.retailer_code, r.id);
    if (r.full_name) {
      byName.set(normName(r.full_name), r.id);
      byFuzz.set(fuzzKey(r.full_name), r.id);
    }
  }
  for (const a of aliases ?? []) {
    byName.set(normName(a.alias), a.retailer_id);
    byFuzz.set(fuzzKey(a.alias), a.retailer_id);
  }

  /* Name resolution: exact (incl. aliases) → exact ignoring punctuation/spacing
     ("S K Mobile" = "SK Mobile") → prefix containment ("Bluestar" ⊂ "Blue Star
     Mobile"). The fuzzy containment step is ONLY used when the row has no phone
     (allowFuzzy) — a phone-bearing row must never be guessed onto a different
     retailer. Containment requires a PREFIX match of ≥5 chars so a short key
     can't match mid-word (e.g. "amobile" inside "majisaMOBILE"). Ambiguous or
     no match → null; the row is auto-created (if it has a phone) or reported. */
  const resolveByName = (raw: string, allowFuzzy: boolean): string | undefined => {
    const exact = byName.get(normName(raw));
    if (exact) return exact;
    const key = fuzzKey(raw);
    if (!key) return undefined;
    const fuzz = byFuzz.get(key);
    if (fuzz) return fuzz;
    if (!allowFuzzy) return undefined;
    const candidates = new Set<string>();
    for (const [k, id] of byFuzz) {
      const [short, long] = key.length <= k.length ? [key, k] : [k, key];
      if (short.length >= 5 && long.startsWith(short)) candidates.add(id);
    }
    return candidates.size === 1 ? [...candidates][0] : undefined;
  };

  // Portal exports include the distributor's own wallet rows — skip those.
  const isSelfRow = (name: string | undefined) => {
    if (!name || distTokens.length === 0) return false;
    const tokens = name.toLowerCase().split(/\s+/);
    return distTokens.every((tk: string) => tokens.includes(tk));
  };

  const newRetailers: { code: string; name: string | null; phone: string | null }[] = [];
  const resolved: ResolvedRow[] = [];
  const skipped: { row: number; message: string }[] = [...(parsed.skipped ?? [])];

  for (const row of parsed.rows) {
    let id: string | undefined;
    if (row.retailer_phone) id = byPhone.get(row.retailer_phone.slice(-10));
    if (!id && row.retailer_code) id = byCode.get(row.retailer_code);
    // Fuzzy name containment only when the row carries no phone — a phone-bearing
    // row that didn't match by phone must auto-create, never be name-guessed.
    if (!id && row.retailer_name) id = resolveByName(row.retailer_name, !row.retailer_phone);

    if (!id && isSelfRow(row.retailer_name)) {
      skipped.push({
        row: 0,
        message: `Self transaction skipped: ${row.retailer_name} ₹${row.amount}`,
      });
      continue;
    }
    if (!id && !row.retailer_phone && !row.retailer_code) {
      // Name-only row with no match: never guess — report and move on.
      skipped.push({
        row: 0,
        message: `No retailer matches "${row.retailer_name}" (₹${row.amount} ${row.type}) — add them or fix the name, then re-upload`,
      });
      continue;
    }

    if (!id) {
      // Auto-create the retailer. Use the explicit retailer_code if the row had
      // one; otherwise generate "M<phone>" so the code stays deterministic.
      const code = row.retailer_code ?? (row.retailer_phone ? `M${row.retailer_phone}` : null);
      if (!code) {
        return {
          ok: false,
          errors: [
            { row: 0, message: "Cannot auto-create retailer without phone or retailer_code" },
          ],
        };
      }
      // Re-check by code in case the auto-generated code already exists.
      const existingId = byCode.get(code);
      if (existingId) {
        id = existingId;
      } else {
        const created = await createRetailer(admin, distributor.id, {
          code,
          name: row.retailer_name ?? `Retailer ${code}`,
          phone: row.retailer_phone ?? null,
        });
        if ("error" in created) {
          return {
            ok: false,
            errors: [{ row: 0, message: `Failed to register retailer ${code}: ${created.error}` }],
          };
        }
        id = created.id;
        byCode.set(code, id);
        if (row.retailer_phone) byPhone.set(row.retailer_phone, id);
        newRetailers.push({ code, name: row.retailer_name ?? null, phone: row.retailer_phone ?? null });
      }
    }

    resolved.push({ ...row, retailer_id: id });
  }

  // Duplicate protection: portal exports overlap day to day — drop rows whose
  // bank reference is already booked for this org+account.
  let duplicates = 0;
  let final = resolved;
  const refs = Array.from(
    new Set(resolved.map((r) => r.bank_reference).filter((x): x is string => !!x)),
  );
  if (refs.length) {
    const { data: existing } = await admin
      .from("eod_transactions")
      .select("bank_reference")
      .eq("distributor_id", distributor.id)
      .eq("account_id", accountId)
      .in("bank_reference", refs);
    const seen = new Set((existing ?? []).map((e) => e.bank_reference));
    if (seen.size) {
      final = resolved.filter((r) => !r.bank_reference || !seen.has(r.bank_reference));
      duplicates = resolved.length - final.length;
    }
  }
  if (final.length === 0) {
    return {
      ok: true,
      summary: {
        rows: 0,
        transferred: 0,
        reversed: 0,
        new_retailers: newRetailers,
        affected_dates: [],
        unmatched_transfers: 0,
        skipped,
        duplicates,
      },
    };
  }

  const totals = final.reduce(
    (acc, r) => {
      if (r.type === "transfer") acc.transferred += r.amount;
      else acc.reversed += r.amount;
      return acc;
    },
    { transferred: 0, reversed: 0 },
  );

  const { data: upload, error: uploadErr } = await admin
    .from("sheet_uploads")
    .insert({
      distributor_id: distributor.id,
      account_id: accountId,
      uploaded_by: distributor.id,
      filename,
      txn_date: today,
      row_count: final.length,
      total_transferred: totals.transferred,
      total_reversed: totals.reversed,
    })
    .select("id")
    .single();
  if (uploadErr || !upload) {
    return { ok: false, errors: [{ row: 0, message: uploadErr?.message ?? "Upload failed" }] };
  }

  const txnRows = final.map((r) => ({
    upload_id: upload.id,
    distributor_id: distributor.id,
    account_id: accountId,
    retailer_id: r.retailer_id,
    type: r.type,
    amount: r.amount,
    txn_date: r.txn_date,
    bank_reference: r.bank_reference ?? null,
    notes: r.notes ?? null,
    // The name+phone as they appeared in the portal file — lets a wrong match
    // be audited later (the row that matched, not just who it matched to).
    raw_name: [r.retailer_name, r.retailer_phone].filter(Boolean).join(" / ") || null,
  }));

  const { error: txnErr } = await admin.from("eod_transactions").insert(txnRows);
  if (txnErr) {
    await admin.from("sheet_uploads").delete().eq("id", upload.id);
    return { ok: false, errors: [{ row: 0, message: txnErr.message }] };
  }

  // Mark (account, date) as EOD-covered for every date that has a transfer
  // row: the file becomes the source of truth for credit on those dates and
  // app-approved requests there turn audit-only. Reversal-only dates are NOT
  // marked — reversals alone must never suppress app credit.
  const coveredDates = Array.from(
    new Set(txnRows.filter((r) => r.type === "transfer").map((r) => r.txn_date)),
  );
  if (coveredDates.length) {
    const { error: covErr } = await admin.from("eod_report_dates").upsert(
      coveredDates.map((dt) => ({ account_id: accountId, txn_date: dt, upload_id: upload.id })),
      { onConflict: "account_id,txn_date", ignoreDuplicates: true },
    );
    if (covErr) {
      console.error("eod_report_dates upsert failed", covErr);
    }
  }

  // Verification: count transfer rows that have no plausible matching approved
  // request (same retailer, similar amount, within 7 days). This is the
  // "who isn't using the app" signal — balances themselves come from the file.
  const transferRows = final.filter((r) => r.type === "transfer");
  let unmatched = 0;
  if (transferRows.length) {
    const retailerIds = Array.from(new Set(transferRows.map((r) => r.retailer_id)));
    const { data: approved } = await admin
      .from("money_requests")
      .select("retailer_id, requested_amount, fos_amount, final_amount, distributor_acted_at")
      .in("retailer_id", retailerIds)
      .eq("account_id", accountId)
      .eq("distributor_status", "approved");
    const byRetailer = new Map<string, { amount: number; date: Date }[]>();
    for (const a of approved ?? []) {
      const list = byRetailer.get(a.retailer_id) ?? [];
      list.push({
        amount: Number(a.final_amount ?? a.fos_amount ?? a.requested_amount),
        date: new Date(a.distributor_acted_at ?? new Date()),
      });
      byRetailer.set(a.retailer_id, list);
    }
    for (const t of transferRows) {
      const list = byRetailer.get(t.retailer_id) ?? [];
      const txDate = new Date(t.txn_date);
      const matchIdx = list.findIndex(
        (a) =>
          Math.abs(a.amount - t.amount) < 0.01 &&
          Math.abs(a.date.getTime() - txDate.getTime()) <= 7 * 24 * 3600 * 1000,
      );
      if (matchIdx === -1) unmatched += 1;
      else list.splice(matchIdx, 1);
    }
  }

  // Recompute balances per retailer from earliest affected date.
  const earliestByRetailer = new Map<string, string>();
  for (const r of txnRows) {
    const prev = earliestByRetailer.get(r.retailer_id);
    if (!prev || r.txn_date < prev) earliestByRetailer.set(r.retailer_id, r.txn_date);
  }
  // Retailers absent from the file but with app approvals on a now-covered
  // date also need a recompute — those approvals just became audit-only.
  if (coveredDates.length) {
    const sorted = [...coveredDates].sort();
    const from = `${sorted[0]}T00:00:00Z`;
    const to = `${sorted[sorted.length - 1]}T23:59:59.999Z`;
    const { data: approvedOnCovered } = await admin
      .from("money_requests")
      .select("retailer_id, distributor_acted_at")
      .eq("account_id", accountId)
      .eq("distributor_status", "approved")
      .gte("distributor_acted_at", from)
      .lte("distributor_acted_at", to);
    for (const mr of approvedOnCovered ?? []) {
      const day = (mr.distributor_acted_at ?? "").slice(0, 10);
      if (!coveredDates.includes(day)) continue;
      const prev = earliestByRetailer.get(mr.retailer_id);
      if (!prev || day < prev) earliestByRetailer.set(mr.retailer_id, day);
    }
  }
  for (const [retailerId, fromDate] of earliestByRetailer) {
    const { error: rpcErr } = await admin.rpc("recompute_balances", {
      p_retailer_id: retailerId,
      p_account_id: accountId,
      p_from_date: fromDate,
    });
    if (rpcErr) {
      console.error("recompute_balances failed", retailerId, rpcErr);
    }
  }

  const affected = Array.from(new Set(txnRows.map((r) => r.txn_date))).sort();
  return {
    ok: true,
    summary: {
      rows: txnRows.length,
      transferred: totals.transferred,
      reversed: totals.reversed,
      new_retailers: newRetailers,
      affected_dates: affected,
      unmatched_transfers: unmatched,
      skipped,
      duplicates,
    },
  };
}

async function createRetailer(
  admin: ReturnType<typeof createAdminClient>,
  distributorId: string,
  args: { code: string; name: string; phone: string | null },
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
