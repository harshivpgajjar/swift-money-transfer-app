import { View, Text, type ViewProps } from "react-native";

export function Card({ className, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={`rounded-2xl border border-zinc-200 bg-white ${className ?? ""}`}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View className="border-b border-zinc-200 px-4 py-3">
      <Text className="text-base font-semibold text-zinc-900">{title}</Text>
      {subtitle && <Text className="mt-0.5 text-xs text-zinc-500">{subtitle}</Text>}
    </View>
  );
}

export function CardBody({
  className,
  ...props
}: ViewProps & { className?: string }) {
  return <View className={`p-4 ${className ?? ""}`} {...props} />;
}
