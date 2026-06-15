import { ScrollView, View, RefreshControl, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactNode } from "react";
import { T } from "../lib/theme";

/**
 * Standard linen page shell. Renders the top portion in the linen background,
 * scrollable body padded for the bottom tab bar.
 */
export function LinenScreen({
  refreshing,
  onRefresh,
  topbar,
  children,
  bottomInset = 100,
}: {
  refreshing?: boolean;
  onRefresh?: () => void;
  topbar?: ReactNode;
  children: ReactNode;
  bottomInset?: number;
}) {
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: T.bg }}>
      <StatusBar barStyle="dark-content" />
      {topbar}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: bottomInset }}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={T.ink2} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function LinenSpacer({ h = 14 }: { h?: number }) {
  return <View style={{ height: h }} />;
}
