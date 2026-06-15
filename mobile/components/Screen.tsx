import { ScrollView, View, RefreshControl, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactNode } from "react";

export function Screen({
  title,
  subtitle,
  refreshing,
  onRefresh,
  children,
}: {
  title?: string;
  subtitle?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  children: ReactNode;
}) {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-zinc-50">
      <ScrollView
        contentContainerClassName="px-4 py-4 gap-4"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        {title && (
          <View className="gap-0.5">
            <Text className="text-2xl font-semibold tracking-tight text-zinc-900">
              {title}
            </Text>
            {subtitle && <Text className="text-sm text-zinc-500">{subtitle}</Text>}
          </View>
        )}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
