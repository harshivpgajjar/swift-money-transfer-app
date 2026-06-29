import { useAuth } from "../../lib/auth";
import { OutstandingInner } from "../(distributor)/outstanding";

/* Retailer's own outstanding — same layout as the distributor screen, scoped to
   just themselves (account toggle + date range + Opening→Closing breakdown). */
export default function RetailerOutstanding() {
  const { profile } = useAuth();
  if (!profile?.distributor_id) return null;
  return <OutstandingInner distributorId={profile.distributor_id} retailerId={profile.id} />;
}
