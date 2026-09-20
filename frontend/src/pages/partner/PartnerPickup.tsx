import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Check,
  CheckCircle2,
  Hand,
  MapPin as MapPinIcon,
  Minus,
  Navigation,
  PackageCheck,
  Phone,
  Plus,
  Radio,
  Scale,
  StickyNote,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { MapView, directionsUrl, type MapPin } from "@/components/MapView";
import { StatusPill, StatusTracker } from "@/components/PickupStatus";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  IconBox,
  Input,
  PageHeader,
  PageSkeleton,
  SectionTitle,
  Select,
  Toggle,
  buttonStyles,
} from "@/components/ui";
import { get, post, mediaUrl } from "@/lib/api";
import { cn, fmtDateTime, fmtKg, pick } from "@/lib/format";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { Pickup } from "@/lib/types";
import { CategoryGlyph, DeclineDialog, PIN_HOME, PIN_SEA, PIN_VEHICLE, dayLabel, slotLabel, usePartnerMe, useRespond } from "./PartnerHome";

type LatLng = { lat: number; lng: number };
type StatusBody = { status: "on_the_way" | "arrived" | "collected"; actual?: Record<string, number> };

const SEND_EVERY_MS = 15_000;

// ── Live location sharing (only while on the way) ────────────────────────────
function LiveLocation({ onPosition }: { onPosition: (p: LatLng | null) => void }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [on, setOn] = useState(false);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!on) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onPosition(p);
        const now = Date.now();
        if (now - lastSent.current >= SEND_EVERY_MS) {
          lastSent.current = now;
          post("/partners/me/location", p).catch(() => undefined);
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          toast({
            tone: "error",
            title: pick(lang, "Location permission is off. Allow it in your browser settings.", "लोकेशन की अनुमति बंद है। ब्राउज़र सेटिंग में चालू करें।"),
          });
          setOn(false);
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      onPosition(null);
    };
  }, [on, onPosition, toast, lang]);

  const toggle = (v: boolean) => {
    if (v && !("geolocation" in navigator)) {
      toast({ tone: "error", title: pick(lang, "This phone can't share location.", "यह फ़ोन लोकेशन साझा नहीं कर सकता।") });
      return;
    }
    if (v) lastSent.current = 0;
    setOn(v);
  };

  return (
    <div className={cn("rounded-lg border px-4 py-1 transition-colors", on ? "border-brand-200 bg-brand-50" : "border-line bg-surface")}>
      <Toggle
        checked={on}
        onChange={toggle}
        label={
          <span className="flex items-center gap-2">
            {on ? (
              <span className="size-2.5 rounded-full bg-brand-600" aria-hidden />
            ) : (
              <Radio className="size-4 text-muted" aria-hidden />
            )}
            {on ? t("partner.sharing") : t("partner.shareLocation")}
          </span>
        }
        description={pick(lang, "The customer sees how far away you are.", "ग्राहक देख पाएगा कि आप कितनी दूर हैं।")}
      />
    </div>
  );
}

// ── Collection form (status: arrived) ────────────────────────────────────────
interface Row {
  slug: string;
  kg: string;
  original: boolean;
}

