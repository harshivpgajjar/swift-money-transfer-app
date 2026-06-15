import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync("/Users/harshiv/Desktop/Swift Money Transfer App/.env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const DIST = "0cf03fc2-1119-494a-af82-e4dffe6155ab";
const FOS  = "7d81f280-bb8d-4d27-927f-3e37a69b5241"; // same FOS as A Mobile (distributor can reassign)
const SWIFT = "0f56e657-3e4c-4b42-8082-4efef38363b9";
const TXN  = "533b88ee-bcb1-46df-a8fe-1bd71ead8358";
const PHONE = "8107128780";

// idempotency: bail if a profile with this phone already exists
let { data: existing } = await admin.from("profiles").select("id,full_name").eq("phone", PHONE).maybeSingle();
let majisaId;
if (existing) {
  majisaId = existing.id;
  console.log("Majisa profile already exists:", existing.full_name, majisaId);
} else {
  const email = `r-m${PHONE}-${DIST.slice(0,8)}@auto.local`;
  const { data: u, error: ae } = await admin.auth.admin.createUser({ email, password: crypto.randomUUID(), email_confirm: true, app_metadata: { role: "retailer" } });
  if (ae) throw ae;
  majisaId = u.user.id;
  const { error: pe } = await admin.from("profiles").insert({
    id: majisaId, role: "retailer", full_name: "Majisa Mobile", retailer_code: `M${PHONE}`,
    phone: PHONE, distributor_id: DIST, fos_id: FOS, active: true,
  });
  if (pe) { await admin.auth.admin.deleteUser(majisaId); throw pe; }
  console.log("Created Majisa Mobile:", majisaId);
}

// aliases for future name-only rows (idempotent)
for (const alias of ["Majisa Mobile", "Majisa Swift", "Narpat Lal (Majisa Mobile)"]) {
  const { error } = await admin.from("retailer_aliases").upsert(
    { distributor_id: DIST, retailer_id: majisaId, alias }, { onConflict: "distributor_id,alias", ignoreDuplicates: true });
  if (error && !/duplicate|unique/i.test(error.message)) console.log("alias warn:", alias, error.message);
}

// reassign the mis-matched transaction + record the true raw name
const { error: ue } = await admin.from("eod_transactions")
  .update({ retailer_id: majisaId, raw_name: "NARPAT LAL (Majisa Mobile) / 8107128780" })
  .eq("id", TXN);
if (ue) throw ue;
console.log("Reassigned txn", TXN, "→ Majisa");

// recompute both A Mobile and Majisa on swift
for (const rid of ["262bd484-5740-4616-9df6-c6d5c5f1742f", majisaId]) {
  const { error } = await admin.rpc("recompute_balances", { p_retailer_id: rid, p_account_id: SWIFT, p_from_date: null });
  if (error) console.log("recompute warn:", rid, error.message);
}
console.log("Recomputed A Mobile + Majisa");
