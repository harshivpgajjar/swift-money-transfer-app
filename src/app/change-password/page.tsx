import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/types";
import ForceForm from "./force-form";

export default async function ChangePasswordPage() {
  const me = await requireProfile();
  if (!me.must_change_password) redirect(ROLE_HOME[me.role]);
  return <ForceForm home={ROLE_HOME[me.role]} />;
}
