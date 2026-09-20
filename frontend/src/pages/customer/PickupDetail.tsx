import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Factory, MapPin, Navigation, Phone, Truck, Warehouse } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { MapView, PIN_HOME, PIN_VEHICLE, type MapPin as Pin } from "@/components/MapView";
import { StatusPill, StatusTracker } from "@/components/PickupStatus";
import { Badge, Button, buttonStyles, Card, ErrorState, IconBox, Modal, PageHeader, PageSkeleton, SectionTitle, Stars } from "@/components/ui";
import { get, mediaUrl, post } from "@/lib/api";
import { cn, fmtDate, fmtDateTime, fmtKg, slotLabel } from "@/lib/format";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { Pickup } from "@/lib/types";

const CANCELLABLE = ["requested", "assigned", "accepted", "on_the_way", "arrived"];

export default function PickupDetail() {
  const { code } = useParams();
  const { t, lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { map, name } = useCategoryMap();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [stars, setStars] = useState(0);
  const { data: p, isLoading, error, refetch } = useQuery({
    queryKey: ["pickup", code],
    queryFn: () => get<Pickup>(`/pickups/${code}`),
    refetchInterval: (q) => (q.state.data && ["on_the_way", "arrived"].includes(q.state.data.status) ? 30_000 : false),
  });
  useDocumentTitle(code ?? "");

  const cancel = useMutation({
    mutationFn: () => post<Pickup>(`/pickups/${code}/cancel`, { reason: "Cancelled by customer" }),
    onSuccess: (d) => {
      qc.setQueryData(["pickup", code], (old: Pickup | undefined) => ({ ...old, ...d }));
      qc.invalidateQueries({ queryKey: ["pickups"] });
      setConfirmCancel(false);
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });
  const rate = useMutation({
    mutationFn: (s: number) => post(`/pickups/${code}/rate`, { stars: s }),
    onSuccess: (_, s) => {
      qc.setQueryData(["pickup", code], (old: Pickup | undefined) => (old ? { ...old, my_rating: s } : old));
      toast({ tone: "success", title: t("pickup.rated") });
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  if (isLoading) return <PageSkeleton />;
  if (error || !p) return <ErrorState error={error} onRetry={refetch} />;

  const pins: Pin[] = [{ id: "home", lat: p.address.lat, lng: p.address.lng, emoji: PIN_HOME, label: "Home" }];
  if (p.tracking) pins.push({ id: "partner", lat: p.tracking.lat, lng: p.tracking.lng, emoji: PIN_VEHICLE, color: "#1f62b4", pulse: p.tracking.live, label: p.partner?.code });
  const canRate = ["collected", "verified", "completed"].includes(p.status) && p.partner && !p.my_rating;
  const qualityTone = { good: "bg-brand-50 text-brand-900", fair: "bg-sea-50 text-sea-700", poor: "bg-amber-50 text-amber-900" } as const;

  return (
    <div className="space-y-5">
      <PageHeader
        back="/app/pickups"
        title={<span className="font-mono">{p.code}</span>}
        subtitle={`${fmtDate(p.scheduled_date, lang, { weekday: "long", day: "numeric", month: "long" })} · ${slotLabel(p.slot)}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill status={p.status} />
            {p.purpose === "donate" && <Badge tone="purple">🎁 {t("pickup.purposeLabel.donate")}</Badge>}
          </div>
        }
      />

      <Card className="p-5">
        <StatusTracker pickup={p} />
        {p.status === "cancelled" && p.cancel_reason && <p className="mt-4 text-sm text-red-700">{p.cancel_reason}</p>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          {p.tracking && (
            <Card className="overflow-hidden">
              <MapView pins={pins} className="h-72 rounded-none border-0" line={[[p.tracking.lat, p.tracking.lng], [p.address.lat, p.address.lng]]} />
              <div className="grid grid-cols-2 divide-x divide-line">
                <div className="flex items-center gap-3 p-4">
                  <Navigation className="size-6 text-sea-600" />
                  <p className="font-bold">{t("pickup.away", { km: p.tracking.distance_km })}</p>
                </div>
                <div className="flex items-center gap-3 p-4">
                  <Clock className="size-6 text-brand-600" />
                  <p className="font-bold">{t("pickup.eta", { min: p.tracking.eta_min })}</p>
                </div>
              </div>
            </Card>
          )}

          <Card className="p-5">
            <SectionTitle>{pickTitle(p.status, t)}</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs tracking-wide text-muted uppercase">
                  <tr>
                    <th className="py-2 font-bold"> </th>
                    <th className="py-2 text-right font-bold">{t("pickup.estimated")}</th>
                    <th className="py-2 text-right font-bold">{t("pickup.collected")}</th>
                    <th className="py-2 text-right font-bold">{t("pickup.verified")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {p.items.map((i) => (
                    <tr key={i.category}>
                      <td className="py-2.5 font-semibold">{map.get(i.category)?.emoji} {name(i.category)}</td>
                      <td className="py-2.5 text-right tabular-nums">{fmtKg(i.estimated_kg)}</td>
                      <td className="py-2.5 text-right tabular-nums">{i.actual_kg != null ? fmtKg(i.actual_kg) : "—"}</td>
                      <td className="py-2.5 text-right font-bold tabular-nums">{i.verified_kg != null ? fmtKg(i.verified_kg) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {p.verification && (
              <p className={cn("mt-4 rounded-xl px-4 py-3", qualityTone[p.verification.quality])}>
                <span className="font-bold">{t(`pickup.quality.${p.verification.quality}`)}</span>
                {p.verification.notes && <span className="block text-sm">{p.verification.notes}</span>}
                {p.verification.quality === "poor" && (
                  <Link to="/app/learn/segregation-mistakes" className="mt-1 inline-block text-sm font-medium underline">5 common segregation mistakes</Link>
                )}
              </p>
            )}
            {p.proof_url && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold">{t("pickup.proof")}</p>
                <img src={mediaUrl(p.proof_url)} alt={t("pickup.proof")} className="max-h-64 rounded-xl border border-line object-cover" />
              </div>
            )}
          </Card>

          {p.journey && p.journey.length > 0 && (
            <Card className="p-5">
              <SectionTitle>{t("pickup.journey")}</SectionTitle>
              <ol className="space-y-3">
                {p.journey.map((j, i) => (
                  <li key={i} className="flex gap-3 rounded-xl bg-canvas p-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700 shadow-sm">
                      {j.recycler ? <Factory className="size-5" /> : <Warehouse className="size-5" />}
                    </span>
                    <div className="min-w-0 text-sm">
                      <p className="font-bold">{map.get(j.category)?.emoji} {fmtKg(j.kg)} {name(j.category)}</p>
                      {j.recycler ? (
                        <p className="text-muted">→ {j.recycler}{j.city ? `, ${j.city}` : ""} · {j.method} · <span className="font-semibold capitalize">{j.status}</span></p>
                      ) : (
                        <p className="text-muted">{j.method ?? t("pickup.journeyAtHub")}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle>{t("pickup.partner")}</SectionTitle>
            {p.partner ? (
              <div className="flex items-center gap-3">
                <IconBox icon={Truck} tone="sea" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">{t("pickup.partnerId")}</p>
                  <p className="font-mono font-bold">{p.partner.code}</p>
                  <p className="text-sm text-muted capitalize">
                    {p.partner.vehicle}
                    {p.partner.rating ? ` · ★ ${p.partner.rating}` : ""}
                  </p>
                </div>
                {p.partner.phone && (
                  <a href={`tel:${p.partner.phone}`} className={cn(buttonStyles("primary", "sm"), "shrink-0")}>
                    <Phone className="size-3.5" /> {t("pickup.call")}
                  </a>
                )}
              </div>
            ) : (
              <div>
                <p className="text-muted">{t("pickup.successSub")}</p>
                {p.status === "requested" && (
                  <Link to={`/app/dropoffs?category=${p.items[0]?.category ?? ""}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                    <MapPin className="size-4" /> {t("pickup.dropoffHint")} →
                  </Link>
                )}
              </div>
            )}
            {canRate && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="mb-2 font-semibold">{t("pickup.rate")}</p>
                <Stars value={stars} onChange={(s) => { setStars(s); rate.mutate(s); }} />
              </div>
            )}
            {p.my_rating ? <div className="mt-4 border-t border-line pt-4"><Stars value={p.my_rating} size="sm" /></div> : null}
          </Card>

          <Card className="p-5">
            <SectionTitle>{t("pickup.address")}</SectionTitle>
            <p>{p.address.text}</p>
            {p.address.landmark && <p className="text-sm text-muted">{p.address.landmark}</p>}
            {p.notes && <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-sm">“{p.notes}”</p>}
          </Card>

          <Card className="p-5">
            <SectionTitle>{t("pickup.timeline")}</SectionTitle>
            <ol className="space-y-3 border-l-2 border-line pl-4">
              {p.timeline.map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full bg-brand-500" aria-hidden />
                  <p className="font-semibold">{t(`status.${e.status}`)}</p>
                  <p className="text-xs text-muted">{fmtDateTime(e.at, lang)}</p>
                  {e.note && <p className="text-sm text-muted">{e.note}</p>}
                </li>
              ))}
            </ol>
          </Card>

          {CANCELLABLE.includes(p.status) && (
            <Button variant="ghost" block className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setConfirmCancel(true)}>
              {t("pickup.cancel")}
            </Button>
          )}
        </div>
      </div>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={t("pickup.cancelConfirm")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>{t("common.back")}</Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>{t("pickup.cancel")}</Button>
          </>
        }
      >
        <p className="text-muted">{p.code}</p>
      </Modal>
    </div>
  );
}

function pickTitle(status: string, t: ReturnType<typeof useI18n>["t"]) {
  return ["verified", "completed"].includes(status) ? t("pickup.verified") : t("pickup.summary");
}
