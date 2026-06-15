import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
const env = Object.fromEntries(readFileSync("/Users/harshiv/Desktop/Swift Money Transfer App/.env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const wb = XLSX.read(readFileSync("/Users/harshiv/Downloads/12 June 2026 (1).xlsx"),{type:"buffer"});
const SHEET_ACCT = { HT:"swift", Swift:"swift", A2Z:"naomi" };
const expected = new Map(); // "acct|name" -> total
for (const [sheet,acct] of Object.entries(SHEET_ACCT)) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:""});
  const hdr = rows.find(r=>String(r[0]).trim()==="Name");
  const tc = hdr.findIndex(c=>String(c).trim()==="Total");
  for (const r of rows){ if(String(r[1]).trim()!=="Effect")continue;
    const k=`${acct}|${String(r[0]).trim()}`; expected.set(k,(expected.get(k)??0)+Number(r[tc]||0)); }
}
const {data:accts}=await admin.from("accounts").select("id,slug").in("slug",["swift","naomi"]);
const slugOf=new Map(accts.map(a=>[a.id,a.slug]));
const {data:profiles}=await admin.from("profiles").select("id,full_name,phone,retailer_code").eq("role","retailer");
const {data:aliases}=await admin.from("retailer_aliases").select("alias,retailer_id");
const {data:bal}=await admin.from("daily_balances").select("retailer_id,account_id,closing,balance_date").order("balance_date",{ascending:true});
const latest=new Map();
for(const b of bal){const s=slugOf.get(b.account_id);if(s)latest.set(`${b.retailer_id}|${s}`,Number(b.closing));}
const norm=s=>s.trim().toLowerCase().replace(/\s+/g," "),fz=s=>s.toLowerCase().replace(/[^a-z0-9]/g,"");
const byPhone=new Map(),byName=new Map(),byFuzz=new Map();
for(const p of profiles){if(p.phone)byPhone.set(p.phone.replace(/\D/g,"").slice(-10),p.id);if(p.full_name){byName.set(norm(p.full_name),p.id);byFuzz.set(fz(p.full_name),p.id);}}
for(const a of aliases){byName.set(norm(a.alias),a.retailer_id);byFuzz.set(fz(a.alias),a.retailer_id);}
function resolve(raw){const ph=(raw.match(/\b(\d{10})\b/)??[])[1];if(ph&&byPhone.has(ph))return byPhone.get(ph);const c=raw.replace(/\b\d{10}\b/,"").trim();for(const x of[raw,c]){const id=byName.get(norm(x))??byFuzz.get(fz(x));if(id)return id;}const k=fz(c||raw);const h=new Set();for(const[kk,id]of byFuzz)if(kk.includes(k)||k.includes(kk))h.add(id);return h.size===1?[...h][0]:undefined;}
let diffs=[],expSum=0;const matched=new Set();
for(const[key,tot]of expected){expSum+=tot;const[acct,nm]=key.split("|");const rid=resolve(nm);const sk=rid?`${rid}|${acct}`:null;const sys=sk&&latest.has(sk)?latest.get(sk):null;if(sk)matched.add(sk);if(sys===null||Math.abs(sys-tot)>0.5)diffs.push({acct,nm:nm.slice(0,40),exp:tot,sys,d:Math.round(((sys??0)-tot)*100)/100,note:rid?(sys===null?"no sys":""):"UNRESOLVED"});}
const extra=[];for(const[k,c]of latest){if(matched.has(k)||Math.abs(c)<0.5)continue;const[rid,sl]=k.split("|");const p=profiles.find(x=>x.id===rid);extra.push({sl,nm:p?.full_name??rid,c});}
console.log("MISMATCHES:");for(const d of diffs.sort((a,b)=>Math.abs(b.d)-Math.abs(a.d)))console.log(`  ${d.acct.padEnd(6)}${d.nm.padEnd(42)} exp ${String(d.exp).padStart(10)} sys ${String(d.sys??"—").padStart(10)} diff ${String(d.d).padStart(9)} ${d.note}`);
console.log("\nIN SYSTEM NOT IN REPORT (≠0):");for(const e of extra.sort((a,b)=>Math.abs(b.c)-Math.abs(a.c)))console.log(`  ${e.sl.padEnd(6)}${String(e.nm).slice(0,42).padEnd(42)} ${e.c}`);
console.log(`\nexpected total: ${expSum}`);
console.log(`system total:   ${[...latest.values()].reduce((s,v)=>s+v,0)}`);
console.log(`mismatched rows: ${diffs.length} / ${expected.size} expected`);
