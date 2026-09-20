import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Bot,
  CircleHelp,
  GraduationCap,
  Lightbulb,
  MessageSquareText,
  Split,
  ThumbsDown,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, EmptyState, ErrorState, LinkButton, PageHeader, PageSkeleton, Segmented, Stat } from "@/components/ui";
import { get, qs } from "@/lib/api";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import { cn, fmtDateTime, fmtNum, timeAgo } from "@/lib/format";

interface Analytics {
  total_questions: number;
  conversations: number;
  by_source: Partial<Record<"knowledge_base" | "ai", number>>;
  helpful_rate: number | null;
  rated: number;
  top_items: { item: string; name: string; count: number }[];
  top_categories: { category: string; name: string; count: number }[];
  confused_items: { item: string; name: string; count: number }[];
  unanswered: { question: string; at: string }[];
  negative_feedback: { question: string; answer: string; note: string | null; at: string }[];
  quiz_struggles: { question: string; wrong_pct: number; attempts: number }[];
}

type Days = "7" | "30" | "90";
const C = { brand: "#1f6d46", sea: "#2a78d6", grid: "#e5eae7", axis: "#66756d" };

function Panel({
  title,
  subtitle,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card as="section" className={cn("p-4 sm:p-5", className)} aria-label={title}>
      <div className="mb-3 flex items-start gap-2">
        {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted">{children}</p>;
}

function TopItemsTip({ active, payload }: { active?: boolean; payload?: readonly { value?: unknown; payload?: { name: string } }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] shadow-lift">
      <p className="font-medium">{payload[0].payload?.name}</p>
      <p className="text-muted">
        <span className="font-medium text-ink tabular-nums">{fmtNum(Number(payload[0].value ?? 0))}</span> answers
      </p>
    </div>
  );
}

export default function AdminAI() {
  useDocumentTitle("AI insights");
  const [days, setDays] = useState<Days>("30");
  const cats = useCategoryMap();
  const q = useQuery({
    queryKey: ["admin", "ai", days],
    queryFn: () => get<Analytics>(`/admin/ai/analytics${qs({ days })}`),
    placeholderData: keepPreviousData,
  });

  const header = (
    <PageHeader
      title="AI insights"
      subtitle="What households ask the assistant, where it struggles, and what to teach next."
      actions={
        <Segmented<Days>
          value={days}
          onChange={setDays}
          options={[
            { value: "7", label: "7 days" },
            { value: "30", label: "30 days" },
            { value: "90", label: "90 days" },
          ]}
        />
      }
    />
  );

  if (q.isPending)
    return (
      <div>
        {header}
        <PageSkeleton />
      </div>
    );
  if (q.isError)
    return (
      <div>
        {header}
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </div>
    );

  const a = q.data;
  const kb = a.by_source.knowledge_base ?? 0;
  const ai = a.by_source.ai ?? 0;
  const answered = kb + ai;
  const kbPct = answered ? Math.round((100 * kb) / answered) : 0;
  const maxCat = Math.max(1, ...a.top_categories.map((c) => c.count));
  const topItems = a.top_items.map((t) => ({ ...t, countLabel: fmtNum(t.count) }));

  return (
    <div className={cn("space-y-6 transition-opacity", q.isPlaceholderData && "opacity-60")}>
      {header}

      <Card as="aside" className="flex gap-3 p-4">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-medium">How to use this page</p>
          <p className="text-[13px] text-ink-2">
            Every unanswered, confusing or down-voted question is a content gap. Add or improve a{" "}
            <span className="font-medium text-ink">knowledge base entry</span> so the assistant can answer with a verified rule, and create a short{" "}
            <span className="font-medium text-ink">lesson</span> for topics people keep getting wrong in quizzes.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <LinkButton to="/admin/knowledge" size="sm" variant="secondary" icon={<BookOpen className="size-4" />}>
              Knowledge base
            </LinkButton>
            <LinkButton to="/admin/content" size="sm" variant="secondary" icon={<GraduationCap className="size-4" />}>
              Learning content
            </LinkButton>
          </div>
        </div>
      </Card>

      {a.total_questions === 0 ? (
        <EmptyState icon={MessageSquareText} title="No questions in this period" text="Try a longer time range." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Questions answered" value={fmtNum(a.total_questions)} icon={MessageSquareText} tone="brand" />
            <Stat label="Conversations" value={fmtNum(a.conversations)} icon={Bot} tone="sea" />
            <Stat
              label="Helpful rate"
              value={a.helpful_rate == null ? "—" : `${a.helpful_rate}%`}
              icon={ThumbsUp}
              hint={a.rated ? `From ${fmtNum(a.rated)} rated answers` : "No ratings yet"}
            />
            <Stat label="From knowledge base" value={`${kbPct}%`} icon={BookOpen} hint={`${fmtNum(kb)} verified · ${fmtNum(ai)} AI-generated`} />
          </div>

          <Panel
            title="Answers by source"
            subtitle="Share of answers drawn from curated rules versus generated by the model, in counts"
            icon={Split}
          >
            {answered ? (
              <>
                <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${kbPct}% knowledge base, ${100 - kbPct}% AI`}>
                  {kb > 0 && <div className="h-full rounded-l-full" style={{ width: `${kbPct}%`, background: C.brand }} />}
                  {ai > 0 && <div className="h-full rounded-r-full" style={{ width: `${100 - kbPct}%`, background: C.sea }} />}
                </div>
                <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
                  <li className="flex items-center gap-2">
                    <span className="size-2 rounded-sm" style={{ background: C.brand }} aria-hidden /> Knowledge base
                    <span className="font-medium tabular-nums">{fmtNum(kb)}</span>
                    <span className="text-muted tabular-nums">({kbPct}%)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-2 rounded-sm" style={{ background: C.sea }} aria-hidden /> AI
                    <span className="font-medium tabular-nums">{fmtNum(ai)}</span>
                    <span className="text-muted tabular-nums">({100 - kbPct}%)</span>
                  </li>
                </ul>
              </>
            ) : (
              <Quiet>No answers yet.</Quiet>
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-5">
            <Panel title="Most asked items" subtitle="Items the assistant answered about most, in answers" className="lg:col-span-3">
              {topItems.length ? (
                <>
                  <div style={{ height: Math.max(160, topItems.length * 34 + 16) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topItems} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                        <CartesianGrid horizontal={false} stroke={C.grid} />
                        <XAxis type="number" hide allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={150} interval={0} tickLine={false} axisLine={false} tick={{ fill: C.axis, fontSize: 12 }} />
                        <Tooltip cursor={{ fill: "rgb(16 22 19 / 0.04)" }} content={<TopItemsTip />} />
                        <Bar dataKey="count" name="Answers" fill={C.brand} radius={[0, 3, 3, 0]} maxBarSize={18}>
                          <LabelList dataKey="countLabel" position="right" fill={C.axis} fontSize={12} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer rounded-md py-1 text-[13px] text-muted transition-colors hover:text-ink">
                      View data table
                    </summary>
                    <table className="mt-2 w-full text-left text-[13px]">
                      <thead>
                        <tr className="border-b border-line">
                          <th scope="col" className="eyebrow py-2">Item</th>
                          <th scope="col" className="eyebrow py-2 text-right">Answers</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {topItems.map((t) => (
                          <tr key={t.item}>
                            <td className="py-2">{t.name}</td>
                            <td className="py-2 text-right tabular-nums">{fmtNum(t.count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </>
              ) : (
                <Quiet>No item-specific answers yet.</Quiet>
              )}
            </Panel>

            <Panel title="Top categories" subtitle="Which waste streams people ask about, in questions" className="lg:col-span-2">
              {a.top_categories.length ? (
                <ul className="divide-y divide-line">
                  {a.top_categories.map((c) => {
                    const cat = cats.map.get(c.category);
                    return (
                      <li key={c.category} className="py-2.5">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate">
                            <span aria-hidden>{cat?.emoji ?? ""}</span> {c.name}
                          </span>
                          <span className="shrink-0 font-medium tabular-nums">{fmtNum(c.count)}</span>
                        </div>
                        <div className="mt-1.5 h-1 rounded-full bg-black/[0.06]" aria-hidden>
                          <div className="h-full rounded-full" style={{ width: `${(100 * c.count) / maxCat}%`, background: cat?.color ?? C.brand }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Quiet>No category data yet.</Quiet>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Frequently confused items" subtitle="The assistant had to ask a clarifying question" icon={Split}>
              {a.confused_items.length ? (
                <ul className="divide-y divide-line">
                  {a.confused_items.map((c) => (
                    <li key={c.item} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span>{c.name}</span>
                      <span className="text-muted tabular-nums">
                        <span className="font-medium text-ink">{fmtNum(c.count)}</span> clarifications
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Quiet>No clarifications needed — nice.</Quiet>
              )}
            </Panel>

            <Panel title="Unanswered or low-confidence" subtitle="Candidates for new knowledge base entries" icon={CircleHelp}>
              {a.unanswered.length ? (
                <ul className="divide-y divide-line">
                  {a.unanswered.map((u, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0">“{u.question || "(question not captured)"}”</span>
                      <time className="shrink-0 text-xs text-muted tabular-nums" dateTime={u.at} title={fmtDateTime(u.at)}>
                        {timeAgo(u.at)}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : (
                <Quiet>Every question was answered confidently.</Quiet>
              )}
            </Panel>
          </div>

          <Panel title="Negative feedback" subtitle="Answers users marked as not helpful" icon={ThumbsDown}>
            {a.negative_feedback.length ? (
              <ul className="space-y-2">
                {a.negative_feedback.map((n, i) => (
                  <li key={i} className="rounded-lg border border-line p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">“{n.question || "(question not captured)"}”</p>
                      <time className="shrink-0 text-xs text-muted tabular-nums" dateTime={n.at} title={fmtDateTime(n.at)}>
                        {timeAgo(n.at)}
                      </time>
                    </div>
                    <p className="mt-1 line-clamp-3 text-[13px] text-muted">{n.answer}</p>
                    {n.note && (
                      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                        <span className="font-medium">User note:</span> {n.note}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Quiet>No negative feedback in this period.</Quiet>
            )}
          </Panel>
        </>
      )}

      <Panel title="Topics users struggle with" subtitle="Quiz questions answered wrong most often, in % wrong" icon={GraduationCap}>
        {a.quiz_struggles.length ? (
          <ul className="divide-y divide-line">
            {a.quiz_struggles.map((s, i) => (
              <li key={i} className="py-2.5">
                <div className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">{s.question}</span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="font-medium">{s.wrong_pct}%</span> <span className="text-muted">wrong</span>
                    <span className="block text-xs text-muted">{fmtNum(s.attempts)} attempts</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-black/[0.06]" role="img" aria-label={`${s.wrong_pct}% answered wrong`}>
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${s.wrong_pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Quiet>No quiz attempts in this period.</Quiet>
        )}
      </Panel>
    </div>
  );
}
