/* E2E test: month-name date headers ("10 JUNE") parse; columns with amounts
   under a non-date header are reported in warnings, never silently dropped. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const BASE = process.env.TEST_BASE ?? "http://localhost:3000";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

let failures = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(got)}${ok ? "" : ` want ${JSON.stringify(want)}`}`);
  if (!ok) failures++;
};

// throwaway org
const email = "cash-headers-test@auto.local";
const password = crypto.randomUUID();
{
  const { data: old } = await admin.from("profiles").select("id").eq("full_name", "Cash Headers Test Org");
  for (const p of old ?? []) await cleanup(p.id);
}
const { data: u, error: ce } = await admin.auth.admin.createUser({
  email, password, email_confirm: true, app_metadata: { role: "distributor" },
});
if (ce) throw ce;
const distId = u.user.id;
await admin.from("profiles").insert({ id: distId, role: "distributor", full_name: "Cash Headers Test Org", active: true });
await admin.from("accounts").insert([
  { distributor_id: distId, name: "Swift Money", slug: "swift" },
  { distributor_id: distId, name: "A2Z", slug: "naomi" },
]);
const { data: s } = await anon.auth.signInWithPassword({ email, password });
const token = s.session.access_token;

// A phone-less retailer reachable only via alias (like the real RT-100x ones).
const { data: ru } = await admin.auth.admin.createUser({
  email: "sai-leela-test@auto.local", password: crypto.randomUUID(), email_confirm: true,
  app_metadata: { role: "retailer" },
});
await admin.from("profiles").insert({
  id: ru.user.id, role: "retailer", full_name: "Sai Leela", retailer_code: "TEST-SL",
  phone: null, distributor_id: distId, active: true,
});
await admin.from("retailer_aliases").insert({
  distributor_id: distId, retailer_id: ru.user.id, alias: "SAI LEELA SWIFT",
});

// Workbook like the FOS's: HT sheet with a month-name header AND a junk
// header ("HT CASH") carrying amounts; PT sheet with a US-style text date.
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ["RETAILER NAME", "10 JUNE", "28/02/2026", "HT CASH"],
  ["9054546565 ATMIYA MEDICAL", 6000, "", 11111],
  ["9725291151 KHODIYAR MOBILE", 4000, "", ""],
  ["8328417299 SHREE SAHARA", "", 50000, ""],
  ["SAI LEELA SWIFT", 50000, "", ""],
  ["NEW SHOP NO PHONE", 9000, "", ""],
]), "HT");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ["v.typ", "date", "bank", "Retailer", "6/10/2026"],
  ["cash receipts book", "", "cash on hand", "8107128780 MAJISA SWIFT", 14000],
]), "PT");
const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

const fd = new FormData();
fd.append("file", new File([buf], "FSE CASH BOOK test.xlsx"));
const res = await fetch(`${BASE}/api/uploads/cash-report`, {
  method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
});
const body = await res.json();

try {
  check("upload ok", body.ok, true);
  const sum = body.summary;
  check("rows", sum.rows, 5); // 2× 10-Jun HT + alias row + 1× 28-Feb HT + 1× PT
  check("covered dates", sum.covered_dates, ["2026-02-28", "2026-06-10"]); // month-name + D/M + US M/D all → real dates
  check("warnings count", (sum.warnings ?? []).length, 2);
  check("warning names the column", (sum.warnings ?? []).some((w) => /HT CASH/.test(w)), true);
  check("warning names unmatched row", (sum.warnings ?? []).some((w) => /NEW SHOP NO PHONE/.test(w)), true);
  // entries landed on the right dates
  const { data: entries } = await admin
    .from("cash_report_entries").select("txn_date, amount, sheet_name, retailer_id")
    .in("account_id", (await admin.from("accounts").select("id").eq("distributor_id", distId)).data.map((a) => a.id))
    .order("txn_date");
  const june10 = (entries ?? []).filter((e) => e.txn_date === "2026-06-10");
  check("10-Jun entries", june10.length, 4); // 6000+4000+50000 HT, 14000 PT
  check("10-Jun total", june10.reduce((t, e) => t + Number(e.amount), 0), 74000);
  // the alias row went to the right retailer
  const { data: sl } = await admin.from("profiles").select("id").eq("retailer_code", "TEST-SL").single();
  check("alias row → Sai Leela", june10.some((e) => e.retailer_id === sl.id && Number(e.amount) === 50000), true);
} finally {
  await cleanup(distId);
}
console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

async function cleanup(orgDistId) {
  const { data: members } = await admin.from("profiles").select("id").eq("distributor_id", orgDistId);
  const ids = [orgDistId, ...(members ?? []).map((m) => m.id)];
  const { data: accts } = await admin.from("accounts").select("id").eq("distributor_id", orgDistId);
  const acctIds = (accts ?? []).map((a) => a.id);
  if (acctIds.length) {
    await admin.from("cash_report_entries").delete().in("account_id", acctIds);
    await admin.from("cash_report_dates").delete().in("account_id", acctIds);
    await admin.from("daily_balances").delete().in("account_id", acctIds);
  }
  await admin.from("cash_reports").delete().eq("distributor_id", orgDistId);
  await admin.from("accounts").delete().eq("distributor_id", orgDistId);
  for (const id of ids) {
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(`cleaned up org ${orgDistId} (${ids.length} users)`);
}
