import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { Link, useParams } from "react-router";
import { LessonPlayer } from "@/components/LessonPlayer";
import { QuizView } from "@/components/QuizView";
import { Badge, ErrorState, PageHeader, PageSkeleton } from "@/components/ui";
import { get, post } from "@/lib/api";
import { pick } from "@/lib/format";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { Lesson } from "@/lib/types";

export default function LessonPage() {
  const { slug } = useParams();
  const { t, lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { name } = useCategoryMap();
  const sent = useRef(0);
  const { data: lesson, isLoading, error, refetch } = useQuery({ queryKey: ["lesson", slug], queryFn: () => get<Lesson>(`/learning/lessons/${slug}`) });
  const { data: all } = useQuery({ queryKey: ["lessons"], queryFn: () => get<Lesson[]>("/learning/lessons") });
  useDocumentTitle(lesson ? pick(lang, lesson.title, lesson.title_hi) : "");

  const progress = useMutation({
    mutationFn: (pct: number) => post<{ progress_pct: number; completed: boolean; newly_completed: boolean; points: number }>(`/learning/lessons/${slug}/progress`, { progress_pct: pct }),
    onSuccess: (r) => {
      if (r.newly_completed) {
        toast({ tone: "success", title: t("learn.lessonDone", { points: r.points }) });
        qc.invalidateQueries({ queryKey: ["lessons"] });
        qc.invalidateQueries({ queryKey: ["lesson", slug] });
        qc.invalidateQueries({ queryKey: ["rewards"] });
        qc.invalidateQueries({ queryKey: ["daily"] });
      }
    },
  });

  const reportProgress = progress.mutate;
  useEffect(() => {
    sent.current = 0; // the route component is reused when moving to the next lesson
  }, [slug]);
  // Only report forward progress, and at most once per 25% step.
  const onProgress = useCallback(
    (pct: number) => {
      const step = pct >= 100 ? 100 : Math.floor(pct / 25) * 25;
      if (step > sent.current) {
        sent.current = step;
        reportProgress(step);
      }
    },
    [reportProgress],
  );

  if (isLoading) return <PageSkeleton />;
  if (error || !lesson) return <ErrorState error={error} onRetry={refetch} />;
  const idx = all?.findIndex((l) => l.slug === lesson.slug) ?? -1;
  const next = idx >= 0 ? all?.slice(idx + 1).find((l) => !l.completed) ?? all?.[idx + 1] : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        back="/app/learn"
        title={pick(lang, lesson.title, lesson.title_hi)}
        subtitle={pick(lang, lesson.description, lesson.description_hi)}
        actions={
          <div className="flex gap-2">
            <Badge tone="blue">⏱ {t("learn.sec", { n: lesson.duration_sec })}</Badge>
            <Badge tone="gray">{lesson.category === "general" ? t("learn.general") : name(lesson.category)}</Badge>
            {lesson.completed && <Badge tone="green"><CheckCircle2 className="size-3.5" /> {t("learn.completed")}</Badge>}
          </div>
        }
      />
      <LessonPlayer key={lesson.slug} lesson={lesson} onProgress={onProgress} />
      {lesson.quiz_id && <QuizView key={lesson.quiz_id} quizId={lesson.quiz_id} />}
      {next && (
        <Link to={`/app/learn/${next.slug}`} className="flex items-center gap-4 rounded-card border border-line bg-white p-4 shadow-soft transition hover:border-brand-300">
          <span className="grid size-14 place-items-center rounded-xl bg-brand-50 text-3xl">{next.emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold tracking-wide text-muted uppercase">{t("learn.nextLesson")}</span>
            <span className="block truncate font-bold">{pick(lang, next.title, next.title_hi)}</span>
          </span>
          <ArrowRight className="size-5 text-muted" />
        </Link>
      )}
    </div>
  );
}
