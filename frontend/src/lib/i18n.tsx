import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en, type I18nKey } from "@/i18n/en";
import { hi } from "@/i18n/hi";
import { patch } from "./api";
import { useAuth } from "./auth";
import type { Lang, User } from "./types";

// Adding a language: create src/i18n/<code>.ts typed as Record<I18nKey, string> and register it here.
const DICTS: Record<Lang, Record<I18nKey, string>> = { en, hi };
export const LANGUAGES: { code: Lang; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "hi", label: "हिन्दी", short: "हि" },
];
const KEY = "swacchify.lang";

interface I18nState {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: I18nKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nState | null>(null);

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "hi") return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.startsWith("hi") ? "hi" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();
  const [lang, setLangState] = useState<Lang>(initial);

  // Signed-in users carry their language across devices.
  useEffect(() => {
    if (user?.language) setLangState(user.language);
  }, [user?.id, user?.language]);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l);
      if (user && user.language !== l) patch<User>("/users/me", { language: l }).then(setUser).catch(() => undefined);
    },
    [user, setUser],
  );

  const t = useCallback(
    (key: I18nKey, vars?: Record<string, string | number>) => {
      let s = DICTS[lang][key] ?? en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nState {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n outside I18nProvider");
  return ctx;
}
