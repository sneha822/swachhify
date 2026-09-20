import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  IndianRupee,
  MapPin,
  Package,
  Search,
  ShieldAlert,
  Truck,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { StatusPill } from "@/components/PickupStatus";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconBox,
  LinkButton,
  Modal,
  PageSkeleton,
  SectionTitle,
  Skeleton,
  Stat,
  Toggle,
} from "@/components/ui";
import { get, patch, post, qs } from "@/lib/api";
import { cn, fmtDate, fmtKg, fmtMoney, pick, toISODate } from "@/lib/format";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { Lang, Pickup } from "@/lib/types";

// ── Shared partner helpers (also used by PartnerPickups / PartnerPickup / PartnerProfile) ─────
export type VerificationStatus = "pending" | "verified" | "rejected";

export interface PartnerMe {
  code: string;
  full_name: string;
  vehicle_type: string | null;
  vehicle_number: string | null;
  service_radius_km: number;
  base_lat: number | null;
  base_lng: number | null;
  is_available: boolean;
  verification_status: VerificationStatus;
  rating_avg: number;
  rating_count: number;
  stats?: {
    today: number;
    pending: number;
    completed: number;
    earnings_today: number;
    earnings_total: number;
  };
}

export type PickupScope = "assigned" | "nearby" | "history";

export function usePartnerMe() {
  return useQuery({ queryKey: ["partner", "me"], queryFn: () => get<PartnerMe>("/partners/me") });
}

export function usePartnerPickups(scope: PickupScope, enabled = true) {
  return useQuery({
    queryKey: ["partner", "pickups", scope],
    queryFn: () => get<Pickup[]>(`/partners/pickups${qs({ scope })}`),
    enabled,
  });
}

// ── Map markers ──────────────────────────────────────────────────────────────
// MapView draws its pin glyph as raw HTML, so we hand it an inline icon rather
// than an emoji. Same shapes as the lucide icons used elsewhere on the page.
const marker = (paths: string, color = "#175939") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const PIN_HOME = marker(
  '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
);
export const PIN_PACKAGE = marker(
  '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
);
export const PIN_VEHICLE = marker(
  '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  "#1f62b4",
);

/** Pin ring colours, kept to the two accents in the palette. */
export const PIN_BRAND = "#1f6d46";
export const PIN_SEA = "#1f62b4";

const SLOT_LABELS: Record<string, [string, string]> = {
  "08-10": ["8–10 AM", "सुबह 8–10"],
  "10-12": ["10 AM–12 PM", "सुबह 10–दोपहर 12"],
  "12-14": ["12–2 PM", "दोपहर 12–2"],
  "14-16": ["2–4 PM", "दोपहर 2–4"],
  "16-18": ["4–6 PM", "शाम 4–6"],
};

export function slotLabel(slot: string, lang: Lang) {
  const l = SLOT_LABELS[slot];
  return l ? pick(lang, l[0], l[1]) : slot;
}

export function dayLabel(iso: string, lang: Lang) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (iso === toISODate(today)) return pick(lang, "Today", "आज");
  if (iso === toISODate(tomorrow)) return pick(lang, "Tomorrow", "कल");
  return fmtDate(iso, lang, { weekday: "short", day: "numeric", month: "short" });
}

/** Waste-category glyph from the API, on a faint tint of the category colour. */
export function CategoryGlyph({ slug, size = "sm" }: { slug: string; size?: "sm" | "md" }) {
  const cats = useCategoryMap();
  const c = cats.map.get(slug);
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg",
        size === "sm" ? "size-8 text-base" : "size-10 text-lg",
        c?.color ? "" : "bg-canvas text-muted",
      )}
      style={c?.color ? { backgroundColor: `${c.color}1a` } : undefined}
      aria-hidden
    >
      {c?.emoji ?? <Package className={size === "sm" ? "size-4" : "size-[18px]"} />}
    </span>
  );
}

