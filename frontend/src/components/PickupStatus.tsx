import { Check } from "lucide-react";
import { cn, fmtDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Pickup, PickupStatus } from "@/lib/types";
import { Badge } from "./ui";

const TONE: Record<PickupStatus, "green" | "blue" | "amber" | "red" | "gray" | "purple"> = {
  requested: "gray",
  assigned: "amber",
  accepted: "blue",
  on_the_way: "blue",
  arrived: "blue",
  collected: "purple",
  verified: "green",
  completed: "green",
  cancelled: "red",
};

export function StatusPill({ status }: { status: PickupStatus }) {
  const { t } = useI18n();
  return <Badge tone={TONE[status]}>{t(`status.${status}`)}</Badge>;
}

/** Visual progress tracker: REQUESTED → … → COMPLETED. Vertical on phones, horizontal on wide screens. */
export function StatusTracker({ pickup }: { pickup: Pickup }) {
  const { t, lang } = useI18n();
  const flow = pickup.flow;
  const cancelled = pickup.status === "cancelled";
  const reached = new Map<string, string>();
  for (const e of pickup.timeline) reached.set(e.status, e.at);
  const currentIdx = cancelled
    ? Math.max(...flow.map((s, i) => (reached.has(s) ? i : -1)))
    : flow.indexOf(pickup.status);

  return (
    <ol className="relative grid gap-0 md:grid-cols-8 md:gap-2" aria-label={t("pickup.timeline")}>
      {flow.map((s, i) => {
        const done = i < currentIdx || (i === currentIdx && (s === "completed" || cancelled));
        const current = i === currentIdx && !done;
        const at = reached.get(s);
        return (
          <li key={s} className="relative flex gap-3 pb-5 last:pb-0 md:flex-col md:items-center md:pb-0 md:text-center">
            {i < flow.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-8 left-[15px] h-[calc(100%-2rem)] w-0.5 md:top-[15px] md:left-[calc(50%+18px)] md:h-0.5 md:w-[calc(100%-36px+0.5rem)]",
                  i < currentIdx ? "bg-brand-500" : "bg-line",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-bold transition",
                done && "border-brand-600 bg-brand-600 text-white",
                current && "border-brand-600 bg-white text-brand-700 ring-4 ring-brand-500/20",
                !done && !current && "border-line bg-white text-muted",
              )}
              aria-current={current ? "step" : undefined}
            >
              {done ? <Check className="size-4" /> : i + 1}
            </span>
            <span className="pt-1 md:pt-0">
              <span className={cn("block text-sm font-semibold", !done && !current && "text-muted")}>{t(`status.${s}`)}</span>
              {at && <span className="block text-xs text-muted">{fmtDateTime(at, lang)}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
