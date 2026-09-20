import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { HOME_FOR, useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "./LanguageToggle";
import { Logo } from "./Logo";
import { LinkButton } from "./ui";

export function PublicHeader() {
  const { user } = useAuth();
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Logo />
        <nav className="ml-8 hidden items-center gap-1 text-sm text-ink-2 md:flex">
          <a href="/#how" className="rounded-md px-2.5 py-1.5 transition-colors hover:bg-black/[0.04] hover:text-ink">
            {t("nav.home") === "Home" ? "How it works" : "कैसे काम करता है"}
          </a>
          <Link to="/ask" className="rounded-md px-2.5 py-1.5 transition-colors hover:bg-black/[0.04] hover:text-ink">
            {t("nav.ask")}
          </Link>
          <a href="/#partners" className="rounded-md px-2.5 py-1.5 transition-colors hover:bg-black/[0.04] hover:text-ink">
            {t("auth.role.partner") === "Collection partner" ? "Partners" : "साथी"}
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LanguageToggle compact />
          {user ? (
            <LinkButton to={HOME_FOR[user.role]} size="sm">
              {t("nav.home")}
            </LinkButton>
          ) : (
            <>
              <LinkButton to="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                {t("auth.signIn")}
              </LinkButton>
              <LinkButton to="/register" size="sm">
                {t("auth.signUp")}
              </LinkButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-line bg-canvas">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.6fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">{t("brand.secondary")}</p>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-3">Swacchify</p>
          <ul className="space-y-2 text-muted">
            <li>
              <Link to="/ask" className="transition-colors hover:text-ink">{t("nav.ask")}</Link>
            </li>
            <li>
              <Link to="/register" className="transition-colors hover:text-ink">{t("auth.signUp")}</Link>
            </li>
            <li>
              <Link to="/login" className="transition-colors hover:text-ink">{t("auth.signIn")}</Link>
            </li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-3">{t("auth.role.partner") === "Collection partner" ? "Partners" : "साथी"}</p>
          <ul className="space-y-2 text-muted">
            <li>
              <Link to="/register?role=partner" className="transition-colors hover:text-ink">{t("auth.role.partner")}</Link>
            </li>
            <li>
              <Link to="/register?role=recycler" className="transition-colors hover:text-ink">{t("auth.role.recycler")}</Link>
            </li>
          </ul>
        </div>
      </div>
      <p className="border-t border-line py-5 text-center text-[13px] text-muted">
        © {new Date().getFullYear()} Swacchify · Guidance follows common Indian practice; local rules may vary.
      </p>
    </footer>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}

/** Split layout for sign-in / sign-up screens. */
export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  const { t, lang } = useI18n();
  const points =
    lang === "hi"
      ? ["किसी भी चीज़ के बारे में पूछें — हिन्दी या अंग्रेज़ी में", "सूखे कचरे का दरवाज़े से पिकअप", "सत्यापित वज़न पर पॉइंट", "देखें आपका कचरा कहाँ गया"]
      : ["Ask about any item — in English or Hindi", "Doorstep pickup for dry waste", "Points credited on verified weight", "See which recycler received your material"];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="hidden flex-col justify-between bg-forest-800 p-10 text-white lg:flex">
        <Logo light />
        <div className="max-w-sm">
          <p className="text-3xl leading-tight font-semibold">{t("brand.tagline")}</p>
          <ul className="mt-8 space-y-3.5">
            {points.map((p) => (
              <li key={p} className="flex gap-3 text-[15px] text-brand-100">
                <Check className="mt-0.5 size-4 shrink-0 text-brand-300" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[13px] text-brand-200/80">© {new Date().getFullYear()} Swacchify</p>
      </aside>
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <div className="lg:hidden">
            <Logo />
          </div>
          <LanguageToggle className="ml-auto" />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-12 sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
