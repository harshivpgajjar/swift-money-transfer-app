// Linen theme tokens — single source of truth for color/radius/font.
// Mirrors the design package's [data-theme="linen"] block on web.

import type { Locale } from "./i18n";

export const T = {
  bg: "#F4EFE4",
  bg2: "#EFE8D9",
  surface: "#FFFFFF",
  surface2: "#FBF7EE",
  border: "rgba(40, 50, 45, 0.10)",
  border2: "rgba(40, 50, 45, 0.18)",
  ink: "#1C2620",
  ink2: "#5E6B62",
  ink3: "#93A096",
  accent: "#0E7B57",
  accent2: "#0A5E42",
  onAccent: "#FFFFFF",
  accentSoft: "rgba(14, 123, 87, 0.10)",
  accentInk: "#0E7B57",
  pos: "#0E7B57",
  neg: "#C2683D",
  warn: "#B7791F",
  rSm: 10,
  rMd: 16,
  rLg: 22,
  rXl: 30,
};

export type Weight = 400 | 500 | 600 | 700 | 800;
export type FontKind = "ui" | "num";

const HANKEN: Record<Weight, string> = {
  400: "HankenGrotesk_400Regular",
  500: "HankenGrotesk_500Medium",
  600: "HankenGrotesk_600SemiBold",
  700: "HankenGrotesk_700Bold",
  800: "HankenGrotesk_800ExtraBold",
};

const SPACE: Record<Weight, string> = {
  400: "SpaceGrotesk_400Regular",
  500: "SpaceGrotesk_500Medium",
  600: "SpaceGrotesk_600SemiBold",
  700: "SpaceGrotesk_700Bold",
  800: "SpaceGrotesk_700Bold",
};

const DEV: Record<Weight, string> = {
  400: "NotoSansDevanagari_400Regular",
  500: "NotoSansDevanagari_500Medium",
  600: "NotoSansDevanagari_600SemiBold",
  700: "NotoSansDevanagari_700Bold",
  800: "NotoSansDevanagari_700Bold",
};

const GUJ: Record<Weight, string> = {
  400: "NotoSansGujarati_400Regular",
  500: "NotoSansGujarati_500Medium",
  600: "NotoSansGujarati_600SemiBold",
  700: "NotoSansGujarati_700Bold",
  800: "NotoSansGujarati_700Bold",
};

/** Resolve a font family for a weight + locale + kind. */
export function font(weight: Weight, locale: Locale = "en", kind: FontKind = "ui"): string {
  if (locale === "hi") return DEV[weight];
  if (locale === "gu") return GUJ[weight];
  if (kind === "num") return SPACE[weight];
  return HANKEN[weight];
}
