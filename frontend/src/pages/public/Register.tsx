import { Factory, Home, Truck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { AuthLayout } from "@/components/PublicLayout";
import { Button, Field, Input, Select } from "@/components/ui";
import { HOME_FOR, useAuth } from "@/lib/auth";
import { cn, pick } from "@/lib/format";
import { useCategories, useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Role } from "@/lib/types";
import { safeNext } from "./Login";

type JoinRole = Exclude<Role, "admin">;

export default function Register() {
  const { t, lang } = useI18n();
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialRole = (["customer", "partner", "recycler"].includes(params.get("role") ?? "") ? params.get("role") : "customer") as JoinRole;
  const [role, setRole] = useState<JoinRole>(initialRole);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "", vehicle_type: "e-rickshaw", vehicle_number: "", org_name: "", authorization_number: "", city: "Jaipur" });
  const [cats, setCats] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: categories } = useCategories();
  useDocumentTitle(t("auth.signUp"));

  if (user) return <Navigate to={HOME_FOR[user.role]} replace />;

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { role, language: lang, full_name: form.full_name, email: form.email, password: form.password, phone: form.phone || null };
      if (role === "partner") Object.assign(body, { vehicle_type: form.vehicle_type, vehicle_number: form.vehicle_number || null });
      if (role === "recycler") Object.assign(body, { org_name: form.org_name, authorization_number: form.authorization_number || null, accepted_categories: cats, city: form.city });
      const u = await register(body);
      const next = params.get("next");
      navigate(next && next.startsWith(HOME_FOR[u.role]) ? safeNext(next, HOME_FOR[u.role]) : HOME_FOR[u.role], { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const roles: { value: JoinRole; icon: typeof Home; title: string; sub: string }[] = [
    { value: "customer", icon: Home, title: t("auth.role.customer"), sub: t("auth.role.customerSub") },
    { value: "partner", icon: Truck, title: t("auth.role.partner"), sub: t("auth.role.partnerSub") },
    { value: "recycler", icon: Factory, title: t("auth.role.recycler"), sub: t("auth.role.recyclerSub") },
  ];

  return (
    <AuthLayout title={t("auth.joinTitle")} subtitle={t("auth.joinSub")}>
      <form onSubmit={submit} className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t("auth.iAm")}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {roles.map((r) => (
              <label
                key={r.value}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 transition sm:flex-col sm:items-start sm:gap-2",
                  role === r.value ? "border-brand-600 bg-brand-50" : "border-line bg-white hover:border-brand-300",
                )}
              >
                <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} className="sr-only" />
                <r.icon className={cn("size-6", role === r.value ? "text-brand-700" : "text-muted")} />
                <span>
                  <span className="block text-sm font-bold">{r.title}</span>
                  <span className="block text-xs text-muted">{r.sub}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label={role === "recycler" ? "Contact person" : t("auth.fullName")}>
          {(id) => <Input id={id} autoComplete="name" required minLength={2} value={form.full_name} onChange={set("full_name")} />}
        </Field>
        {role === "recycler" && (
          <>
            <Field label="Organisation name">{(id) => <Input id={id} required value={form.org_name} onChange={set("org_name")} />}</Field>
            <Field label="SPCB / CPCB authorisation number" optional={t("common.optional")} hint="Needed before you can request material.">
              {(id) => <Input id={id} value={form.authorization_number} onChange={set("authorization_number")} />}
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Materials you process</legend>
              <div className="flex flex-wrap gap-2">
                {categories?.filter((c) => c.collectable).map((c) => {
                  const on = cats.includes(c.slug);
                  return (
                    <button
                      type="button"
                      key={c.slug}
                      aria-pressed={on}
                      onClick={() => setCats((xs) => (on ? xs.filter((x) => x !== c.slug) : [...xs, c.slug]))}
                      className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold", on ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line bg-white text-muted")}
                    >
                      {c.emoji} {pick(lang, c.name, c.name_hi)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <Field label={t("address.city")}>{(id) => <Input id={id} value={form.city} onChange={set("city")} />}</Field>
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("auth.email")}>{(id) => <Input id={id} type="email" autoComplete="email" required value={form.email} onChange={set("email")} />}</Field>
          <Field label={t("auth.phone")} optional={role === "customer" ? t("common.optional") : undefined}>
            {(id) => <Input id={id} type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" required={role !== "customer"} value={form.phone} onChange={set("phone")} />}
          </Field>
        </div>
        {role === "partner" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={pick(lang, "Vehicle", "वाहन")}>
              {(id) => (
                <Select id={id} value={form.vehicle_type} onChange={set("vehicle_type")}>
                  <option value="e-rickshaw">E-rickshaw</option>
                  <option value="tempo">Tempo / mini-truck</option>
                  <option value="cycle-cart">Cycle cart</option>
                  <option value="two-wheeler">Two-wheeler</option>
                </Select>
              )}
            </Field>
            <Field label={pick(lang, "Vehicle number", "वाहन नंबर")} optional={t("common.optional")}>
              {(id) => <Input id={id} value={form.vehicle_number} onChange={set("vehicle_number")} placeholder="RJ14 ER 0000" />}
            </Field>
          </div>
        )}
        <Field label={t("auth.password")} hint={t("auth.passwordHint")}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={set("password")} />}
        </Field>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" block loading={busy}>
          {t("auth.signUp")}
        </Button>
        <p className="text-center text-sm text-muted">
          {t("auth.haveAccount")}{" "}
          <Link to={`/login${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`} className="font-semibold text-brand-700 hover:underline">
            {t("auth.signIn")}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
