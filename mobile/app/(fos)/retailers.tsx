import { useAuth } from "../../lib/auth";
import { OutstandingInner } from "../(distributor)/outstanding";

/* FOS retailers = the distributor Outstanding screen, scoped to this FOS's own
   retailers, read-only (no adjust / no defaulter management / no FOS filter). */
export default function FosRetailers() {
  const { profile } = useAuth();
  if (!profile?.distributor_id) return null;
  return (
    <OutstandingInner
      distributorId={profile.distributor_id}
      fosId={profile.id}
      showSearch
    />
  );
}
