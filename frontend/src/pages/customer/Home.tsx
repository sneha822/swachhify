import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  Flame,
  GraduationCap,
  Lightbulb,
  Scale,
  Search,
  Target,
  Truck,
  Volume2,
  VolumeX,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { StatusPill } from "@/components/PickupStatus";
import { Button, Card, IconBox, ProgressBar, SectionTitle, Skeleton, Stat } from "@/components/ui";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, fmtDate, fmtKg, fmtNum, pick, slotLabel } from "@/lib/format";
import { useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useSpeaker } from "@/lib/speech";
import { useToast } from "@/lib/toast";
import type { I18nKey } from "@/i18n/en";
import type { DailyOverview, ImpactSummary, Paged, Pickup, RewardSummary } from "@/lib/types";

const ACTIONS: { to: string; icon: LucideIcon; title: I18nKey; sub: I18nKey }[] = [
  { to: "/app/guide", icon: Search, title: "home.haveWaste", sub: "home.haveWasteSub" },
  { to: "/app/pickups/new", icon: Truck, title: "home.schedule", sub: "home.scheduleSub" },
  { to: "/app/learn", icon: GraduationCap, title: "home.learn", sub: "home.learnSub" },
  { to: "/app/rewards", icon: Wallet, title: "home.rewards", sub: "home.rewardsSub" },
];

