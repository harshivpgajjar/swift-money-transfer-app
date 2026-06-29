import { useAuth } from "../../lib/auth";
import { ActionCenter } from "../../components/ActionCenter";

export default function FosActionScreen() {
  const { profile } = useAuth();
  if (!profile?.distributor_id) return null;
  return <ActionCenter distributorId={profile.distributor_id} fosId={profile.id} />;
}
