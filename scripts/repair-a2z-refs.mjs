/* One-off repair (11 June 2026): the A2Z export's "Order id" column holds the
   wallet label ("Money"), so all 106 imported A2Z eod_transactions share
   bank_reference "Money" — which would make every future A2Z upload look like
   a duplicate. Re-derive the real numeric order numbers from the original
   file by matching (type, amount, retailer phone) and write them back. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const FILE = "/Users/harshiv/Downloads/PaymentReports - 2026-06-10T230231.403.csv";
const wb = XLSX.read(readFileSync(FILE), { type: "buffer" });
const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false });

// queue of wallet numbers per (type|amount|phone)
const queues = new Map();
let fileRows = 0;
for (const r of raw) {
  const ref = String(r["Ref Id"] ?? "").trim().toUpperCase();
  if (ref !== "DT" && ref !== "DT REVERSED") continue;
  const phone = (String(r["Description"] ?? "").match(/REM:\s*(\d{10})/i) ?? [])[1];
  if (!phone) continue;
  const amount = Number(String(r["Credit Amount"] ?? "").replace(/,/g, ""));
  const wallet = String(r["Wallet"] ?? "").trim();
  if (!/^\d{4,}$/.test(wallet)) {
    console.error("file row without numeric wallet id:", r);
    process.exit(1);
  }
  const key = `${ref === "DT" ? "transfer" : "reversal"}|${amount}|${phone}`;
  if (!queues.has(key)) queues.set(key, []);
  queues.get(key).push(wallet);
  fileRows++;
}

const { data: accounts } = await admin.from("accounts").select("id, slug").eq("slug", "naomi");
const accountIds = accounts.map((a) => a.id);
const { data: dbRows, error } = await admin
  .from("eod_transactions")
  .select("id, type, amount, retailer_id, bank_reference, profiles:retailer_id(phone)")
  .in("account_id", accountIds)
  .eq("bank_reference", "Money");
if (error) throw error;

console.log(`file rows: ${fileRows}, db rows to repair: ${dbRows.length}`);

let fixed = 0;
const unmatched = [];
for (const row of dbRows) {
  const phone = (row.profiles?.phone ?? "").replace(/\D/g, "").slice(-10);
  const key = `${row.type}|${Number(row.amount)}|${phone}`;
  const q = queues.get(key);
  if (!q || q.length === 0) {
    unmatched.push({ id: row.id, key });
    continue;
  }
  const ref = q.shift();
  const { error: upErr } = await admin
    .from("eod_transactions")
    .update({ bank_reference: ref })
    .eq("id", row.id);
  if (upErr) throw upErr;
  fixed++;
}

console.log(`fixed: ${fixed}, unmatched: ${unmatched.length}`);
if (unmatched.length) console.log(unmatched);
