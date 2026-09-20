import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock, Crosshair, LogOut, Save, ShieldAlert, User as UserIcon } from "lucide-react";
import { useState } from "react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { DEFAULT_CENTER, LocationPicker } from "@/components/MapView";
import { Badge, Button, Card, ErrorState, Field, IconBox, Input, PageHeader, PageSkeleton, SectionTitle, Select, Stars } from "@/components/ui";
import { patch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { pick } from "@/lib/format";
import { useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import { usePartnerMe, type PartnerMe } from "./PartnerHome";

const VEHICLES: { value: string; en: string; hi: string }[] = [
  { value: "e-rickshaw", en: "E-rickshaw", hi: "ई-रिक्शा" },
  { value: "tempo", en: "Tempo / mini truck", hi: "टेम्पो / छोटा ट्रक" },
  { value: "auto", en: "Auto-rickshaw", hi: "ऑटो-रिक्शा" },
  { value: "cycle-cart", en: "Cycle cart", hi: "साइकिल ठेला" },
  { value: "handcart", en: "Handcart", hi: "हाथ ठेला" },
  { value: "bike", en: "Motorbike", hi: "मोटरसाइकिल" },
];

function ProfileForm({ me }: { me: PartnerMe }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [vehicleType, setVehicleType] = useState(me.vehicle_type ?? "e-rickshaw");
  const [vehicleNumber, setVehicleNumber] = useState(me.vehicle_number ?? "");
  const [radius, setRadius] = useState(me.service_radius_km || 5);
  const [pos, setPos] = useState<[number, number]>(me.base_lat != null && me.base_lng != null ? [me.base_lat, me.base_lng] : DEFAULT_CENTER);
  const [locating, setLocating] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      patch<PartnerMe>("/partners/me", {
        vehicle_type: vehicleType,
        vehicle_number: vehicleNumber.trim() || null,
        service_radius_km: radius,
        base_lat: pos[0],
        base_lng: pos[1],
      }),
    onSuccess: (d) => {
      qc.setQueryData<PartnerMe>(["partner", "me"], (old) => (old ? { ...old, ...d } : d));
      qc.invalidateQueries({ queryKey: ["partner", "pickups", "nearby"] });
      toast({ tone: "success", title: t("common.saved") });
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  const locateMe = () => {
    if (!("geolocation" in navigator)) {
      toast({ tone: "error", title: pick(lang, "This phone can't share location.", "यह फ़ोन लोकेशन साझा नहीं कर सकता।") });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos([p.coords.latitude, p.coords.longitude]);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        toast({ tone: "error", title: err.message || t("common.error") });
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const vehicleOptions = VEHICLES.some((v) => v.value === vehicleType) ? VEHICLES : [...VEHICLES, { value: vehicleType, en: vehicleType, hi: vehicleType }];

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Card as="section" className="space-y-4 p-4 sm:p-5">
        <SectionTitle>{pick(lang, "Vehicle", "गाड़ी")}</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={pick(lang, "Vehicle type", "गाड़ी का प्रकार")}>
            {(id) => (
              <Select id={id} value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
                {vehicleOptions.map((v) => (
                  <option key={v.value} value={v.value}>
                    {pick(lang, v.en, v.hi)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={pick(lang, "Vehicle number", "गाड़ी नंबर")} optional={t("common.optional")}>
            {(id) => (
              <Input
                id={id}
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                placeholder="RJ14 AB 1234"
                autoCapitalize="characters"
                maxLength={20}
                className="font-mono"
              />
            )}
          </Field>
        </div>
      </Card>

      <Card as="section" className="space-y-4 p-4 sm:p-5">
        <SectionTitle>{pick(lang, "Where you work", "आप कहाँ काम करते हैं")}</SectionTitle>
        <Field
          label={
            <span className="flex items-center justify-between">
              <span>{pick(lang, "How far can you travel?", "आप कितनी दूर जा सकते हैं?")}</span>
              <span className="text-[15px] font-semibold text-brand-700 tabular-nums">
                {radius} {pick(lang, "km", "किमी")}
              </span>
            </span>
          }
        >
          {(id) => (
            <input
              id={id}
              type="range"
              min={1}
              max={50}
              step={1}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="h-11 w-full accent-brand-700"
            />
          )}
        </Field>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-medium text-ink-2">{pick(lang, "Your base location", "आपका ठिकाना")}</p>
            <Button variant="soft" size="sm" loading={locating} onClick={locateMe} icon={<Crosshair className="size-4" />}>
              {t("address.useLocation")}
            </Button>
          </div>
          <LocationPicker lat={pos[0]} lng={pos[1]} onChange={(lat, lng) => setPos([lat, lng])} className="h-64" />
          <p className="text-[13px] text-muted">
            {pick(lang, "Tap the map or drag the pin to set where you start from.", "जहाँ से आप शुरू करते हैं, वहाँ नक्शे पर टैप करें या पिन खींचें।")}
          </p>
        </div>
      </Card>

      <Button type="submit" size="lg" block loading={save.isPending} icon={<Save className="size-[18px]" />} className="sm:w-auto">
        {t("common.save")}
      </Button>
    </form>
  );
}

export default function PartnerProfile() {
  const { t, lang } = useI18n();
  const { logout } = useAuth();
  useDocumentTitle(t("nav.me"));
  const q = usePartnerMe();

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const me = q.data;
  const verified = me.verification_status === "verified";
  const rejected = me.verification_status === "rejected";

  return (
    <div className="space-y-8">
      <PageHeader title={t("nav.me")} icon={UserIcon} />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Identity */}
        <Card as="section" className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <IconBox icon={verified ? BadgeCheck : rejected ? ShieldAlert : Clock} tone={verified ? "brand" : rejected ? "red" : "amber"} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{me.full_name}</p>
              <p className="text-[13px] text-muted">{t("auth.role.partner")}</p>
              <Badge tone={verified ? "green" : rejected ? "red" : "amber"} className="mt-2">
                {verified
                  ? pick(lang, "Verified partner", "सत्यापित साथी")
                  : rejected
                    ? pick(lang, "Verification rejected", "सत्यापन अस्वीकार")
                    : pick(lang, "Verification pending", "सत्यापन बाकी")}
              </Badge>
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <p className="eyebrow">{t("common.yourId")}</p>
            <p className="mt-1 font-mono text-lg font-medium tracking-wide">{me.code}</p>
          </div>
        </Card>

        <div className="grid gap-4">
          {/* Rating */}
          <Card as="section" className="p-4 sm:p-5">
            <p className="text-[13px] font-medium text-muted">{t("partner.rating")}</p>
            {me.rating_count > 0 ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <span className="text-2xl font-semibold tabular-nums">{me.rating_avg.toFixed(1)}</span>
                <span aria-label={`${me.rating_avg.toFixed(1)} / 5`}>
                  <Stars value={Math.round(me.rating_avg)} size="sm" />
                </span>
                <span className="text-[13px] text-muted">{pick(lang, `${me.rating_count} ratings`, `${me.rating_count} रेटिंग`)}</span>
              </div>
            ) : (
              <p className="mt-1.5 text-sm text-muted">{pick(lang, "No ratings yet", "अभी कोई रेटिंग नहीं")}</p>
            )}
          </Card>

          {/* Language */}
          <Card as="section" className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
            <p className="text-sm font-medium">{t("common.language")}</p>
            <LanguageToggle />
          </Card>
        </div>
      </div>

      <ProfileForm key={me.code} me={me} />

      <Button
        variant="secondary"
        size="lg"
        block
        className="border-red-200 text-red-700 hover:bg-red-50 sm:w-auto"
        onClick={() => logout()}
        icon={<LogOut className="size-[18px]" />}
      >
        {t("common.signOut")}
      </Button>
    </div>
  );
}
