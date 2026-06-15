"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
export {
  DICT,
  LOCALES,
  LOCALE_LABEL,
  fmt,
  type Locale,
} from "./i18n-dict";
import { DICT, type Locale } from "./i18n-dict";

const LOCALE_COOKIE = "locale";
const LOCALE_MAXAGE = 60 * 60 * 24 * 365;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale = "en",
  children,
}: {
  initialLocale?: Locale;
  children: ReactNode;
}) {
  // initialLocale comes from the server-side cookie, so client and server
  // agree at hydration; setLocale keeps cookie and state in sync afterwards.
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    document.cookie = `${LOCALE_COOKIE}=${l};path=/;max-age=${LOCALE_MAXAGE};samesite=lax`;
    document.documentElement.lang = l;
  }, []);

  const t = useCallback(
    (key: string) => DICT[locale][key] ?? DICT.en[key] ?? key,
    [locale],
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useT must be used inside <LocaleProvider>");
  return ctx;
}
