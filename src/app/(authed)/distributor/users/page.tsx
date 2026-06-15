import { requireRole } from "@/lib/auth";
import { getDistributorRoster } from "@/lib/queries";
import UsersView from "./users-view";

export default async function UsersPage() {
  const me = await requireRole("distributor");
  const { fos, retailers } = await getDistributorRoster(me.id);

  return (
    <UsersView
      fos={fos.map((f) => ({
        id: f.id,
        name: f.full_name,
        phone: f.phone,
        active: f.active,
        autoApprove: f.fos_auto_approve,
        joined: f.created_at,
      }))}
      retailers={retailers.map((r) => ({
        id: r.id,
        code: r.retailer_code ?? "",
        name: r.full_name,
        phone: r.phone,
        active: r.active,
        needsAssignment: r.needs_assignment,
        fosId: r.fos_id,
        joined: r.created_at,
      }))}
    />
  );
}
