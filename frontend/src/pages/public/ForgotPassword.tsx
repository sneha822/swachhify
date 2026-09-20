import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { AuthLayout } from "@/components/PublicLayout";
import { Button, Field, Input } from "@/components/ui";
import { post } from "@/lib/api";
import { useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

export default function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ message: string; dev_reset_url?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useDocumentTitle(t("auth.resetTitle"));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await post("/auth/forgot-password", { email }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t("auth.resetTitle")}>
      {result ? (
        <div className="space-y-4 rounded-card border border-line bg-white p-5">
          <p className="text-3xl" aria-hidden>📬</p>
          <p className="font-semibold">{result.message}</p>
          {result.dev_reset_url && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Development mode (no email provider configured):{" "}
              <a className="font-semibold break-all underline" href={result.dev_reset_url.replace(/^https?:\/\/[^/]+/, "")}>
                open the reset link
              </a>
            </p>
          )}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            ← {t("auth.signIn")}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={t("auth.email")}>
            {(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <Button type="submit" size="lg" block loading={busy}>
            {t("auth.resetSend")}
          </Button>
          <Link to="/login" className="block text-center text-sm font-semibold text-brand-700 hover:underline">
            ← {t("auth.signIn")}
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