export default function Home() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const speaker = useSpeaker(lang);
  useDocumentTitle(t("nav.home"));

  const daily = useQuery({ queryKey: ["daily"], queryFn: () => get<DailyOverview>("/learning/daily") });
  const rewards = useQuery({ queryKey: ["rewards", "summary"], queryFn: () => get<RewardSummary>("/rewards/summary") });
  const impact = useQuery({
    queryKey: ["impact", "me"],
    queryFn: () => get<{ me: ImpactSummary; household: (ImpactSummary & { name: string }) | null }>("/impact/me"),
  });
  const active = useQuery({ queryKey: ["pickups", "active"], queryFn: () => get<Paged<Pickup>>("/pickups?status=active&size=3") });

  const markTip = useMutation({
    mutationFn: () => post<DailyOverview>("/learning/daily/tip-read"),
    onSuccess: (d) => qc.setQueryData(["daily"], d),
  });
  const markChallenge = useMutation({
    mutationFn: () => post<DailyOverview>("/learning/daily/challenge-done"),
    onSuccess: (d) => {
      qc.setQueryData(["daily"], d);
      qc.invalidateQueries({ queryKey: ["rewards"] });
      toast({ tone: "success", title: t("home.challengeCompleted"), body: `+2 ${t("common.points")}` });
    },
  });

  const firstName = user?.full_name.split(" ")[0] ?? "";
  const d = daily.data;
  const summary = impact.data?.household ?? impact.data?.me;
  const subVars = { points: fmtNum(rewards.data?.balance ?? 0), kg: fmtKg(summary?.total_kg ?? 0) };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{fmtDate(new Date().toISOString(), lang, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{t("home.greeting", { name: firstName })}</h1>
        </div>
        <p className="text-sm text-muted">
          {t("common.yourId")} <span className="ml-1 font-mono font-medium text-ink">{user?.public_code}</span>
        </p>
      </header>

      {/* Primary action: the assistant, presented as an ask box. */}
      <Link
        to="/app/ask"
        className="group flex items-center gap-3 rounded-card border border-brand-200 bg-brand-50/60 p-3 transition-colors hover:border-brand-300 hover:bg-brand-50 sm:p-4"
      >
        <IconBox icon={Bot} tone="brand" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t("home.ask")}</span>
          <span className="block text-sm leading-snug text-muted">{t("ai.subtitle")}</span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-brand-700 transition-transform group-hover:translate-x-0.5" />
      </Link>

      <section>
        <h2 className="sr-only">{t("home.question")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ACTIONS.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="flex items-start gap-3 rounded-card border border-line bg-surface p-4 shadow-soft transition-colors hover:border-line-strong hover:bg-canvas/60"
            >
              <IconBox icon={a.icon} size="sm" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t(a.title)}</span>
                <span className="mt-0.5 block text-[13px] text-muted">{t(a.sub, subVars)}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label={t("rewards.balance")} value={fmtNum(rewards.data?.balance ?? 0)} icon={Wallet} tone="brand" />
        <Stat label={t("impact.diverted")} value={fmtKg(summary?.total_kg ?? 0)} icon={Scale} />
        <Stat
          label={t("home.learningStreak")}
          value={t("home.days", { n: d?.streaks.learning.current ?? 0 })}
          icon={Flame}
          tone={d?.streaks.learning.current ? "amber" : "neutral"}
        />
        <Stat label={t("impact.pickups")} value={fmtNum(summary?.pickups ?? 0)} icon={Truck} />
      </section>

      {active.data && active.data.items.length > 0 && (
        <section>
          <SectionTitle
            action={
              <Link to="/app/pickups" className="text-[13px] font-medium text-brand-700 hover:underline">
                {t("common.seeAll")}
              </Link>
            }
          >
            {t("home.activePickup")}
          </SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {active.data.items.map((p) => (
              <Link key={p.code} to={`/app/pickups/${p.code}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-canvas/70">
                <IconBox icon={Truck} tone="sea" size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {fmtDate(p.scheduled_date, lang, { weekday: "short", day: "numeric", month: "short" })} · {slotLabel(p.slot)}
                    </span>
                    <StatusPill status={p.status} />
                  </span>
                  <span className="mt-0.5 block text-[13px] text-muted">
                    <span className="font-mono">{p.code}</span>
                    {p.partner && ` · ${t("pickup.partnerId")} ${p.partner.code}`}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted" />
              </Link>
            ))}
          </Card>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        {daily.isLoading ? (
          <>
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </>
        ) : (
          d && (
            <>
              {d.tip && (
                <Card className="flex flex-col p-4">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="size-4 text-amber-600" />
                    <p className="eyebrow">{t("home.tipTitle")}</p>
                  </div>
                  <p className="mt-2 flex-1 text-[15px] leading-relaxed" lang={lang}>
                    {pick(lang, d.tip.text, d.tip.text_hi)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={d.tip_read ? "soft" : "primary"}
                      disabled={d.tip_read}
                      loading={markTip.isPending}
                      onClick={() => markTip.mutate()}
                      icon={d.tip_read ? <Check className="size-3.5" /> : undefined}
                    >
                      {t("home.gotIt")}
                    </Button>
                    {speaker.supported && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={speaker.speaking ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                        onClick={() => (speaker.speaking ? speaker.stop() : speaker.speak(pick(lang, d.tip!.text, d.tip!.text_hi)))}
                      >
                        {speaker.speaking ? t("common.stop") : t("common.listen")}
                      </Button>
                    )}
                  </div>
                </Card>
              )}
              {d.challenge && (
                <Card className="flex flex-col p-4">
                  <div className="flex items-center gap-2">
                    <Target className="size-4 text-brand-600" />
                    <p className="eyebrow">{t("home.challengeTitle")}</p>
                  </div>
                  <p className="mt-2 flex-1 text-[15px] leading-relaxed" lang={lang}>
                    {pick(lang, d.challenge.text, d.challenge.text_hi)}
                  </p>
                  <div className="mt-4">
                    {d.challenge_done ? (
                      <p className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700">
                        <Check className="size-4" /> {t("home.challengeCompleted")}
                      </p>
                    ) : (
                      <Button size="sm" loading={markChallenge.isPending} onClick={() => markChallenge.mutate()}>
                        {t("home.challengeDone")}
                      </Button>
                    )}
                  </div>
                </Card>
              )}
            </>
          )
        )}
      </section>

      {d && (
        <section>
          <SectionTitle>{t("home.goals")}</SectionTitle>
          <Card className="grid gap-x-10 gap-y-5 p-5 sm:grid-cols-2">
            {(["weekly", "monthly"] as const).map((period) => (
              <div key={period} className="space-y-3">
                <p className="eyebrow">{t(period === "weekly" ? "home.weekly" : "home.monthly")}</p>
                {d.goals[period].map((g) => (
                  <div key={g.key}>
                    <div className="mb-1.5 flex justify-between gap-3 text-[13px]">
                      <span>{pick(lang, g.label, g.label_hi)}</span>
                      <span className={cn("font-medium tabular-nums", g.progress >= g.target ? "text-brand-700" : "text-muted")}>
                        {g.progress}/{g.target}
                      </span>
                    </div>
                    <ProgressBar value={g.progress} max={g.target} label={g.label} />
                  </div>
                ))}
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
