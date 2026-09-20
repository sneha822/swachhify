import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Hand, History, MapPin as MapPinIcon, Truck } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { MapView, type MapPin } from "@/components/MapView";
import { Button, EmptyState, ErrorState, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { post } from "@/lib/api";
import { fmtKg, pick } from "@/lib/format";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { Pickup } from "@/lib/types";
import {
  PIN_BRAND,
  PIN_PACKAGE,
  PIN_SEA,
  PIN_VEHICLE,
  PartnerPickupCard,
  VerificationBanner,
  dayLabel,
  slotLabel,
  usePartnerMe,
  usePartnerPickups,
  type PickupScope,
} from "./PartnerHome";

const TABS: PickupScope[] = ["assigned", "nearby", "history"];

function ClaimButton({ pickup }: { pickup: Pickup }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const claim = useMutation({
    mutationFn: () => post<Pickup>(`/partners/pickups/${encodeURIComponent(pickup.code)}/claim`),
    onSuccess: (p) => {
      qc.setQueryData(["partner", "pickup", p.code], p);
      qc.invalidateQueries({ queryKey: ["partner"] });
      toast({ tone: "success", title: pick(lang, "Pickup is yours!", "पिकअप आपका हुआ!") });
      navigate(`/partner/pickups/${p.code}`);
    },
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ["partner", "pickups", "nearby"] });
      toast({ tone: "error", title: (e as Error).message });
    },
  });
  return (
    <Button size="lg" block loading={claim.isPending} onClick={() => claim.mutate()} icon={<Hand className="size-5" />}>
      {t("partner.claim")}
    </Button>
  );
}

function NearbyMap({ pickups, base }: { pickups: Pickup[]; base: { lat: number; lng: number } | null }) {
  const { lang } = useI18n();
  const cats = useCategoryMap();
  const pins = useMemo<MapPin[]>(() => {
    const out: MapPin[] = pickups.map((p) => ({
      id: p.code,
      lat: p.address.lat,
      lng: p.address.lng,
      emoji: cats.map.get(p.items[0]?.category ?? "")?.emoji ?? PIN_PACKAGE,
      color: PIN_BRAND,
      label: p.code,
      popup: (
        <div className="min-w-40 space-y-1 text-sm">
          <p className="font-mono font-medium">{p.code}</p>
          <p>
            {dayLabel(p.scheduled_date, lang)} · {slotLabel(p.slot, lang)}
          </p>
          <p className="tabular-nums">
            {fmtKg(p.estimated_total_kg)}
            {p.distance_km != null && ` · ${p.distance_km} ${pick(lang, "km", "किमी")}`}
          </p>
          <Link to={`/partner/pickups/${p.code}`} className="font-medium text-brand-700 underline">
            {pick(lang, "Open", "खोलें")}
          </Link>
        </div>
      ),
    }));
    if (base) out.push({ id: "me", lat: base.lat, lng: base.lng, emoji: PIN_VEHICLE, color: PIN_SEA, label: pick(lang, "You", "आप") });
    return out;
  }, [pickups, base, cats, lang]);
  return <MapView pins={pins} className="h-64 sm:h-80" />;
}

export default function PartnerPickups() {
  const { t, lang } = useI18n();
  useDocumentTitle(t("partner.assigned"));
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: PickupScope = TABS.includes(raw as PickupScope) ? (raw as PickupScope) : "assigned";
  const setTab = (v: PickupScope) => setParams(v === "assigned" ? {} : { tab: v }, { replace: true });

  const me = usePartnerMe();
  const list = usePartnerPickups(tab);
  const verified = me.data?.verification_status === "verified";
  const base = me.data?.base_lat != null && me.data?.base_lng != null ? { lat: me.data.base_lat, lng: me.data.base_lng } : null;

  const empty = {
    assigned: {
      icon: Truck,
      title: t("partner.noPickups"),
      text: pick(lang, "New pickups offered to you will show here.", "आपको मिले नए पिकअप यहाँ दिखेंगे।"),
    },
    nearby: {
      icon: MapPinIcon,
      title: pick(lang, "No open pickups nearby", "आसपास कोई खुला पिकअप नहीं"),
      text: pick(lang, "Check again in a little while.", "थोड़ी देर बाद फिर देखें।"),
    },
    history: {
      icon: History,
      title: pick(lang, "No past pickups yet", "अभी कोई पुराना पिकअप नहीं"),
      text: pick(lang, "Pickups you finish will appear here.", "आपके पूरे किए पिकअप यहाँ दिखेंगे।"),
    },
  }[tab];

  return (
    <div>
      <PageHeader title={t("partner.assigned")} icon={Truck} />
      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-6 w-full sm:w-auto"
        options={[
          { value: "assigned", label: t("partner.assigned") },
          { value: "nearby", label: t("partner.nearby") },
          { value: "history", label: t("partner.history") },
        ]}
      />

      <div role="tabpanel" className="space-y-4">
        {tab === "nearby" && me.data && !verified && <VerificationBanner status={me.data.verification_status} />}

        {list.isPending ? (
          <div className="grid gap-3 md:grid-cols-2">
            {tab === "nearby" && <Skeleton className="h-64 md:col-span-2" />}
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : (
          <>
            {tab === "nearby" && list.data.length > 0 && (
              <section aria-label={pick(lang, "Map of nearby pickups", "आसपास के पिकअप का नक्शा")}>
                <p className="eyebrow mb-2">
                  {pick(lang, `${list.data.length} open pickups near you`, `आपके पास ${list.data.length} खुले पिकअप`)}
                </p>
                <NearbyMap pickups={list.data} base={base} />
              </section>
            )}
            {list.data.length === 0 ? (
              <EmptyState icon={empty.icon} title={empty.title} text={empty.text} />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {list.data.map((p) => (
                  <PartnerPickupCard
                    key={p.code}
                    pickup={p}
                    respond={tab === "assigned"}
                    action={tab === "nearby" && verified ? <ClaimButton pickup={p} /> : undefined}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
