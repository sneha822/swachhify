import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bot, Check, Gift, Search, X } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Link } from "react-router";
import { Badge, Card, IconBox, LinkButton, PageHeader, Skeleton } from "@/components/ui";
import { get } from "@/lib/api";
import { pick } from "@/lib/format";
import { useCategories, useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { WasteItem } from "@/lib/types";

/** "I have waste" — pick a category or search an item. */
export default function Guide() {
  const { t, lang } = useI18n();
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const { data: categories, isLoading } = useCategories();
  const { map } = useCategoryMap();
  const results = useQuery({
    queryKey: ["waste", "search", query],
    queryFn: ({ signal }) => get<WasteItem[]>(`/waste/items?q=${encodeURIComponent(query)}`, signal),
    enabled: query.length >= 2,
  });
  useDocumentTitle(t("nav.guide"));

  return (
    <div>
      <PageHeader title={t("guide.title")} subtitle={t("guide.sub")} />
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
        <label htmlFor="guide-search" className="sr-only">{t("guide.search")}</label>
        <input
          id="guide-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("guide.search")}
          className="h-12 w-full rounded-lg border border-line-strong bg-surface pr-4 pl-11 text-[15px] outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </div>

      {query.length >= 2 ? (
        <div className="space-y-3">
          {results.isLoading && <Skeleton className="h-20" />}
          {results.data?.map((it) => {
            const cat = map.get(it.category);
            return (
              <Card key={it.slug} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg text-xl" style={{ background: `${cat?.color}1a` }} aria-hidden>
                    {it.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{pick(lang, it.name, it.name_hi)}</p>
                      {cat && <Badge tone="gray"><span className="size-2 rounded-full" style={{ background: cat.color }} aria-hidden />{pick(lang, cat.name, cat.name_hi)}</Badge>}
                      {it.donatable && <Badge tone="purple"><Gift className="size-3" />{t("guide.donate")}</Badge>}
                    </div>
                    {it.has_clarify ? (
                      <Link to={`/app/ask?q=${encodeURIComponent(it.name)}`} className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">
                        {t("guide.askInstead")} <ArrowRight className="size-3.5" />
                      </Link>
                    ) : (
                      <>
                        <p className="mt-1.5 flex gap-1.5 text-[13px] leading-relaxed"><Check className="mt-0.5 size-3.5 shrink-0 text-brand-600" />{it.what_to_do}</p>
                        <p className="mt-1 flex gap-1.5 text-[13px] leading-relaxed text-muted"><X className="mt-0.5 size-3.5 shrink-0 text-red-500" />{it.what_not_to_do}</p>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
          {results.data && results.data.length === 0 && (
            <Card className="p-6 text-center">
              <p className="text-sm text-muted">No match for “{query}”</p>
              <LinkButton to={`/app/ask?q=${encodeURIComponent(query)}`} className="mt-3" icon={<Bot className="size-4" />}>
                {t("guide.askInstead")}
              </LinkButton>
            </Card>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {isLoading && [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-40" />)}
            {categories?.map((c) => (
              <Link
                key={c.slug}
                to={`/app/guide/${c.slug}`}
                className="flex flex-col rounded-card border border-line bg-surface p-4 shadow-soft transition-colors hover:border-line-strong hover:bg-canvas/60"
              >
                <span className="grid size-10 place-items-center rounded-lg text-xl" style={{ background: `${c.color}1a` }} aria-hidden>
                  {c.emoji}
                </span>
                <span className="mt-3 block font-medium">{pick(lang, c.name, c.name_hi)}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">{pick(lang, c.short, c.short_hi)}</span>
                {!c.collectable && (
                  <span className="mt-2.5 inline-flex w-fit rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200/70 ring-inset">
                    {t("ai.notCollected")}
                  </span>
                )}
              </Link>
            ))}
          </div>
          <Link
            to="/app/ask"
            className="mt-4 flex items-center gap-3 rounded-card border border-brand-200 bg-brand-50/60 p-4 transition-colors hover:bg-brand-50"
          >
            <IconBox icon={Bot} tone="brand" size="sm" />
            <span className="text-sm font-medium">{t("guide.askInstead")}</span>
          </Link>
        </>
      )}
    </div>
  );
}
