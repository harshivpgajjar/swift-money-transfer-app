import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth";
import type { UserRole } from "../lib/types";
import { ROLE_HOME } from "../lib/types";
import type { ReactNode } from "react";

export function RoleGate({
  role,
  children,
}: {
  role: UserRole;
  children: ReactNode;
}) {
  const { loading, profile } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-50">
        <ActivityIndicator />
      </View>
    );
  }
  if (!profile) return <Redirect href="/login" />;
  if (profile.must_change_password) {
    return <Redirect href={"/change-password" as "/login"} />;
  }
  if (profile.role !== role) {
    return <Redirect href={ROLE_HOME[profile.role] as "/(distributor)" | "/(fos)" | "/(retailer)"} />;
  }
  return <>{children}</>;
}
