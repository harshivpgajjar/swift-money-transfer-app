import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../lib/auth";
import { ROLE_HOME } from "../lib/types";

export default function Index() {
  const { loading, profile } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-50">
        <ActivityIndicator />
      </View>
    );
  }

  if (!profile) return <Redirect href="/login" />;
  if (profile.must_change_password) return <Redirect href={"/change-password" as "/login"} />;
  return <Redirect href={ROLE_HOME[profile.role] as "/(distributor)" | "/(fos)" | "/(retailer)"} />;
}
