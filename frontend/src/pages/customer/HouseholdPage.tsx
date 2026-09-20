import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Flame, GraduationCap, Scale, Trash2, Truck, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card, ErrorState, Field, Input, PageHeader, PageSkeleton, ProgressBar, SectionTitle, Stat } from "@/components/ui";
import { del, get, post } from "@/lib/api";
import { fmtKg, fmtNum, pick } from "@/lib/format";
import { useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { Household } from "@/lib/types";

export default function HouseholdPage() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: hh, isLoading, error, refetch } = useQuery({ queryKey: ["household"], queryFn: () => get<Household | null>("/households/me") });
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [member, setMember] = useState({ display_name: "", relation: "" });
  useDocumentTitle(t("household.title"));

  const onDone = (d: unknown) => {
    qc.setQueryData(["household"], d);
    qc.invalidateQueries({ queryKey: ["impact"] });
  };
  const onError = (e: Error) => toast({ tone: "error", title: e.message });
  const create = useMutation({ mutationFn: () => post<Household>("/households", { name }), onSuccess: onDone, onError });
  const join = useMutation({ mutationFn: () => post<Household>("/households/join", { invite_code: code }), onSuccess: onDone, onError });
  const addMember = useMutation({
    mutationFn: () => post<Household>("/households/me/members", { display_name: member.display_name, relation: member.relation || null }),
    onSuccess: (d) => { onDone(d); setMember({ display_name: "", relation: "" }); },
    onError,
  });
  const removeMember = useMutation({ mutationFn: (id: number) => del(`/households/me/members/${id}`), onSuccess: () => refetch(), onError });
  const leave = useMutation({ mutationFn: () => post("/households/me/leave"), onSuccess: () => onDone(null), onError });

  if (isLoading) return <PageSkeleton />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  if (!hh) {
    const submit = (fn: () => void) => (e: FormEvent) => { e.preventDefault(); fn(); };
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={t("household.create")} subtitle={t("household.createSub")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <form onSubmit={submit(() => create.mutate())} className="space-y-4">
              <Field label={t("household.name")}>{(id) => <Input id={id} required minLength={2} placeholder={t("household.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
              <Button type="submit" block loading={create.isPending}>{t("household.create")}</Button>
            </form>
          </Card>
          <Card className="p-5">
            <form onSubmit={submit(() => join.mutate())} className="space-y-4">
              <Field label={t("household.code")}>{(id) => <Input id={id} required className="font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
              <Button type="submit" variant="secondary" block loading={join.isPending}>{t("household.join")}</Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  const s = hh.stats;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hh.invite_code);
      toast({ tone: "success", title: t("household.copied") });
    } catch {
      /* clipboard blocked — code is visible anyway */
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={hh.name} subtitle={hh.city ?? undefined} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t("impact.diverted")} value={fmtKg(s.waste_diverted_kg)} icon={<Scale className="size-5" />} />
        <Stat label={t("impact.pickups")} value={fmtNum(s.pickups)} icon={<Truck className="size-5" />} tone="blue" />
        <Stat label={t("household.streak")} value={t("home.days", { n: s.current_streak })} icon={<Flame className="size-5" />} tone="amber" />
        <Stat label={t("household.learning")} value={`${s.learning_progress_pct}%`} icon={<GraduationCap className="size-5" />} tone="purple" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-5">
          <SectionTitle>{t("impact.byCategory")}</SectionTitle>
          <ul className="space-y-3">
            {s.by_category.map((c) => (
              <li key={c.category} className="grid grid-cols-[minmax(6rem,9rem)_1fr_4.5rem] items-center gap-3 text-[13px]">
                <span className="truncate font-medium" title={pick(lang, c.name, c.name_hi)}>{c.emoji} {pick(lang, c.name, c.name_hi)}</span>
                <ProgressBar value={c.kg} max={Math.max(...s.by_category.map((x) => x.kg), 1)} color={c.color} label={c.name} />
                <span className="text-right font-bold tabular-nums">{fmtKg(c.kg)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <SectionTitle>{t("household.invite")}</SectionTitle>
          <p className="text-sm text-muted">{t("household.inviteSub")}</p>
          <button onClick={copy} className="mt-3 flex w-full items-center justify-between rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 px-4 py-3">
            <span className="font-mono text-2xl font-semibold tracking-[0.2em] text-forest-800">{hh.invite_code}</span>
            <Copy className="size-5 text-brand-700" />
          </button>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle>{t("household.members")}</SectionTitle>
        <ul className="divide-y divide-line">
          {hh.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-3">
              <span className="grid size-10 place-items-center rounded-full bg-brand-100 font-bold text-brand-800">{m.display_name[0]?.toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{m.display_name} {m.is_me && <span className="text-muted">({t("impact.me")})</span>}</p>
                <p className="text-sm text-muted">{m.relation}</p>
              </div>
              {m.has_app ? <Badge tone="green">App</Badge> : <Badge tone="gray">—</Badge>}
              {hh.is_owner && !m.is_me && (
                <button onClick={() => removeMember.mutate(m.id)} className="rounded-xl p-2 text-muted hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${m.display_name}`}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => { e.preventDefault(); addMember.mutate(); }} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={t("household.memberName")}>{(id) => <Input id={id} required value={member.display_name} onChange={(e) => setMember((x) => ({ ...x, display_name: e.target.value }))} />}</Field>
          <Field label={t("household.relation")} optional={t("common.optional")}>{(id) => <Input id={id} value={member.relation} onChange={(e) => setMember((x) => ({ ...x, relation: e.target.value }))} />}</Field>
          <Button type="submit" variant="soft" loading={addMember.isPending} icon={<UserPlus className="size-4" />} className="h-12">{t("household.addMember")}</Button>
        </form>
      </Card>

      <Button variant="ghost" className="text-red-600 hover:bg-red-50" loading={leave.isPending} onClick={() => leave.mutate()}>
        {t("household.leave")}
      </Button>
    </div>
  );
}
