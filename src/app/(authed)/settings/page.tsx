import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SettingsView from "./settings-view";

export default async function SettingsPage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();

  let fosName: string | null = null;
  let distributorName: string | null = null;
  if (me.role === "retailer") {
    if (me.fos_id) {
      const { data } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", me.fos_id)
        .maybeSingle();
      fosName = data?.full_name ?? null;
    }
    if (me.distributor_id) {
      const { data } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", me.distributor_id)
        .maybeSingle();
      distributorName = data?.full_name ?? null;
    }
  }

  let accounts: { id: string; name: string; slug: string; active: boolean }[] = [];
  if (me.role === "distributor") {
    const { data } = await admin
      .from("accounts")
      .select("id, name, slug, active")
      .eq("distributor_id", me.id)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    accounts = data ?? [];
  }

  return (
    <SettingsView
      role={me.role}
      profile={{
        name: me.full_name,
        email: user?.email ?? "",
        phone: me.phone ?? "",
        timezone: me.timezone || "Asia/Kolkata",
        memberSince: me.created_at,
        retailerCode: me.retailer_code,
        autoApprove: me.fos_auto_approve,
        defaultFosAutoApprove: me.default_fos_auto_approve === true,
        notificationPrefs: me.notification_prefs ?? {},
      }}
      fosName={fosName}
      distributorName={distributorName}
      accounts={accounts}
    />
  );
}
