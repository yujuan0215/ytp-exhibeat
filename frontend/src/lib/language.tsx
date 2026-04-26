import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type SupportedLocale = "zh-TW" | "en" | "ja" | "zh-CN" | "fr" | "es" | "pt" | "ar" | "hi";

type LanguageContextValue = {
  locale: SupportedLocale;
  setLocale: (next: SupportedLocale) => void;
};

const STORAGE_KEY = "exhibeat_locale";
const DEFAULT_LOCALE: SupportedLocale = "zh-TW";

const SUPPORTED_LOCALES: SupportedLocale[] = ["zh-TW", "en", "ja", "zh-CN", "fr", "es", "pt", "ar", "hi"];

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readInitialLocale(): SupportedLocale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && SUPPORTED_LOCALES.includes(raw as SupportedLocale)) {
      return raw as SupportedLocale;
    }
  } catch {
    // ignore localStorage access issues
  }
  return DEFAULT_LOCALE;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [localeState, setLocaleState] = useState<SupportedLocale>(readInitialLocale);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale: localeState,
      setLocale: (next) => {
        setLocaleState(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // ignore localStorage access issues
        }
      },
    }),
    [localeState],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

export const LOCALE_OPTIONS: Array<{ value: SupportedLocale; label: string }> = [
  { value: "zh-TW", label: "繁體中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "zh-CN", label: "简体中文" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
  { value: "ar", label: "العربية" },
  { value: "hi", label: "हिन्दी" },
];

export function getLocaleCopy<T>(
  locale: SupportedLocale,
  copyByLocale: { "zh-TW": T } & Partial<Record<SupportedLocale, T>>,
): T {
  return copyByLocale[locale] ?? copyByLocale.en ?? copyByLocale["zh-TW"];
}

