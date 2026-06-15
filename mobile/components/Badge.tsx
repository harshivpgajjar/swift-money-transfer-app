import { Text, View } from "react-native";

type Tone = "neutral" | "amber" | "green" | "red" | "blue";

const tones: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: "bg-zinc-100", fg: "text-zinc-700" },
  amber: { bg: "bg-amber-100", fg: "text-amber-800" },
  green: { bg: "bg-emerald-100", fg: "text-emerald-800" },
  red: { bg: "bg-red-100", fg: "text-red-700" },
  blue: { bg: "bg-blue-100", fg: "text-blue-700" },
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  const t = tones[tone];
  return (
    <View className={`self-start rounded-full px-2 py-0.5 ${t.bg}`}>
      <Text className={`text-xs font-medium ${t.fg}`}>{children}</Text>
    </View>
  );
}
