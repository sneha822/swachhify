import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, PartyPopper, RotateCw, XCircle } from "lucide-react";
import { useState } from "react";
import { get, post } from "@/lib/api";
import { cn, pick } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { Quiz, QuizResult } from "@/lib/types";
import { Button, Card, Skeleton } from "./ui";

export function QuizView({ quizId }: { quizId: number }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const { data: quiz } = useQuery({ queryKey: ["quiz", quizId], queryFn: () => get<Quiz>(`/quizzes/${quizId}`) });

  const submit = useMutation({
    mutationFn: () => post<QuizResult>(`/quizzes/${quizId}/attempts`, { answers }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["rewards"] });
      if (r.passed && r.points) toast({ tone: "success", title: t("learn.passed", { points: r.points }) });
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  if (!quiz) return <Skeleton className="h-48" />;
  const byId = new Map(result?.results.map((r) => [r.question_id, r]));
  const complete = quiz.questions.every((q) => answers[q.id] !== undefined);

  return (
    <Card className="p-5 sm:p-6">
      <p className="text-xs font-bold tracking-wide text-brand-700 uppercase">{t("learn.quiz")}</p>
      <div className="mt-3 space-y-6">
        {quiz.questions.map((q, qi) => {
          const r = byId.get(q.id);
          return (
            <fieldset key={q.id} disabled={!!result}>
              <legend className="text-lg font-bold" lang={lang}>
                {qi + 1}. {pick(lang, q.question, q.question_hi)}
              </legend>
              <div className="mt-3 grid gap-2">
                {q.options.map((o, oi) => {
                  const chosen = answers[q.id] === oi;
                  const isCorrect = r && r.correct_index === oi;
                  const isWrongPick = r && chosen && !r.correct;
                  return (
                    <label
                      key={oi}
                      className={cn(
                        "flex min-h-13 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 font-medium transition",
                        !r && chosen && "border-brand-600 bg-brand-50",
                        !r && !chosen && "border-line hover:border-brand-300",
                        isCorrect && "border-brand-600 bg-brand-50",
                        isWrongPick && "border-red-400 bg-red-50",
                        r && !isCorrect && !isWrongPick && "border-line opacity-60",
                      )}
                    >
                      <input type="radio" name={`q${q.id}`} className="size-5 accent-brand-700" checked={chosen} onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))} />
                      <span className="flex-1">{String.fromCharCode(65 + oi)}. {pick(lang, o.text, o.text_hi)}</span>
                      {isCorrect && <CheckCircle2 className="size-5 text-brand-600" />}
                      {isWrongPick && <XCircle className="size-5 text-red-500" />}
                    </label>
                  );
                })}
              </div>
              {r && (
                <p className={cn("mt-3 rounded-xl px-4 py-3 text-[15px]", r.correct ? "bg-brand-50 text-brand-900" : "bg-amber-50 text-amber-900")} role="status">
                  <span className="font-bold">{r.correct ? t("learn.correct") : t("learn.incorrect")} </span>
                  {pick(lang, r.explanation, r.explanation_hi)}
                </p>
              )}
            </fieldset>
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {result ? (
          <>
            <p className="flex items-center gap-2 font-medium">
              {result.passed ? <PartyPopper className="size-4 text-brand-600" /> : <RotateCw className="size-4 text-muted" />}
              {t("learn.score", { score: result.score, total: result.total })}
            </p>
            {!result.passed && (
              <Button variant="secondary" onClick={() => { setResult(null); setAnswers({}); }}>
                {t("learn.tryAgain")}
              </Button>
            )}
          </>
        ) : (
          <Button size="lg" disabled={!complete} loading={submit.isPending} onClick={() => submit.mutate()}>
            {t("learn.check")}
          </Button>
        )}
      </div>
    </Card>
  );
}