/** Accept / decline an offered pickup. */
export function useRespond(code: string, onDone?: (accepted: boolean) => void) {
  const qc = useQueryClient();
  const toast = useToast();
  const { lang } = useI18n();
  return useMutation({
    mutationFn: (v: { accept: boolean; reason?: string }) =>
      post<Pickup>(`/partners/pickups/${encodeURIComponent(code)}/respond`, { accept: v.accept, reason: v.reason ?? null }),
    onSuccess: (p, v) => {
      if (v.accept) qc.setQueryData(["partner", "pickup", code], p);
      else qc.removeQueries({ queryKey: ["partner", "pickup", code] });
      qc.invalidateQueries({ queryKey: ["partner", "pickups"] });
      qc.invalidateQueries({ queryKey: ["partner", "me"] });
      toast({
        tone: "success",
        title: v.accept ? pick(lang, "Pickup accepted", "पिकअप स्वीकार किया") : pick(lang, "Pickup declined", "पिकअप मना किया"),
      });
      onDone?.(v.accept);
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });
}

const DECLINE_REASONS: [string, string][] = [
  ["Too far", "बहुत दूर है"],
  ["Vehicle problem", "गाड़ी में समस्या"],
  ["Not free at this time", "इस समय खाली नहीं हूँ"],
  ["Other", "अन्य"],
];

export function DeclineDialog({
  open,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
  loading?: boolean;
}) {
  const { t, lang } = useI18n();
  const [reason, setReason] = useState<string>();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={pick(lang, "Decline this pickup?", "यह पिकअप मना करें?")}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" size="lg" loading={loading} onClick={() => onConfirm(reason)} icon={<X className="size-5" />}>
            {t("partner.reject")}
          </Button>
        </>
      }
    >
      <p className="mb-3 font-medium">
        {pick(lang, "Why are you declining?", "आप मना क्यों कर रहे हैं?")}{" "}
        <span className="font-normal text-muted">({t("common.optional")})</span>
      </p>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
        {DECLINE_REASONS.map(([en, hi]) => (
          <button
            key={en}
            type="button"
            role="radio"
            aria-checked={reason === en}
            onClick={() => setReason(reason === en ? undefined : en)}
            className={cn(
              "flex min-h-12 items-center rounded-lg border px-4 text-left text-[15px] font-medium transition-colors",
              reason === en ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line-strong bg-surface text-ink hover:bg-canvas",
            )}
          >
            {pick(lang, en, hi)}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function RespondBar({ pickup }: { pickup: Pickup }) {
  const { t } = useI18n();
  const [declining, setDeclining] = useState(false);
  const respond = useRespond(pickup.code, () => setDeclining(false));
  return (
    <div className="grid grid-cols-2 gap-2 border-t border-line bg-canvas/70 p-3">
      <Button variant="secondary" size="lg" onClick={() => setDeclining(true)} disabled={respond.isPending} icon={<X className="size-5" />}>
        {t("partner.reject")}
      </Button>
      <Button
        size="lg"
        loading={respond.isPending && respond.variables?.accept}
        disabled={respond.isPending}
        onClick={() => respond.mutate({ accept: true })}
        icon={<Check className="size-5" />}
      >
        {t("partner.accept")}
      </Button>
      <DeclineDialog
        open={declining}
        onClose={() => setDeclining(false)}
        loading={respond.isPending}
        onConfirm={(reason) => respond.mutate({ accept: false, reason })}
      />
    </div>
  );
}

/** Big tappable pickup card. Offered pickups get Accept / Decline right on the card. */
export function PartnerPickupCard({ pickup, action, respond = true }: { pickup: Pickup; action?: ReactNode; respond?: boolean }) {
  const { t, lang } = useI18n();
  const cats = useCategoryMap();
  const offered = respond && pickup.status === "assigned";
  return (
    <Card as="article" className={cn("overflow-hidden", offered && "border-amber-300")}>
      <Link to={`/partner/pickups/${pickup.code}`} className="block p-4 transition-colors hover:bg-canvas/60 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={pickup.status} />
              {pickup.purpose === "donate" && <Badge tone="purple">{t("pickup.purposeLabel.donate")}</Badge>}
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-base font-semibold">
              <CalendarDays className="size-[18px] shrink-0 text-brand-700" aria-hidden />
              {dayLabel(pickup.scheduled_date, lang)}
              <span className="text-line-strong" aria-hidden>
                ·
              </span>
              <span>{slotLabel(pickup.slot, lang)}</span>
            </p>
          </div>
          {pickup.distance_km != null && (
            <span
              className="shrink-0 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-center"
              aria-label={t("pickup.away", { km: pickup.distance_km })}
            >
              <span className="block text-base leading-none font-semibold tabular-nums">{pickup.distance_km}</span>
              <span className="text-[11px] font-medium text-muted">{pick(lang, "km", "किमी")}</span>
            </span>
          )}
        </div>
        <p className="mt-2 flex items-start gap-2 text-sm text-ink-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <span className="line-clamp-2">
            {pickup.address.text}
            {pickup.address.landmark ? ` · ${pickup.address.landmark}` : ""}
          </span>
        </p>
        {pickup.items.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {pickup.items.map((i) => {
              const c = cats.map.get(i.category);
              return (
                <li
                  key={i.category}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-1 text-[13px] font-medium"
                >
                  {c?.color && <span className="size-2 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />}
                  {c?.emoji && <span aria-hidden>{c.emoji}</span>}
                  {cats.name(i.category)}
                  <span className="text-muted tabular-nums">{fmtKg(i.actual_kg ?? i.estimated_kg)}</span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3 text-[13px]">
          <span className="min-w-0 truncate">
            <span className="text-muted">{t("partner.customerId")}: </span>
            <span className="font-mono font-medium text-ink">{pickup.customer?.code ?? "—"}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 font-mono text-muted">
            {pickup.code}
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </div>
      </Link>
      {offered && <RespondBar pickup={pickup} />}
      {action && <div className="border-t border-line bg-canvas/60 p-3">{action}</div>}
    </Card>
  );
}

export function VerificationBanner({ status }: { status: VerificationStatus }) {
  const { t, lang } = useI18n();
  if (status === "verified") return null;
  const rejected = status === "rejected";
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-card border p-4",
        rejected ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
      <p className="text-sm font-medium">
        {rejected
          ? pick(
              lang,
              "Your account could not be verified. Please contact Swacchify support.",
              "आपका खाता सत्यापित नहीं हो सका। कृपया स्वच्छिफ़ाई सहायता से संपर्क करें।",
            )
          : t("partner.awaitingVerification")}
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PartnerHome() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  useDocumentTitle(t("nav.home"));
  const me = usePartnerMe();
  const active = usePartnerPickups("assigned");

  const availability = useMutation({
    mutationFn: (is_available: boolean) => patch<PartnerMe>("/partners/me", { is_available }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["partner", "me"] });
      const prev = qc.getQueryData<PartnerMe>(["partner", "me"]);
      qc.setQueryData<PartnerMe>(["partner", "me"], (d) => (d ? { ...d, is_available: v } : d));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["partner", "me"], ctx.prev);
      toast({ tone: "error", title: (e as Error).message });
    },
    onSuccess: (d) => {
      qc.setQueryData<PartnerMe>(["partner", "me"], (old) => (old ? { ...old, ...d } : d));
      toast({
        tone: "success",
        title: d.is_available ? pick(lang, "You're online", "आप ऑनलाइन हैं") : pick(lang, "You're offline", "आप ऑफ़लाइन हैं"),
      });
    },
  });

  if (me.isPending) return <PageSkeleton />;
  if (me.isError) return <ErrorState error={me.error} onRetry={() => me.refetch()} />;

  const p = me.data;
  const s = p.stats;
  const firstName = p.full_name.split(" ")[0] || p.full_name;
  const pickups = [...(active.data ?? [])].sort((a, b) => Number(b.status === "assigned") - Number(a.status === "assigned"));
  const offers = pickups.filter((x) => x.status === "assigned").length;

  return (
    <div className="space-y-8">
      {/* Greeting + ID */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{fmtDate(toISODate(new Date()), lang, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{t("home.greeting", { name: firstName })}</h1>
        </div>
        <p className="text-sm text-muted">
          {t("common.yourId")} <span className="ml-1 font-mono font-medium text-ink">{p.code}</span>
        </p>
      </header>

      <VerificationBanner status={p.verification_status} />

      {/* Availability */}
      <Card as="section" aria-label={t("partner.available")} className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <IconBox icon={Truck} tone={p.is_available ? "brand" : "neutral"} />
          <div className="min-w-0 flex-1">
            <Toggle
              checked={p.is_available}
              onChange={(v) => availability.mutate(v)}
              label={<span className="text-[15px] font-semibold">{p.is_available ? t("partner.available") : t("partner.offline")}</span>}
              description={
                p.is_available
                  ? pick(lang, "You'll get new pickups nearby.", "आपको पास के नए पिकअप मिलेंगे।")
                  : pick(lang, "Turn on to get new pickups.", "नए पिकअप पाने के लिए चालू करें।")
              }
            />
          </div>
        </div>
      </Card>

      {/* Stats */}
      {s && (
        <section aria-label={pick(lang, "Your numbers", "आपके आँकड़े")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("partner.today")} value={s.today} icon={CalendarDays} />
          <Stat label={t("partner.pending")} value={s.pending} icon={Clock} tone={s.pending ? "amber" : "neutral"} />
          <Stat label={t("partner.completed")} value={s.completed} icon={CheckCircle2} tone="brand" />
          <Link to="/partner/earnings" className="block rounded-card" aria-label={t("partner.earnings")}>
            <Stat
              label={pick(lang, "Earned today", "आज की कमाई")}
              value={fmtMoney(s.earnings_today)}
              hint={`${pick(lang, "Total", "कुल")}: ${fmtMoney(s.earnings_total)}`}
              icon={IndianRupee}
              tone="brand"
            />
          </Link>
        </section>
      )}

      {/* Active pickups */}
      <section>
        <SectionTitle
          action={
            pickups.length > 0 && (
              <Link to="/partner/pickups" className="text-[13px] font-medium text-brand-700 hover:underline">
                {t("common.seeAll")}
              </Link>
            )
          }
        >
          {pick(lang, "Active pickups", "चल रहे पिकअप")}
          {offers > 0 && (
            <Badge tone="amber" className="ml-2 align-middle">
              {pick(lang, `${offers} new`, `${offers} नए`)}
            </Badge>
          )}
        </SectionTitle>
        {active.isPending ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        ) : active.isError ? (
          <ErrorState error={active.error} onRetry={() => active.refetch()} />
        ) : pickups.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={t("partner.noPickups")}
            text={
              p.verification_status === "verified"
                ? pick(lang, "Check nearby pickups you can take.", "पास के पिकअप देखें जो आप ले सकते हैं।")
                : undefined
            }
            action={
              p.verification_status === "verified" && (
                <LinkButton to="/partner/pickups?tab=nearby" size="lg" icon={<Search className="size-5" />}>
                  {pick(lang, "Find nearby pickups", "पास के पिकअप देखें")}
                </LinkButton>
              )
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {pickups.map((x) => (
              <PartnerPickupCard key={x.code} pickup={x} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
