import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { StatusPill } from "@/components/PickupStatus";
import { EmptyState, ErrorState, LinkButton, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { get } from "@/lib/api";
import { fmtDate, fmtKg, slotLabel } from "@/lib/format";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Paged, Pickup } from "@/lib/types";

export default function Pickups() {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<"active" | "all">("active");
  const { map } = useCategoryMap();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["pickups", tab],
    queryFn: () => get<Paged<Pickup>>(`/pickups?size=50${tab === "active" ? "&status=active" : ""}`),
  });
  useDocumentTitle(t("pickup.myPickups"));

  return (
    <div>
      <PageHeader
        title={t("pickup.myPickups")}
        actions={<LinkButton to="/app/pickups/new" icon={<Plus className="size-4" />}>{t("home.schedule")}</LinkButton>}
      />
      <Segmented className="mb-5" value={tab} onChange={setTab} options={[{ value: "active", label: t("pickup.active") }, { value: "all", label: t("learn.all") }]} />
      {error && <ErrorState error={error} onRetry={refetch} />}
      <div className="space-y-3">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
        {data?.items.length === 0 && (
          <EmptyState title={t("pickup.none")} text={t("pickup.noneSub")} action={<LinkButton to="/app/pickups/new">{t("home.schedule")}</LinkButton>} />
        )}
        {data?.items.map((p) => (
          <Link key={p.code} to={`/app/pickups/${p.code}`} className="flex items-center gap-4 rounded-card border border-line bg-white p-4 shadow-soft transition hover:border-brand-300">
            <div className="flex -space-x-2">
              {p.items.slice(0, 3).map((i) => (
                <span key={i.category} className="grid size-11 place-items-center rounded-xl border-2 border-white text-xl" style={{ background: `${map.get(i.category)?.color ?? "#0b7a3d"}22` }} aria-hidden>
                  {map.get(i.category)?.emoji}
                </span>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={p.status} />
                {p.purpose === "donate" && <span className="text-xs font-semibold text-fuchsia-700">🎁 {t("pickup.purposeLabel.donate")}</span>}
              </div>
              <p className="mt-1 font-semibold">
                {fmtDate(p.scheduled_date, lang, { weekday: "short", day: "numeric", month: "short" })} · {slotLabel(p.slot)}
              </p>
              <p className="text-sm text-muted">
                <span className="font-mono">{p.code}</span> · {fmtKg(p.actual_total_kg ?? p.estimated_total_kg)}
              </p>
            </div>
            <ArrowRight className="size-5 shrink-0 text-muted" />
          </Link>
        ))}
      </div>
    </div>
  );
}
