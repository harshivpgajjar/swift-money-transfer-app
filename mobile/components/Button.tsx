import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const variantClasses: Record<Variant, string> = {
  primary: "bg-zinc-900 active:bg-zinc-700",
  secondary: "bg-white border border-zinc-300 active:bg-zinc-100",
  danger: "bg-red-600 active:bg-red-500",
  ghost: "bg-transparent active:bg-zinc-100",
};

const variantText: Record<Variant, string> = {
  primary: "text-white",
  secondary: "text-zinc-900",
  danger: "text-white",
  ghost: "text-zinc-900",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-3",
  md: "h-11 px-4",
};

const sizeText: Record<Size, string> = {
  sm: "text-sm",
  md: "text-base",
};

type Props = Omit<PressableProps, "children"> & {
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

export function Button({
  title,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  className,
  ...rest
}: Props & { className?: string }) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      disabled={isDisabled}
      className={`flex-row items-center justify-center gap-2 rounded-lg ${sizeClasses[size]} ${variantClasses[variant]} ${isDisabled ? "opacity-50" : ""} ${className ?? ""}`}
      {...rest}
    >
      {loading && (
        <ActivityIndicator
          size="small"
          color={variant === "primary" || variant === "danger" ? "#ffffff" : "#18181b"}
        />
      )}
      <Text className={`font-semibold ${sizeText[size]} ${variantText[variant]}`}>
        {title}
      </Text>
    </Pressable>
  );
}
