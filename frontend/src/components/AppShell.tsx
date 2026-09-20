import {
  BarChart3,
  Bot,
  BookOpen,
  Boxes,
  ClipboardCheck,
  Factory,
  FileText,
  GraduationCap,
  Home,
  IndianRupee,
  LogOut,
  Menu,
  MessageSquareText,
  ScrollText,
  Truck,
  User as UserIcon,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import type { I18nKey } from "@/i18n/en";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import type { Role } from "@/lib/types";
import { LanguageToggle } from "./LanguageToggle";
import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";

interface NavItem {
  to: string;
  label: I18nKey | string;
  icon: LucideIcon;
  mobile?: boolean; // shown in the bottom tab bar
  end?: boolean;
  group?: string;
}

const NAV: Record<Role, NavItem[]> = {
  customer: [
    { to: "/app", label: "nav.home", icon: Home, mobile: true, end: true },
    { to: "/app/ask", label: "nav.ask", icon: Bot, mobile: true },
    { to: "/app/pickups", label: "nav.pickup", icon: Truck, mobile: true },
    { to: "/app/learn", label: "nav.learn", icon: GraduationCap, mobile: true },
    { to: "/app/guide", label: "nav.guide", icon: BookOpen },
    { to: "/app/rewards", label: "nav.rewards", icon: Wallet },
    { to: "/app/impact", label: "nav.impact", icon: BarChart3 },
    { to: "/app/household", label: "nav.household", icon: Users },
    { to: "/app/me", label: "nav.me", icon: UserIcon, mobile: true },
  ],
  partner: [
    { to: "/partner", label: "nav.home", icon: Home, mobile: true, end: true },
    { to: "/partner/pickups", label: "partner.assigned", icon: Truck, mobile: true },
    { to: "/partner/earnings", label: "partner.earnings", icon: IndianRupee, mobile: true },
    { to: "/partner/profile", label: "nav.me", icon: UserIcon, mobile: true },
  ],
  recycler: [
    { to: "/recycler", label: "Materials", icon: Boxes, mobile: true, end: true },
    { to: "/recycler/orders", label: "Orders", icon: ClipboardCheck, mobile: true },
    { to: "/recycler/invoices", label: "Invoices", icon: FileText, mobile: true },
    { to: "/recycler/profile", label: "Organisation", icon: Factory, mobile: true },
  ],
  admin: [
    { to: "/admin", label: "Overview", icon: BarChart3, end: true },
    { to: "/admin/pickups", label: "Pickups & verification", icon: Truck, group: "Operations" },
    { to: "/admin/orders", label: "Recycler orders", icon: Factory, group: "Operations" },
    { to: "/admin/payouts", label: "Payouts & rewards", icon: IndianRupee, group: "Operations" },
    { to: "/admin/users", label: "Users & approvals", icon: Users, group: "People" },
    { to: "/admin/audit", label: "Audit log", icon: ScrollText, group: "People" },
    { to: "/admin/ai", label: "AI insights", icon: MessageSquareText, group: "Content" },
    { to: "/admin/knowledge", label: "Knowledge base", icon: BookOpen, group: "Content" },
    { to: "/admin/content", label: "Lessons", icon: GraduationCap, group: "Content" },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  customer: "Household",
  partner: "Collection partner",
  recycler: "Recycling partner",
  admin: "Admin",
};

export function AppShell({ role }: { role: Role }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  useRealtime(!!user);

  useEffect(() => {
    setDrawer(false);
    // Block body: scrollTo returns a Promise in newer Chromium, and effects may only return a cleanup.
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const items = NAV[role];
  const label = (l: string) => (l.includes(".") ? t(l as I18nKey) : l);
  const base = items[0].to;
  const mobileItems = items.filter((i) => i.mobile);
  const groups = [...new Set(items.map((i) => i.group ?? ""))];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between px-5 lg:h-16">
        <Logo to={base} />
        <button className="-mr-2 rounded-md p-2 text-muted hover:bg-canvas lg:hidden" onClick={() => setDrawer(false)} aria-label="Close menu">
          <X className="size-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2" aria-label="Main">
        {groups.map((g) => (
          <div key={g}>
            {g && <p className="eyebrow px-2.5 pb-1.5">{g}</p>}
            <div className="space-y-0.5">
              {items
                .filter((i) => (i.group ?? "") === g)
                .map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        isActive ? "bg-brand-50 font-medium text-brand-800" : "text-ink-2 hover:bg-black/[0.035] hover:text-ink",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon className={cn("size-[18px] shrink-0", isActive ? "text-brand-700" : "text-muted")} />
                        <span className="truncate">{label(item.label)}</span>
                      </>
                    )}
                  </NavLink>
                ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-line p-3">
        {user && (
          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-[13px] font-semibold text-brand-800">
              {user.full_name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{user.full_name}</span>
              <span className="block truncate text-xs text-muted">
                {ROLE_LABEL[role]} · <span className="font-mono">{user.public_code}</span>
              </span>
            </span>
          </div>
        )}
        <button
          onClick={logout}
          className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted transition-colors hover:bg-red-50 hover:text-red-700"
        >
          <LogOut className="size-[18px]" /> {t("common.signOut")}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[999] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lift"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-line bg-surface lg:block">{sidebar}</aside>
      {drawer && (
        <div className="fixed inset-0 z-[850] lg:hidden">
          <div className="absolute inset-0 animate-fade bg-ink/35" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface shadow-lift">{sidebar}</aside>
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:h-16">
          <button className="-ml-2 rounded-md p-2 text-ink transition-colors hover:bg-black/[0.04] lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="lg:hidden">
            <Logo to={base} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LanguageToggle compact />
            <NotificationBell allHref={`${base}/notifications`} />
          </div>
        </div>
      </header>

      <main id="main" className={cn("mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:pt-8", mobileItems.length ? "pb-24 lg:pb-14" : "pb-14")}>
        <Outlet />
      </main>

      {mobileItems.length > 0 && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-sm pb-safe lg:hidden" aria-label="Sections">
          <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}>
            {mobileItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-1 px-1 pt-2 pb-1.5 text-[11px] transition-colors",
                    isActive ? "font-medium text-brand-700" : "text-muted",
                  )
                }
              >
                <item.icon className="size-5" />
                <span className="max-w-full truncate">{label(item.label)}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
