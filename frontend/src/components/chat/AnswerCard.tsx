import { AlertTriangle, CheckCircle2, ExternalLink, Gift, Info, Lightbulb, MapPin, PlayCircle, Recycle, Truck, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { buttonStyles } from "@/components/ui";
import { cn } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { ChatAction, ChatPayload } from "@/lib/types";

const ACTION_ICON = { schedule_pickup: Truck, donate: Gift, dropoff: MapPin, learn: PlayCircle, open: ExternalLink };

function Block({ icon, title, tone, children }: { icon: ReactNode; title: string; tone: "green" | "blue" | "red" | "amber" | "gray"; children: ReactNode }) {
  const styles = {
    green: "bg-brand-50 text-brand-700",
    blue: "bg-sea-50 text-sea-700",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-700",
    gray: "bg-canvas text-ink-2",
  }[tone];
  return (
    <div className="flex gap-3">
      <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg", styles)} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="eyebrow">{title}</p>
        <p className="mt-1 text-[15px] leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

export function ActionButtons({ actions, onAction }: { actions: ChatAction[]; onAction: (a: ChatAction) => void }) {
  const { t } = useI18n();
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a, i) => {
        const Icon = ACTION_ICON[a.type] ?? ExternalLink;
        const primary = i === 0 && a.type !== "learn";
        return (
          <button key={`${a.type}-${i}`} onClick={() => onAction(a)} className={buttonStyles(primary ? "primary" : "secondary", "sm")}>
            <Icon className="size-3.5" />
            {a.type === "learn" ? t("ai.action.learn") : t(`ai.action.${a.type}`)}
          </button>
        );
      })}
    </div>
  );
}

/** Structured answer: CATEGORY · WHAT TO DO · WHY · WHAT NOT TO DO · NEXT · LEARN. */
export function AnswerCard({ payload, onAction }: { payload: ChatPayload; onAction: (a: ChatAction) => void }) {
  const { t, lang } = useI18n();
  const card = payload.card!;
  const cat = card.category;
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-soft">
      {cat && (
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg text-xl" style={{ background: `${cat.color}1a` }} aria-hidden>
            {card.item?.emoji ?? cat.emoji}
          </span>
          <div className="min-w-0">
            {card.item && <p className="truncate font-medium">{card.item.name}</p>}
            <p className="flex items-center gap-1.5 text-[13px] text-muted">
              <span className="size-2 rounded-full" style={{ background: cat.color }} aria-hidden />
              {cat.name}
            </p>
          </div>
          {!cat.collectable && (
            <span className="ml-auto hidden rounded-md bg-canvas px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-line-strong ring-inset sm:inline">
              {t("ai.notCollected")}
            </span>
          )}
        </div>
      )}

      <div className="space-y-4 px-4 py-4 sm:px-5" lang={lang}>
        <Block icon={<CheckCircle2 className="size-4" />} title={t("ai.whatToDo")} tone="green">
          {card.what_to_do}
        </Block>
        {card.why && (
          <Block icon={<Info className="size-4" />} title={t("ai.why")} tone="blue">
            {card.why}
          </Block>
        )}
        {card.what_not_to_do && (
          <Block icon={<XCircle className="size-4" />} title={t("ai.whatNot")} tone="red">
            {card.what_not_to_do}
          </Block>
        )}
        {card.safety && (
          <Block icon={<AlertTriangle className="size-4" />} title={t("ai.safety")} tone="amber">
            {card.safety}
          </Block>
        )}
        {card.prep && (
          <Block icon={<Recycle className="size-4" />} title={t("ai.prep")} tone="gray">
            {card.prep}
          </Block>
        )}
        {card.reuse && (
          <Block icon={<Lightbulb className="size-4" />} title={t("ai.reuse")} tone="green">
            {card.reuse}
          </Block>
        )}
        {card.local_note && (
          <p className="flex gap-2 rounded-lg bg-canvas px-3 py-2 text-[13px] leading-relaxed text-muted">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {card.local_note}
          </p>
        )}
      </div>

      {(payload.actions.length > 0 || payload.learn) && (
        <div className="space-y-3 border-t border-line bg-canvas/60 px-4 py-3.5 sm:px-5">
          <p className="eyebrow">{t("ai.next")}</p>
          <ActionButtons actions={payload.actions.filter((a) => a.type !== "learn")} onAction={onAction} />
          {payload.learn && (
            <button
              onClick={() => onAction({ type: "learn", label: payload.learn!.title, params: { lesson: payload.learn!.slug } })}
              className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-2.5 text-left transition-colors hover:border-line-strong hover:bg-canvas"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-canvas text-muted">
                <PlayCircle className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="eyebrow block">{t("ai.learnMore")}</span>
                <span className="mt-0.5 block truncate text-sm font-medium">{payload.learn.title}</span>
              </span>
              <span className="shrink-0 text-[13px] text-muted tabular-nums">{t("learn.sec", { n: payload.learn.duration_sec })}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
