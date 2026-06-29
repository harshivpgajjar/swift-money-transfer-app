import { requireRole } from "@/lib/auth";
import { getActionCenter } from "@/lib/queries";
import ActionCenterView from "../../action/action-view";

export default async function FosActionPage() {
  const me = await requireRole("fos");
  if (!me.distributor_id) return null;
  const rows = await getActionCenter(me.distributor_id, me.id);
  return <ActionCenterView rows={rows} />;
}
