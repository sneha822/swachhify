import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bot, ChevronDown, Gift, MapPin, Truck } from "lucide-react";
import { useParams } from "react-router";
import { Badge, Card, ErrorState, LinkButton, PageHeader, PageSkeleton } from "@/components/ui";
import { get } from "@/lib/api";
import { pick } from "@/lib/format";
import { useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Category, WasteItem } from "@/lib/types";

export default function CategoryGuide() {
  const { slug } = useParams();
  const { t, lang } = useI18n();
  const { data: c, isLoading, error, refetch } = useQuery({
    queryKey: ["waste", "category", slug],
    queryFn: () => get<Category & { items: WasteItem[] }>(`/waste/categories/${slug}`),
  });
  useDocumentTitle(c ? pick(lang, c.name, c.name_hi) : "");

  if (isLoading) return <PageSkeleton />;
  if (error || !c) return <ErrorState error={error} onRetry={refetch} />;
  const g = c.guidance[lang] ?? c.guidance.en;

  return (
    <div>
      <PageHeader back="/app/guide" title={<span className="flex items-center gap-2"><span aria-hidden>{c.emoji}</span>{pick(lang, c.name, c.name_hi)}</span>} subtitle={pick(lang, c.short, c.short_hi)} />

      {!c.collectable && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 font-semibold text-amber-900">
          <AlertTriangle className="size-5 shrink-0" /> {t("guide.notCollected")}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <p className="font-bold text-brand-800">✅ {t("guide.do")}</p>
          <ul className="mt-2 space-y-2">{g.do.map((x) => <li key={x} className="flex gap-2"><span className="text-brand-600">•</span>{x}</li>)}</ul>
        </Card>
        <Card className="p-5">
          <p className="font-bold text-red-700">🚫 {t("guide.dont")}</p>
          <ul className="mt-2 space-y-2">{g.dont.map((x) => <li key={x} className="flex gap-2"><span className="text-red-500">•</span>{x}</li>)}</ul>
        </Card>
        <Card className="p-5 md:col-span-2" style={{ background: `${c.color}0d` }}>
          <p className="font-bold">💡 {t("guide.why")}</p>
          <p className="mt-1">{g.why}</p>
        </Card>
      </div>

      <div className="my-6 flex flex-wrap gap-2">
        {c.collectable && <LinkButton to={`/app/pickups/new?category=${c.slug}`} icon={<Truck className="size-4" />}>{t("ai.action.schedule_pickup")}</LinkButton>}
        {c.donatable && <LinkButton to={`/app/pickups/new?purpose=donate&category=${c.slug}`} variant="secondary" icon={<Gift className="size-4" />}>{t("ai.action.donate")}</LinkButton>}
        {c.collectable && <LinkButton to={`/app/dropoffs?category=${c.slug}`} variant="secondary" icon={<MapPin className="size-4" />}>{t("ai.action.dropoff")}</LinkButton>}
        <LinkButton to="/app/ask" variant="ghost" icon={<Bot className="size-4" />}>{t("guide.askInstead")}</LinkButton>
      </div>

      <h2 className="mb-3 text-lg font-bold">{t("guide.items")}</h2>
      <div className="space-y-2">
        {c.items.map((it) => (
          <details key={it.slug} className="group rounded-xl border border-line bg-white shadow-soft open:shadow-lift">
            <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
              <span className="text-2xl" aria-hidden>{it.emoji}</span>
              <span className="flex-1 font-semibold">{pick(lang, it.name, it.name_hi)}</span>
              {it.donatable && <Badge tone="purple">🎁 {t("guide.donate")}</Badge>}
              <ChevronDown className="size-5 text-muted transition group-open:rotate-180" />
            </summary>
            <div className="space-y-2 border-t border-line px-4 py-3 text-[15px]">
              <p><span className="font-semibold text-brand-800">{t("ai.whatToDo")}: </span>{it.what_to_do}</p>
              <p><span className="font-semibold text-sea-700">{t("ai.why")}: </span>{it.why}</p>
              <p><span className="font-semibold text-red-700">{t("ai.whatNot")}: </span>{it.what_not_to_do}</p>
              {it.safety_notes && <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">⚠️ {it.safety_notes}</p>}
              {it.reuse_tip && <p className="text-muted">♻️ {it.reuse_tip}</p>}
              {it.local_note && <p className="text-sm text-muted">📍 {it.local_note}</p>}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
