import "server-only";
import * as XLSX from "xlsx";
import type { AccountSlug } from "@/lib/types";

export type CashReportEntry = {
  account_slug: AccountSlug;
  sheet_name: string;
  /* Empty when the row has no 10-digit phone — the import layer then
     resolves the retailer by name/alias (like the EOD importer). */
  phone: string;
  raw_name: string;
  txn_date: string; // YYYY-MM-DD
  amount: number;
};

export type CashReportParseResult =
  | {
      ok: true;
      entries: CashReportEntry[];
      sheets_processed: string[];
      missing_sheets: string[];
      /* Columns holding amounts whose header didn't parse as a date —
         surfaced loudly so a typo'd header can never vanish silently. */
      warnings: string[];
    }
  | { ok: false; error: string };

// Sheet name → account slug. Case-insensitive, trims whitespace.
const SHEET_TO_ACCOUNT: Record<string, AccountSlug> = {
  ht: "swift",
  pt: "swift",
  a2z: "naomi",
};

/* Fuzzy HT/PT/A2Z recognition for sheet names AND filenames.
   Accepts "HT", "H T", "H.T.", "HT Cash 11-6", "ht11june", "A 2 Z", "a-2-z",
   "swift"… while NOT firing on incidental substrings ("night", "receipt"):
   labels are split into tokens and runs of single letters are merged, so only
   a standalone ht/pt token (optionally followed by digits) matches. */
export function sheetKeyFromLabel(label: string): "ht" | "pt" | "a2z" | null {
  const low = label.toLowerCase();
  if (/a[\s._-]*2[\s._-]*z|naomi/.test(low)) return "a2z";
  const parts = low.split(/[^a-z0-9]+/).filter(Boolean);
  const tokens: string[] = [];
  let run = "";
  for (const p of parts) {
    if (p.length === 1 && /^[a-z]$/.test(p)) {
      run += p;
      continue;
    }
    if (run) {
      tokens.push(run);
      run = "";
    }
    tokens.push(p);
  }
  if (run) tokens.push(run);
  for (const t of tokens) {
    if (t === "ht" || /^ht\d/.test(t)) return "ht";
    if (t === "pt" || /^pt\d/.test(t)) return "pt";
    if (t.includes("swift")) return "ht";
  }
  return null;
}


/* A date column header can be text ("08/06/2026") or a true Excel date cell
   (numeric serial, format-dependent display). Accept both, leniently:
   the date may carry decoration ("HT 11/06/2026"), use / - or . separators,
   or omit the year ("11/6" typed quickly) — then the current IST year is
   assumed. A column whose header doesn't parse is not an amount column. */
/* Google Sheets in a US locale stores a typed "10/06/2026" as the DATE
   October 6 (month-first) — the cell arrives as a genuine date serial for the
   wrong day. A daily cash book's columns are always near today, so when the
   serial is implausibly far away and swapping day↔month lands near today,
   trust the swap. */
