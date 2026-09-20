import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { AuthLayout } from "@/components/PublicLayout";
import { Button, Field, Input } from "@/components/ui";
import { HOME_FOR, useAuth } from "@/lib/auth";
import { useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

const DEMO = [
  { label: "Household", email: "priya@swacchify.demo", emoji: "🏡" },
  { label: "Collection partner", email: "partner1@swacchify.demo", emoji: "🚚" },
  { label: "Recycler", email: "recycler@swacchify.demo", emoji: "🏭" },
  { label: "Admin", email: "admin@swacchify.demo", emoji: "🛠️" },
];
const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO === "true";

/** Only allow same-app relative redirects. */
export function safeNext(next: string | null, fallback: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export default function Login() {
  const { t } = useI18n();
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useDocumentTitle(t("auth.signIn"));

  if (user) return <Navigate to={safeNext(params.get("next"), HOME_FOR[user.role])} replace />;

  const submit = async (e: FormEvent, creds?: { email: string; password: string }) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(creds?.email ?? email, creds?.password ?? password);
      const next = params.get("next");
      navigate(next && next.startsWith(HOME_FOR[u.role]) ? safeNext(next, HOME_FOR[u.role]) : HOME_FOR[u.role], { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t("auth.welcomeBack")} subtitle={t("auth.welcomeSub")}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t("auth.email")}>
          {(id) => <Input id={id} type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label={t("auth.password")}>
          {(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" block loading={busy}>
          {t("auth.signIn")}
        </Button>
        <div className="flex items-center justify-between text-sm">
          <Link to="/forgot-password" className="font-semibold text-brand-700 hover:underline">
            {t("auth.forgot")}
          </Link>
          <span className="text-muted">
            {t("auth.noAccount")}{" "}
            <Link to={`/register${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`} className="font-semibold text-brand-700 hover:underline">
              {t("auth.signUp")}
            </Link>
          </span>
        </div>
      </form>

      {SHOW_DEMO && (
        <div className="mt-10 rounded-card border border-dashed border-line-strong bg-canvas p-4">
          <p className="text-sm font-medium">{t("auth.demo")}</p>
          <p className="mt-0.5 text-[13px] text-muted">Password for all demo accounts: Swacchify@123</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO.map((d) => (
              <button
                key={d.email}
                disabled={busy}
                onClick={(e) => submit(e, { email: d.email, password: "Swacchify@123" })}
                className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-sm font-medium transition-colors hover:border-brand-300 hover:bg-brand-50/50"
              >
                <span className="text-lg" aria-hidden>{d.emoji}</span>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