function CollectForm({ pickup, onSubmit, submitting }: { pickup: Pickup; onSubmit: (actual: Record<string, number>) => void; submitting: boolean }) {
  const { t, lang } = useI18n();
  const cats = useCategoryMap();
  const toast = useToast();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>(() =>
    pickup.items.map((i) => ({ slug: i.category, kg: String(i.actual_kg ?? i.estimated_kg ?? 0), original: true })),
  );
  const [adding, setAdding] = useState("");
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("photo", file);
      return post<Pickup>(`/partners/pickups/${encodeURIComponent(pickup.code)}/proof`, fd);
    },
    onSuccess: (p) => {
      qc.setQueryData(["partner", "pickup", p.code], p);
      toast({ tone: "success", title: pick(lang, "Photo added", "फ़ोटो जुड़ गई") });
    },
    onError: (e) => {
      setPreview(null);
      toast({ tone: "error", title: (e as Error).message });
    },
  });

  const addable = cats.list.filter((c) => c.collectable && !rows.some((r) => r.slug === c.slug));
  const num = (s: string) => (s.trim() === "" ? 0 : Number(s));
  const total = rows.reduce((sum, r) => sum + (Number.isFinite(num(r.kg)) ? Math.max(0, num(r.kg)) : 0), 0);

  const setKg = (slug: string, kg: string) => {
    setError(undefined);
    setRows((rs) => rs.map((r) => (r.slug === slug ? { ...r, kg } : r)));
  };
  const step = (slug: string, delta: number) => {
    const r = rows.find((x) => x.slug === slug);
    const cur = r && Number.isFinite(num(r.kg)) ? num(r.kg) : 0;
    setKg(slug, String(Math.max(0, Math.round((cur + delta) * 10) / 10)));
  };

  const submit = () => {
    const actual: Record<string, number> = {};
    for (const r of rows) {
      const v = num(r.kg);
      if (!Number.isFinite(v) || v < 0) {
        setError(pick(lang, `Check the weight for ${cats.name(r.slug)}`, `${cats.name(r.slug)} का वज़न जाँचें`));
        return;
      }
      actual[r.slug] = Math.round(v * 100) / 100;
    }
    if (total <= 0) {
      setError(pick(lang, "Enter a weight above 0 kg", "0 किलो से ज़्यादा वज़न लिखें"));
      return;
    }
    onSubmit(actual);
  };

  const photo = preview ?? mediaUrl(pickup.proof_url);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[15px] font-semibold">{t("partner.recordWeight")}</h3>
        <p className="mt-0.5 text-[13px] text-muted">{pick(lang, "Weigh each type and enter the kg.", "हर प्रकार का वज़न करें और किलो लिखें।")}</p>
      </div>

      <ul className="space-y-3">
        {rows.map((r) => {
          const id = `kg-${r.slug}`;
          const est = pickup.items.find((i) => i.category === r.slug)?.estimated_kg;
          return (
            <li key={r.slug} className="rounded-lg border border-line bg-surface p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <label htmlFor={id} className="flex items-center gap-2 text-[15px] font-medium">
                  <CategoryGlyph slug={r.slug} />
                  {cats.name(r.slug)}
                </label>
                {r.original ? (
                  est != null && (
                    <span className="text-[13px] text-muted tabular-nums">
                      {t("pickup.estimated")}: {fmtKg(est)}
                    </span>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => setRows((rs) => rs.filter((x) => x.slug !== r.slug))}
                    className="grid size-11 place-items-center rounded-lg text-muted transition-colors hover:bg-red-50 hover:text-red-700"
                    aria-label={`${pick(lang, "Remove", "हटाएँ")} ${cats.name(r.slug)}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-12 shrink-0 px-0"
                  onClick={() => step(r.slug, -0.5)}
                  aria-label={pick(lang, `Less ${cats.name(r.slug)}`, `${cats.name(r.slug)} कम करें`)}
                >
                  <Minus className="size-5" />
                </Button>
                <div className="relative flex-1">
                  <Input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.1}
                    value={r.kg}
                    onChange={(e) => setKg(r.slug, e.target.value)}
                    className="h-11 pr-12 text-center text-lg font-semibold tabular-nums"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[13px] font-medium text-muted">
                    {pick(lang, "kg", "किलो")}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-12 shrink-0 px-0"
                  onClick={() => step(r.slug, 0.5)}
                  aria-label={pick(lang, `More ${cats.name(r.slug)}`, `${cats.name(r.slug)} ज़्यादा करें`)}
                >
                  <Plus className="size-5" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {addable.length > 0 && (
        <div className="flex gap-2">
          <label htmlFor="add-cat" className="sr-only">
            {pick(lang, "Add another type", "दूसरा प्रकार जोड़ें")}
          </label>
          <Select id="add-cat" value={adding} onChange={(e) => setAdding(e.target.value)} className="flex-1">
            <option value="">{pick(lang, "+ Add another type", "+ दूसरा प्रकार जोड़ें")}</option>
            {addable.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.emoji} {cats.name(c.slug)}
              </option>
            ))}
          </Select>
          <Button
            variant="soft"
            size="lg"
            disabled={!adding}
            icon={<Plus className="size-5" />}
            onClick={() => {
              setRows((rs) => [...rs, { slug: adding, kg: "", original: false }]);
              setAdding("");
            }}
          >
            {pick(lang, "Add", "जोड़ें")}
          </Button>
        </div>
      )}

      <Card className="flex items-center gap-3 p-4">
        <IconBox icon={Scale} size="sm" />
        <span className="flex-1 text-[13px] font-medium text-muted">{pick(lang, "Total", "कुल")}</span>
        <span className="text-xl font-semibold tabular-nums">{fmtKg(total, 2)}</span>
      </Card>

      {/* Photo */}
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          id="proof-photo"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setPreview(URL.createObjectURL(f));
            upload.mutate(f);
          }}
        />
        {photo ? (
          <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
            <img src={photo} alt={t("pickup.proof")} className="size-20 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                {upload.isPending ? (
                  pick(lang, "Uploading…", "अपलोड हो रही है…")
                ) : (
                  <>
                    <CheckCircle2 className="size-4 text-brand-600" aria-hidden />
                    {pick(lang, "Photo added", "फ़ोटो जुड़ गई")}
                  </>
                )}
              </p>
              <Button variant="ghost" size="sm" className="-ml-3" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
                {pick(lang, "Change photo", "फ़ोटो बदलें")}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="lg"
            block
            loading={upload.isPending}
            onClick={() => fileRef.current?.click()}
            icon={<Camera className="size-5" />}
          >
            {t("partner.uploadProof")} <span className="font-normal text-muted">({t("common.optional")})</span>
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <Button size="xl" block loading={submitting} disabled={upload.isPending} onClick={submit} icon={<PackageCheck className="size-5" />}>
        {t("partner.markCollected")}
      </Button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PartnerPickup() {
  const { code = "" } = useParams();
  const { t, lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const cats = useCategoryMap();
  useDocumentTitle(code);

  const key = ["partner", "pickup", code];
  const q = useQuery({
    queryKey: key,
    queryFn: () => get<Pickup>(`/partners/pickups/${encodeURIComponent(code)}`),
    enabled: !!code,
  });
  const me = usePartnerMe();
  const [live, setLive] = useState<LatLng | null>(null);
  const [declining, setDeclining] = useState(false);

  const onDone = (p: Pickup) => {
    qc.setQueryData(key, p);
    qc.invalidateQueries({ queryKey: ["partner", "pickups"] });
    qc.invalidateQueries({ queryKey: ["partner", "me"] });
  };

  const respond = useRespond(code, (accepted) => {
    setDeclining(false);
    if (!accepted) navigate("/partner", { replace: true });
  });

  const claim = useMutation({
    mutationFn: () => post<Pickup>(`/partners/pickups/${encodeURIComponent(code)}/claim`),
    onSuccess: (p) => {
      onDone(p);
      toast({ tone: "success", title: pick(lang, "Pickup is yours!", "पिकअप आपका हुआ!") });
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  const advance = useMutation({
    mutationFn: (body: StatusBody) => post<Pickup>(`/partners/pickups/${encodeURIComponent(code)}/status`, body),
    onSuccess: (p) => {
      onDone(p);
      toast({
        tone: "success",
        title: p.status === "collected" ? pick(lang, "Pickup collected — thank you!", "पिकअप हो गया — धन्यवाद!") : t(`status.${p.status}`),
      });
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  const pickup = q.data;
  const partnerPos: LatLng | null =
    live ?? (me.data?.base_lat != null && me.data?.base_lng != null ? { lat: me.data.base_lat, lng: me.data.base_lng } : null);

  const pins = useMemo<MapPin[]>(() => {
    if (!pickup) return [];
    const out: MapPin[] = [
      { id: "home", lat: pickup.address.lat, lng: pickup.address.lng, emoji: PIN_HOME, label: pick(lang, "Pickup address", "पिकअप का पता") },
    ];
    if (partnerPos)
      out.push({ id: "me", lat: partnerPos.lat, lng: partnerPos.lng, emoji: PIN_VEHICLE, color: PIN_SEA, pulse: !!live, label: pick(lang, "You", "आप") });
    return out;
  }, [pickup, partnerPos?.lat, partnerPos?.lng, live, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data;

  const nav = directionsUrl(p.address.lat, p.address.lng);
  const hint: Record<Pickup["status"], [string, string]> = {
    requested: ["This pickup is open. Take it if you can reach on time.", "यह पिकअप खुला है। समय पर पहुँच सकें तो इसे लें।"],
    assigned: ["New pickup for you. Please accept or decline.", "आपके लिए नया पिकअप। स्वीकार करें या मना करें।"],
    accepted: ["When you leave for the address, tap the button.", "पते के लिए निकलते समय बटन दबाएँ।"],
    on_the_way: ["Tap the button when you reach the customer.", "ग्राहक के पास पहुँचकर बटन दबाएँ।"],
    arrived: ["Weigh the waste, add a photo and finish.", "कचरे का वज़न करें, फ़ोटो लें और पूरा करें।"],
    collected: ["Collected. Take it to the Swacchify hub for checking.", "इकट्ठा हो गया। जाँच के लिए स्वच्छिफ़ाई हब पर जमा करें।"],
    verified: ["Checked at the hub. Well done!", "हब पर जाँच हो गई। शाबाश!"],
    completed: ["All done. Thank you!", "सब पूरा हुआ। धन्यवाद!"],
    cancelled: ["This pickup was cancelled.", "यह पिकअप रद्द हो गया।"],
  };
  const done = ["collected", "verified", "completed"].includes(p.status);

  return (
    <div className="space-y-8">
      <PageHeader
        back="/partner/pickups"
        title={<span className="font-mono">{p.code}</span>}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={p.status} />
            {p.purpose === "donate" && <Badge tone="purple">{t("pickup.purposeLabel.donate")}</Badge>}
            <span>
              {dayLabel(p.scheduled_date, lang)} · {slotLabel(p.slot, lang)}
            </span>
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Primary action */}
        <Card as="section" aria-label={pick(lang, "Next step", "अगला कदम")} className="p-4 sm:p-5 lg:order-2">
          <p className="eyebrow">{pick(lang, "Next step", "अगला कदम")}</p>
          <p className="mt-1.5 mb-4 text-[15px] font-medium">{pick(lang, ...hint[p.status])}</p>

          {p.status === "requested" && (
            <Button size="xl" block loading={claim.isPending} onClick={() => claim.mutate()} icon={<Hand className="size-5" />}>
              {t("partner.claim")}
            </Button>
          )}

          {p.status === "assigned" && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="xl" onClick={() => setDeclining(true)} disabled={respond.isPending} icon={<X className="size-5" />}>
                {t("partner.reject")}
              </Button>
              <Button
                size="xl"
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
          )}

          {p.status === "accepted" && (
            <Button size="xl" block loading={advance.isPending} onClick={() => advance.mutate({ status: "on_the_way" })} icon={<Truck className="size-5" />}>
              {t("partner.startTrip")}
            </Button>
          )}

          {p.status === "on_the_way" && (
            <div className="space-y-3">
              <Button size="xl" block loading={advance.isPending} onClick={() => advance.mutate({ status: "arrived" })} icon={<MapPinIcon className="size-5" />}>
                {t("partner.markArrived")}
              </Button>
              <LiveLocation onPosition={setLive} />
            </div>
          )}

          {p.status === "arrived" && (
            <CollectForm pickup={p} submitting={advance.isPending} onSubmit={(actual) => advance.mutate({ status: "collected", actual })} />
          )}

          {done && (
            <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas p-3">
              <IconBox icon={CheckCircle2} tone="brand" />
              <div>
                <p className="text-[15px] font-medium">{t(`status.${p.status}`)}</p>
                {p.actual_total_kg != null && (
                  <p className="text-[13px] text-muted tabular-nums">
                    {t("pickup.collected")}: {fmtKg(p.actual_total_kg, 2)}
                  </p>
                )}
              </div>
            </div>
          )}

          {p.status === "cancelled" && p.cancel_reason && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{p.cancel_reason}</p>
          )}
        </Card>

        {/* Map + address */}
        <div className="space-y-3 lg:order-1">
          <MapView pins={pins} line={partnerPos ? [[partnerPos.lat, partnerPos.lng], [p.address.lat, p.address.lng]] : undefined} className="h-60 sm:h-72" />
          <a href={nav} target="_blank" rel="noopener noreferrer" className={buttonStyles("sea", "xl", true)}>
            <Navigation className="size-5" aria-hidden />
            {t("partner.navigate")}
            {p.distance_km != null && <span className="font-normal opacity-90">· {t("pickup.away", { km: p.distance_km })}</span>}
          </a>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Address & customer */}
        <Card as="section" className="p-4 sm:p-5">
          <SectionTitle>{t("pickup.address")}</SectionTitle>
          <div className="flex items-start gap-3">
            <MapPinIcon className="mt-0.5 size-[18px] shrink-0 text-muted" aria-hidden />
            <div className="text-sm">
              <p className="text-[15px] font-medium">{p.address.text}</p>
              {p.address.landmark && (
                <p className="mt-0.5 text-muted">
                  {t("address.landmark")}: {p.address.landmark}
                </p>
              )}
              {p.address.city && <p className="text-muted">{p.address.city}</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-canvas p-3">
            <div>
              <p className="text-[13px] text-muted">{t("partner.customerId")}</p>
              <p className="mt-0.5 font-mono text-[15px] font-medium text-ink">{p.customer?.code ?? "—"}</p>
            </div>
            {p.customer?.phone ? (
              <a href={`tel:${p.customer.phone}`} className={buttonStyles("primary", "lg")} aria-label={`${t("pickup.call")} ${p.customer.code}`}>
                <Phone className="size-[18px]" aria-hidden /> {t("pickup.call")}
              </a>
            ) : (
              !done &&
              p.status !== "cancelled" && (
                <p className="max-w-48 text-[13px] text-muted">
                  {pick(lang, "Phone number shows after you accept.", "स्वीकार करने के बाद फ़ोन नंबर दिखेगा।")}
                </p>
              )
            )}
          </div>
          {p.notes && (
            <div className="mt-3 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <StickyNote className="mt-0.5 size-[18px] shrink-0" aria-hidden />
              <p>{p.notes}</p>
            </div>
          )}
        </Card>

        {/* Items */}
        <Card as="section" className="p-4 sm:p-5">
          <SectionTitle>{pick(lang, "Items", "सामान")}</SectionTitle>
          <ul className="divide-y divide-line">
            {p.items.map((i) => (
              <li key={i.category} className="flex items-center justify-between gap-3 py-3">
                <span className="flex items-center gap-2.5 text-sm font-medium">
                  <CategoryGlyph slug={i.category} size="md" />
                  {cats.name(i.category)}
                </span>
                <span className="text-right text-[13px]">
                  <span className="block">
                    <span className="text-muted">{t("pickup.estimated")}: </span>
                    <span className="font-medium tabular-nums">{fmtKg(i.estimated_kg)}</span>
                  </span>
                  {i.actual_kg != null && (
                    <span className="block">
                      <span className="text-muted">{t("pickup.collected")}: </span>
                      <span className="font-medium tabular-nums">{fmtKg(i.actual_kg, 2)}</span>
                    </span>
                  )}
                  {i.verified_kg != null && (
                    <span className="block text-brand-700">
                      {t("pickup.verified")}: <span className="font-medium tabular-nums">{fmtKg(i.verified_kg, 2)}</span>
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex justify-between border-t border-line pt-3 text-sm font-semibold">
            <span>{pick(lang, "Total", "कुल")}</span>
            <span className="tabular-nums">{fmtKg(p.actual_total_kg ?? p.estimated_total_kg, 2)}</span>
          </div>
        </Card>
      </div>

      {(p.verification || (p.proof_url && p.status !== "arrived")) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {p.verification && (
            <Card as="section" className="p-4 sm:p-5">
              <SectionTitle>{pick(lang, "Hub verification", "हब पर जाँच")}</SectionTitle>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">{fmtKg(p.verification.total_kg, 2)}</p>
              <Badge tone={p.verification.quality === "good" ? "green" : p.verification.quality === "fair" ? "amber" : "red"} className="mt-2">
                {pick(
                  lang,
                  { good: "Well segregated", fair: "Mostly segregated", poor: "Mixed / dirty" }[p.verification.quality],
                  { good: "बढ़िया छँटाई", fair: "ठीक-ठाक छँटाई", poor: "मिला हुआ / गंदा" }[p.verification.quality],
                )}
              </Badge>
              {p.verification.notes && <p className="mt-3 text-sm text-muted">{p.verification.notes}</p>}
            </Card>
          )}
          {p.proof_url && p.status !== "arrived" && (
            <Card as="section" className="p-4 sm:p-5">
              <SectionTitle>{t("pickup.proof")}</SectionTitle>
              <img src={mediaUrl(p.proof_url)} alt={t("pickup.proof")} className="max-h-72 w-full rounded-lg object-cover" />
            </Card>
          )}
        </div>
      )}

      <Card as="section" className="p-4 sm:p-5">
        <SectionTitle>{t("pickup.timeline")}</SectionTitle>
        <StatusTracker pickup={p} />
        {p.updated_at && (
          <p className="mt-4 text-xs text-muted">
            {pick(lang, "Last update", "आख़िरी अपडेट")}: {fmtDateTime(p.updated_at, lang)}
          </p>
        )}
      </Card>
    </div>
  );
}
