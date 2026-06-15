import { Text, View } from "react-native";

type Tone = "neutral" | "amber" | "blue";

const valueTone: Record<Tone, string> = {
  neutral: "text-zinc-900",
  amber: "text-amber-700",
  blue: "text-blue-700",
};

export function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <View className="flex-1 rounded-2xl border border-zinc-200 bg-white p-4">
      <Text className="text-xs uppercase tracking-wider text-zinc-500">{label}</Text>
      <Text className={`mt-1 text-2xl font-semibold ${valueTone[tone]}`}>{value}</Text>
    </View>
  );
}
