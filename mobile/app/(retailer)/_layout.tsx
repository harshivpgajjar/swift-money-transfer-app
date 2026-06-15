import { Tabs } from "expo-router";
import { Home, ArrowUp, Wallet, Clock } from "lucide-react-native";
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

const TabBarIcon = ({
  IconComp,
  color,
  focused,
}: {
  IconComp: React.ComponentType<{ size: number; color: string }>;
  color: string;
  focused: boolean;
}) => (
  <View style={{ alignItems: "center", justifyContent: "center" }}>
    {focused && <ActiveDot />}
    <IconComp size={22} color={color} />
  </View>
);

export default function RetailerLayout() {
  const { t, locale } = useT();
  return (
    <RoleGate role="retailer">
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
          options={{
            title: t("tabs.home"),
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon IconComp={Home} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="request"
          options={{
            title: t("tabs.request"),
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon IconComp={ArrowUp} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="cash"
          options={{
            title: t("tabs.cash"),
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon IconComp={Wallet} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: t("tabs.history"),
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon IconComp={Clock} color={color} focused={focused} />
            ),
          }}
        />
      </Tabs>
    </RoleGate>
  );
}