function plausibleDmy(y: number, m: number, d: number): string {
  const fmt = (mo: number, dy: number) =>
    `${y}-${String(mo).padStart(2, "0")}-${String(dy).padStart(2, "0")}`;
  if (m <= 12 && d <= 12 && m !== d) {
    const today = Date.parse(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
    const orig = Math.abs(Date.parse(fmt(m, d)) - today);
    const swap = Math.abs(Date.parse(fmt(d, m)) - today);
    if (orig > 45 * 86400e3 && swap < orig) return fmt(d, m);
  }
  return fmt(m, d);
}

function headerDate(sheet: XLSX.WorkSheet, col: number, formatted: string): string | null {
  const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
  if (cell && cell.t === "n" && cell.v > 30000 && cell.v < 80000) {
    const pd = XLSX.SSF.parse_date_code(cell.v as number);
    if (pd) {
      return plausibleDmy(pd.y, pd.m, pd.d);
    }
  }
  const iso = formatted.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const byName = monthNameDate(formatted);
  if (byName) return byName;
  const m = formatted.match(/(?:^|[^\d])(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2}|\d{4}))?(?:[^\d]|$)/);
  if (m) {
    const [, d, mo, yRaw] = m;
    let day = Number(d);
    let month = Number(mo);
    if (month < 1 || month > 31 || day < 1 || day > 31) return null;
    // D/M (Indian) vs M/D (US export) is ambiguous when both parts ≤ 12.
    // A cash-book column is always near today — pick the closer reading.
    // (This is what turned "6/10/2026" into 6 October instead of 10 June.)
    const todayIst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const y = !yRaw ? todayIst.slice(0, 4) : yRaw.length === 2 ? `20${yRaw}` : yRaw;
    if (month > 12 && day <= 12) {
      [day, month] = [month, day]; // unambiguous M/D
    } else if (month > 12) {
      return null;
    } else if (day <= 12 && day !== month) {
      const today = Date.parse(todayIst);
      const asDm = Date.parse(`${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
      const asMd = Date.parse(`${y}-${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}`);
      if (Math.abs(asMd - today) < Math.abs(asDm - today)) [day, month] = [month, day];
    }
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

const PHONE_RE = /\b(\d{10})\b/;
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/* Headers typed with month names: "10 JUNE", "10th Jun 2026", "June 10". */
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
function monthNameDate(text: string): string | null {
  const low = text.toLowerCase();
  let day = 0;
  let month = 0;
  let yRaw: string | undefined;
  let m = low.match(
    new RegExp(`(\\d{1,2})\\s*(?:st|nd|rd|th)?[\\s\\-.,]*${MONTH_RE}(?:[\\s\\-.,]*(\\d{2}|\\d{4}))?(?!\\d)`),
  );
  if (m) {
    day = Number(m[1]);
    month = MONTHS[m[2]];
    yRaw = m[3];
  } else {
    m = low.match(
      new RegExp(`${MONTH_RE}[\\s\\-.,]*(\\d{1,2})(?!\\d)(?:\\s*(?:st|nd|rd|th))?(?:[\\s\\-.,]*(\\d{2}|\\d{4}))?(?!\\d)`),
    );
    if (m) {
      month = MONTHS[m[1]];
      day = Number(m[2]);
      yRaw = m[3];
    }
  }
  if (!day || !month || day < 1 || day > 31) return null;
  const y = !yRaw
    ? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 4)
    : yRaw.length === 2
      ? `20${yRaw}`
      : yRaw;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/* Infer the account from a FILENAME when a workbook's sheets aren't named
   HT/PT/A2Z — e.g. three individual files "HT.xlsx", "PT June.xlsx",
   "A2Z cash.xlsx", each holding one sheet. */
export function accountFromFilename(filename: string): AccountSlug | null {
  const key = sheetKeyFromLabel(filename);
  return key ? SHEET_TO_ACCOUNT[key] : null;
}

export async function parseCashWorkbooks(
  files: File[],
): Promise<CashReportParseResult> {
  const entries: CashReportEntry[] = [];
  const processed: string[] = [];
  const warnings: string[] = [];
  const matchedKeys = new Set<string>();
  const coveredAccounts = new Set<AccountSlug>();
  const multi = files.length > 1;

  for (const file of files) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: false });

    // Locate the HT/PT/A2Z sheets: exact names win, then fuzzy matches
    // ("HT Cash", "h t", "A 2 Z"…) fill any remaining slots.
    const sheetIndex = new Map<string, string>();
    for (const name of wb.SheetNames) {
      const key = name.trim().toLowerCase();
      if (key in SHEET_TO_ACCOUNT) sheetIndex.set(key, name);
    }
    for (const name of wb.SheetNames) {
      const key = sheetKeyFromLabel(name);
      if (key && !sheetIndex.has(key)) sheetIndex.set(key, name);
    }

    let plan: { sheetName: string; slug: AccountSlug; key?: string }[] = [];
    if (sheetIndex.size > 0) {
      plan = [...sheetIndex.entries()].map(([key, sheetName]) => ({
        sheetName,
        slug: SHEET_TO_ACCOUNT[key],
        key,
      }));
    } else {
      // No recognizable sheet names — fall back to the filename.
      const slug = accountFromFilename(file.name);
      if (!slug) {
        return {
          ok: false,
          error: `"${file.name}" has no HT/PT/A2Z sheet, and the account can't be inferred from the filename. Name the file (or a sheet) HT, PT or A2Z.`,
        };
      }
      plan = wb.SheetNames.map((sheetName) => ({ sheetName, slug }));
    }

    for (const { sheetName, slug, key } of plan) {
      const before = entries.length;
      extractSheet(wb, sheetName, slug, entries, warnings);
      coveredAccounts.add(slug);
      if (key) matchedKeys.add(key);
      if (entries.length > before || key) {
        processed.push(multi ? `${file.name} → ${sheetName.trim()}` : sheetName);
      }
    }
  }

  const missing = Object.entries(SHEET_TO_ACCOUNT)
    .filter(([key, slug]) => !matchedKeys.has(key) && !coveredAccounts.has(slug))
    .map(([key]) => key.toUpperCase());

  // Cash cannot be collected on a future date — a future column is always a
  // mis-typed header. Hard-fail so nothing wrong ever reaches the books.
  const todayIst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const future = entries.filter((e) => e.txn_date > todayIst);
  if (future.length) {
    const where = [...new Set(future.map((e) => `${e.sheet_name.trim()} → ${e.txn_date}`))].join(", ");
    return {
      ok: false,
      error: `Found cash dated in the FUTURE (${where}). A date column header is wrong — fix it (DD/MM/YYYY) and re-upload. Nothing was imported.`,
    };
  }

  // A cash column should normally be today or yesterday. Anything else (e.g. a
  // wrong-year typo like 14.06.2025) is imported but flagged loudly — it's a
  // valid past date so it isn't rejected, but it's almost always a mistake.
  const yest = new Date(`${todayIst}T00:00:00Z`);
  yest.setUTCDate(yest.getUTCDate() - 1);
  const yesterdayIst = yest.toISOString().slice(0, 10);
  const oddDates = [...new Set(entries.map((e) => e.txn_date))]
    .filter((d) => d !== todayIst && d !== yesterdayIst)
    .sort();
  for (const d of oddDates) {
    const sheets = [...new Set(entries.filter((e) => e.txn_date === d).map((e) => e.sheet_name.trim()))].join(", ");
    warnings.push(
      `Date ${d} (${sheets}) is not today (${todayIst}) or yesterday — check the column header for a typo (wrong year/month?). It was imported on that date.`,
    );
  }

  return { ok: true, entries, sheets_processed: processed, missing_sheets: missing, warnings };
}

