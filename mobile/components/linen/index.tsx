import { Pressable, Text, View, ActivityIndicator } from "react-native";
import type { TextStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { T, font } from "../../lib/theme";
import type { Locale } from "../../lib/i18n";
import { NotifBell } from "../notif-bell";

/* WhatsApp glyph (filled, brand). fill goes on the Path — react-native-svg
   does not reliably inherit fill from <Svg>. */
export function WhatsAppIcon({ size = 20, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.2h.004c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.02zM12.04 20.15h-.004a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43-.14-.01-.31-.01-.48-.01-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z"
      />
    </Svg>
  );
}

/* ============================================================
   Topbar — title + sub + right slot
   ============================================================ */
export function Topbar({
  title,
  sub,
  right,
  locale = "en",
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  locale?: Locale;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        paddingHorizontal: 22,
        paddingTop: 8,
        paddingBottom: 14,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 26,
            fontFamily: font(800, locale),
            letterSpacing: -0.52,
            lineHeight: 28.6,
            color: T.ink,
          }}
        >
          {title}
        </Text>
        {sub ? (
          <Text
            style={{
              marginTop: 3,
              fontSize: 13.5,
              color: T.ink2,
              fontFamily: font(500, locale),
              lineHeight: 18,
            }}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 2 }}>
        {right}
        <NotifBell />
      </View>
    </View>
  );
}

/* ============================================================
   IconBtn — circular ghost button used in the topbar
   ============================================================ */
export function IconBtn({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: T.border2, borderless: true, radius: 21 }}
      style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: T.surface,
        borderWidth: 1,
        borderColor: T.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </Pressable>
  );
}

/* ============================================================
   SectionLabel
   ============================================================ */
