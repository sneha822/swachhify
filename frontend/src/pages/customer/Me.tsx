import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  LogOut,
  MapPin,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Card, IconBox } from "@/components/ui";
import { get } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtNum } from "@/lib/format";
import { useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { I18nKey } from "@/i18n/en";
import type { RewardSummary } from "@/lib/types";

const LINKS: { to: string; icon: LucideIcon; label: I18nKey }[] = [
  { to: "/app/pickups", icon: Truck, label: "nav.pickups" },
  { to: "/app/rewards", icon: Wallet, label: "nav.rewards" },
  { to: "/app/impact", icon: BarChart3, label: "nav.impact" },
  { to: "/app/household", icon: Users, label: "nav.household" },
  { to: "/app/guide", icon: BookOpen, label: "nav.guide" },
  { to: "/app/dropoffs", icon: MapPin, label: "nav.dropoffs" },
  { to: "/app/profile", icon: Settings, label: "nav.profile" },
];

/** Mobile "Me" hub: identity card + everything that isn't in the bottom bar. */
export default function Me() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const { data } = useQuery({ queryKey: ["rewards", "summary"], queryFn: () => get<RewardSummary>("/rewards/summary") });
  useDocumentTitle(t("nav.me"));

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-800">
            {user?.full_name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{user?.full_name}</p>
            <p className="truncate text-sm text-muted">{user?.email}</p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
          <div>
            <dt className="text-[13px] text-muted">{t("common.yourId")}</dt>
            <dd className="mt-0.5 font-mono font-medium">{user?.public_code}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted">{t("rewards.balance")}</dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {fmtNum(data?.balance)} <span className="text-[13px] font-normal text-muted">{t("common.points")}</span>
            </dd>
          </div>
        </dl>
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-canvas px-3 py-2 text-[13px] text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
          Collection partners see this ID, not your name.
        </p>
      </Card>

      <Card className="flex items-center justify-between gap-3 p-4">
        <span className="text-sm font-medium">{t("common.language")}</span>
        <LanguageToggle />
      </Card>

      <Card className="divide-y divide-line overflow-hidden">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="flex items-center gap-3 px-4 py-3.5 text-sm transition-colors hover:bg-canvas/70">
            <IconBox icon={l.icon} size="sm" />
            <span className="flex-1 font-medium">{t(l.label)}</span>
            <ChevronRight className="size-4 text-muted" />
          </Link>
        ))}
      </Card>

      <button
        onClick={logout}
        className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
      >
        <LogOut className="size-4" /> {t("common.signOut")}
      </button>
    </div>
  );
}
