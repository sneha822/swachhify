import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, PlayCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Card, ErrorState, LinkButton, PageHeader, ProgressBar, ProgressRing, Segmented, Skeleton } from "@/components/ui";
import { get } from "@/lib/api";
import { cn, pick } from "@/lib/format";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Lesson } from "@/lib/types";

export default function Learn() {
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState("all");
  const { list: categories, map } = useCategoryMap();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["lessons"], queryFn: () => get<Lesson[]>("/learning/lessons") });
  useDocumentTitle(t("nav.learn"));

  const lessons = (data ?? []).filter((l) => filter === "all" || l.category === filter);
  const done = data?.filter((l) => l.completed).length ?? 0;
  const total = data?.length ?? 0;
  const present = new Set(data?.map((l) => l.category));
  const next = data?.find((l) => !l.completed);

  return (
    <div>
      <PageHeader title={t("learn.title")} subtitle={t("learn.sub")} />

      {data && (
        <Card className="mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <ProgressRing value={total ? done / total : 0} size={56}>
            <span className="text-[13px] font-semibold tabular-nums">{total ? Math.round((done / total) * 100) : 0}%</span>
          </ProgressRing>
          <div className="flex-1">
            <p className="eyebrow">{t("learn.progress")}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {done} / {total} <span className="text-sm font-normal text-muted">{t("learn.completed").toLowerCase()}</span>
            </p>
          </div>
          {next && (
            <LinkButton to={`/app/learn/${next.slug}`} icon={<PlayCircle className="size-4" />}>
              {t("learn.nextLesson")}
            </LinkButton>
          )}
        </Card>
      )}

      <Segmented
        className="mb-5"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: t("learn.all") },
          ...(present.has("general") ? [{ value: "general", label: `📘 ${t("learn.general")}` }] : []),
          ...categories.filter((c) => present.has(c.slug)).map((c) => ({ value: c.slug, label: `${c.emoji} ${pick(lang, c.name, c.name_hi)}` })),
        ]}
      />

      {error && <ErrorState error={error} onRetry={refetch} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-64" />)}
        {lessons.map((l) => {
          const cat = map.get(l.category);
          return (
            <Link
              key={l.slug}
              to={`/app/learn/${l.slug}`}
              className="overflow-hidden rounded-card border border-line bg-surface shadow-soft transition-colors hover:border-line-strong"
            >
              <div
                className="relative grid aspect-[16/9] place-items-center text-5xl"
                style={{ background: `${cat?.color ?? "#1f6d46"}0f` }}
              >
                <span aria-hidden>{l.emoji}</span>
                <span className="absolute right-2.5 bottom-2.5 rounded bg-ink/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">{t("learn.sec", { n: l.duration_sec })}</span>
                {l.completed ? (
                  <CheckCircle2 className="absolute top-2.5 right-2.5 size-5 fill-surface text-brand-600" aria-label={t("learn.completed")} />
                ) : (
                  <PlayCircle className="absolute inset-0 m-auto size-14 text-white opacity-0 drop-shadow transition group-hover:opacity-100" aria-hidden />
                )}
              </div>
              <div className="p-4">
                <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted uppercase"><span className="size-2 rounded-full" style={{ background: cat?.color ?? "var(--color-brand-600)" }} aria-hidden />
                  {cat ? pick(lang, cat.name, cat.name_hi) : t("learn.general")}
                </p>
                <p className="mt-1.5 leading-snug font-medium">{pick(lang, l.title, l.title_hi)}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{pick(lang, l.description, l.description_hi)}</p>
                <div className="mt-3 flex items-center gap-3">
                  <ProgressBar value={l.progress_pct} className="flex-1" label={pick(lang, l.title, l.title_hi)} />
                  <span className={cn("text-xs font-bold", l.completed ? "text-brand-700" : "text-muted")}>
                    {l.completed ? t("learn.completed") : l.progress_pct ? t("learn.continue") : `+${l.points}`}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
