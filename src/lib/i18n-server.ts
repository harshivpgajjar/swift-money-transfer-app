import "server-only";
import { cookies } from "next/headers";
import { DICT, LOCALES, type Locale } from "@/lib/i18n-dict";

export async function getServerLocale(): Promise<Locale> {
  const c = await cookies();
  const raw = c.get("locale")?.value;
  return raw && (LOCALES as string[]).includes(raw) ? (raw as Locale) : "en";
}

export async function getServerT() {
  const locale = await getServerLocale();
  return {
    locale,
    t: (key: string) => DICT[locale][key] ?? DICT.en[key] ?? key,
  };
}
