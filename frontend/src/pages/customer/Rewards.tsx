import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Flame, Gift, GraduationCap, Info, Target, Truck } from "lucide-react";
import { useState } from "react";
import { Award, Sparkles } from "lucide-react";
import { Badge, Button, Card, EmptyState, IconBox, PageHeader, ProgressBar, ProgressRing, Segmented, Skeleton } from "@/components/ui";
import { get, post } from "@/lib/api";
import { cn, fmtDate, fmtNum, pick } from "@/lib/format";
import { useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { Badge as BadgeT, Paged, RewardItem, RewardSummary, RewardTxn } from "@/lib/types";

export default function Rewards() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"redeem" | "badges" | "history">("redeem");
  const summary = useQuery({ queryKey: ["rewards", "summary"], queryFn: () => get<RewardSummary>("/rewards/summary") });
  const catalog = useQuery({ queryKey: ["rewards", "catalog"], queryFn: () => get<RewardItem[]>("/rewards/catalog") });
  const badges = useQuery({ queryKey: ["rewards", "badges"], queryFn: () => get<BadgeT[]>("/rewards/badges"), enabled: tab === "badges" });
  const history = useQuery({ queryKey: ["rewards", "history"], queryFn: () => get<Paged<RewardTxn>>("/rewards/transactions?size=50"), enabled: tab === "history" });
  useDocumentTitle(t("rewards.title"));

  const redeem = useMutation({
    mutationFn: (id: number) => post<RewardSummary>(`/rewards/redeem/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rewards"] });
      toast({ tone: "success", title: t("rewards.redeemed.ok") });
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  const s = summary.data;
  return (
    <div className="space-y-6">
      <PageHeader title={t("rewards.title")} />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-5">
          <p className="eyebrow">{t("rewards.balance")}</p>
          {summary.isLoading ? (
            <Skeleton className="mt-2 h-10 w-32" />
          ) : (
            <p className="mt-1.5 text-4xl font-semibold tracking-tight text-brand-700 tabular-nums">{fmtNum(s?.balance)}</p>
          )}
          <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4 text-sm">
            <div>
              <dt className="text-[13px] text-muted">{t("rewards.earned")}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{fmtNum(s?.total_earned)}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">{t("rewards.redeemed")}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{fmtNum(s?.redeemed)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-[13px] text-muted"><Clock className="size-3.5" />{t("rewards.pending")}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{fmtNum(s?.pending)}</dd>
            </div>
          </dl>
          {!!s?.pending && <p className="mt-4 text-[13px] text-muted">{t("rewards.pendingHint")}</p>}
        </Card>
        <Card className="p-5">
          <p className="font-bold">{t("rewards.howToEarn")}</p>
          <ul className="mt-3 space-y-2.5 text-sm">
            {([
              ["pickup", Truck],
              ["lesson", GraduationCap],
              ["quiz", CheckCircle2],
              ["challenge", Target],
              ["streak", Flame],
            ] as const).map(([k, Icon]) => (
              <li key={k} className="flex items-start gap-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                {t(`rewards.earn.${k}`)}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex gap-2 rounded-xl bg-canvas p-3 text-xs text-muted"><Info className="size-4 shrink-0" />{t("rewards.noMoney")}</p>
        </Card>
      </div>

      <Segmented value={tab} onChange={setTab} options={[
          { value: "redeem", label: t("rewards.catalog") },
          { value: "badges", label: t("rewards.badges") },
          { value: "history", label: t("rewards.history") },
        ]} />

      {tab === "redeem" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}
          {catalog.data?.map((r) => {
            const short = Math.max(0, r.points_cost - (s?.balance ?? 0));
            return (
              <Card key={r.id} className="flex flex-col p-5">
                <span className="grid size-14 place-items-center rounded-xl bg-brand-50 text-3xl" aria-hidden>{r.emoji}</span>
                <p className="mt-3 font-bold">{pick(lang, r.title, r.title_hi)}</p>
                <p className="mt-1 flex-1 text-sm text-muted">{r.description}</p>
                <p className="mt-3 text-lg font-semibold tabular-nums">{fmtNum(r.points_cost)} <span className="text-sm font-semibold text-muted">{t("common.points")}</span></p>
                {short > 0 && <ProgressBar className="mt-2" value={s?.balance ?? 0} max={r.points_cost} label={r.title} />}
                <Button className="mt-4" variant={short ? "secondary" : "primary"} disabled={!!short || !r.in_stock} loading={redeem.isPending && redeem.variables === r.id} onClick={() => redeem.mutate(r.id)} icon={<Gift className="size-4" />}>
                  {short ? t("rewards.need", { n: fmtNum(short) }) : t("rewards.redeem")}
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "badges" && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {badges.isLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}
          {badges.data?.map((b) => (
            <Card key={b.slug} className={cn("flex flex-col items-center p-5 text-center", !b.earned && "bg-white/60")}>
              <ProgressRing value={b.progress} size={84} color={b.earned ? "var(--color-brand-500)" : "var(--color-sea-500)"}>
                <span className={cn("text-3xl", !b.earned && "grayscale opacity-60")} aria-hidden>{b.emoji}</span>
              </ProgressRing>
              <p className="mt-3 leading-tight font-bold">{pick(lang, b.name, b.name_hi)}</p>
              <p className="mt-1 text-xs text-muted">{b.description}</p>
              <div className="mt-2">
                {b.earned ? <Badge tone="green">✓ {fmtDate(b.awarded_at, lang)}</Badge> : <Badge tone="gray">{b.hint}</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "history" && (
        <Card className="divide-y divide-line">
          {history.isLoading && <Skeleton className="m-4 h-32" />}
          {history.data?.items.length === 0 && <div className="p-4"><EmptyState title={t("rewards.history")} /></div>}
          {history.data?.items.map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <IconBox
                size="sm"
                tone={tx.points >= 0 ? "brand" : "amber"}
                icon={{ pickup: Truck, lesson: GraduationCap, quiz: CheckCircle2, challenge: Target, streak: Flame, redeem: Gift, badge: Award }[tx.source] ?? Sparkles}
              />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate font-semibold", tx.status === "cancelled" && "text-muted line-through")}>{tx.description}</p>
                <p className="text-xs text-muted">{fmtDate(tx.created_at, lang)} · {tx.status}</p>
              </div>
              <p className={cn("font-semibold tabular-nums", tx.status === "cancelled" ? "text-muted" : tx.points >= 0 ? "text-brand-700" : "text-amber-700")}>
                {tx.points > 0 ? "+" : ""}{fmtNum(tx.points)}
              </p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