export async function parseCashWorkbook(file: File): Promise<CashReportParseResult> {
  return parseCashWorkbooks([file]);
}

function extractSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  accountSlug: AccountSlug,
  entries: CashReportEntry[],
  warnings: string[],
): void {
  {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    if (rows.length === 0) return;

    // Header row = row 0. Find which columns are dates and which is the retailer column.
    const header = rows[0] as string[];
    const dateCols: { idx: number; date: string }[] = [];
    const unknownCols: { idx: number; label: string }[] = [];
    let retailerCol = -1;

    for (let c = 0; c < header.length; c++) {
      const label = String(header[c] ?? "").trim();
      const date = headerDate(sheet, c, label);
      if (date) {
        dateCols.push({ idx: c, date });
        continue;
      }
      const low = label.toLowerCase();
      if (retailerCol === -1 && (low === "retailer" || low === "retailer name")) {
        retailerCol = c;
        continue;
      }
      // Candidate for the "amounts under a non-date header" warning. Known
      // structural headers are exempt; everything else gets checked below.
      if (label && !/date|bank|total|v\.?typ|column|retailer|name|remark|note/i.test(low)) {
        unknownCols.push({ idx: c, label });
      }
    }

    // If no explicit retailer column header, fall back to the column where the
    // first data row has a phone-bearing string.
    if (retailerCol === -1 && rows.length > 1) {
      const sampleRow = (rows[1] ?? []) as unknown[];
      for (let c = 0; c < sampleRow.length; c++) {
        const sample = String(sampleRow[c] ?? "");
        if (PHONE_RE.test(sample)) {
          retailerCol = c;
          break;
        }
      }
    }

    // Any non-date column that actually carries amounts on retailer rows is
    // a likely typo'd date header — never drop it silently.
    for (const { idx, label } of unknownCols) {
      let hits = 0;
      for (let r = 1; r < rows.length && hits < 1; r++) {
        const row = rows[r] as unknown[];
        const who = String(row?.[retailerCol === -1 ? 0 : retailerCol] ?? "").trim();
        if (!who || /total|cash|book|hand|closing|opening|balance|receipt/i.test(who)) continue;
        const v = Number(String(row?.[idx] ?? "").replace(/[, ]/g, ""));
        if (Number.isFinite(v) && v > 0) hits++;
      }
      if (hits >= 1) {
        warnings.push(
          `${sheetName.trim()}: column "${label}" has amounts but its header is not a date — those amounts were NOT imported. Fix the header (e.g. 11/06/2026) and re-upload.`,
        );
      }
    }

    if (retailerCol === -1 || dateCols.length === 0) {
      // Sheet present but unusable — skip silently.
      return;
    }

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] as unknown[];
      const retailerCell = String(row[retailerCol] ?? "").trim();
      if (!retailerCell) continue;
      const phoneMatch = retailerCell.match(PHONE_RE);
      // Structural rows (totals, "cash on hand", …) are never entries.
      if (!phoneMatch && /total|cash|book|hand|closing|opening|balance|receipt/i.test(retailerCell)) {
        continue;
      }

      for (const { idx, date } of dateCols) {
        const raw = row[idx];
        if (raw === "" || raw === null || raw === undefined) continue;
        const amount = Number(String(raw).replace(/[, ]/g, ""));
        if (!Number.isFinite(amount) || amount <= 0) continue;
        entries.push({
          account_slug: accountSlug,
          sheet_name: sheetName,
          phone: phoneMatch ? phoneMatch[1] : "",
          raw_name: retailerCell,
          txn_date: date,
          amount,
        });
      }
    }
  }

}
