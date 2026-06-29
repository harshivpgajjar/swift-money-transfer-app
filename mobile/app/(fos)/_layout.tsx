import { Tabs } from "expo-router";
import { Home, Bell, Inbox, Wallet, Banknote, Send } from "lucide-react-native";
import { View } from "react-native";
import { RoleGate } from "../../components/RoleGate";
import { useT } from "../../lib/i18n";
import { T, font } from "../../lib/theme";

function ActiveDot() {
  return (
    <View
      style={{
        position: "absolute",
        top: 4,
        width: 5,
        height: 5,
        borderRadius: 999,
        backgroundColor: T.accent,
      }}
    />
  );
}
const Ic = (IconComp: React.ComponentType<{ size: number; color: string }>) =>
  function TabIcon({ color, focused }: { color: string; focused: boolean }) {
    return (
      <View style={{ alignItems: "center", justifyContent: "center" }}>
        {focused && <ActiveDot />}
        <IconComp size={22} color={color} />
      </View>
    );
  };

export default function FosLayout() {
  const { t, locale } = useT();
  return (
    <RoleGate role="fos">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: T.accentInk,
          tabBarInactiveTintColor: T.ink3,
          tabBarStyle: {
            backgroundColor: T.bg,
            borderTopColor: T.border,
            borderTopWidth: 1,
            height: 84,
            paddingBottom: 24,
            paddingTop: 10,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontFamily: font(700, locale),
            letterSpacing: -0.11,
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: t("tabs.home"), tabBarIcon: Ic(Home) }}
        />
        <Tabs.Screen
          name="action"
          options={{ title: t("nav.action"), tabBarIcon: Ic(Bell) }}
        />
        <Tabs.Screen
          name="inbox"
          options={{ title: t("tabs.inbox"), tabBarIcon: Ic(Inbox) }}
        />
        <Tabs.Screen
          name="cash"
          options={{ title: t("tabs.cash"), tabBarIcon: Ic(Banknote) }}
        />
        <Tabs.Screen
          name="retailers"
          options={{ title: t("tabs.outstanding"), tabBarIcon: Ic(Wallet) }}
        />
        <Tabs.Screen
          name="request"
          options={{ title: t("fosreq.tab"), tabBarIcon: Ic(Send) }}
        />
      </Tabs>
    </RoleGate>
  );
}
