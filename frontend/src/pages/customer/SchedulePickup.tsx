import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, Gift, MapPin, Minus, Plus, Recycle, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AddressForm } from "@/components/AddressForm";
import { Badge, Button, Card, Field, LinkButton, Modal, PageHeader, Skeleton, Textarea } from "@/components/ui";
import { get, post } from "@/lib/api";
import { cn, fmtDate, fmtKg, pick, toISODate } from "@/lib/format";
import { useCategories, useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { Address, Pickup, Slot } from "@/lib/types";

type Step = 0 | 1 | 2 | 3;
const PRESETS = [
  { kg: 1, en: "Small bag", hi: "छोटी थैली" },
  { kg: 3, en: "Big bag", hi: "बड़ा थैला" },
  { kg: 8, en: "Sack", hi: "बोरी" },
];

export default function SchedulePickup() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const { data: categories } = useCategories();
  const addresses = useQuery({ queryKey: ["addresses"], queryFn: () => get<Address[]>("/users/me/addresses") });
  useDocumentTitle(t("pickup.title"));

  const [step, setStep] = useState<Step>(0);
  const [purpose, setPurpose] = useState<"recycle" | "donate">(params.get("purpose") === "donate" ? "donate" : "recycle");
  const [items, setItems] = useState<Record<string, number>>(() => {
    const c = params.get("category");
    return c && c !== "other" ? { [c]: 2 } : {};
  });
  const [addressId, setAddressId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => toISODate(new Date(Date.now() + i * 86_400_000))), []);
  const [date, setDate] = useState(days[1]);
  const [slot, setSlot] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [booked, setBooked] = useState<Pickup | null>(null);

  useEffect(() => {
    if (addressId === null && addresses.data?.length) setAddressId((addresses.data.find((a) => a.is_default) ?? addresses.data[0]).id);
  }, [addresses.data, addressId]);

  const slots = useQuery({ queryKey: ["slots", date], queryFn: () => get<Slot[]>(`/pickups/slots?date=${date}`) });
  useEffect(() => {
    setSlot(null);
  }, [date]);

  const collectable = (categories ?? []).filter((c) => c.collectable);
  const chosen = Object.entries(items).filter(([, kg]) => kg > 0);
  const totalKg = chosen.reduce((s, [, kg]) => s + kg, 0);
  const estPoints = purpose === "donate" ? 25 : chosen.reduce((s, [slug, kg]) => s + Math.round(kg * (categories?.find((c) => c.slug === slug)?.points_per_kg ?? 0)), 0);
  const address = addresses.data?.find((a) => a.id === addressId);

  const book = useMutation({
    mutationFn: () =>
      post<Pickup>("/pickups", {
        address_id: addressId,
        scheduled_date: date,
        slot,
        purpose,
        notes: notes || null,
        items: chosen.map(([category, estimated_kg]) => ({ category, estimated_kg })),
      }),
    onSuccess: (p) => {
      setBooked(p);
      qc.invalidateQueries({ queryKey: ["pickups"] });
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  const canNext = [chosen.length > 0, !!addressId, !!slot, true][step];
  const steps = [t("pickup.step.what"), t("pickup.step.where"), t("pickup.step.when"), t("pickup.step.confirm")];

  if (booked) {
    return (
      <div className="mx-auto max-w-lg animate-pop py-6 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-50 text-brand-700"><CheckCircle2 className="size-7" /></div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{t("pickup.success")}</h1>
        <p className="mt-2 text-muted">{t("pickup.successSub")}</p>
        <Card className="mt-6 p-5 text-left">
          <p className="font-mono text-sm text-muted">{booked.code}</p>
          <p className="mt-1 text-lg font-bold">{fmtDate(booked.scheduled_date, lang, { weekday: "long", day: "numeric", month: "long" })}</p>
          <p className="text-muted">{slots.data?.find((s) => s.slot === booked.slot)?.label ?? booked.slot}</p>
        </Card>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <LinkButton to={`/app/pickups/${booked.code}`} size="lg">{t("pickup.track")}</LinkButton>
          <LinkButton to="/app" size="lg" variant="secondary">{t("nav.home")}</LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("pickup.title")} subtitle={t("pickup.sub")} />

      <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s}>
            <button
              onClick={() => i < step && setStep(i as Step)}
              disabled={i > step}
              className="w-full text-left"
              aria-current={i === step ? "step" : undefined}
            >
              <span className={cn("block h-1.5 rounded-full transition", i <= step ? "bg-brand-600" : "bg-line")} />
              <span className={cn("mt-2 block text-xs font-bold sm:text-sm", i === step ? "text-ink" : "text-muted")}>
                {i + 1}. {s}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div key={step} className=" space-y-6">
        {step === 0 && (
          <>
            <div>
              <p className="mb-2 font-bold">{t("pickup.purpose")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  ["recycle", Recycle, t("pickup.recycle"), t("pickup.recycleSub")],
                  ["donate", Gift, t("pickup.donate"), t("pickup.donateSub")],
                ] as const).map(([value, Icon, title, sub]) => (
                  <button
                    key={value}
                    onClick={() => setPurpose(value)}
                    aria-pressed={purpose === value}
                    className={cn("flex items-start gap-3 rounded-card border-2 bg-white p-4 text-left transition", purpose === value ? "border-brand-600 bg-brand-50" : "border-line hover:border-brand-300")}
                  >
                    <Icon className={cn("mt-0.5 size-6", purpose === value ? "text-brand-700" : "text-muted")} />
                    <span>
                      <span className="block font-bold">{title}</span>
                      <span className="block text-sm text-muted">{sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="font-bold">{t("pickup.chooseCategories")}</p>
              <p className="mb-3 text-sm text-muted">{t("pickup.kgHint")}</p>
              <div className="space-y-2">
                {!categories && <Skeleton className="h-40" />}
                {collectable.map((c) => {
                  const kg = items[c.slug] ?? 0;
                  const on = kg > 0;
                  const suggested = purpose === "donate" && c.donatable;
                  return (
                    <div key={c.slug} className={cn("rounded-card border-2 bg-white transition", on ? "border-brand-500 shadow-soft" : "border-line")}>
                      <button
                        onClick={() => setItems((x) => ({ ...x, [c.slug]: on ? 0 : 2 }))}
                        aria-pressed={on}
                        className="flex w-full items-center gap-3 p-3 text-left sm:p-4"
                      >
                        <span className="grid size-12 shrink-0 place-items-center rounded-xl text-2xl" style={{ background: `${c.color}1a` }} aria-hidden>{c.emoji}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 font-bold">
                            {pick(lang, c.name, c.name_hi)}
                            {suggested && <Badge tone="purple">🎁</Badge>}
                          </span>
                          <span className="block truncate text-sm text-muted">{pick(lang, c.short, c.short_hi)}</span>
                        </span>
                        <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border-2", on ? "border-brand-600 bg-brand-600 text-white" : "border-line")}>
                          {on && <Check className="size-4" />}
                        </span>
                      </button>
                      {on && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-3 sm:px-4">
                          <span className="mr-auto text-sm font-semibold">{t("pickup.approxKg")}</span>
                          {PRESETS.map((p) => (
                            <button key={p.kg} onClick={() => setItems((x) => ({ ...x, [c.slug]: p.kg }))} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", kg === p.kg ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line")}>
                              {pick(lang, p.en, p.hi)} ~{p.kg}
                            </button>
                          ))}
                          <span className="flex items-center gap-1 rounded-xl bg-canvas p-1">
                            <button onClick={() => setItems((x) => ({ ...x, [c.slug]: Math.max(0.5, (x[c.slug] ?? 0) - 0.5) }))} className="grid size-9 place-items-center rounded-xl bg-white shadow-sm" aria-label="Less">
                              <Minus className="size-4" />
                            </button>
                            <span className="w-16 text-center font-bold tabular-nums">{fmtKg(kg)}</span>
                            <button onClick={() => setItems((x) => ({ ...x, [c.slug]: Math.min(200, (x[c.slug] ?? 0) + 0.5) }))} className="grid size-9 place-items-center rounded-xl bg-white shadow-sm" aria-label="More">
                              <Plus className="size-4" />
                            </button>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-sm text-muted">
                🥬 {pick(lang, "Wet waste, thermocol, wet wipes and medicines aren't collected.", "गीला कचरा, थर्माकोल, वेट वाइप्स और दवाइयाँ नहीं ली जातीं।")}{" "}
                <Link to="/app/guide/other" className="font-semibold text-brand-700">{t("ai.learnMore")} →</Link>
              </p>
            </div>
          </>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="font-bold">{t("pickup.address")}</p>
            {addresses.isLoading && <Skeleton className="h-24" />}
            {addresses.data?.length === 0 && (
              <Card className="p-5">
                <AddressForm onSaved={(a) => setAddressId(a.id)} />
              </Card>
            )}
            {addresses.data?.map((a) => (
              <label key={a.id} className={cn("flex cursor-pointer items-start gap-3 rounded-card border-2 bg-white p-4", addressId === a.id ? "border-brand-600 bg-brand-50/50" : "border-line")}>
                <input type="radio" name="address" className="mt-1 size-5 accent-brand-700" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                <span>
                  <span className="flex items-center gap-2 font-bold">
                    <MapPin className="size-4 text-brand-700" /> {a.label}
                    {a.is_default && <Badge tone="green">{t("profile.setDefault")}</Badge>}
                  </span>
                  <span className="block text-muted">{[a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(", ")}</span>
                  {a.landmark && <span className="block text-sm text-muted">📍 {a.landmark}</span>}
                </span>
              </label>
            ))}
            {!!addresses.data?.length && (
              <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setAddOpen(true)}>
                {t("pickup.addAddress")}
              </Button>
            )}
            <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t("pickup.addAddress")} wide>
              <AddressForm onSaved={(a) => { setAddressId(a.id); setAddOpen(false); }} onCancel={() => setAddOpen(false)} />
            </Modal>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <p className="mb-2 font-bold">{t("pickup.date")}</p>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {days.map((d) => {
                  const dt = new Date(`${d}T00:00:00`);
                  return (
                    <button key={d} onClick={() => setDate(d)} aria-pressed={date === d}
                      className={cn("flex w-16 shrink-0 flex-col items-center rounded-xl border-2 py-2.5 transition", date === d ? "border-brand-600 bg-brand-700 text-white" : "border-line bg-white hover:border-brand-300")}>
                      <span className={cn("text-xs font-semibold", date === d ? "text-brand-100" : "text-muted")}>{dt.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { weekday: "short" })}</span>
                      <span className="text-xl font-semibold">{dt.getDate()}</span>
                      <span className={cn("text-xs", date === d ? "text-brand-100" : "text-muted")}>{dt.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { month: "short" })}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-2 font-bold">{t("pickup.slot")}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {slots.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}
                {slots.data?.map((s) => (
                  <button key={s.slot} disabled={!s.available} onClick={() => setSlot(s.slot)} aria-pressed={slot === s.slot}
                    className={cn("rounded-xl border-2 px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40",
                      slot === s.slot ? "border-brand-600 bg-brand-50" : "border-line bg-white hover:border-brand-300")}>
                    <span className="block font-bold">{s.label}</span>
                    <span className="text-xs text-muted">{s.available ? pick(lang, `${s.remaining} left`, `${s.remaining} बाकी`) : t("pickup.full")}</span>
                  </button>
                ))}
              </div>
            </div>
            <Field label={t("pickup.notes")} optional={t("common.optional")}>
              {(id) => <Textarea id={id} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder={t("pickup.notesPlaceholder")} />}
            </Field>
          </div>
        )}

        {step === 3 && (
          <Card className="divide-y divide-line">
            <div className="p-5">
              <p className="text-xs font-bold tracking-wide text-muted uppercase">{t("pickup.summary")}</p>
              <p className="mt-1 text-lg font-bold">{purpose === "donate" ? `🎁 ${t("pickup.donate")}` : `♻️ ${t("pickup.recycle")}`}</p>
              <ul className="mt-3 space-y-1.5">
                {chosen.map(([slug, kg]) => {
                  const c = categories?.find((x) => x.slug === slug);
                  return (
                    <li key={slug} className="flex justify-between">
                      <span>{c?.emoji} {c ? pick(lang, c.name, c.name_hi) : slug}</span>
                      <span className="font-semibold tabular-nums">~{fmtKg(kg)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="p-5">
              <p className="font-semibold">📍 {address?.label}</p>
              <p className="text-muted">{address && [address.line1, address.line2, address.city].filter(Boolean).join(", ")}</p>
              <p className="mt-3 font-semibold">📅 {fmtDate(date, lang, { weekday: "long", day: "numeric", month: "long" })}</p>
              <p className="text-muted">{slots.data?.find((s) => s.slot === slot)?.label}</p>
              {notes && <p className="mt-3 text-sm text-muted">“{notes}”</p>}
            </div>
            <div className="flex items-center gap-3 bg-brand-50/50 p-5">
              <Sparkles className="size-5 shrink-0 text-brand-700" aria-hidden />
              <p className="text-sm">
                <span className="font-bold">~{estPoints} {t("common.points")}</span> ({t("common.estimate").toLowerCase()}) · {fmtKg(totalKg)}
                <span className="block text-muted">{t("rewards.pendingHint")}</span>
              </p>
            </div>
          </Card>
        )}
      </div>

      <div className="sticky bottom-20 z-10 mt-8 flex gap-3 bg-gradient-to-t from-canvas via-canvas to-transparent pt-4 pb-2 lg:bottom-0">
        {step > 0 && (
          <Button variant="secondary" size="lg" onClick={() => setStep((s) => (s - 1) as Step)}>
            {t("common.back")}
          </Button>
        )}
        {step < 3 ? (
          <Button size="lg" className="flex-1 shadow-lift" disabled={!canNext} onClick={() => setStep((s) => (s + 1) as Step)}>
            {t("common.continue")}
          </Button>
        ) : (
          <Button size="lg" className="flex-1 shadow-lift" loading={book.isPending} onClick={() => book.mutate()}>
            {t("pickup.confirmBtn")}
          </Button>
        )}
      </div>
    </div>
  );
}
