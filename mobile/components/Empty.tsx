import { Text, View } from "react-native";

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10">
      <Text className="text-center text-sm font-medium text-zinc-900">{title}</Text>
      {body && (
        <Text className="mt-1 text-center text-xs text-zinc-500">{body}</Text>
      )}
    </View>
  );
}
