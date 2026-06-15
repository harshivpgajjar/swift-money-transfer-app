import { TextInput, type TextInputProps } from "react-native";
import { forwardRef } from "react";

export const Input = forwardRef<TextInput, TextInputProps & { className?: string }>(
  function Input({ className, ...props }, ref) {
    return (
      <TextInput
        ref={ref}
        placeholderTextColor="#a1a1aa"
        className={`h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 ${className ?? ""}`}
        {...props}
      />
    );
  },
);
