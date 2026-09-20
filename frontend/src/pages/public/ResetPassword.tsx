import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AuthLayout } from "@/components/PublicLayout";
import { Button, Field, Input } from "@/components/ui";
import { post } from "@/lib/api";
import { useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";

export default function ResetPassword() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const token = params.get("token");
  useDocumentTitle(t("auth.resetTitle"));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ message: string }>("/auth/reset-password", { token, password });
      toast({ tone: "success", title: r.message });
      navigate("/login", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t("auth.resetTitle")}>
      {!token ? (
        <p className="text-muted">
          This link is incomplete. <Link to="/forgot-password" className="font-semibold text-brand-700">Request a new one</Link>.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={t("auth.newPassword")} hint={t("auth.passwordHint")}>
            {(id) => <Input id={id} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <Button type="submit" size="lg" block loading={busy}>
            {t("common.save")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
