import { useQuery } from "@tanstack/react-query";
import { Gift, Leaf, Recycle, Scale, Truck } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, EmptyState, ErrorState, LinkButton, PageHeader, PageSkeleton, Segmented, Stat } from "@/components/ui";
import { get } from "@/lib/api";
import { fmtKg, fmtNum, pick } from "@/lib/format";
import { useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { ImpactSummary } from "@/lib/types";

export default function Impact() {
  const { t, lang } = useI18n();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["impact", "me"],
    queryFn: () => get<{ me: ImpactSummary; household: (ImpactSummary & { name: string }) | null }>("/impact/me"),
  });
  const [scope, setScope] = useState<"household" | "me">("household");
  useDocumentTitle(t("impact.title"));

  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const s = scope === "household" && data.household ? data.household : data.me;
  const maxKg = Math.max(...s.by_category.map((c) => c.kg), 1);
  const sorted = [...s.by_category].sort((a, b) => b.kg - a.kg);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("impact.title")}
        actions={data.household && <Segmented value={scope} onChange={setScope} options={[
              { value: "household", label: t("impact.household") },
              { value: "me", label: t("impact.me") },
            ]} />}
      />

      {s.total_kg === 0 ? (
        <EmptyState title={t("impact.empty")} action={<LinkButton to="/app/pickups/new">{t("home.schedule")}</LinkButton>} />
      ) : (
        <>
          <Card className="p-6">
            <p className="eyebrow">{t("impact.diverted")}</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-brand-700 tabular-nums sm:text-5xl">{fmtKg(s.total_kg)}</p>
            <p className="mt-3 max-w-2xl text-ink-2">
              {t(scope === "household" && data.household ? "impact.headline" : "impact.headlineMe", { kg: fmtKg(s.total_kg) })}
            </p>
          </Card>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label={t("impact.recycled")} value={fmtKg(s.recycled_kg)} icon={<Recycle className="size-5" />} />
            <Stat label={t("impact.donated")} value={fmtKg(s.donated_kg)} icon={<Gift className="size-5" />} tone="purple" />
            <Stat label={t("impact.pickups")} value={fmtNum(s.pickups)} icon={<Truck className="size-5" />} tone="blue" />
            <Stat label={t("impact.co2")} value={`~${fmtKg(s.co2e_kg_est, 0)}`} icon={<Leaf className="size-5" />} tone="gray" hint={t("common.estimate")} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <p className="mb-4 font-bold">{t("impact.byCategory")}</p>
              {/* Direct-labelled bars: identity is never colour alone. */}
              <ul className="space-y-3">
                {sorted.map((c) => (
                  <li key={c.category}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2 font-semibold">
                        <span aria-hidden>{c.emoji}</span> {pick(lang, c.name, c.name_hi)}
                      </span>
                      <span className="font-bold tabular-nums">{fmtKg(c.kg)}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-black/[0.05]">
                      <div className="h-full rounded-full" style={{ width: `${(c.kg / maxKg) * 100}%`, background: c.color }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-5">
              <p className="font-bold">{t("impact.monthly")}</p>
              <p className="mb-3 text-sm text-muted">kg</p>
              <div className="h-64" role="img" aria-label={`${t("impact.monthly")}: ${s.monthly.map((m) => `${m.month} ${m.kg} kg`).join(", ")}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.monthly} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e3ece6" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#5b6b62", fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "#5b6b62", fontSize: 12 }} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "rgba(11,122,61,0.06)" }} formatter={(v) => [fmtKg(Number(v)), "kg"]} contentStyle={{ borderRadius: 12, border: "1px solid #e3ece6" }} />
                    <Bar dataKey="kg" fill="#0b9a49" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <details className="rounded-card border border-line bg-white p-5">
            <summary className="flex cursor-pointer items-center gap-2 font-semibold">
              <Scale className="size-5 text-brand-700" /> {t("impact.methodology")}
            </summary>
            <p className="mt-3 text-muted">{s.methodology}</p>
          </details>
        </>
      )}
    </div>
  );
}