export function SectionLabel({
  children,
  locale = "en",
  style,
}: {
  children: ReactNode;
  locale?: Locale;
  style?: TextStyle;
}) {
  return (
    <Text
      style={[
        {
          fontSize: 12.5,
          fontFamily: font(700, locale),
          letterSpacing: 0.75,
          textTransform: "uppercase",
          color: T.ink3,
          marginTop: 22,
          marginHorizontal: 4,
          marginBottom: 11,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/* ============================================================
   Sparkline
   ============================================================ */
export function Sparkline({ color = T.accent }: { color?: string }) {
  return (
    <Svg
      width={150}
      height={56}
      viewBox="0 0 150 56"
      fill="none"
      style={{ position: "absolute", right: -6, bottom: -6, opacity: 0.55 }}
    >
      <Path
        d="M0 44 C20 40 28 20 46 22 C66 24 70 42 92 34 C112 27 120 8 150 6"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/* ============================================================
   Tile — regular and feature.  Parent controls layout via flex.
   For a 2-column row, wrap two Tiles in <View flexDirection:'row' gap:13>
   and they auto-split. Use <feature /> for full-width.
   ============================================================ */
export function Tile({
  icon,
  label,
  value,
  chip,
  feature,
  onPress,
  locale = "en",
  numKind = "num",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  chip?: string;
  feature?: boolean;
  onPress?: () => void;
  locale?: Locale;
  numKind?: "ui" | "num";
}) {
  const content = (
    <>
      {feature ? <Sparkline /> : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            backgroundColor: T.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </View>
        {chip ? (
          <View
            style={{
              paddingHorizontal: 9,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: T.accentSoft,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontFamily: font(700, locale),
                color: T.accentInk,
                lineHeight: 14,
              }}
            >
              {chip}
            </Text>
          </View>
        ) : (
          <ChevronRight size={18} color={T.ink3} />
        )}
      </View>
      <Text
        style={{
          fontSize: 13,
          fontFamily: font(600, locale),
          color: T.ink2,
          lineHeight: 16.25,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: font(600, "en", numKind),
          fontSize: feature ? 40 : 26,
          letterSpacing: -0.8,
          color: T.ink,
          marginTop: 3,
          lineHeight: feature ? 46 : 32,
        }}
      >
        {value}
      </Text>
    </>
  );

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: T.border2 }}
      style={{
        flex: feature ? undefined : 1,
        alignSelf: feature ? "stretch" : undefined,
        position: "relative",
        overflow: "hidden",
        backgroundColor: T.surface,
        borderWidth: 1,
        borderColor: T.border,
        borderRadius: T.rLg,
        paddingHorizontal: 17,
        paddingTop: 17,
        paddingBottom: 16,
        shadowColor: "#28322d",
        shadowOpacity: 0.08,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 2,
      }}
    >
      {content}
    </Pressable>
  );
}

/* ============================================================
   Btn — primary / ghost / danger / soft, optional vertical/full layout
   ============================================================ */
export function Btn({
  title,
  onPress,
  variant = "primary",
  icon,
  vertical,
  disabled,
  loading,
  locale = "en",
  busyLabel,
  fullWidth = true,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "ghost" | "danger" | "soft";
  icon?: ReactNode;
  vertical?: boolean;
  disabled?: boolean;
  loading?: boolean;
  locale?: Locale;
  busyLabel?: string;
  fullWidth?: boolean;
}) {
  const isPrimary = variant === "primary";
  const isGhost = variant === "ghost";
  const isDanger = variant === "danger";
  const isSoft = variant === "soft";
  const isInactive = disabled || loading;

  const bg = isPrimary
    ? T.accent
    : isSoft
    ? T.accentSoft
    : isDanger
    ? "transparent"
    : T.surface;
  const fg = isPrimary
    ? T.onAccent
    : isSoft
    ? T.accentInk
    : isDanger
    ? T.neg
    : T.ink;
  const borderColor = isGhost || isDanger ? T.border2 : "transparent";

  return (
    <Pressable
      onPress={onPress}
      disabled={isInactive}
      android_ripple={{ color: isPrimary ? T.accent2 : T.border2 }}
      style={{
        flex: fullWidth ? 1 : 0,
        alignSelf: fullWidth ? "stretch" : undefined,
        height: vertical ? 72 : 56,
        borderRadius: T.rMd,
        paddingHorizontal: 22,
        flexDirection: vertical ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        borderWidth: isGhost || isDanger ? 1 : 0,
        borderColor,
        opacity: isInactive ? 0.55 : 1,
        // primary green halo (iOS) / Android elevation
        shadowColor: isPrimary ? T.accent : "transparent",
        shadowOpacity: isPrimary ? 0.3 : 0,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 12 },
        elevation: isPrimary ? 6 : 0,
      }}
    >
      <View
        style={{
          flexDirection: vertical ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          gap: vertical ? 6 : 9,
        }}
      >
        {loading ? <ActivityIndicator color={fg} /> : icon ?? null}
        <Text
          style={{
            fontSize: vertical ? 14.5 : 16.5,
            fontFamily: font(700, locale),
            letterSpacing: -0.16,
            color: fg,
          }}
        >
          {loading && busyLabel ? busyLabel : title}
        </Text>
      </View>
    </Pressable>
  );
}

/* ============================================================
   WhoCard
   ============================================================ */
export function WhoCard({
  icon,
  line,
  sub,
  right,
  locale = "en",
}: {
  icon: ReactNode;
  line: ReactNode;
  sub: string;
  right?: ReactNode;
  locale?: Locale;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginTop: 22,
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: T.surface,
        borderWidth: 1,
        borderColor: T.border,
        borderRadius: T.rMd,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 11,
          backgroundColor: T.accentSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, color: T.ink, fontFamily: font(500, locale), lineHeight: 19 }}>
          {line}
        </Text>
        <Text
          style={{
            fontSize: 12.5,
            color: T.ink2,
            marginTop: 2,
            fontFamily: font(500, locale),
            lineHeight: 16,
          }}
        >
          {sub}
        </Text>
      </View>
      {right ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{right}</View>
      ) : null}
    </View>
  );
}

/* ============================================================
   Bold span helper
   ============================================================ */
export function Bold({ children, locale = "en" }: { children: ReactNode; locale?: Locale }) {
  return <Text style={{ fontFamily: font(700, locale), color: T.ink }}>{children}</Text>;
}
