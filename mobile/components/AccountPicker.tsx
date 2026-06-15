import { Pressable, Text, View } from "react-native";
import type { Account } from "../lib/types";

export function AccountPicker({
  accounts,
  value,
  onChange,
}: {
  accounts: Account[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <View className="flex-row gap-2">
      {accounts.map((a) => {
        const active = a.id === value;
        return (
          <Pressable
            key={a.id}
            onPress={() => onChange(a.id)}
            className={`flex-1 rounded-lg border p-3 ${
              active ? "border-zinc-900 bg-zinc-900" : "border-zinc-200 bg-white"
            }`}
          >
            <Text
              className={`text-center text-sm font-semibold ${
                active ? "text-white" : "text-zinc-900"
              }`}
            >
              {a.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
