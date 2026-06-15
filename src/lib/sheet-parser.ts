import "server-only";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { EodRowSchema, type EodRow } from "./zod-schemas";

export type RowError = { row: number; field?: string; message: string };

export type ParseResult =
  | {
      ok: true;
      rows: EodRow[];
      /* Set when the file format itself identifies the account
         (HT/PT portal exports → swift, A2Z PaymentReports → naomi). */
      detected_account?: "swift" | "naomi";
      /* Rows intentionally not imported (e.g. A2Z wallet top-ups). */
      skipped?: RowError[];
    }
  | { ok: false; errors: RowError[] };

// Two formats are supported:
//   1. Simple format — explicit columns: retailer_code, type, amount, ...
//   2. Provider report format — what payment portals export (Pemo / similar).
//      Cells are wrapped as `= "..."` to defeat Excel's auto-formatting.
//      Identifies retailer by `Merchant MobileNo`. Amount is signed
//      (positive = transfer, negative = reversal). Dates are DD/MM/YYYY HH:mm:ss.
const SIMPLE_HEADERS = ["retailer_code", "type", "amount"] as const;
const REPORT_HEADERS = ["merchant_mobileno", "amount", "narration"] as const;
// HT "transfer to distributor" export — names only, type in TranName.
// ("tarnsfer_to" is the portal's own typo; accept the fixed spelling too.)
const HT_A_HEADERS = ["tranname", "amount", "transfer_date"] as const;
// HT credit/debit ledger export — phone + paired amount columns.
const HT_B_HEADERS = ["mobileno", "creditamount", "debitamount"] as const;
// A2Z PaymentReports export — phone inside Description "( REM:9374869996)".
const A2Z_HEADERS = ["status", "description", "closing_bal"] as const;

export async function parseEodFile(
  file: File,
  todayIso: string,
): Promise<ParseResult> {
  const filename = file.name.toLowerCase();
  let raw: Record<string, unknown>[];

  if (filename.endsWith(".csv")) {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => normalizeHeader(h),
    });
    if (parsed.errors.length) {
      return {
        ok: false,
        errors: parsed.errors.map((e) => ({
          row: (e.row ?? 0) + 2,
          message: e.message,
        })),
      };
    }
    raw = parsed.data;
  } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: false });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      return { ok: false, errors: [{ row: 0, message: "Workbook is empty" }] };
    }
    const sheet = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: true,
    });
    raw = json.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) out[normalizeHeader(k)] = v;
      return out;
    });
  } else {
    return { ok: false, errors: [{ row: 0, message: "File must be .csv, .xlsx or .xls" }] };
  }

  if (raw.length === 0) {
    return { ok: false, errors: [{ row: 0, message: "No data rows found" }] };
  }

  const headers = Object.keys(raw[0]);
  const isSimple = SIMPLE_HEADERS.every((h) => headers.includes(h));
  const isReport = REPORT_HEADERS.every((h) => headers.includes(h));
  const isHtA =
    HT_A_HEADERS.every((h) => headers.includes(h)) &&
    (headers.includes("tarnsfer_to") || headers.includes("transfer_to"));
  const isHtB = HT_B_HEADERS.every((h) => headers.includes(h));
  const isA2z = A2Z_HEADERS.every((h) => headers.includes(h));

  if (isHtA || isHtB || isA2z) {
    const errors: RowError[] = [];
    const skipped: RowError[] = [];
    const rows: EodRow[] = [];
    let ignored = 0;
    raw.forEach((rowRaw, i) => {
      const rowIndex = i + 2;
      const candidate = isHtA
        ? mapHtARow(rowRaw, todayIso)
        : isHtB
          ? mapHtBRow(rowRaw, todayIso)
          : mapA2zRow(rowRaw, todayIso);
      if ("ignore" in candidate) {
        ignored += 1;
        return;
      }
      if ("skip" in candidate) {
        skipped.push({ row: rowIndex, message: candidate.skip });
        return;
      }
      if ("error" in candidate) {
        errors.push({ row: rowIndex, message: candidate.error });
        return;
      }
      const parsed = EodRowSchema.safeParse(candidate.value);
      if (!parsed.success) {
        errors.push({ row: rowIndex, message: parsed.error.issues[0].message });
        return;
      }
      rows.push(parsed.data);
    });
    if (errors.length) return { ok: false, errors };
    if (ignored > 0) {
      skipped.push({ row: 0, message: `${ignored} non-retailer rows ignored (wallet/other entries)` });
    }
    return { ok: true, rows, detected_account: isA2z ? "naomi" : "swift", skipped };
  }

  if (!isSimple && !isReport) {
    const expectedSimple = SIMPLE_HEADERS.join(", ");
    const expectedReport = "Merchant MobileNo, Amount, Narration (Pemo / payment-portal export)";
    return {
      ok: false,
      errors: [
        {
          row: 1,
          message: `Unrecognised columns. Expected either: ${expectedSimple}; or: ${expectedReport}.`,
        },
      ],
    };
  }

  const errors: RowError[] = [];
  const rows: EodRow[] = [];

  raw.forEach((rowRaw, i) => {
    const rowIndex = i + 2;
    const candidate = isReport
      ? mapReportRow(rowRaw, todayIso)
      : mapSimpleRow(rowRaw, todayIso);

    if ("error" in candidate) {
      errors.push({ row: rowIndex, message: candidate.error });
      return;
    }

    const parsed = EodRowSchema.safeParse(candidate.value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({
          row: rowIndex,
          field: issue.path.join("."),
          message: issue.message,
        });
      }
      return;
    }
    rows.push(parsed.data);
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, rows, detected_account: isReport ? "swift" : undefined };
}

