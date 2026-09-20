import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, IndianRupee, Wallet } from "lucide-react";
import { Link } from "react-router";
import { Badge, Card, EmptyState, ErrorState, IconBox, PageHeader, PageSkeleton, SectionTitle, Stat } from "@/components/ui";
import { get } from "@/lib/api";
import { fmtDate, fmtMoney, pick } from "@/lib/format";
import { useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

interface EarningEntry {
  id: number;
  amount: number;
  status: "paid" | "pending" | string;
  reference: string | null;
  description: string | null;
  created_at: string;
  paid_at: string | null;
}

interface Earnings {
  total: number;
  paid: number;
  pending: number;
  items: EarningEntry[];
}

export default function PartnerEarnings() {
  const { t, lang } = useI18n();
  useDocumentTitle(t("partner.earnings"));
  const q = useQuery({ queryKey: ["partner", "earnings"], queryFn: () => get<Earnings>("/partners/earnings") });

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const e = q.data;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("partner.earnings")}
        icon={IndianRupee}
        subtitle={pick(lang, "Money you earn for every completed pickup.", "हर पूरे पिकअप के लिए आपकी कमाई।")}
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={pick(lang, "Totals", "कुल जोड़")}>
        <Stat label={pick(lang, "Total earned", "कुल कमाई")} value={fmtMoney(e.total)} icon={Wallet} tone="brand" />
        <Stat label={t("partner.paid")} value={fmtMoney(e.paid)} icon={CheckCircle2} />
        <Stat label={t("partner.unpaid")} value={fmtMoney(e.pending)} icon={Clock} tone={e.pending ? "amber" : "neutral"} />
      </section>

      <section>
        <SectionTitle>{pick(lang, "Payments", "भुगतान")}</SectionTitle>
        {e.items.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={pick(lang, "No earnings yet", "अभी कोई कमाई नहीं")}
            text={pick(lang, "Complete pickups to start earning.", "कमाई शुरू करने के लिए पिकअप पूरे करें।")}
          />
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {e.items.map((it) => {
                const paid = it.status === "paid";
                return (
                  <li key={it.id} className="flex items-center gap-3 p-4 sm:px-5">
                    <IconBox icon={IndianRupee} tone={paid ? "brand" : "amber"} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {it.reference ? (
                          <Link to={`/partner/pickups/${encodeURIComponent(it.reference)}`} className="font-mono text-ink hover:underline">
                            {it.reference}
                          </Link>
                        ) : (
                          it.description ?? pick(lang, "Payment", "भुगतान")
                        )}
                      </p>
                      <p className="truncate text-[13px] text-muted">
                        {fmtDate(it.created_at, lang)}
                        {it.reference && it.description ? ` · ${it.description}` : ""}
                        {paid && it.paid_at ? ` · ${pick(lang, "paid", "भुगतान")} ${fmtDate(it.paid_at, lang)}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 space-y-1 text-right">
                      <p className="text-[15px] font-semibold tabular-nums">{fmtMoney(it.amount)}</p>
                      <Badge tone={paid ? "green" : "amber"}>{paid ? t("partner.paid") : t("partner.unpaid")}</Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
