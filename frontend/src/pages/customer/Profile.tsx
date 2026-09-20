import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AddressForm } from "@/components/AddressForm";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, SectionTitle, Toggle } from "@/components/ui";
import { del, get, patch, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { Address, NotificationPrefs, User } from "@/lib/types";

const PREFS = ["rewards", "learning_reminders", "daily_tip", "campaigns"] as const;
const CHANNELS = ["email", "sms", "whatsapp"] as const;

export default function Profile() {
  const { t } = useI18n();
  const { user, setUser } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [details, setDetails] = useState({ full_name: user?.full_name ?? "", phone: user?.phone ?? "" });
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const addresses = useQuery({ queryKey: ["addresses"], queryFn: () => get<Address[]>("/users/me/addresses") });
  useDocumentTitle(t("profile.title"));

  const onError = (e: Error) => toast({ tone: "error", title: e.message });
  const saveUser = useMutation({
    mutationFn: (body: Record<string, unknown>) => patch<User>("/users/me", body),
    onSuccess: (u) => { setUser(u); toast({ tone: "success", title: t("common.saved") }); },
    onError,
  });
  const changePw = useMutation({
    mutationFn: () => post("/users/me/password", pw),
    onSuccess: () => { setPw({ current_password: "", new_password: "" }); toast({ tone: "success", title: t("common.saved") }); },
    onError,
  });
  const removeAddress = useMutation({ mutationFn: (id: number) => del(`/users/me/addresses/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["addresses"] }), onError });

  if (!user) return null;
  const prefs = user.notification_prefs;
  const setPref = (k: keyof NotificationPrefs, v: boolean) => saveUser.mutate({ notification_prefs: { [k]: v } });
  const setChannel = (k: keyof NotificationPrefs["channels"], v: boolean) => saveUser.mutate({ notification_prefs: { channels: { [k]: v } } });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={t("profile.title")} />

      <Card className="p-5">
        <SectionTitle action={<Badge tone="green" className="font-mono">{user.public_code}</Badge>}>{t("profile.details")}</SectionTitle>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); saveUser.mutate({ full_name: details.full_name, phone: details.phone || null }); }} className="grid gap-4 sm:grid-cols-2">
          <Field label={t("auth.fullName")}>{(id) => <Input id={id} value={details.full_name} onChange={(e) => setDetails((d) => ({ ...d, full_name: e.target.value }))} />}</Field>
          <Field label={t("auth.phone")}>{(id) => <Input id={id} type="tel" value={details.phone} onChange={(e) => setDetails((d) => ({ ...d, phone: e.target.value }))} />}</Field>
          <Field label={t("auth.email")}>{(id) => <Input id={id} value={user.email} disabled />}</Field>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">{t("common.language")}</p>
            <LanguageToggle />
          </div>
          <div className="sm:col-span-2"><Button type="submit" loading={saveUser.isPending}>{t("common.save")}</Button></div>
        </form>
      </Card>

      <Card className="p-5">
        <SectionTitle action={<Button size="sm" variant="soft" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>{t("pickup.addAddress")}</Button>}>{t("profile.addresses")}</SectionTitle>
        <ul className="divide-y divide-line">
          {addresses.data?.map((a) => (
            <li key={a.id} className="flex items-start gap-3 py-3">
              <MapPin className="mt-0.5 size-5 text-brand-700" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{a.label} {a.is_default && <Badge tone="green">{t("profile.setDefault")}</Badge>}</p>
                <p className="text-sm text-muted">{[a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(", ")}</p>
              </div>
              <button onClick={() => setEditing(a)} className="rounded-xl p-2 text-muted hover:bg-canvas" aria-label="Edit address"><Pencil className="size-4" /></button>
              <button onClick={() => removeAddress.mutate(a.id)} className="rounded-xl p-2 text-muted hover:bg-red-50 hover:text-red-600" aria-label="Delete address"><Trash2 className="size-4" /></button>
            </li>
          ))}
          {addresses.data?.length === 0 && <li className="py-3 text-muted">—</li>}
        </ul>
      </Card>

      <Card className="p-5">
        <SectionTitle>{t("profile.notifications")}</SectionTitle>
        <p className="mb-2 text-sm text-muted">{t("profile.pickupAlways")}</p>
        <div className="divide-y divide-line">
          {PREFS.map((k) => <Toggle key={k} checked={prefs[k] !== false} onChange={(v) => setPref(k, v)} label={t(`profile.pref.${k}`)} />)}
        </div>
        <p className="mt-4 mb-1 text-sm font-bold">{t("profile.channels")}</p>
        <div className="divide-y divide-line">
          {CHANNELS.map((k) => <Toggle key={k} checked={!!prefs.channels?.[k]} onChange={(v) => setChannel(k, v)} label={t(`profile.channel.${k}`)} />)}
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle>{t("profile.password")}</SectionTitle>
        <form onSubmit={(e) => { e.preventDefault(); changePw.mutate(); }} className="grid gap-4 sm:grid-cols-2">
          <Field label={t("profile.currentPassword")}>{(id) => <Input id={id} type="password" autoComplete="current-password" required value={pw.current_password} onChange={(e) => setPw((p) => ({ ...p, current_password: e.target.value }))} />}</Field>
          <Field label={t("auth.newPassword")} hint={t("auth.passwordHint")}>{(id) => <Input id={id} type="password" autoComplete="new-password" minLength={8} required value={pw.new_password} onChange={(e) => setPw((p) => ({ ...p, new_password: e.target.value }))} />}</Field>
          <div className="sm:col-span-2"><Button type="submit" variant="secondary" loading={changePw.isPending}>{t("common.save")}</Button></div>
        </form>
      </Card>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? t("pickup.addAddress") : t("profile.addresses")} wide>
        {editing !== null && <AddressForm initial={editing === "new" ? undefined : editing} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
