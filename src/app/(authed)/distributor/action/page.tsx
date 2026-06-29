import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActionCenter } from "@/lib/queries";
import ActionCenterView from "../../action/action-view";

export default async function DistributorActionPage() {
  const me = await requireRole("distributor");
  const supabase = await createClient();
  const [rows, fosRes] = await Promise.all([
    getActionCenter(me.id),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("distributor_id", me.id)
      .eq("role", "fos")
      .order("full_name"),
  ]);
  const fosOptions = (fosRes.data ?? []).map((f) => ({ id: f.id, name: f.full_name }));
  return <ActionCenterView rows={rows} fosOptions={fosOptions} />;
}
