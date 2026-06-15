import { Text, View } from "react-native";
import type { ReactNode } from "react";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-zinc-700">{label}</Text>
      {children}
      {hint && !error && <Text className="text-xs text-zinc-500">{hint}</Text>}
      {error && <Text className="text-xs text-red-600">{error}</Text>}
    </View>
  );
}
