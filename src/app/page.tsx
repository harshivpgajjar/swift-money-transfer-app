import { redirect } from "next/navigation";
import { ROLE_HOME } from "@/lib/types";
import { getProfile } from "@/lib/auth";

export default async function RootPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  redirect(ROLE_HOME[profile.role]);
}
