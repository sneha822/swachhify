import { Languages } from "lucide-react";
import { cn } from "@/lib/format";
import { LANGUAGES, useI18n } from "@/lib/i18n";

/** Prominent EN / हि switch — language choice is one tap away everywhere. */
export function LanguageToggle({ className, compact }: { className?: string; compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      className={cn("inline-flex items-center gap-0.5 rounded-xl border border-line bg-white p-0.5", className)}
      role="group"
      aria-label={t("common.language")}
    >
      {!compact && <Languages className="mx-1.5 size-4 text-muted" aria-hidden />}
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          lang={l.code}
          className={cn(
            "h-8 min-w-9 rounded-lg px-2 text-sm font-bold transition",
            lang === l.code ? "bg-brand-700 text-white" : "text-muted hover:text-ink",
          )}
        >
          {compact ? l.short : l.label}
        </button>
      ))}
    </div>
  );
}
