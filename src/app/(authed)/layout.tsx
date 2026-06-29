import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPendingApprovalsCount, getPendingFosInboxCount, getActionBadge } from "@/lib/queries";
import AppShell from "./shell";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  if (profile.must_change_password) redirect("/change-password");

  let inboxBadge = 0;
  let approvalsBadge = 0;
  let actionBadge = 0;
  let fosName: string | null = null;

  if (profile.role === "fos") {
    [inboxBadge, actionBadge] = await Promise.all([
      getPendingFosInboxCount(profile.id),
      profile.distributor_id ? getActionBadge(profile.distributor_id, profile.id) : Promise.resolve(0),
    ]);
  } else if (profile.role === "distributor") {
    [approvalsBadge, actionBadge] = await Promise.all([
      getPendingApprovalsCount(profile.id),
      getActionBadge(profile.id),
    ]);
  } else if (profile.role === "retailer" && profile.fos_id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", profile.fos_id)
      .maybeSingle();
    fosName = data?.full_name ?? null;
  }

  return (
    <AppShell
      role={profile.role}
      name={profile.full_name}
      retailerCode={profile.retailer_code}
      fosName={fosName}
      inboxBadge={inboxBadge}
      approvalsBadge={approvalsBadge}
      actionBadge={actionBadge}
    >
      {children}
    </AppShell>
  );
}
