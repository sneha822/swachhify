import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Gift, Send } from "lucide-react";
import { useState } from "react";
import { Button, Card, EmptyState, ErrorState, Modal, PageHeader, PageSkeleton, SectionTitle } from "@/components/ui";
import { get, post } from "@/lib/api";
import { useDocumentTitle } from "@/lib/hooks";
import { cn, fmtDateTime, fmtMoney, fmtNum, timeAgo } from "@/lib/format";
import { useToast } from "@/lib/toast";

interface PartnerPayment {
  id: number;
  partner: string | null;
  amount: number;
  reference: string | null;
  created_at: string;
}
interface Redemption {
  id: number;
  customer: string | null;
  points: number;
  description: string;
  created_at: string;
}
interface Payouts {
  partner_payments: PartnerPayment[];
  redemptions: Redemption[];
}

const TH = "eyebrow px-3 py-2 whitespace-nowrap first:pl-4 last:pr-4 last:sticky last:right-0 last:border-l last:border-line last:bg-surface";
const TD = "px-3 py-2.5 align-middle first:pl-4 last:pr-4";

export default function AdminPayouts() {
  useDocumentTitle("Payouts & rewards");
  const toast = useToast();
  const qc = useQueryClient();
  const [paying, setPaying] = useState<PartnerPayment | null>(null);
  const [lastSent, setLastSent] = useState<number | null>(null);
  const q = useQuery({ queryKey: ["admin", "payouts"], queryFn: () => get<Payouts>("/admin/payouts") });

  const fulfil = useMutation({
    mutationFn: (r: Redemption) => post(`/admin/redemptions/${r.id}/fulfill`),
    onSuccess: (_d, r) => {
      toast({ tone: "success", title: `Reward fulfilled for ${r.customer ?? "customer"}` });
      qc.invalidateQueries({ queryKey: ["admin", "payouts"] });
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  const tips = useMutation({
    mutationFn: () => post<{ sent: number }>("/admin/jobs/daily-tips"),
    onSuccess: (d) => {
      setLastSent(d.sent);
      toast({ tone: "success", title: `Today's tip sent to ${fmtNum(d.sent)} ${d.sent === 1 ? "person" : "people"}` });
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  const header = (
    <PageHeader
      title="Payouts & rewards"
      subtitle="Settle partner earnings and hand over redeemed rewards."
      actions={
        <Button variant="secondary" loading={tips.isPending} onClick={() => tips.mutate()} icon={<Send className="size-4" />}>
          Send today's tip now
        </Button>
      }
    />
  );

  if (q.isPending)
    return (
      <div>
        {header}
        <PageSkeleton />
      </div>
    );
  if (q.isError)
    return (
      <div>
        {header}
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </div>
    );

  const { partner_payments: pays, redemptions: reds } = q.data;
  const owed = pays.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-8">
      {header}

      {lastSent !== null && (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-[13px] text-brand-800">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          Daily tip delivered to <span className="font-medium tabular-nums">{fmtNum(lastSent)}</span> opted-in {lastSent === 1 ? "user" : "users"}.
        </p>
      )}

      <section aria-labelledby="pp">
        <SectionTitle>
          <span id="pp">Partner payments</span>
        </SectionTitle>
        {pays.length ? (
          <>
            <p className="-mt-1.5 mb-3 text-[13px] text-muted tabular-nums">
              {fmtNum(pays.length)} pending · <span className="font-medium text-ink">{fmtMoney(owed)}</span> owed in total
            </p>

            {/* Desktop table */}
            <Card className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className={TH}>Partner</th>
                    <th scope="col" className={TH}>Reference</th>
                    <th scope="col" className={TH}>Raised</th>
                    <th scope="col" className={cn(TH, "text-right")}>Amount</th>
                    <th scope="col" className={cn(TH, "text-right")}>Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pays.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-canvas/70">
                      <td className={cn(TD, "font-mono font-medium")}>{p.partner ?? "—"}</td>
                      <td className={cn(TD, "text-muted")}>{p.reference ?? `Payment #${p.id}`}</td>
                      <td className={cn(TD, "whitespace-nowrap text-muted")}>
                        <time dateTime={p.created_at} title={fmtDateTime(p.created_at)}>
                          {timeAgo(p.created_at)}
                        </time>
                      </td>
                      <td className={cn(TD, "text-right font-medium whitespace-nowrap tabular-nums")}>{fmtMoney(p.amount)}</td>
                      <td className={cn(TD, "text-right")}>
                        <Button size="sm" onClick={() => setPaying(p)}>
                          Mark paid
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Mobile cards */}
            <ul className="space-y-2 md:hidden">
              {pays.map((p) => (
                <li key={p.id}>
                  <Card className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono font-medium">{p.partner ?? "—"}</p>
                      <p className="text-xs text-muted">
                        {p.reference ?? `Payment #${p.id}`} ·{" "}
                        <time dateTime={p.created_at} title={fmtDateTime(p.created_at)}>
                          {timeAgo(p.created_at)}
                        </time>
                      </p>
                    </div>
                    <p className="font-medium tabular-nums">{fmtMoney(p.amount)}</p>
                    <Button size="sm" onClick={() => setPaying(p)}>
                      Mark paid
                    </Button>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState icon={CheckCircle2} title="All partners are paid" text="New earnings appear here after each verified pickup." />
        )}
      </section>

      <section aria-labelledby="rd">
        <SectionTitle>
          <span id="rd">Reward redemptions</span>
        </SectionTitle>
        {reds.length ? (
          <>
            {/* Desktop table */}
            <Card className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className={TH}>Reward</th>
                    <th scope="col" className={TH}>Customer</th>
                    <th scope="col" className={TH}>Requested</th>
                    <th scope="col" className={cn(TH, "text-right")}>Points</th>
                    <th scope="col" className={cn(TH, "text-right")}>Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {reds.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-canvas/70">
                      <td className={cn(TD, "font-medium")}>{r.description}</td>
                      <td className={cn(TD, "font-mono")}>{r.customer ?? "—"}</td>
                      <td className={cn(TD, "whitespace-nowrap text-muted")}>
                        <time dateTime={r.created_at} title={fmtDateTime(r.created_at)}>
                          {timeAgo(r.created_at)}
                        </time>
                      </td>
                      <td className={cn(TD, "text-right font-medium whitespace-nowrap tabular-nums")}>{fmtNum(r.points)} pts</td>
                      <td className={cn(TD, "text-right")}>
                        <Button
                          size="sm"
                          variant="soft"
                          loading={fulfil.isPending && fulfil.variables?.id === r.id}
                          disabled={fulfil.isPending}
                          onClick={() => fulfil.mutate(r)}
                          icon={<Gift className="size-4" />}
                        >
                          Fulfil
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Mobile cards */}
            <ul className="space-y-2 md:hidden">
              {reds.map((r) => (
                <li key={r.id}>
                  <Card className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{r.description}</p>
                      <p className="text-xs text-muted">
                        <span className="font-mono">{r.customer ?? "—"}</span> ·{" "}
                        <time dateTime={r.created_at} title={fmtDateTime(r.created_at)}>
                          {timeAgo(r.created_at)}
                        </time>
                      </p>
                    </div>
                    <p className="font-medium tabular-nums">{fmtNum(r.points)} pts</p>
                    <Button
                      size="sm"
                      variant="soft"
                      loading={fulfil.isPending && fulfil.variables?.id === r.id}
                      disabled={fulfil.isPending}
                      onClick={() => fulfil.mutate(r)}
                      icon={<Gift className="size-4" />}
                    >
                      Fulfil
                    </Button>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState icon={Gift} title="No rewards waiting" text="Redeemed rewards that need handing over appear here." />
        )}
      </section>

      {paying && <PayModal payment={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function PayModal({ payment, onClose }: { payment: PartnerPayment; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => post(`/admin/payments/${payment.id}/pay`),
    onSuccess: () => {
      toast({ tone: "success", title: `${fmtMoney(payment.amount)} marked paid to ${payment.partner ?? "partner"}` });
      qc.invalidateQueries({ queryKey: ["admin", "payouts"] });
      onClose();
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Confirm payment"
      description="This records the payment as settled and can't be undone here."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate()}>
            Mark {fmtMoney(payment.amount)} paid
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        Only confirm after the transfer to partner <span className="font-mono font-medium text-ink">{payment.partner ?? "—"}</span> has
        gone through.
      </p>
    </Modal>
  );
}