function normalizeHeader(h: string): string {
  return stripExcelEscape(String(h)).trim().toLowerCase().replace(/\s+/g, "_");
}

function stripExcelEscape(s: unknown): string {
  if (s == null) return "";
  const str = String(s).trim();
  // matches: = "..." or ="...", with possible escaped double quotes ""
  const m = str.match(/^=\s*"([\s\S]*)"$/);
  return m ? m[1].replace(/""/g, '"').trim() : str;
}

function cleanString(v: unknown): string | undefined {
  const s = stripExcelEscape(v);
  return s.length ? s : undefined;
}

function normalizePhone(v: unknown): string | undefined {
  const digits = stripExcelEscape(v).replace(/\D/g, "");
  return digits.length >= 7 ? digits : undefined;
}

function parseDmyDate(v: unknown): string | undefined {
  const s = stripExcelEscape(v);
  // Accepts DD/MM/YYYY optionally followed by a time component.
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return undefined;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseSignedAmount(v: unknown): number | undefined {
  const s = stripExcelEscape(v).replace(/[, ]/g, "");
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

type RowOut =
  | { value: Partial<EodRow> }
  | { error: string };

function mapSimpleRow(rowRaw: Record<string, unknown>, todayIso: string): RowOut {
  const code = cleanString(rowRaw.retailer_code);
  const typeRaw = cleanString(rowRaw.type)?.toLowerCase();
  const amount = parseSignedAmount(rowRaw.amount);
  if (amount == null) return { error: "Amount is missing or not a number" };
  if (amount <= 0) return { error: "Amount must be positive in the simple format" };
  if (typeRaw !== "transfer" && typeRaw !== "reversal") {
    return { error: "type must be 'transfer' or 'reversal'" };
  }

  return {
    value: {
      retailer_code: code,
      retailer_name: cleanString(rowRaw.retailer_name),
      retailer_phone: normalizePhone(rowRaw.retailer_phone),
      type: typeRaw,
      amount,
      txn_date: cleanString(rowRaw.txn_date) ?? todayIso,
      bank_reference: cleanString(rowRaw.bank_reference),
      notes: cleanString(rowRaw.notes),
    },
  };
}

function mapReportRow(rowRaw: Record<string, unknown>, todayIso: string): RowOut {
  const phone = normalizePhone(rowRaw.merchant_mobileno);
  if (!phone) return { error: "Merchant MobileNo is missing or invalid" };

  const merchant = cleanString(rowRaw.merchant);
  // "Mukesh Menghrajmal Mohinani (ASHHAPURA TRAVELS)" → keep the whole string
  const retailer_name = merchant;

  const signed = parseSignedAmount(rowRaw.amount);
  if (signed == null) return { error: "Amount is missing or not a number" };
  if (signed === 0) return { error: "Amount cannot be zero" };

  // Cross-check with Narration. If signed amount disagrees with narration, sign wins.
  const narration = cleanString(rowRaw.narration)?.toLowerCase() ?? "";
  const inferredType: "transfer" | "reversal" =
    signed < 0 || narration.includes("reversal") ? "reversal" : "transfer";

  const txn_date = parseDmyDate(rowRaw.transfer_date) ?? todayIso;

  const remarks = cleanString(rowRaw.remarks);
  const requestId = cleanString(rowRaw.requestid);

  return {
    value: {
      retailer_phone: phone,
      retailer_name,
      type: inferredType,
      amount: Math.abs(signed),
      txn_date,
      bank_reference: requestId,
      notes: remarks ?? cleanString(rowRaw.narration),
    },
  };
}

type RowOut2 =
  | { value: Partial<EodRow> }
  | { error: string }
  | { skip: string }
  | { ignore: true };

/* Names that are the wallet/up-chain or the distributor's own firms — never
   retailers. Rows under these names are inter-portal money movements and are
   dropped without comment (confirmed against the distributor's own ledger:
   his report carries no Panache/Quicksun retailer rows). */
const IGNORED_COUNTERPARTIES = new Set([
  "rameshchandra mohanlal gajjar",
  "swift money wallet",
  "pankaj rameshchandra gajjar huf",
  "panache traders",
  "panache traders swift",
  "quicksun vinod kumar",
  "vinod achalaram kumar",
]);
const isIgnoredCounterparty = (name: string) =>
  IGNORED_COUNTERPARTIES.has(name.trim().toLowerCase().replace(/\s+/g, " "));

/* HT name-only export: "Money Transfer To Distributor / Money Reversal From
   Distributor By Super Distributor". No phone — matched by name downstream. */
function mapHtARow(rowRaw: Record<string, unknown>, todayIso: string): RowOut2 {
  const name = cleanString(rowRaw.tarnsfer_to ?? rowRaw.transfer_to);
  if (!name) return { error: "Transfer To name is missing" };
  if (isIgnoredCounterparty(name)) {
    return { ignore: true };
  }
  const tranName = (cleanString(rowRaw.tranname) ?? "").toLowerCase();
  const amount = parseSignedAmount(rowRaw.amount);
  if (amount == null || amount === 0) return { error: "Amount is missing or zero" };
  return {
    value: {
      retailer_name: name,
      type: tranName.includes("reversal") ? "reversal" : "transfer",
      amount: Math.abs(amount),
      txn_date: parseDmyDate(rowRaw.transfer_date) ?? todayIso,
      bank_reference: cleanString(rowRaw.request_id),
      notes: cleanString(rowRaw.remarks),
    },
  };
}

/* HT credit/debit ledger: Debit = money out to the retailer (transfer),
   Credit = money back from them (reversal). */
function mapHtBRow(rowRaw: Record<string, unknown>, todayIso: string): RowOut2 {
  const phone = normalizePhone(rowRaw.mobileno);
  const name = cleanString(rowRaw.distributor);
  if (name && isIgnoredCounterparty(name)) return { ignore: true };
  const credit = parseSignedAmount(rowRaw.creditamount) ?? 0;
  const debit = parseSignedAmount(rowRaw.debitamount) ?? 0;
  if (credit > 0 && debit > 0) return { error: "Row has both credit and debit amounts" };
  if (credit <= 0 && debit <= 0) return { skip: "No amount" };
  return {
    value: {
      retailer_phone: phone,
      retailer_name: name,
      type: debit > 0 ? "transfer" : "reversal",
      amount: debit > 0 ? debit : credit,
      txn_date: parseDmyDate(rowRaw.transfer_date) ?? todayIso,
      bank_reference: cleanString(rowRaw.request_id),
      notes: cleanString(rowRaw.remarks),
    },
  };
}

/* A2Z PaymentReports: Status Debit = transfer to retailer; Credit rows
   without a REM phone are the platform loading the wallet — skipped. */
function mapA2zRow(rowRaw: Record<string, unknown>, todayIso: string): RowOut2 {
  // Only DT / DT REVERSED are retailer events; everything else (wallet
  // top-ups, fees, self payment returns, numeric refs) is irrelevant by
  // design — repayments live solely in the daily cash book.
  const refId = (cleanString(rowRaw.ref_id) ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  const description = cleanString(rowRaw.description) ?? "";
  const firm = cleanString(rowRaw.firm_name);
  const amount = parseSignedAmount(rowRaw.credit_amount);
  const dateRaw = cleanString(rowRaw["date/time"]) ?? "";
  const isoMatch = dateRaw.match(/^(\d{4}-\d{2}-\d{2})/);
  const txn_date = isoMatch ? isoMatch[1] : todayIso;
  // The export's columns are shifted: "Order id" holds the wallet label
  // ("Money") and "Wallet" holds the actual numeric order number. Use
  // whichever looks like a real id — it is the dedup key, so a non-unique
  // label here would make every later upload look like a duplicate.
  const wallet = cleanString(rowRaw.wallet);
  const orderRaw = cleanString(rowRaw.order_id);
  const orderId =
    wallet && /^\d{4,}$/.test(wallet)
      ? wallet
      : orderRaw && /^\d{4,}$/.test(orderRaw)
        ? orderRaw
        : undefined; // a label like "Money" is NOT an id — import without ref
  // Retailer file tags the phone "REM:", the distributor MD file "DLM:".
  const phoneMatch = description.match(/\b(?:REM|DLM)\s*:\s*(\d{10})\b/i);

  if (refId !== "DT" && refId !== "DT REVERSED") {
    return { ignore: true };
  }
  if (amount == null || amount === 0) return { error: "Credit Amount is missing or zero" };

  // DT / DT REVERSED carry the retailer phone in the Description.
  if (!phoneMatch) {
    return { skip: `${refId} row without a retailer phone — ${description.slice(0, 60)}` };
  }
  return {
    value: {
      retailer_phone: phoneMatch[1],
      retailer_name: firm,
      type: refId === "DT REVERSED" ? "reversal" : "transfer",
      amount: Math.abs(amount),
      txn_date,
      bank_reference: orderId,
      notes: firm,
    },
  };
}
