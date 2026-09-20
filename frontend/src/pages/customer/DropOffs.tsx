import { useQuery } from "@tanstack/react-query";
import { BatteryCharging, Clock, Gift, MapPinned, Navigation, Recycle, Warehouse, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { directionsUrl, MapView, PIN_BATTERY, PIN_GIFT, PIN_HOME, PIN_HUB, PIN_RECYCLE } from "@/components/MapView";
import { buttonStyles, Card, EmptyState, IconBox, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { get, qs } from "@/lib/api";
import { cn } from "@/lib/format";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Address, DropOff } from "@/lib/types";

const KIND_ICON: Record<DropOff["kind"], LucideIcon> = {
  swacchify_hub: Warehouse,
  ewaste_bin: BatteryCharging,
  donation_box: Gift,
  recycling_center: Recycle,
};
const KIND_PIN: Record<DropOff["kind"], string> = {
  swacchify_hub: PIN_HUB,
  ewaste_bin: PIN_BATTERY,
  donation_box: PIN_GIFT,
  recycling_center: PIN_RECYCLE,
};

export default function DropOffs() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [kind, setKind] = useState<string>(params.get("kind") ?? "all");
  const [selected, setSelected] = useState<number | null>(null);
  const category = params.get("category") ?? undefined;
  const { map } = useCategoryMap();
  const addresses = useQuery({ queryKey: ["addresses"], queryFn: () => get<Address[]>("/users/me/addresses") });
  const home = addresses.data?.find((a) => a.is_default) ?? addresses.data?.[0];
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  useDocumentTitle(t("dropoff.title"));

  useEffect(() => {
    if (home) setHere({ lat: home.lat, lng: home.lng });
  }, [home]);

  const { data, isLoading } = useQuery({
    queryKey: ["dropoffs", kind, category, here],
    queryFn: () => get<DropOff[]>(`/waste/dropoffs${qs({ kind: kind === "all" ? undefined : kind, category, lat: here?.lat, lng: here?.lng })}`),
  });

  const pins = [
    ...(here ? [{ id: "home", lat: here.lat, lng: here.lng, emoji: PIN_HOME, color: "#1f62b4", label: "Home" }] : []),
    ...(data ?? []).map((d) => ({ id: d.id, lat: d.lat, lng: d.lng, emoji: KIND_PIN[d.kind], label: d.name, popup: <b>{d.name}</b> })),
  ];

  return (
    <div className="space-y-5">
      <PageHeader title={t("dropoff.title")} subtitle={t("dropoff.sub")} />
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: "all", label: t("dropoff.all") },
          ...(Object.keys(KIND_ICON) as DropOff["kind"][]).map((k) => ({ value: k, label: t(`dropoff.kind.${k}`) })),
        ]}
      />
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <MapView pins={pins} className="h-80 xl:sticky xl:top-24 xl:h-[34rem]" onPinClick={(id) => typeof id === "number" && setSelected(id)} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />)}
          {data?.length === 0 && <EmptyState icon={MapPinned} title={t("dropoff.title")} text={t("dropoff.sub")} />}
          {data?.map((d) => (
            <Card key={d.id} className={cn("flex flex-col p-4 transition-shadow", selected === d.id && "ring-2 ring-brand-500")}>
              <div className="flex items-start gap-3">
                <IconBox icon={KIND_ICON[d.kind]} tone="brand" size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{d.name}</p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {d.address}, {d.city}
                  </p>
                </div>
                {d.distance_km !== null && <span className="shrink-0 text-[13px] font-medium whitespace-nowrap tabular-nums">{d.distance_km} km</span>}
              </div>
              {d.hours && (
                <p className="mt-2.5 flex items-center gap-1.5 text-[13px] text-muted">
                  <Clock className="size-3.5 shrink-0" /> {d.hours}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Accepts">
                {d.accepted_categories.map((c) => (
                  <span
                    key={c}
                    title={map.get(c)?.name}
                    className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink-2"
                  >
                    <span aria-hidden>{map.get(c)?.emoji}</span>
                    {map.get(c)?.name}
                  </span>
                ))}
              </div>
              <a
                href={directionsUrl(d.lat, d.lng)}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonStyles("secondary", "sm"), "mt-4 w-full")}
              >
                <Navigation className="size-3.5" /> {t("dropoff.directions")}
              </a>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
