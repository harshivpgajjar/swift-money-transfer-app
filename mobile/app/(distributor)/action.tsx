import { useAuth } from "../../lib/auth";
import { ActionCenter } from "../../components/ActionCenter";

export default function DistributorActionScreen() {
  const { profile } = useAuth();
  if (!profile) return null;
  return <ActionCenter distributorId={profile.id} />;
}
