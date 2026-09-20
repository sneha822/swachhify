import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Check, Clock, Crosshair, Factory, Mail, Phone, Save, ShieldX, User as UserIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { DEFAULT_CENTER, LocationPicker } from "@/components/MapView";
import { Badge, Button, Card, ErrorState, Field, IconBox, Input, PageHeader, PageSkeleton, SectionTitle, Skeleton, Textarea } from "@/components/ui";
import { patch } from "@/lib/api";
import { cn } from "@/lib/format";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { useIndustryProfile, type IndustryProfile } from "./RecyclerHome";

const VERIFICATION = {
  verified: { label: "Verified", tone: "green", icon: BadgeCheck, text: "Your organisation is verified. You can request material from the hub." },
  pending: { label: "Verification pending", tone: "amber", icon: Clock, text: "Our team is reviewing your authorisation details. This usually takes 1–2 working days." },
  rejected: { label: "Not verified", tone: "red", icon: ShieldX, text: "We couldn't verify your organisation. Please check your authorisation number and contact support." },
} as const;

function ProfileForm({ profile }: { profile: IndustryProfile }) {
  const cats = useCategoryMap();
  const toast = useToast();
  const qc = useQueryClient();
  const [orgName, setOrgName] = useState(profile.org_name);
  const [authNo, setAuthNo] = useState(profile.authorization_number ?? "");
  const [accepted, setAccepted] = useState<string[]>(profile.accepted_categories ?? []);
  const [address, setAddress] = useState(profile.address ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [pos, setPos] = useState<[number, number]>(profile.lat != null && profile.lng != null ? [profile.lat, profile.lng] : DEFAULT_CENTER);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string>();

  const collectable = cats.list.filter((c) => c.collectable);

  const save = useMutation({
    mutationFn: () =>
      patch<IndustryProfile>("/industries/me", {
        org_name: orgName.trim(),
        authorization_number: authNo.trim() || null,
        accepted_categories: accepted,
        address: address.trim() || null,
        city: city.trim() || null,
        lat: pos[0],
        lng: pos[1],
      }),
    onSuccess: (d) => {
      qc.setQueryData(["recycler", "me"], d);
      qc.invalidateQueries({ queryKey: ["recycler", "materials"] });
      toast({ tone: "success", title: "Organisation profile saved" });
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  const toggle = (slug: string) => setAccepted((xs) => (xs.includes(slug) ? xs.filter((x) => x !== slug) : [...xs, slug]));

  const locate = () => {
    if (!("geolocation" in navigator)) {
      toast({ tone: "error", title: "Location isn't available in this browser" });
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
        toast({ tone: "error", title: err.message || "Couldn't get your location" });
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) {
      setError("Organisation name is required");
      return;
    }
    setError(undefined);
    save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <Card as="section" className="space-y-4 p-4 sm:p-5">
        <SectionTitle>Organisation</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organisation name" error={error}>
            {(id) => <Input id={id} value={orgName} onChange={(e) => setOrgName(e.target.value)} required maxLength={160} />}
          </Field>
          <Field label="Authorisation number" hint="Pollution Control Board / CPCB registration or trade licence.">
            {(id) => <Input id={id} value={authNo} onChange={(e) => setAuthNo(e.target.value)} className="font-mono" maxLength={80} placeholder="e.g. RSPCB/PWM/2024/0123" />}
          </Field>
        </div>
      </Card>

      <Card as="section" className="p-4 sm:p-5">
        <SectionTitle action={<span className="text-[13px] text-muted tabular-nums">{accepted.length} selected</span>}>Accepted materials</SectionTitle>
        <p className="mb-4 text-[13px] text-muted">Choose the materials your facility processes. You can only request these.</p>
        {collectable.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-28 rounded-full" />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Accepted materials">
            {collectable.map((c) => {
              const on = accepted.includes(c.slug);
              return (
                <button
                  key={c.slug}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(c.slug)}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                    on ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line-strong bg-surface text-ink hover:bg-canvas",
                  )}
                >
                  {c.emoji && <span aria-hidden>{c.emoji}</span>}
                  {c.name}
                  {on && <Check className="size-4" aria-hidden />}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card as="section" className="space-y-4 p-4 sm:p-5">
        <SectionTitle>Facility location</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Address">
            {(id) => <Textarea id={id} value={address} onChange={(e) => setAddress(e.target.value)} className="min-h-12" rows={2} maxLength={300} />}
          </Field>
          <Field label="City">
            {(id) => <Input id={id} value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />}
          </Field>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-medium text-ink-2">Pin on map</p>
            <Button variant="soft" size="sm" loading={locating} onClick={locate} icon={<Crosshair className="size-4" />}>
              Use my location
            </Button>
          </div>
          <LocationPicker lat={pos[0]} lng={pos[1]} onChange={(lat, lng) => setPos([lat, lng])} className="h-72" />
          <p className="text-[13px] text-muted">Click the map or drag the pin to your facility's gate.</p>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={save.isPending} icon={<Save className="size-[18px]" />}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

export default function RecyclerProfile() {
  useDocumentTitle("Organisation");
  const q = useIndustryProfile();

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data;
  const v = VERIFICATION[p.verification_status] ?? VERIFICATION.pending;

  return (
    <div className="space-y-8">
      <PageHeader title="Organisation" icon={Factory} subtitle="Your recycler profile, accepted materials and facility location." />

      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <Card as="section" className="p-4 sm:p-5" aria-label="Verification status">
          <div className="flex items-start gap-3">
            <IconBox icon={v.icon} tone={v.tone} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-[15px] font-semibold">{p.org_name}</h2>
                <Badge tone={v.tone}>{v.label}</Badge>
              </div>
              <p className="mt-1 text-[13px] text-muted">{v.text}</p>
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <p className="eyebrow">Swacchify ID</p>
            <p className="mt-1 font-mono text-[15px] font-medium tracking-wide">{p.code}</p>
          </div>
        </Card>

        <Card as="section" className="p-4 sm:p-5" aria-label="Account contact">
          <h2 className="eyebrow">Account contact</h2>
          <ul className="mt-2.5 space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <UserIcon className="size-4 shrink-0 text-muted" aria-hidden /> {p.contact_name}
            </li>
            <li className="flex min-w-0 items-center gap-2">
              <Mail className="size-4 shrink-0 text-muted" aria-hidden /> <span className="truncate">{p.email}</span>
            </li>
            {p.phone && (
              <li className="flex items-center gap-2">
                <Phone className="size-4 shrink-0 text-muted" aria-hidden /> {p.phone}
              </li>
            )}
          </ul>
        </Card>
      </div>

      <ProfileForm key={p.code} profile={p} />
    </div>
  );
}
