import { supabase } from "./supabase";
import type { Account } from "./types";

export async function fetchAccounts(distributorId: string): Promise<Account[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("distributor_id", distributorId)
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Account[];
}

export async function fetchLatestClosingPerAccount(retailerId: string) {
  const { data } = await supabase
    .from("daily_balances")
    .select("account_id, balance_date, closing")
    .eq("retailer_id", retailerId)
    .order("balance_date", { ascending: false });
  const map = new Map<string, number>();
  for (const b of data ?? []) {
    if (!map.has(b.account_id)) map.set(b.account_id, Number(b.closing));
  }
  return map;
}
