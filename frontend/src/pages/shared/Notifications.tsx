import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, BookOpen, CheckCheck, Flame, Gift, GraduationCap, Lightbulb, Megaphone, Truck, type LucideIcon } from "lucide-react";
import { Link, useLocation } from "react-router";
import { Bell } from "lucide-react";
import { Button, Card, EmptyState, ErrorState, IconBox, PageHeader, Skeleton } from "@/components/ui";
import { get, post } from "@/lib/api";
import { cn, fmtDateTime } from "@/lib/format";
import { useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { AppNotification, Paged } from "@/lib/types";

const ICON: Record<string, LucideIcon> = {
  pickup: Truck,
  reward: Gift,
  badge: Award,
  learning: GraduationCap,
  streak: Flame,
  daily_tip: Lightbulb,
  content: BookOpen,
  campaign: Megaphone,
};

export default function Notifications() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const base = "/" + useLocation().pathname.split("/")[1];
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["notifications", "all"], queryFn: () => get<Paged<AppNotification> & { unread: number }>("/notifications?size=100") });
  useDocumentTitle(t("common.notifications"));

  const readAll = useMutation({ mutationFn: () => post("/notifications/read-all"), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
  const readOne = useMutation({ mutationFn: (id: number) => post(`/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });

  // Deep-link a notification to what it's about.
  const linkFor = (n: AppNotification): string | null => {
    const d = n.data ?? {};
    if (d.pickup_code) return base === "/partner" ? `/partner/pickups/${d.pickup_code}` : base === "/app" ? `/app/pickups/${d.pickup_code}` : null;
    if (d.lesson && base === "/app") return `/app/learn/${d.lesson}`;
    if (d.badge && base === "/app") return "/app/rewards";
    if (d.order) return base === "/admin" ? "/admin/orders" : base === "/recycler" ? "/recycler/orders" : null;
    return null;
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={t("common.notifications")}
        actions={!!data?.unread && <Button variant="secondary" size="sm" icon={<CheckCheck className="size-4" />} onClick={() => readAll.mutate()}>{t("common.markAllRead")}</Button>}
      />
      {error && <ErrorState error={error} onRetry={refetch} />}
      {isLoading && <Skeleton className="h-64" />}
      {data?.items.length === 0 && <EmptyState title={t("common.noNotifications")} />}
      {!!data?.items.length && (
        <Card className="divide-y divide-line overflow-hidden">
          {data.items.map((n) => {
            const to = linkFor(n);
            const body = (
              <>
                <IconBox icon={ICON[n.type] ?? Bell} size="sm" tone={n.read ? "neutral" : "brand"} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{n.title}</span>
                  <span className="block text-sm text-muted">{n.body}</span>
                  <span className="mt-1 block text-xs text-muted">{fmtDateTime(n.created_at, lang)}</span>
                </span>
                {!n.read && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-brand-500" aria-label="Unread" />}
              </>
            );
            const cls = cn("flex gap-3 px-4 py-4 text-left", !n.read && "bg-brand-50/50");
            return to ? (
              <Link key={n.id} to={to} onClick={() => !n.read && readOne.mutate(n.id)} className={cn(cls, "hover:bg-canvas")}>{body}</Link>
            ) : (
              <button key={n.id} onClick={() => !n.read && readOne.mutate(n.id)} className={cn(cls, "w-full")}>{body}</button>
            );
          })}
        </Card>
      )}
    </div>
  );
}
