import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Account } from "@/lib/types";

export async function getAccounts(distributorId: string): Promise<Account[]> {
  const supabase = await createClient();
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

export async function getAccountById(accountId: string): Promise<Account | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  return (data as Account | null) ?? null;
}

/**
 * Resolve an account for a non-distributor caller — uses admin (bypassing RLS)
 * because we've already validated the caller's role + distributor_id.
 */
export async function getAccountsForDistributor(
  distributorId: string,
): Promise<Account[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("accounts")
    .select("*")
    .eq("distributor_id", distributorId)
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Account[];
}
