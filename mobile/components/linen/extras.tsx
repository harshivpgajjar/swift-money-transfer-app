import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useState, type ReactNode } from "react";
import { Bell, Eye, EyeOff } from "lucide-react-native";
import { T, font } from "../../lib/theme";
import type { Locale } from "../../lib/i18n";

/* ============================================================
   Card — surface block with linen border
   ============================================================ */
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: T.surface,
          borderWidth: 1,
          borderColor: T.border,
          borderRadius: T.rMd,
          padding: 16,
          shadowColor: "#28322d",
          shadowOpacity: 0.08,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ============================================================
   Field — labeled input with optional prefix/icon
   ============================================================ */
export function Field({
  label,
  value,
  onChangeText,
  prefix,
  icon,
  placeholder,
  locale = "en",
  keyboardType,
  secureTextEntry,
  multiline,
  hint,
  inputProps,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  prefix?: string;
  icon?: ReactNode;
  placeholder?: string;
  locale?: Locale;
  keyboardType?: TextInputProps["keyboardType"];
  secureTextEntry?: boolean;
  multiline?: boolean;
  hint?: string;
  inputProps?: TextInputProps;
}) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ marginBottom: 16 }}>
      {label ? (
        <Text
          style={{
            fontSize: 13.5,
            fontFamily: font(600, locale),
            color: T.ink2,
            marginBottom: 7,
            marginLeft: 3,
          }}
        >
          {label}
        </Text>
      ) : null}
      <View
        style={{
          height: multiline ? 80 : 56,
          paddingHorizontal: 15,
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
          gap: 9,
          borderRadius: T.rMd,
          backgroundColor: T.surface,
          borderWidth: 1.5,
          borderColor: T.border,
          paddingTop: multiline ? 12 : 0,
        }}
      >
        {prefix ? (
          <Text
            style={{
              fontFamily: font(600, "en", "num"),
              fontSize: 19,
              color: T.ink2,
            }}
          >
            {prefix}
          </Text>
        ) : null}
        {icon ? <View>{icon}</View> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={T.ink3}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry && !show}
          multiline={multiline}
          style={{
            flex: 1,
            fontSize: 17,
            fontFamily: font(500, locale),
            color: T.ink,
            paddingVertical: 0,
            textAlignVertical: multiline ? "top" : "center",
          }}
          {...inputProps}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setShow((s) => !s)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={show ? "Hide password" : "Show password"}
          >
            {show ? (
              <EyeOff size={18} color={T.ink3} />
            ) : (
              <Eye size={18} color={T.ink3} />
            )}
          </Pressable>
        ) : null}
      </View>
      {hint ? (
        <Text
          style={{
            fontSize: 12.5,
            color: T.ink3,
            marginTop: 6,
            marginLeft: 3,
            fontFamily: font(400, locale),
          }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/* ============================================================
   AmountBox — big centered ₹ amount entry
   ============================================================ */
export function AmountBox({
  value,
  onChangeText,
  autoFocus,
}: {
  value: string;
  onChangeText: (v: string) => void;
  autoFocus?: boolean;
}) {
  const formatted = value
    ? Number(value).toLocaleString("en-IN")
    : "";
  return (
    <View
      style={{
        alignItems: "center",
        paddingVertical: 26,
        paddingHorizontal: 18,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 4 }}>
        <Text
          style={{
            fontFamily: font(500, "en", "num"),
            fontSize: 30,
            color: T.ink2,
            paddingTop: 8,
          }}
        >
          ₹
        </Text>
        <TextInput
          value={formatted}
          onChangeText={(v) => onChangeText(v.replace(/[^\d]/g, ""))}
          placeholder="0"
          placeholderTextColor={T.ink3}
          autoFocus={autoFocus}
          keyboardType="numeric"
          style={{
            fontFamily: font(600, "en", "num"),
            fontSize: 58,
            color: T.ink,
            letterSpacing: -1.16,
            minWidth: 80,
            textAlign: "center",
            paddingVertical: 0,
          }}
        />
      </View>
    </View>
  );
}

/* ============================================================
   Segmented — pill-style 2+ option toggle
   ============================================================ */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  locale = "en",
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  locale?: Locale;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: T.surface2,
        borderWidth: 1,
        borderColor: T.border,
        borderRadius: 999,
        padding: 5,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              height: 38,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? T.accent : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 13.5,
                fontFamily: font(700, locale),
                color: on ? T.onAccent : T.ink2,
              }}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ============================================================
   Row — list row with title + sub on left, value/badge on right
   ============================================================ */
export function Row({
  title,
  sub,
  right,
  onPress,
  selected,
  locale = "en",
}: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
  locale?: Locale;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        paddingHorizontal: 16,
        paddingVertical: 15,
        backgroundColor: T.surface,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? T.accent : T.border,
        borderRadius: T.rMd,
        marginBottom: 10,
        transform: pressed ? [{ scale: 0.985 }] : [],
      })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 15.5,
            fontFamily: font(700, locale),
            letterSpacing: -0.15,
            color: T.ink,
          }}
        >
          {title}
        </Text>
        {sub ? (
          <Text
            style={{
              fontSize: 12.5,
              color: T.ink2,
              marginTop: 2,
              fontFamily: font(500, locale),
            }}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

/* ============================================================
   Badge — pill, tone variants matching the design
   ============================================================ */
export type BadgeTone = "ok" | "warn" | "neg" | "mute";
export function Badge({
  tone = "mute",
  children,
  locale = "en",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  locale?: Locale;
}) {
  const palette: Record<BadgeTone, { bg: string; fg: string; border?: string }> = {
    ok: { bg: T.accentSoft, fg: T.accentInk },
    warn: { bg: "rgba(183, 121, 31, 0.16)", fg: T.warn },
    neg: { bg: "rgba(194, 104, 61, 0.15)", fg: T.neg },
    mute: { bg: T.surface2, fg: T.ink2, border: T.border },
  };
  const p = palette[tone];
  return (
    <View
      style={{
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: p.bg,
        borderWidth: p.border ? 1 : 0,
        borderColor: p.border ?? "transparent",
        alignSelf: "flex-start",
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontFamily: font(700, locale),
          color: p.fg,
          letterSpacing: 0.11,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

/* ============================================================
   InlineErr — error pill with bell icon
   ============================================================ */
export function InlineErr({
  children,
  locale = "en",
}: {
  children: ReactNode;
  locale?: Locale;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        marginTop: 12,
      }}
    >
      <Bell size={15} color={T.neg} />
      <Text
        style={{
          color: T.neg,
          fontSize: 13,
          fontFamily: font(600, locale),
          flex: 1,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

/* ============================================================
   Empty — empty state card with icon + title + sub
   ============================================================ */
export function Empty({
  icon,
  title,
  sub,
  locale = "en",
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  locale?: Locale;
}) {
  return (
    <View style={{ alignItems: "center", padding: 40, paddingHorizontal: 20 }}>
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 18,
          backgroundColor: T.surface2,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        {icon}
      </View>
      <Text
        style={{ fontSize: 16, fontFamily: font(700, locale), color: T.ink }}
      >
        {title}
      </Text>
      {sub ? (
        <Text
          style={{
            fontSize: 13.5,
            color: T.ink2,
            marginTop: 5,
            textAlign: "center",
            fontFamily: font(500, locale),
            lineHeight: 20,
          }}
        >
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/* ============================================================
   PayFullButton — small pill button under amount field
   ============================================================ */
export function PayFullButton({
  amount,
  label,
  onPress,
  locale = "en",
}: {
  amount: string;
  label: string;
  onPress: () => void;
  locale?: Locale;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: "center",
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: T.accentSoft,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        marginTop: -6,
        marginBottom: 4,
        transform: pressed ? [{ scale: 0.96 }] : [],
      })}
    >
      <Text
        style={{
          color: T.accentInk,
          fontFamily: font(700, locale),
          fontSize: 13.5,
        }}
      >
        {label} · {amount}
      </Text>
    </Pressable>
  );
}

/* ============================================================
   Divider
   ============================================================ */
export function Divider() {
  return (
    <View
      style={{ height: 1, backgroundColor: T.border, marginVertical: 16 }}
    />
  );
}

/* ============================================================
   HelperNote — soft tan note card
   ============================================================ */
export function HelperNote({
  children,
  locale = "en",
  style,
}: {
  children: ReactNode;
  locale?: Locale;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: T.surface2,
          borderWidth: 1,
          borderColor: T.border,
          borderRadius: T.rMd,
          padding: 15,
          paddingHorizontal: 15,
          paddingVertical: 13,
        },
        style,
      ]}
    >
      <Text
        style={{
          fontSize: 13,
          color: T.ink2,
          fontFamily: font(500, locale),
          lineHeight: 20,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

/* ============================================================
   Lead — gray intro paragraph at the top of a screen body
   ============================================================ */
export function Lead({
  children,
  locale = "en",
}: {
  children: ReactNode;
  locale?: Locale;
}) {
  return (
    <Text
      style={{
        fontSize: 14.5,
        lineHeight: 22,
        color: T.ink2,
        fontFamily: font(500, locale),
        marginHorizontal: 4,
        marginVertical: 12,
      }}
    >
      {children}
    </Text>
  );
}

/* ============================================================
   OutLine — "Outstanding · Foo  ₹X" stripe inside cards
   ============================================================ */
export function OutLine({
  left,
  right,
  locale = "en",
}: {
  left: string;
  right: string;
  locale?: Locale;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginTop: 14,
        paddingHorizontal: 15,
        paddingVertical: 12,
        backgroundColor: T.surface2,
        borderRadius: T.rSm,
      }}
    >
      <Text
        style={{
          fontSize: 13.5,
          color: T.ink2,
          fontFamily: font(500, locale),
        }}
      >
        {left}
      </Text>
      <Text
        style={{
          fontFamily: font(700, "en", "num"),
          fontSize: 17,
          color: T.ink,
        }}
      >
        {right}
      </Text>
    </View>
  );
}

/* ============================================================
   KV — Key-Value row inside a card
   ============================================================ */
export function KV({
  k,
  v,
  locale = "en",
}: {
  k: string;
  v: ReactNode;
  locale?: Locale;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        paddingVertical: 9,
        borderTopWidth: 1,
        borderTopColor: T.border,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          color: T.ink2,
          fontFamily: font(500, locale),
        }}
      >
        {k}
      </Text>
      <Text
        style={{
          fontSize: 13.5,
          color: T.ink,
          fontFamily: font(600, "en", "num"),
        }}
      >
        {v}
      </Text>
    </View>
  );
}
