/* Compare system outstanding (latest closing per retailer/account) against
   the distributor's expected report (11 June 2026.xlsx).
   HT + Swift sheets → swift account; A2Z sheet → naomi account. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// ---- expected ----
const wb = XLSX.read(readFileSync("/Users/harshiv/Downloads/11 June 2026.xlsx"), { type: "buffer" });
const SHEET_ACCT = { HT: "swift", Swift: "swift", A2Z: "naomi" };
const expected = new Map(); // key "acct|name" → { name, acct, total }
for (const [sheet, acct] of Object.entries(SHEET_ACCT)) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "" });
  for (const r of rows) {
    if (String(r[1]).trim() !== "Effect") continue; // retailer rows only
    const name = String(r[0]).trim();
    const total = Number(r[r.length - 1] || 0); // Total = last column
    const key = `${acct}|${name}`;
    expected.set(key, { name, acct, total: (expected.get(key)?.total ?? 0) + total });
  }
}

// ---- system ----
const { data: accounts } = await admin.from("accounts").select("id, slug").in("slug", ["swift", "naomi"]);
const acctById = new Map(accounts.map((a) => [a.id, a.slug]));
const { data: profiles } = await admin
  .from("profiles").select("id, full_name, phone, retailer_code").eq("role", "retailer");
const { data: aliases } = await admin.from("retailer_aliases").select("alias, retailer_id");
const { data: balances } = await admin
  .from("daily_balances").select("retailer_id, account_id, balance_date, closing")
  .order("balance_date", { ascending: true });
const latest = new Map(); // "retailer|acctSlug" → closing
for (const b of balances) {
  const slug = acctById.get(b.account_id);
  if (slug) latest.set(`${b.retailer_id}|${slug}`, Number(b.closing));
}

// resolution maps
const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
const fuzz = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const byPhone = new Map(), byName = new Map(), byFuzz = new Map();
for (const p of profiles) {
  if (p.phone) byPhone.set(p.phone.replace(/\D/g, "").slice(-10), p.id);
  if (p.full_name) { byName.set(norm(p.full_name), p.id); byFuzz.set(fuzz(p.full_name), p.id); }
}
for (const a of aliases) { byName.set(norm(a.alias), a.retailer_id); byFuzz.set(fuzz(a.alias), a.retailer_id); }
function resolve(raw) {
  const phone = (raw.match(/\b(\d{10})\b/) ?? [])[1];
  if (phone && byPhone.has(phone)) return byPhone.get(phone);
  const cleaned = raw.replace(/\b\d{10}\b/, "").trim();
  for (const cand of [raw, cleaned]) {
    const id = byName.get(norm(cand)) ?? byFuzz.get(fuzz(cand));
    if (id) return id;
  }
  // unique containment
  const key = fuzz(cleaned || raw);
  const hits = new Set();
  for (const [k, id] of byFuzz) if (k.includes(key) || key.includes(k)) hits.add(id);
  return hits.size === 1 ? [...hits][0] : undefined;
}

// ---- compare ----
const matchedSys = new Set();
const diffs = [];
let expTotal = 0, expMatchedSys = 0;
for (const { name, acct, total } of expected.values()) {
  expTotal += total;
  const rid = resolve(name);
  const sysKey = rid ? `${rid}|${acct}` : null;
  const sys = sysKey && latest.has(sysKey) ? latest.get(sysKey) : null;
  if (sysKey) matchedSys.add(sysKey);
  if (sys !== null) expMatchedSys += sys;
  const d = (sys ?? 0) - total;
  if (Math.abs(d) > 0.5 || sys === null) {
    diffs.push({ acct, name: name.slice(0, 44), expected: total, system: sys, diff: Math.round(d * 100) / 100, note: rid ? (sys === null ? "no system balance" : "") : "NOT RESOLVED" });
  }
}
// system retailers with balance ≠ 0 that aren't in the expected report at all
const extras = [];
for (const [key, closing] of latest) {
  if (matchedSys.has(key) || Math.abs(closing) < 0.5) continue;
  const [rid, slug] = key.split("|");
  const p = profiles.find((x) => x.id === rid);
  extras.push({ acct: slug, name: p?.full_name ?? rid, closing });
}

diffs.sort((a, b) => Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0));
extras.sort((a, b) => Math.abs(b.closing) - Math.abs(a.closing));
console.log("== MISMATCHES (expected vs system) ==");
for (const d of diffs) console.log(`${d.acct.padEnd(6)} ${d.name.padEnd(46)} exp ${String(d.expected).padStart(11)}  sys ${String(d.system ?? "—").padStart(11)}  diff ${String(d.diff).padStart(11)}  ${d.note}`);
console.log(`\n== IN SYSTEM BUT NOT IN EXPECTED REPORT (closing ≠ 0) ==`);
for (const e of extras) console.log(`${e.acct.padEnd(6)} ${String(e.name).slice(0, 46).padEnd(46)} sys ${e.closing}`);
const sysTotal = [...latest.values()].reduce((s, v) => s + v, 0);
console.log(`\nexpected grand total: ${expTotal}`);
console.log(`system grand total:   ${sysTotal}`);
console.log(`matched rows: ${expected.size - diffs.filter((d) => d.note === "NOT RESOLVED").length}/${expected.size} expected rows resolved`);
