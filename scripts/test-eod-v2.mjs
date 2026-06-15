/* E2E test (11 June 2026) for the EOD-authoritative model + new A2Z rules,
   run against a LOCAL dev server with a throwaway org. Asserts:
   - SELF PAYMENT RETURN rows ignored; DT/DT REVERSED kept
   - distributor-file DLM: phone tag resolves retailers (REM: in retailer file)
   - numeric order ids (Wallet column) used as bank_reference → dedup works
   - eod_report_dates coverage written; balances = transfers − reversals
   Cleans up the throwaway org afterwards. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.TEST_BASE ?? "http://localhost:3100";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const RETAILER_FILE = "/Users/harshiv/Downloads/PaymentReports - 2026-06-10T230231.403.csv";
const DIST_FILE = "/Users/harshiv/Downloads/PaymentReports - 2026-06-11T165846.333.csv";

let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: got ${JSON.stringify(got)}${ok ? "" : `, want ${JSON.stringify(want)}`}`);
  if (!ok) failures++;
}

// ---- create throwaway org ----
const email = "eod-test-v2@auto.local";
const password = crypto.randomUUID();
{
  // remove leftovers from a previous run
  const { data: old } = await admin.from("profiles").select("id").eq("full_name", "EOD Test V2 Org");
  for (const p of old ?? []) await cleanup(p.id);
}
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true, app_metadata: { role: "distributor" },
});
if (createErr) throw createErr;
const distId = created.user.id;
await must(admin.from("profiles").insert({
  id: distId, role: "distributor", full_name: "EOD Test V2 Org", active: true,
}));
const { data: accounts } = await must(
  admin.from("accounts").insert([
    { distributor_id: distId, name: "Swift Money", slug: "swift" },
    { distributor_id: distId, name: "A2Z", slug: "naomi" },
  ]).select("id, slug"),
);
const swiftId = accounts.find((a) => a.slug === "swift").id;
const naomiId = accounts.find((a) => a.slug === "naomi").id;

const { data: signin, error: signinErr } = await anon.auth.signInWithPassword({ email, password });
if (signinErr) throw signinErr;
const token = signin.session.access_token;

async function upload(paths) {
  const fd = new FormData();
  fd.set("account_id", swiftId); // wrong default on purpose — A2Z must be auto-detected
  for (const p of paths) {
    fd.append("file", new File([readFileSync(p)], p.split("/").pop(), { type: "text/csv" }));
  }
  const res = await fetch(`${BASE}/api/uploads/eod`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
  return { status: res.status, body: await res.json() };
}

try {
  // ---- 1) both A2Z files together ----
  const r1 = await upload([RETAILER_FILE, DIST_FILE]);
  check("upload ok", r1.body.ok, true);
  const s = r1.body.summary;
  check("rows", s.rows, 107);                       // 101+5 DT/DT-REV + 1 DT (dist file)
  check("transferred", s.transferred, 1563500);     // 15,13,500 + 50,000 (DLM row)
  check("reversed", s.reversed, 166000);            // 5,16,000 − 3,50,000 self returns
  const ignoredMsgs = (s.skipped ?? []).filter((x) => /non-retailer rows ignored/.test(x.message));
  check("ignored summary lines", ignoredMsgs.length, 2); // one per file (incl. self returns)
  check("duplicates first run", s.duplicates, 0);

  // ---- 2) coverage rows ----
  const { data: cov } = await admin.from("eod_report_dates")
    .select("account_id, txn_date").eq("account_id", naomiId).order("txn_date");
  check("coverage dates", (cov ?? []).map((c) => c.txn_date), ["2026-06-10", "2026-06-11"]);

  // ---- 3) re-upload → all duplicates ----
  const r2 = await upload([RETAILER_FILE]);
  check("re-upload rows", r2.body.summary.rows, 0);
  check("re-upload duplicates", r2.body.summary.duplicates, 106);

  // ---- 4) Blue Star (9375055640): 10 Jun transfers + 11 Jun 50k via DLM ----
  const { data: bs } = await admin.from("profiles").select("id")
    .eq("distributor_id", distId).eq("phone", "9375055640").single();
  const { data: bsBal } = await admin.from("daily_balances")
    .select("balance_date, transferred, reversed, closing")
    .eq("retailer_id", bs.id).eq("account_id", naomiId).order("balance_date");
  const d11 = (bsBal ?? []).find((b) => b.balance_date === "2026-06-11");
  check("Blue Star 11 Jun transferred", Number(d11?.transferred), 50000);
  const { data: bsTx } = await admin.from("eod_transactions")
    .select("type, amount").eq("retailer_id", bs.id).eq("account_id", naomiId);
  const bsT = bsTx.filter((t) => t.type === "transfer").reduce((s2, t) => s2 + Number(t.amount), 0);
  const bsR = bsTx.filter((t) => t.type === "reversal").reduce((s2, t) => s2 + Number(t.amount), 0);
  const last = (bsBal ?? [])[bsBal.length - 1];
  check("Blue Star closing = transfers − reversals", Number(last?.closing), bsT - bsR);

  // ---- 5) refs are numeric (no "Money") ----
  const { data: badRefs } = await admin.from("eod_transactions")
    .select("id").eq("distributor_id", distId).eq("bank_reference", "Money");
  check("no 'Money' refs", (badRefs ?? []).length, 0);
} finally {
  await cleanup(distId);
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

async function must(p) {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  return r;
}

async function cleanup(orgDistId) {
  const { data: members } = await admin.from("profiles").select("id").eq("distributor_id", orgDistId);
  const ids = [orgDistId, ...(members ?? []).map((m) => m.id)];
  await admin.from("eod_transactions").delete().eq("distributor_id", orgDistId);
  const { data: accts } = await admin.from("accounts").select("id").eq("distributor_id", orgDistId);
  const acctIds = (accts ?? []).map((a) => a.id);
  if (acctIds.length) {
    await admin.from("eod_report_dates").delete().in("account_id", acctIds);
    await admin.from("daily_balances").delete().in("account_id", acctIds);
  }
  await admin.from("sheet_uploads").delete().eq("distributor_id", orgDistId);
  await admin.from("accounts").delete().eq("distributor_id", orgDistId);
  for (const id of ids) {
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(`cleaned up org ${orgDistId} (${ids.length} users)`);
}
