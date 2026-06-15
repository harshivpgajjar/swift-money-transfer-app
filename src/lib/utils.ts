import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(
  amount: number | string | null | undefined,
  withSymbol = true,
): string {
  if (amount === null || amount === undefined) return "—";
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "—";
  const s = Math.round(n).toLocaleString("en-IN");
  return withSymbol ? "₹" + s : s;
}
