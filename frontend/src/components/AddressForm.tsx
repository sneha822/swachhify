import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LocateFixed } from "lucide-react";
import { useState, type FormEvent } from "react";
import { post, put } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { Address } from "@/lib/types";
import { DEFAULT_CENTER, LocationPicker } from "./MapView";
import { Button, Field, Input, Toggle } from "./ui";

export function AddressForm({ initial, onSaved, onCancel }: { initial?: Address; onSaved: (a: Address) => void; onCancel?: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({
    label: initial?.label ?? "Home",
    line1: initial?.line1 ?? "",
    line2: initial?.line2 ?? "",
    landmark: initial?.landmark ?? "",
    city: initial?.city ?? "Jaipur",
    pincode: initial?.pincode ?? "",
    lat: initial?.lat ?? DEFAULT_CENTER[0],
    lng: initial?.lng ?? DEFAULT_CENTER[1],
    is_default: initial?.is_default ?? false,
  });
  const [locating, setLocating] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, line2: f.line2 || null, landmark: f.landmark || null, pincode: f.pincode || null };
      return initial ? put<Address>(`/users/me/addresses/${initial.id}`, body) : post<Address>("/users/me/addresses", body);
    },
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["addresses"] });
      toast({ tone: "success", title: t("common.saved") });
      onSaved(a);
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setF((x) => ({ ...x, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast({ tone: "error", title: "Location permission denied — tap the map instead." });
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <Field label={t("address.label")}>{(id) => <Input id={id} value={f.label} onChange={set("label")} maxLength={40} />}</Field>
        <Field label={t("address.line1")}>{(id) => <Input id={id} required minLength={3} value={f.line1} onChange={set("line1")} autoComplete="address-line1" />}</Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("address.line2")} optional={t("common.optional")}>{(id) => <Input id={id} value={f.line2} onChange={set("line2")} autoComplete="address-line2" />}</Field>
        <Field label={t("address.landmark")} optional={t("common.optional")}>{(id) => <Input id={id} value={f.landmark} onChange={set("landmark")} />}</Field>
        <Field label={t("address.city")}>{(id) => <Input id={id} required value={f.city} onChange={set("city")} autoComplete="address-level2" />}</Field>
        <Field label={t("address.pincode")} optional={t("common.optional")}>
          {(id) => <Input id={id} inputMode="numeric" pattern="\d{6}" maxLength={6} value={f.pincode} onChange={set("pincode")} autoComplete="postal-code" />}
        </Field>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{t("address.pin")}</p>
          <Button variant="soft" size="sm" onClick={locate} loading={locating} icon={<LocateFixed className="size-4" />}>
            {t("address.useLocation")}
          </Button>
        </div>
        <LocationPicker lat={f.lat} lng={f.lng} onChange={(lat, lng) => setF((x) => ({ ...x, lat, lng }))} />
      </div>
      <Toggle checked={f.is_default} onChange={(v) => setF((x) => ({ ...x, is_default: v }))} label={t("profile.setDefault")} />
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>}
        <Button type="submit" loading={save.isPending}>{t("address.save")}</Button>
      </div>
    </form>
  );
}
