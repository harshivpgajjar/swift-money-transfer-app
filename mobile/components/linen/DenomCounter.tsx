import { Pressable, Text, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { T, font } from "../../lib/theme";
import { useT, format as fmt, type Locale } from "../../lib/i18n";

export const DENOMS = [500, 200, 100, 50, 20, 10] as const;
export type DenomCounts = Partial<Record<(typeof DENOMS)[number], number>>;

export function denomTotal(counts: DenomCounts): number {
  return DENOMS.reduce((s, d) => s + d * (counts[d] ?? 0), 0);
}
export function denomCountNotes(counts: DenomCounts): number {
  return DENOMS.reduce((s, d) => s + (counts[d] ?? 0), 0);
}

export function DenomCounter({
  counts,
  onChange,
  locale = "en",
}: {
  counts: DenomCounts;
  onChange: (next: DenomCounts) => void;
  locale?: Locale;
}) {
  const { t } = useT();
  const total = denomTotal(counts);
  const totalNotes = denomCountNotes(counts);

  const inc = (d: (typeof DENOMS)[number]) =>
    onChange({ ...counts, [d]: (counts[d] ?? 0) + 1 });
  const dec = (d: (typeof DENOMS)[number]) => {
    const next = Math.max(0, (counts[d] ?? 0) - 1);
    onChange({ ...counts, [d]: next });
  };

  return (
    <View>
      {/* Header: big total + N notes counted */}
      <View style={{ alignItems: "center", paddingVertical: 22, paddingHorizontal: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 4 }}>
          <Text
            style={{
              fontFamily: font(500, "en", "num"),
              fontSize: 22,
              color: T.ink2,
              paddingTop: 8,
            }}
          >
            ₹
          </Text>
          <Text
            style={{
              fontFamily: font(700, "en", "num"),
              fontSize: 46,
              color: T.ink,
              letterSpacing: -0.92,
              lineHeight: 52,
              minWidth: 60,
              textAlign: "center",
            }}
          >
            {total.toLocaleString("en-IN")}
          </Text>
        </View>
        <Text
          style={{
            marginTop: 6,
            fontSize: 12.5,
            color: T.ink3,
            fontFamily: font(600, locale),
          }}
        >
          {fmt(t("cash.notes_counted"), { n: totalNotes })}
        </Text>
      </View>

      {/* Denomination rows */}
      {DENOMS.map((d) => {
        const count = counts[d] ?? 0;
        const active = count > 0;
        const lineTotal = d * count;
        return (
          <View
            key={d}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 10,
              gap: 12,
              borderTopWidth: 1,
              borderTopColor: T.border,
            }}
          >
            {/* Chip */}
            <View
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? "transparent" : T.border,
                backgroundColor: active ? T.accentSoft : T.surface2,
                minWidth: 72,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: font(700, "en", "num"),
                  fontSize: 14.5,
                  color: active ? T.accentInk : T.ink2,
                }}
              >
                ₹{d}
              </Text>
            </View>

            {/* Stepper */}
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
              }}
            >
              <CircleBtn onPress={() => dec(d)} disabled={count === 0}>
                <Minus size={18} color={count === 0 ? T.ink3 : T.ink} strokeWidth={2.4} />
              </CircleBtn>
              <Text
                style={{
                  fontFamily: font(700, "en", "num"),
                  fontSize: 18,
                  color: T.ink,
                  minWidth: 24,
                  textAlign: "center",
                }}
              >
                {count}
              </Text>
              <CircleBtn onPress={() => inc(d)}>
                <Plus size={18} color={T.ink} strokeWidth={2.4} />
              </CircleBtn>
            </View>

            {/* Line total */}
            <Text
              style={{
                fontFamily: font(active ? 700 : 500, "en", "num"),
                fontSize: 14.5,
                color: active ? T.ink : T.ink3,
                minWidth: 60,
                textAlign: "right",
              }}
            >
              {active ? "₹" + lineTotal.toLocaleString("en-IN") : "—"}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function CircleBtn({
  children,
  onPress,
  disabled,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: T.surface,
        borderWidth: 1,
        borderColor: T.border,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        transform: pressed && !disabled ? [{ scale: 0.94 }] : [],
      })}
    >
      {children}
    </Pressable>
  );
}
